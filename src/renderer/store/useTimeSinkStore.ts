/**
 * TIME SINK STORE
 *
 * Manages time sinks and their sessions for the current session.
 * Time sinks are session-scoped - each session has its own set of sinks.
 *
 * This store:
 * - Loads sinks from the database on initialization
 * - Provides CRUD operations for sinks
 * - Manages active time sink sessions (start/stop)
 * - Tracks accumulated time by sink
 */

import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import { useShallow } from 'zustand/react/shallow'
import {
  TimeSink,
  TimeSinkSession,
  CreateTimeSinkInput,
  UpdateTimeSinkInput,
  TimeSinkAccumulatedResult,
  getSinkById,
  getSinkColor,
  getSinkEmoji,
  getSinkName,
  getSortedSinks,
  calculateSessionDuration,
} from '@/shared/time-sink-types'
import { getCurrentTime } from '@/shared/time-provider'
import { dateToYYYYMMDD } from '@/shared/time-utils'
import { logger } from '@/logger'

interface TimeSinkStoreState {
  // Core state
  sinks: TimeSink[]
  activeSinkSession: TimeSinkSession | null
  isLoading: boolean
  error: string | null
  isInitialized: boolean

  // Actions - Sinks
  loadSinks: () => Promise<void>
  createSink: (input: Omit<CreateTimeSinkInput, 'sessionId'>) => Promise<TimeSink>
  updateSink: (id: string, updates: UpdateTimeSinkInput) => Promise<TimeSink>
  deleteSink: (id: string) => Promise<void>
  reorderSinks: (orderedIds: string[]) => Promise<void>
  clearSinks: () => void

  // Actions - Sessions
  startSession: (sinkId: string, notes?: string) => Promise<TimeSinkSession>
  stopSession: (notes?: string) => Promise<TimeSinkSession | null>
  loadActiveSession: () => Promise<void>
  getAccumulatedTime: (startDate: string, endDate: string) => Promise<TimeSinkAccumulatedResult>

  // Helpers
  getById: (id: string) => TimeSink | undefined
  getColor: (sinkId: string) => string
  getEmoji: (sinkId: string) => string
  getName: (sinkId: string) => string
  getSorted: () => TimeSink[]
  hasSinks: () => boolean
  isSessionActive: () => boolean
  getActiveSessionDuration: () => number
}

export const useTimeSinkStore = create<TimeSinkStoreState>()(
  subscribeWithSelector((set, get) => ({
    // Initial state
    sinks: [],
    activeSinkSession: null,
    isLoading: false,
    error: null,
    isInitialized: false,

    /**
     * Load all time sinks for the current session from the database.
     */
    loadSinks: async (): Promise<void> => {
      set({ isLoading: true, error: null })

      try {
        const sinks = await window.electronAPI.db.getTimeSinks()

        set({
          sinks,
          isLoading: false,
          isInitialized: true,
        })

        // Also load active session
        await get().loadActiveSession()

        logger.ui.info('Time sinks loaded', {
          count: sinks.length,
          sinkNames: sinks.map((s) => s.name),
        }, 'time-sinks-loaded')
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        set({ error: errorMessage, isLoading: false, isInitialized: true })
        logger.ui.error('Failed to load time sinks', { error: errorMessage }, 'time-sinks-error')
      }
    },

    /**
     * Create a new time sink.
     */
    createSink: async (input): Promise<TimeSink> => {
      try {
        const newSink = await window.electronAPI.db.createTimeSink(input)

        set((state) => ({
          sinks: [...state.sinks, newSink],
        }))

        logger.ui.info('Created time sink', {
          id: newSink.id,
          name: newSink.name,
        }, 'time-sink-created')

        return newSink
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        logger.ui.error('Failed to create time sink', { error: errorMessage }, 'time-sink-create-error')
        throw error
      }
    },

    /**
     * Update an existing time sink.
     */
    updateSink: async (id, updates): Promise<TimeSink> => {
      try {
        const updatedSink = await window.electronAPI.db.updateTimeSink(id, updates)

        set((state) => ({
          sinks: state.sinks.map((s) => (s.id === id ? updatedSink : s)),
        }))

        logger.ui.info('Updated time sink', {
          id: updatedSink.id,
          name: updatedSink.name,
          updates,
        }, 'time-sink-updated')

        return updatedSink
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        logger.ui.error('Failed to update time sink', { error: errorMessage }, 'time-sink-update-error')
        throw error
      }
    },

    /**
     * Delete a time sink.
     */
    deleteSink: async (id): Promise<void> => {
      try {
        await window.electronAPI.db.deleteTimeSink(id)

        set((state) => ({
          sinks: state.sinks.filter((s) => s.id !== id),
        }))

        logger.ui.info('Deleted time sink', { id }, 'time-sink-deleted')
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        logger.ui.error('Failed to delete time sink', { error: errorMessage }, 'time-sink-delete-error')
        throw error
      }
    },

    /**
     * Reorder time sinks by providing an ordered array of IDs.
     */
    reorderSinks: async (orderedIds): Promise<void> => {
      try {
        await window.electronAPI.db.reorderTimeSinks(orderedIds)

        // Reorder in local state
        set((state) => {
          const sinksMap = new Map(state.sinks.map((s) => [s.id, s]))
          const reorderedSinks = orderedIds
            .map((id, index) => {
              const sink = sinksMap.get(id)
              if (sink) {
                return { ...sink, sortOrder: index }
              }
              return null
            })
            .filter((s): s is TimeSink => s !== null)

          return { sinks: reorderedSinks }
        })

        logger.ui.info('Reordered time sinks', { count: orderedIds.length }, 'time-sinks-reordered')
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        logger.ui.error('Failed to reorder time sinks', { error: errorMessage }, 'time-sinks-reorder-error')
        throw error
      }
    },

    /**
     * Clear all sinks from store (used on session switch).
     */
    clearSinks: (): void => {
      set({
        sinks: [],
        activeSinkSession: null,
        isInitialized: false,
        error: null,
      })
    },

    /**
     * Start a new time sink session.
     */
    startSession: async (sinkId, notes): Promise<TimeSinkSession> => {
      const { activeSinkSession } = get()

      // Stop any existing active session first
      if (activeSinkSession) {
        await get().stopSession()
      }

      try {
        const now = getCurrentTime()
        const session = await window.electronAPI.db.createTimeSinkSession({
          timeSinkId: sinkId,
          startTime: now.toISOString(),
          notes,
        })

        set({ activeSinkSession: session })

        logger.ui.info('Started time sink session', {
          sessionId: session.id,
          sinkId,
        }, 'time-sink-session-started')

        return session
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        logger.ui.error('Failed to start time sink session', { error: errorMessage }, 'time-sink-session-start-error')
        throw error
      }
    },

    /**
     * Stop the active time sink session.
     */
    stopSession: async (notes): Promise<TimeSinkSession | null> => {
      const { activeSinkSession } = get()

      if (!activeSinkSession) {
        return null
      }

      try {
        // Calculate actual minutes
        const actualMinutes = calculateSessionDuration(activeSinkSession)

        const stoppedSession = await window.electronAPI.db.endTimeSinkSession(
          activeSinkSession.id,
          actualMinutes,
          notes,
        )

        set({ activeSinkSession: null })

        logger.ui.info('Stopped time sink session', {
          sessionId: stoppedSession.id,
          actualMinutes,
        }, 'time-sink-session-stopped')

        return stoppedSession
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        logger.ui.error('Failed to stop time sink session', { error: errorMessage }, 'time-sink-session-stop-error')
        throw error
      }
    },

    /**
     * Load the currently active time sink session (if any).
     */
    loadActiveSession: async (): Promise<void> => {
      try {
        const activeSession = await window.electronAPI.db.getActiveTimeSinkSession()
        set({ activeSinkSession: activeSession })
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        logger.ui.error('Failed to load active time sink session', { error: errorMessage }, 'time-sink-active-session-error')
      }
    },

    /**
     * Get accumulated time by sink for a date range.
     */
    getAccumulatedTime: async (startDate, endDate): Promise<TimeSinkAccumulatedResult> => {
      try {
        return await window.electronAPI.db.getTimeSinkAccumulated(startDate, endDate)
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        logger.ui.error('Failed to get accumulated time', { error: errorMessage }, 'time-sink-accumulated-error')
        return { bySink: {}, total: 0 }
      }
    },

    // Helpers
    getById: (id): TimeSink | undefined => getSinkById(get().sinks, id),
    getColor: (sinkId): string => getSinkColor(get().sinks, sinkId),
    getEmoji: (sinkId): string => getSinkEmoji(get().sinks, sinkId),
    getName: (sinkId): string => getSinkName(get().sinks, sinkId),
    getSorted: (): TimeSink[] => getSortedSinks(get().sinks),
    hasSinks: (): boolean => get().sinks.length > 0,
    isSessionActive: (): boolean => get().activeSinkSession !== null,
    getActiveSessionDuration: (): number => {
      const { activeSinkSession } = get()
      if (!activeSinkSession) return 0
      return calculateSessionDuration(activeSinkSession)
    },
  })),
)

// ============================================================================
// Custom Hooks for Common Patterns
// ============================================================================

/**
 * Get sorted time sinks with shallow comparison to prevent unnecessary re-renders.
 */
export function useSortedTimeSinks(): TimeSink[] {
  return useTimeSinkStore(
    useShallow((state) => getSortedSinks(state.sinks)),
  )
}

/**
 * Check if the store has any time sinks.
 */
export function useHasTimeSinks(): boolean {
  return useTimeSinkStore((state) => state.sinks.length > 0)
}

/**
 * Get a specific time sink by ID.
 */
export function useTimeSink(sinkId: string): TimeSink | undefined {
  return useTimeSinkStore(
    useShallow((state) => state.sinks.find((s) => s.id === sinkId)),
  )
}

/**
 * Get the active sink session state.
 */
export function useActiveSinkSession(): TimeSinkSession | null {
  return useTimeSinkStore((state) => state.activeSinkSession)
}

/**
 * Get today's accumulated time by sink.
 */
export function useTodayAccumulatedSinkTime(): () => Promise<TimeSinkAccumulatedResult> {
  const getAccumulatedTime = useTimeSinkStore((state) => state.getAccumulatedTime)
  return (): Promise<TimeSinkAccumulatedResult> => {
    const today = dateToYYYYMMDD(getCurrentTime())
    return getAccumulatedTime(today, today)
  }
}
