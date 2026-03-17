/**
 * POMODORO STORE
 *
 * Manages Pomodoro cycle lifecycle: settings, timer engine, and phase transitions.
 *
 * Architecture:
 * - Timer is derived state: remaining = phaseStartTime + duration - getCurrentTime()
 * - PomodoroCycle groups multiple WorkSessions (one per task worked)
 * - Break activities use TimeSinkSession (leveraging existing infrastructure)
 * - Mutual exclusivity: WorkTrackingService handles work/timesink session conflicts
 *
 * Phase flow:
 *   startPomodoro(taskId) → [WORK] → timer expires → prompt break activity
 *   → transitionToBreak(sinkId) → [BREAK] → timer expires → prompt next task
 *   → transitionToWork(taskId) → [WORK] → ...
 *
 * Mid-cycle task switch (task completed during work phase):
 *   switchTaskWithinCycle(newTaskId) → stops current WorkSession, starts new one
 *   Timer continues uninterrupted (no reset)
 */

import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import { PomodoroPhase, PomodoroPromptType } from '@shared/enums'
import { POMODORO_DEFAULTS } from '@shared/constants'
import {
  createInitialTimerState,
  computeRemainingSeconds,
  phaseDurationToSeconds,
  getBreakDurationMinutes,
  fromDatabasePomodoroCycle,
  fromDatabasePomodoroSettings,
  DEFAULT_POMODORO_SETTINGS,
} from '@shared/pomodoro-types'
import type {
  PomodoroSettings,
  PomodoroCycle,
  PomodoroTimerState,
  UpdatePomodoroSettingsInput,
} from '@shared/pomodoro-types'
import { getCurrentTime } from '@shared/time-provider'
import { logger } from '@/logger'
import { NotificationService } from '@/renderer/services/notificationService'
import { getDatabase } from '@/renderer/services/database'
import { useTaskStore, getWorkTrackingServiceInstance } from './useTaskStore'
import { useTimeSinkStore } from './useTimeSinkStore'

// ============================================================================
// State Interface
// ============================================================================

interface PomodoroStoreState {
  // Settings (loaded from server)
  settings: PomodoroSettings | null

  // Timer state (derived, updated every tick)
  timerState: PomodoroTimerState

  // Active cycle data
  activeCycle: PomodoroCycle | null

  // Pending prompt for UI to display
  pendingPrompt: PomodoroPromptType | null

  // Loading state
  isLoading: boolean
  isInitialized: boolean

  // ---- Settings Actions ----
  loadSettings: () => Promise<void>
  updateSettings: (updates: UpdatePomodoroSettingsInput) => Promise<void>

  // ---- Cycle Lifecycle Actions ----
  startPomodoro: (taskId: string, stepId?: string) => Promise<void>
  transitionToBreak: (sinkId?: string) => Promise<void>
  transitionToWork: (taskId: string, stepId?: string) => Promise<void>
  switchTaskWithinCycle: (newTaskId: string, stepId?: string) => Promise<void>
  pauseCycle: () => Promise<void>
  resumeCycle: () => Promise<void>
  endCycle: () => Promise<void>

  // ---- Prompt Actions ----
  dismissPrompt: () => void

  // ---- Initialization ----
  initialize: () => Promise<void>
  reset: () => void

  // ---- Internal Timer ----
  _tickTimerId: ReturnType<typeof setInterval> | null
  _startTick: () => void
  _stopTick: () => void
  _onTimerExpired: () => void
}

// ============================================================================
// Helpers
// ============================================================================

// Cached fallback settings — stable reference prevents React 19 infinite re-render loop
// when usePomodoroSettings() selector returns this for null settings
const DEFAULT_EFFECTIVE_SETTINGS: PomodoroSettings = {
  id: '',
  sessionId: '',
  ...DEFAULT_POMODORO_SETTINGS,
  createdAt: new Date(0),
  updatedAt: new Date(0),
}

function getEffectiveSettings(settings: PomodoroSettings | null): PomodoroSettings {
  return settings ?? DEFAULT_EFFECTIVE_SETTINGS
}

/**
 * Wraps an async store action with structured logging (entry on success, error on failure).
 * Eliminates repetitive try/catch/logger.ui.error boilerplate across store actions.
 */
function withStoreLogging<TArgs extends unknown[], TResult>(
  actionName: string,
  fn: (...args: TArgs) => Promise<TResult>,
  getContext?: (...args: TArgs) => Record<string, unknown>,
): (...args: TArgs) => Promise<TResult> {
  return async (...args: TArgs): Promise<TResult> => {
    try {
      const result = await fn(...args)
      const context = getContext ? getContext(...args) : {}
      logger.ui.info(`Pomodoro: ${actionName}`, context, `pomodoro-${actionName}`)
      return result
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      const context = getContext ? getContext(...args) : {}
      logger.ui.error(`Pomodoro: ${actionName} failed`, { error: msg, ...context }, `pomodoro-${actionName}-error`)
      throw error
    }
  }
}

/** Start work on a task or step using the unified startWork() dispatcher */
async function startWorkItem(taskId: string, stepId?: string): Promise<void> {
  await useTaskStore.getState().startWork({
    isSimpleTask: !stepId,
    stepId: stepId ?? taskId,
    taskId,
  })
}

/** Link the currently active work session to a Pomodoro cycle */
async function linkActiveSessionToCycle(taskId: string, stepId: string | undefined, cycleId: string): Promise<void> {
  const activeWorkSessions = useTaskStore.getState().activeWorkSessions
  const activeSession = activeWorkSessions.get(taskId) ?? activeWorkSessions.get(stepId ?? '')
  if (activeSession?.id) {
    await getDatabase().updateWorkSession(activeSession.id, { pomodoroCycleId: cycleId })
  }
}

/** Get a task's display name by ID */
function getTaskName(taskId: string): string | null {
  const task = useTaskStore.getState().tasks.find(t => t.id === taskId)
  return task?.name ?? null
}

// ============================================================================
// Store
// ============================================================================

export const usePomodoroStore = create<PomodoroStoreState>()(
  subscribeWithSelector((set, get) => ({
    // Initial state
    settings: null,
    timerState: createInitialTimerState(),
    activeCycle: null,
    pendingPrompt: null,
    isLoading: false,
    isInitialized: false,
    _tickTimerId: null,

    // ==========================================================================
    // Settings
    // ==========================================================================

    loadSettings: async (): Promise<void> => {
      try {
        const raw = await getDatabase().getPomodoroSettings()
        const settings = raw ? fromDatabasePomodoroSettings(raw) : null
        set({ settings })
        logger.ui.info('Pomodoro settings loaded', { hasSettings: !!settings }, 'pomodoro-settings-loaded')
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error)
        logger.ui.error('Failed to load pomodoro settings', { error: msg }, 'pomodoro-settings-error')
      }
    },

    updateSettings: withStoreLogging(
      'settings-updated',
      async (updates: UpdatePomodoroSettingsInput): Promise<void> => {
        const raw = await getDatabase().updatePomodoroSettings(updates)
        const settings = fromDatabasePomodoroSettings(raw)
        set({ settings })
      },
      (updates) => ({ updates }),
    ),

    // ==========================================================================
    // Cycle Lifecycle
    // ==========================================================================

    startPomodoro: async (taskId, stepId): Promise<void> => {
      const { activeCycle, _startTick } = get()
      if (activeCycle) {
        logger.ui.warn('Cannot start pomodoro: cycle already active', {
          cycleId: activeCycle.id,
        }, 'pomodoro-already-active')
        return
      }

      set({ isLoading: true })

      await withStoreLogging(
        'started',
        async () => {
          const effectiveSettings = getEffectiveSettings(get().settings)

          // 1. Create PomodoroCycle via tRPC
          const raw = await getDatabase().startPomodoroCycle({
            workDurationMinutes: effectiveSettings.workDurationMinutes,
            breakDurationMinutes: getBreakDurationMinutes(1, effectiveSettings),
          })
          const cycle = fromDatabasePomodoroCycle(raw)

          // 2. Start WorkSession via unified dispatcher
          await startWorkItem(taskId, stepId)

          // 3. Link WorkSession to cycle
          await linkActiveSessionToCycle(taskId, stepId, cycle.id)

          // 4. Update store state
          set({
            activeCycle: cycle,
            timerState: {
              isActive: true,
              currentPhase: PomodoroPhase.Work,
              currentCycleId: cycle.id,
              cycleNumber: cycle.cycleNumber,
              remainingSeconds: phaseDurationToSeconds(cycle.workDurationMinutes),
              totalSeconds: phaseDurationToSeconds(cycle.workDurationMinutes),
              currentTaskId: taskId,
              currentTaskName: getTaskName(taskId),
            },
            pendingPrompt: null,
            isLoading: false,
          })

          // 5. Start timer tick
          _startTick()
        },
        () => ({ taskId, stepId }),
      )().catch(() => {
        set({ isLoading: false })
      })
    },

    transitionToBreak: withStoreLogging(
      'break-started',
      async (sinkId?: string): Promise<void> => {
        const { activeCycle, _startTick, _stopTick } = usePomodoroStore.getState()
        if (!activeCycle) return

        _stopTick()

        const now = getCurrentTime()
        const effectiveSettings = getEffectiveSettings(usePomodoroStore.getState().settings)

        // 1. Stop the active work session
        const workService = getWorkTrackingServiceInstance()
        const activeSession = workService.getCurrentActiveSession()
        if (activeSession?.id) {
          await workService.pauseWorkSession(activeSession.id)
        }

        // 2. Determine break type
        const breakPhase = activeCycle.cycleNumber % effectiveSettings.cyclesBeforeLongBreak === 0
          ? PomodoroPhase.LongBreak
          : PomodoroPhase.ShortBreak

        // 3. Update cycle phase in database
        await getDatabase().updatePomodoroCyclePhase({
          cycleId: activeCycle.id,
          status: breakPhase,
          phaseStartTime: now,
          breakTimeSinkId: sinkId ?? null,
        })

        // 4. Optionally start a TimeSinkSession for the break activity
        if (sinkId) {
          await useTimeSinkStore.getState().startSession(sinkId)
        }

        // 5. Update local state
        usePomodoroStore.setState({
          activeCycle: { ...activeCycle, status: breakPhase, phaseStartTime: now, breakTimeSinkId: sinkId ?? null },
          timerState: {
            ...usePomodoroStore.getState().timerState,
            currentPhase: breakPhase,
            remainingSeconds: phaseDurationToSeconds(activeCycle.breakDurationMinutes),
            totalSeconds: phaseDurationToSeconds(activeCycle.breakDurationMinutes),
            currentTaskId: null,
            currentTaskName: null,
          },
          pendingPrompt: null,
        })

        // 6. Restart timer for break phase
        _startTick()
      },
      (sinkId) => ({ sinkId }),
    ),

    transitionToWork: withStoreLogging(
      'work-started',
      async (taskId: string, stepId?: string): Promise<void> => {
        const { activeCycle, _startTick, _stopTick } = usePomodoroStore.getState()
        if (!activeCycle) return

        _stopTick()

        const now = getCurrentTime()

        // 1. Stop the break TimeSinkSession (if any)
        const timeSinkState = useTimeSinkStore.getState()
        if (timeSinkState.activeSinkSession) {
          await timeSinkState.stopSession()
        }

        // 2. Update cycle phase to Work in database
        await getDatabase().updatePomodoroCyclePhase({
          cycleId: activeCycle.id,
          status: PomodoroPhase.Work,
          phaseStartTime: now,
        })

        // 3. Start new WorkSession via unified dispatcher
        await startWorkItem(taskId, stepId)

        // 4. Link new WorkSession to cycle
        await linkActiveSessionToCycle(taskId, stepId, activeCycle.id)

        // 5. Update local state
        usePomodoroStore.setState({
          activeCycle: { ...activeCycle, status: PomodoroPhase.Work, phaseStartTime: now },
          timerState: {
            ...usePomodoroStore.getState().timerState,
            currentPhase: PomodoroPhase.Work,
            remainingSeconds: phaseDurationToSeconds(activeCycle.workDurationMinutes),
            totalSeconds: phaseDurationToSeconds(activeCycle.workDurationMinutes),
            currentTaskId: taskId,
            currentTaskName: getTaskName(taskId),
          },
          pendingPrompt: null,
        })

        // 6. Restart timer for work phase
        _startTick()
      },
      (taskId) => ({ taskId }),
    ),

    switchTaskWithinCycle: withStoreLogging(
      'task-switched',
      async (newTaskId: string, stepId?: string): Promise<void> => {
        const { activeCycle } = usePomodoroStore.getState()
        if (!activeCycle || activeCycle.status !== PomodoroPhase.Work) return

        // 1. Stop current work session
        const workService = getWorkTrackingServiceInstance()
        const activeSession = workService.getCurrentActiveSession()
        if (activeSession?.id) {
          await workService.pauseWorkSession(activeSession.id)
        }

        // 2. Start new work session via unified dispatcher
        await startWorkItem(newTaskId, stepId)

        // 3. Link to same cycle
        await linkActiveSessionToCycle(newTaskId, stepId, activeCycle.id)

        // 4. Update timer state (task info only — no timer reset!)
        usePomodoroStore.setState({
          timerState: {
            ...usePomodoroStore.getState().timerState,
            currentTaskId: newTaskId,
            currentTaskName: getTaskName(newTaskId),
          },
          pendingPrompt: null,
        })
      },
      (newTaskId) => ({ newTaskId }),
    ),

    pauseCycle: withStoreLogging(
      'paused',
      async (): Promise<void> => {
        const { activeCycle, _stopTick } = usePomodoroStore.getState()
        if (!activeCycle) return

        _stopTick()

        const now = getCurrentTime()

        // Capture remaining time before pausing
        const remaining = computeRemainingSeconds(
          activeCycle.phaseStartTime,
          activeCycle.status === PomodoroPhase.Work
            ? activeCycle.workDurationMinutes
            : activeCycle.breakDurationMinutes,
          now,
        )

        await getDatabase().updatePomodoroCyclePhase({
          cycleId: activeCycle.id,
          status: PomodoroPhase.Paused,
          phaseStartTime: activeCycle.phaseStartTime,
        })

        usePomodoroStore.setState({
          activeCycle: { ...activeCycle, status: PomodoroPhase.Paused },
          timerState: {
            ...usePomodoroStore.getState().timerState,
            isActive: false,
            currentPhase: PomodoroPhase.Paused,
            remainingSeconds: remaining,
          },
        })
      },
    ),

    resumeCycle: withStoreLogging(
      'resumed',
      async (): Promise<void> => {
        const { activeCycle, timerState, _startTick } = usePomodoroStore.getState()
        if (!activeCycle || activeCycle.status !== PomodoroPhase.Paused) return

        const now = getCurrentTime()

        // Compute new phaseStartTime so that remaining seconds are preserved
        const durationMinutes = timerState.totalSeconds / 60
        const remainingMs = timerState.remainingSeconds * 1000
        const newPhaseStartTime = new Date(now.getTime() - (durationMinutes * 60 * 1000 - remainingMs))

        // Restore the previous phase (work or break) — determine from totalSeconds
        const previousPhase = timerState.totalSeconds === phaseDurationToSeconds(activeCycle.workDurationMinutes)
          ? PomodoroPhase.Work
          : (activeCycle.cycleNumber % getEffectiveSettings(usePomodoroStore.getState().settings).cyclesBeforeLongBreak === 0
            ? PomodoroPhase.LongBreak
            : PomodoroPhase.ShortBreak)

        await getDatabase().updatePomodoroCyclePhase({
          cycleId: activeCycle.id,
          status: previousPhase,
          phaseStartTime: newPhaseStartTime,
        })

        usePomodoroStore.setState({
          activeCycle: { ...activeCycle, status: previousPhase, phaseStartTime: newPhaseStartTime },
          timerState: { ...timerState, isActive: true, currentPhase: previousPhase },
        })

        _startTick()
      },
    ),

    endCycle: withStoreLogging(
      'ended',
      async (): Promise<void> => {
        const { activeCycle, _stopTick } = usePomodoroStore.getState()
        if (!activeCycle) return

        _stopTick()

        // 1. Stop any active work session
        const workService = getWorkTrackingServiceInstance()
        const activeSession = workService.getCurrentActiveSession()
        if (activeSession?.id) {
          await workService.pauseWorkSession(activeSession.id)
        }

        // 2. Stop any active time sink session
        const timeSinkState = useTimeSinkStore.getState()
        if (timeSinkState.activeSinkSession) {
          await timeSinkState.stopSession()
        }

        // 3. End the cycle in database
        await getDatabase().endPomodoroCycle(activeCycle.id)

        // 4. Reset store
        usePomodoroStore.setState({
          activeCycle: null,
          timerState: createInitialTimerState(),
          pendingPrompt: null,
        })
      },
    ),

    // ==========================================================================
    // Prompt Actions
    // ==========================================================================

    dismissPrompt: (): void => {
      set({ pendingPrompt: null })
    },

    // ==========================================================================
    // Initialization
    // ==========================================================================

    initialize: async (): Promise<void> => {
      if (get().isInitialized) return

      try {
        // Load settings
        await get().loadSettings()

        // Check for any active cycle (e.g., app was refreshed mid-pomodoro)
        const raw = await getDatabase().getActivePomodoroCycle()
        if (raw) {
          const cycle = fromDatabasePomodoroCycle(raw)
          const durationMinutes = cycle.status === PomodoroPhase.Work
            ? cycle.workDurationMinutes
            : cycle.breakDurationMinutes
          const remaining = computeRemainingSeconds(cycle.phaseStartTime, durationMinutes, getCurrentTime())

          set({
            activeCycle: cycle,
            timerState: {
              isActive: cycle.status !== PomodoroPhase.Paused && cycle.status !== PomodoroPhase.Completed,
              currentPhase: cycle.status,
              currentCycleId: cycle.id,
              cycleNumber: cycle.cycleNumber,
              remainingSeconds: remaining,
              totalSeconds: phaseDurationToSeconds(durationMinutes),
              currentTaskId: null, // Will be populated from active work session
              currentTaskName: null,
            },
          })

          // Start ticking if cycle is active
          if (cycle.status === PomodoroPhase.Work || cycle.status === PomodoroPhase.ShortBreak || cycle.status === PomodoroPhase.LongBreak) {
            get()._startTick()
          }
        }

        set({ isInitialized: true })
        logger.ui.info('Pomodoro store initialized', { hasActiveCycle: !!raw }, 'pomodoro-initialized')
      } catch (error) {
        set({ isInitialized: true })
        const msg = error instanceof Error ? error.message : String(error)
        logger.ui.error('Failed to initialize pomodoro store', { error: msg }, 'pomodoro-init-error')
      }
    },

    reset: (): void => {
      get()._stopTick()
      set({
        settings: null,
        timerState: createInitialTimerState(),
        activeCycle: null,
        pendingPrompt: null,
        isLoading: false,
        isInitialized: false,
      })
    },

    // ==========================================================================
    // Internal Timer Engine
    // ==========================================================================

    _startTick: (): void => {
      const { _tickTimerId } = get()
      if (_tickTimerId) {
        clearInterval(_tickTimerId)
      }

      const timerId = setInterval(() => {
        const { activeCycle, timerState } = get()
        if (!activeCycle || !timerState.isActive) return

        const durationMinutes = activeCycle.status === PomodoroPhase.Work
          ? activeCycle.workDurationMinutes
          : activeCycle.breakDurationMinutes

        const remaining = computeRemainingSeconds(
          activeCycle.phaseStartTime,
          durationMinutes,
          getCurrentTime(),
        )

        if (remaining !== timerState.remainingSeconds) {
          set({ timerState: { ...timerState, remainingSeconds: remaining } })
        }

        if (remaining === 0) {
          get()._onTimerExpired()
        }
      }, POMODORO_DEFAULTS.TIMER_TICK_INTERVAL_MS)

      set({ _tickTimerId: timerId })
    },

    _stopTick: (): void => {
      const { _tickTimerId } = get()
      if (_tickTimerId) {
        clearInterval(_tickTimerId)
        set({ _tickTimerId: null })
      }
    },

    _onTimerExpired: (): void => {
      const { activeCycle, _stopTick } = get()
      if (!activeCycle) return

      _stopTick()

      if (activeCycle.status === PomodoroPhase.Work) {
        set({
          timerState: { ...get().timerState, isActive: false, remainingSeconds: 0 },
          pendingPrompt: PomodoroPromptType.BreakActivity,
        })
        NotificationService.getInstance().sendPomodoroPhaseComplete(PomodoroPhase.Work, get().timerState.currentTaskName)
      } else if (
        activeCycle.status === PomodoroPhase.ShortBreak ||
        activeCycle.status === PomodoroPhase.LongBreak
      ) {
        set({
          timerState: { ...get().timerState, isActive: false, remainingSeconds: 0 },
          pendingPrompt: PomodoroPromptType.NextTask,
        })
        NotificationService.getInstance().sendPomodoroPhaseComplete(activeCycle.status)
      }
    },
  })),
)

// ============================================================================
// Custom Hooks
// ============================================================================

/** Get the current timer state reactively */
export function usePomodoroTimer(): PomodoroTimerState {
  return usePomodoroStore((state) => state.timerState)
}

/** Check if a Pomodoro cycle is currently active */
export function useIsPomodoroActive(): boolean {
  return usePomodoroStore((state) => state.activeCycle !== null)
}

/** Get the pending prompt type (if any) */
export function usePomodoroPrompt(): PomodoroPromptType | null {
  return usePomodoroStore((state) => state.pendingPrompt)
}

/** Get Pomodoro settings (with defaults) */
export function usePomodoroSettings(): PomodoroSettings {
  return usePomodoroStore((state) => getEffectiveSettings(state.settings))
}
