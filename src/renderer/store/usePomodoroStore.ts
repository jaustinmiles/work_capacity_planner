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
import { sendPomodoroNotification } from '@/renderer/utils/pomodoroNotifications'
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
// Helper: Get effective settings with defaults
// ============================================================================

function getEffectiveSettings(settings: PomodoroSettings | null): PomodoroSettings {
  if (settings) return settings
  return {
    id: '',
    sessionId: '',
    ...DEFAULT_POMODORO_SETTINGS,
    createdAt: new Date(),
    updatedAt: new Date(),
  }
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
        logger.ui.info('Pomodoro settings loaded', {
          hasSettings: !!settings,
        }, 'pomodoro-settings-loaded')
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error)
        logger.ui.error('Failed to load pomodoro settings', { error: msg }, 'pomodoro-settings-error')
      }
    },

    updateSettings: async (updates): Promise<void> => {
      try {
        const raw = await getDatabase().updatePomodoroSettings(updates)
        const settings = fromDatabasePomodoroSettings(raw)
        set({ settings })
        logger.ui.info('Pomodoro settings updated', { updates }, 'pomodoro-settings-updated')
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error)
        logger.ui.error('Failed to update pomodoro settings', { error: msg }, 'pomodoro-settings-update-error')
        throw error
      }
    },

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

      try {
        const effectiveSettings = getEffectiveSettings(get().settings)

        // 1. Create PomodoroCycle via tRPC
        const raw = await getDatabase().startPomodoroCycle({
          workDurationMinutes: effectiveSettings.workDurationMinutes,
          breakDurationMinutes: getBreakDurationMinutes(1, effectiveSettings),
        })
        const cycle = fromDatabasePomodoroCycle(raw)

        // 2. Start WorkSession via task store (handles mutual exclusivity)
        if (stepId) {
          await useTaskStore.getState().startWorkOnStep(taskId, stepId)
        } else {
          await useTaskStore.getState().startWorkOnTask(taskId)
        }

        // 3. Link the WorkSession to the cycle
        const activeWorkSessions = useTaskStore.getState().activeWorkSessions
        const activeSession = activeWorkSessions.get(taskId) ?? activeWorkSessions.get(stepId ?? '')
        if (activeSession?.id) {
          await getDatabase().updateWorkSession(activeSession.id, {
            pomodoroCycleId: cycle.id,
          })
        }

        // 4. Get task name for timer display
        const tasks = useTaskStore.getState().tasks
        const task = tasks.find(t => t.id === taskId)

        // 5. Update store state
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
            currentTaskName: task?.name ?? null,
          },
          pendingPrompt: null,
          isLoading: false,
        })

        // 6. Start timer tick
        _startTick()

        logger.ui.info('Pomodoro started', {
          cycleId: cycle.id,
          cycleNumber: cycle.cycleNumber,
          taskId,
          workMinutes: cycle.workDurationMinutes,
        }, 'pomodoro-started')
      } catch (error) {
        set({ isLoading: false })
        const msg = error instanceof Error ? error.message : String(error)
        logger.ui.error('Failed to start pomodoro', { error: msg, taskId }, 'pomodoro-start-error')
        throw error
      }
    },

    transitionToBreak: async (sinkId): Promise<void> => {
      const { activeCycle, _startTick, _stopTick } = get()
      if (!activeCycle) return

      _stopTick()

      try {
        const now = getCurrentTime()
        const effectiveSettings = getEffectiveSettings(get().settings)

        // 1. Stop the active work session
        const workService = getWorkTrackingServiceInstance()
        const activeSession = workService.getCurrentActiveSession()
        if (activeSession?.id) {
          await workService.pauseWorkSession(activeSession.id)
          useTaskStore.getState().notifyWorkSessionsChanged()
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
        const updatedCycle: PomodoroCycle = {
          ...activeCycle,
          status: breakPhase,
          phaseStartTime: now,
          breakTimeSinkId: sinkId ?? null,
        }

        set({
          activeCycle: updatedCycle,
          timerState: {
            ...get().timerState,
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

        logger.ui.info('Pomodoro transitioned to break', {
          cycleId: activeCycle.id,
          breakPhase,
          sinkId,
          breakMinutes: activeCycle.breakDurationMinutes,
        }, 'pomodoro-break-started')
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error)
        logger.ui.error('Failed to transition to break', { error: msg }, 'pomodoro-break-error')
        throw error
      }
    },

    transitionToWork: async (taskId, stepId): Promise<void> => {
      const { activeCycle, _startTick, _stopTick } = get()
      if (!activeCycle) return

      _stopTick()

      try {
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

        // 3. Start new WorkSession for the selected task
        if (stepId) {
          await useTaskStore.getState().startWorkOnStep(taskId, stepId)
        } else {
          await useTaskStore.getState().startWorkOnTask(taskId)
        }

        // 4. Link new WorkSession to cycle
        const activeWorkSessions = useTaskStore.getState().activeWorkSessions
        const activeSession = activeWorkSessions.get(taskId) ?? activeWorkSessions.get(stepId ?? '')
        if (activeSession?.id) {
          await getDatabase().updateWorkSession(activeSession.id, {
            pomodoroCycleId: activeCycle.id,
          })
        }

        // 5. Get task name
        const tasks = useTaskStore.getState().tasks
        const task = tasks.find(t => t.id === taskId)

        // 6. Update local state
        const updatedCycle: PomodoroCycle = {
          ...activeCycle,
          status: PomodoroPhase.Work,
          phaseStartTime: now,
        }

        set({
          activeCycle: updatedCycle,
          timerState: {
            ...get().timerState,
            currentPhase: PomodoroPhase.Work,
            remainingSeconds: phaseDurationToSeconds(activeCycle.workDurationMinutes),
            totalSeconds: phaseDurationToSeconds(activeCycle.workDurationMinutes),
            currentTaskId: taskId,
            currentTaskName: task?.name ?? null,
          },
          pendingPrompt: null,
        })

        // 7. Restart timer for work phase
        _startTick()

        logger.ui.info('Pomodoro transitioned to work', {
          cycleId: activeCycle.id,
          taskId,
          workMinutes: activeCycle.workDurationMinutes,
        }, 'pomodoro-work-started')
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error)
        logger.ui.error('Failed to transition to work', { error: msg }, 'pomodoro-work-error')
        throw error
      }
    },

    switchTaskWithinCycle: async (newTaskId, stepId): Promise<void> => {
      const { activeCycle } = get()
      if (!activeCycle || activeCycle.status !== PomodoroPhase.Work) return

      try {
        // 1. Stop current work session (records its time)
        const workService = getWorkTrackingServiceInstance()
        const activeSession = workService.getCurrentActiveSession()
        if (activeSession?.id) {
          await workService.pauseWorkSession(activeSession.id)
        }

        // 2. Start new work session for the new task
        if (stepId) {
          await useTaskStore.getState().startWorkOnStep(newTaskId, stepId)
        } else {
          await useTaskStore.getState().startWorkOnTask(newTaskId)
        }

        // 3. Link to same cycle
        const activeWorkSessions = useTaskStore.getState().activeWorkSessions
        const newSession = activeWorkSessions.get(newTaskId) ?? activeWorkSessions.get(stepId ?? '')
        if (newSession?.id) {
          await getDatabase().updateWorkSession(newSession.id, {
            pomodoroCycleId: activeCycle.id,
          })
        }

        // 4. Update timer state (task info only — no timer reset!)
        const tasks = useTaskStore.getState().tasks
        const task = tasks.find(t => t.id === newTaskId)

        set({
          timerState: {
            ...get().timerState,
            currentTaskId: newTaskId,
            currentTaskName: task?.name ?? null,
          },
          pendingPrompt: null,
        })

        useTaskStore.getState().notifyWorkSessionsChanged()

        logger.ui.info('Pomodoro task switched within cycle', {
          cycleId: activeCycle.id,
          newTaskId,
        }, 'pomodoro-task-switched')
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error)
        logger.ui.error('Failed to switch task within cycle', { error: msg }, 'pomodoro-switch-error')
        throw error
      }
    },

    pauseCycle: async (): Promise<void> => {
      const { activeCycle, _stopTick } = get()
      if (!activeCycle) return

      _stopTick()

      try {
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
          phaseStartTime: activeCycle.phaseStartTime, // Keep original
        })

        set({
          activeCycle: { ...activeCycle, status: PomodoroPhase.Paused },
          timerState: {
            ...get().timerState,
            isActive: false,
            currentPhase: PomodoroPhase.Paused,
            remainingSeconds: remaining,
          },
        })

        logger.ui.info('Pomodoro paused', {
          cycleId: activeCycle.id,
          remainingSeconds: remaining,
        }, 'pomodoro-paused')
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error)
        logger.ui.error('Failed to pause pomodoro', { error: msg }, 'pomodoro-pause-error')
        throw error
      }
    },

    resumeCycle: async (): Promise<void> => {
      const { activeCycle, timerState, _startTick } = get()
      if (!activeCycle || activeCycle.status !== PomodoroPhase.Paused) return

      try {
        const now = getCurrentTime()

        // Compute new phaseStartTime so that remaining seconds are preserved
        // If there were 300s remaining, set phaseStartTime so that now + 300s = expiry
        const durationMinutes = timerState.totalSeconds / 60
        const remainingMs = timerState.remainingSeconds * 1000
        const newPhaseStartTime = new Date(now.getTime() - (durationMinutes * 60 * 1000 - remainingMs))

        // Restore the previous phase (work or break) — determine from totalSeconds
        const previousPhase = timerState.totalSeconds === phaseDurationToSeconds(activeCycle.workDurationMinutes)
          ? PomodoroPhase.Work
          : (activeCycle.cycleNumber % getEffectiveSettings(get().settings).cyclesBeforeLongBreak === 0
            ? PomodoroPhase.LongBreak
            : PomodoroPhase.ShortBreak)

        await getDatabase().updatePomodoroCyclePhase({
          cycleId: activeCycle.id,
          status: previousPhase,
          phaseStartTime: newPhaseStartTime,
        })

        set({
          activeCycle: {
            ...activeCycle,
            status: previousPhase,
            phaseStartTime: newPhaseStartTime,
          },
          timerState: {
            ...timerState,
            isActive: true,
            currentPhase: previousPhase,
          },
        })

        _startTick()

        logger.ui.info('Pomodoro resumed', {
          cycleId: activeCycle.id,
          remainingSeconds: timerState.remainingSeconds,
        }, 'pomodoro-resumed')
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error)
        logger.ui.error('Failed to resume pomodoro', { error: msg }, 'pomodoro-resume-error')
        throw error
      }
    },

    endCycle: async (): Promise<void> => {
      const { activeCycle, _stopTick } = get()
      if (!activeCycle) return

      _stopTick()

      try {
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

        // 4. Notify task store of session changes
        useTaskStore.getState().notifyWorkSessionsChanged()

        // 5. Reset store
        set({
          activeCycle: null,
          timerState: createInitialTimerState(),
          pendingPrompt: null,
        })

        logger.ui.info('Pomodoro cycle ended', {
          cycleId: activeCycle.id,
          cycleNumber: activeCycle.cycleNumber,
        }, 'pomodoro-ended')
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error)
        logger.ui.error('Failed to end pomodoro', { error: msg }, 'pomodoro-end-error')
        throw error
      }
    },

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
        logger.ui.info('Pomodoro store initialized', {
          hasActiveCycle: !!raw,
        }, 'pomodoro-initialized')
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

        // Update remaining seconds
        set({
          timerState: {
            ...timerState,
            remainingSeconds: remaining,
          },
        })

        // Check for expiry
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

      const effectiveSettings = getEffectiveSettings(get().settings)

      if (activeCycle.status === PomodoroPhase.Work) {
        // Work phase ended — prompt for break activity
        logger.ui.info('Pomodoro work phase expired', {
          cycleId: activeCycle.id,
        }, 'pomodoro-work-expired')

        set({
          timerState: {
            ...get().timerState,
            isActive: false,
            remainingSeconds: 0,
          },
          pendingPrompt: PomodoroPromptType.BreakActivity,
        })

        // Desktop notification
        sendPomodoroNotification(PomodoroPhase.Work, get().timerState.currentTaskName)

        // Auto-start break if configured
        if (effectiveSettings.autoStartBreak) {
          // Still show prompt but auto-transition after a brief moment
          // The UI can handle this — if pendingPrompt is set AND autoStartBreak, auto-dismiss
        }
      } else if (
        activeCycle.status === PomodoroPhase.ShortBreak ||
        activeCycle.status === PomodoroPhase.LongBreak
      ) {
        // Break phase ended — prompt for next task
        logger.ui.info('Pomodoro break phase expired', {
          cycleId: activeCycle.id,
          breakType: activeCycle.status,
        }, 'pomodoro-break-expired')

        set({
          timerState: {
            ...get().timerState,
            isActive: false,
            remainingSeconds: 0,
          },
          pendingPrompt: PomodoroPromptType.NextTask,
        })

        // Desktop notification
        sendPomodoroNotification(activeCycle.status)
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
