/**
 * TIMER STORE
 *
 * Manages first-class countdown timers. Timers persist in the database
 * and survive app restarts. The tick engine runs one setInterval that
 * updates all active timers.
 *
 * Architecture:
 * - Timer state is absolute: expiresAt is a database timestamp
 * - Remaining time is derived: remainingSeconds = ceil((expiresAt - now) / 1000)
 * - One setInterval(1000) ticks all active timers
 * - On expiry: server transitions linked task/step, client sends notification
 * - On startup: loads all active/paused timers, catches up expired ones
 */

import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import { TimerStatus } from '@shared/enums'
import { TIMER_DEFAULTS } from '@shared/constants'
import {
  toTimerDisplayState,
  fromDatabaseTimer,
  formatTimerDuration,
} from '@shared/timer-types'
import type { Timer, TimerDisplayState } from '@shared/timer-types'
import { getCurrentTime } from '@shared/time-provider'
import { logger } from '@/logger'
import { NotificationService } from '@/renderer/services/notificationService'
import { getDatabase } from '@/renderer/services/database'

// ============================================================================
// State Interface
// ============================================================================

interface TimerStoreState {
  /** All tracked timers keyed by ID */
  timers: Map<string, Timer>

  /** Derived display states, updated every tick */
  displayStates: Map<string, TimerDisplayState>

  /** Pre-computed arrays for selectors (stable references, updated by _refreshDisplayStates) */
  activeTimersList: TimerDisplayState[]
  expiredTimersList: TimerDisplayState[]
  badgeCount: number

  /** Loading state */
  isLoading: boolean
  isInitialized: boolean

  // Actions
  initialize: () => Promise<void>
  createTimer: (name: string, durationMinutes: number, linkedTaskId?: string, linkedStepId?: string) => Promise<Timer>
  extendTimer: (timerId: string, addMinutes: number) => Promise<void>
  pauseTimer: (timerId: string) => Promise<void>
  resumeTimer: (timerId: string) => Promise<void>
  dismissTimer: (timerId: string) => Promise<void>
  cancelTimer: (timerId: string) => Promise<void>
  reset: () => void

  // Internal
  _tickTimerId: ReturnType<typeof setInterval> | null
  _startTick: () => void
  _stopTick: () => void
  _onTimerExpired: (timerId: string) => Promise<void>
  _refreshDisplayStates: () => void
}

// ============================================================================
// Store
// ============================================================================

export const useTimerStore = create<TimerStoreState>()(
  subscribeWithSelector((set, get) => ({
    timers: new Map(),
    displayStates: new Map(),
    activeTimersList: [],
    expiredTimersList: [],
    badgeCount: 0,
    isLoading: false,
    isInitialized: false,
    _tickTimerId: null,

    // ========================================================================
    // Initialization
    // ========================================================================

    initialize: async (): Promise<void> => {
      if (get().isInitialized) return
      set({ isLoading: true })

      try {
        const db = getDatabase()
        const rawTimers = await db.getActiveTimers()

        const timers = new Map<string, Timer>()
        const expiredTimerIds: string[] = []
        const now = getCurrentTime()

        for (const raw of rawTimers) {
          const timer = fromDatabaseTimer(raw as Record<string, unknown>)
          timers.set(timer.id, timer)

          // Catch up: if timer expired while we were offline
          if (timer.status === TimerStatus.Active && now.getTime() >= timer.expiresAt.getTime()) {
            expiredTimerIds.push(timer.id)
          }
        }

        set({ timers, isLoading: false, isInitialized: true })
        get()._refreshDisplayStates()

        // Expire any timers that passed while offline
        for (const timerId of expiredTimerIds) {
          await get()._onTimerExpired(timerId)
        }

        // Start ticking if there are active timers
        const hasActive = Array.from(timers.values()).some(t => t.status === TimerStatus.Active)
        if (hasActive) {
          get()._startTick()
        }

        logger.system.info('Timer store initialized', {
          totalTimers: timers.size,
          expiredCatchUp: expiredTimerIds.length,
        }, 'timer-init')
      } catch (error) {
        logger.system.error('Failed to initialize timer store', {
          error: error instanceof Error ? error.message : String(error),
        }, 'timer-init-error')
        set({ isLoading: false, isInitialized: true })
      }
    },

    // ========================================================================
    // Timer Actions
    // ========================================================================

    createTimer: async (name, durationMinutes, linkedTaskId, linkedStepId): Promise<Timer> => {
      const db = getDatabase()
      const raw = await db.createTimer({
        name,
        durationMinutes,
        linkedTaskId,
        linkedStepId,
      })

      const timer = fromDatabaseTimer(raw as Record<string, unknown>)
      const { timers } = get()
      const newTimers = new Map(timers)
      newTimers.set(timer.id, timer)
      set({ timers: newTimers })
      get()._refreshDisplayStates()
      get()._startTick()

      logger.ui.info('Timer created', {
        timerId: timer.id,
        name,
        duration: formatTimerDuration(durationMinutes),
      }, 'timer-created')

      return timer
    },

    extendTimer: async (timerId, addMinutes): Promise<void> => {
      const db = getDatabase()
      const raw = await db.extendTimer(timerId, addMinutes)
      const timer = fromDatabaseTimer(raw as Record<string, unknown>)

      const { timers } = get()
      const newTimers = new Map(timers)
      newTimers.set(timer.id, timer)
      set({ timers: newTimers })
      get()._refreshDisplayStates()

      // Restart tick if timer was reactivated from expired
      if (timer.status === TimerStatus.Active) {
        get()._startTick()
      }
    },

    pauseTimer: async (timerId): Promise<void> => {
      const db = getDatabase()
      const raw = await db.pauseTimer(timerId)
      const timer = fromDatabaseTimer(raw as Record<string, unknown>)

      const { timers } = get()
      const newTimers = new Map(timers)
      newTimers.set(timer.id, timer)
      set({ timers: newTimers })
      get()._refreshDisplayStates()
    },

    resumeTimer: async (timerId): Promise<void> => {
      const db = getDatabase()
      const raw = await db.resumeTimer(timerId)
      const timer = fromDatabaseTimer(raw as Record<string, unknown>)

      const { timers } = get()
      const newTimers = new Map(timers)
      newTimers.set(timer.id, timer)
      set({ timers: newTimers })
      get()._refreshDisplayStates()
      get()._startTick()
    },

    dismissTimer: async (timerId): Promise<void> => {
      const db = getDatabase()
      await db.dismissTimer(timerId)

      const { timers } = get()
      const newTimers = new Map(timers)
      newTimers.delete(timerId)
      set({ timers: newTimers })
      get()._refreshDisplayStates()
    },

    cancelTimer: async (timerId): Promise<void> => {
      const db = getDatabase()
      await db.cancelTimer(timerId)

      const { timers } = get()
      const newTimers = new Map(timers)
      newTimers.delete(timerId)
      set({ timers: newTimers })
      get()._refreshDisplayStates()
    },

    reset: (): void => {
      get()._stopTick()
      set({
        timers: new Map(),
        displayStates: new Map(),
        activeTimersList: [],
        expiredTimersList: [],
        badgeCount: 0,
        isLoading: false,
        isInitialized: false,
      })
    },

    // ========================================================================
    // Internal Timer Engine
    // ========================================================================

    _startTick: (): void => {
      const { _tickTimerId } = get()
      if (_tickTimerId) {
        clearInterval(_tickTimerId)
      }

      const timerId = setInterval(() => {
        const { timers } = get()
        const now = getCurrentTime()
        let anyChanged = false
        const expiredIds: string[] = []

        for (const [id, timer] of timers) {
          if (timer.status !== TimerStatus.Active) continue

          // Check if expired
          if (now.getTime() >= timer.expiresAt.getTime()) {
            expiredIds.push(id)
            anyChanged = true
          }
        }

        // Always refresh display states (countdown changes every second)
        get()._refreshDisplayStates()

        // Handle expirations
        for (const id of expiredIds) {
          get()._onTimerExpired(id)
        }

        // Stop ticking if no active timers left
        if (!anyChanged) {
          const hasActive = Array.from(timers.values()).some(t => t.status === TimerStatus.Active)
          if (!hasActive) {
            get()._stopTick()
          }
        }
      }, TIMER_DEFAULTS.TICK_INTERVAL_MS)

      set({ _tickTimerId: timerId })
    },

    _stopTick: (): void => {
      const { _tickTimerId } = get()
      if (_tickTimerId) {
        clearInterval(_tickTimerId)
        set({ _tickTimerId: null })
      }
    },

    _onTimerExpired: async (timerId): Promise<void> => {
      const { timers } = get()
      const timer = timers.get(timerId)
      if (!timer) return

      logger.ui.info('Timer expired', {
        timerId,
        name: timer.name,
      }, 'timer-expired')

      // Mark expired on server (transitions linked step/task)
      try {
        const db = getDatabase()
        await db.expireTimer(timerId)
      } catch (error) {
        logger.system.error('Failed to expire timer on server', {
          timerId,
          error: error instanceof Error ? error.message : String(error),
        }, 'timer-expire-error')
      }

      // Update local state
      const newTimers = new Map(timers)
      newTimers.set(timerId, {
        ...timer,
        status: TimerStatus.Expired,
        expiredAt: getCurrentTime(),
      })
      set({ timers: newTimers })
      get()._refreshDisplayStates()

      // Send notification
      NotificationService.getInstance().send(
        'Timer Expired',
        `"${timer.name}" has finished.`,
        { tag: `timer-${timerId}` },
      )
    },

    _refreshDisplayStates: (): void => {
      const { timers } = get()
      const now = getCurrentTime()
      const displayStates = new Map<string, TimerDisplayState>()
      const active: TimerDisplayState[] = []
      const expired: TimerDisplayState[] = []
      let badge = 0

      for (const [id, timer] of timers) {
        const ds = toTimerDisplayState(timer, now)
        displayStates.set(id, ds)

        if (ds.status === TimerStatus.Active || ds.status === TimerStatus.Paused) {
          active.push(ds)
        }
        if (ds.status === TimerStatus.Expired) {
          expired.push(ds)
        }
        if (ds.status === TimerStatus.Active || ds.status === TimerStatus.Expired) {
          badge++
        }
      }

      active.sort((a, b) => a.expiresAt.getTime() - b.expiresAt.getTime())

      set({
        displayStates,
        activeTimersList: active,
        expiredTimersList: expired,
        badgeCount: badge,
      })
    },
  })),
)

// ============================================================================
// Selectors
// ============================================================================

/** Get all active timer display states, sorted by expiration (soonest first) */
export function useActiveTimers(): TimerDisplayState[] {
  return useTimerStore((state) => state.activeTimersList)
}

/** Get all expired (not yet dismissed) timer display states */
export function useExpiredTimers(): TimerDisplayState[] {
  return useTimerStore((state) => state.expiredTimersList)
}

/** Get count of active + expired timers (for badge display) */
export function useTimerBadgeCount(): number {
  return useTimerStore((state) => state.badgeCount)
}
