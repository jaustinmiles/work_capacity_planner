/**
 * SCHEDULE SNAPSHOT STORE
 *
 * Manages schedule snapshots for the "freeze schedule" feature.
 * Allows users to capture schedule state and compare planned vs actual time use.
 *
 * This store:
 * - Creates snapshots from current schedule state
 * - Retrieves snapshots for the current session
 * - Provides "today's snapshot" for quick access
 * - Manages snapshot lifecycle (create, delete)
 */

import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import {
  ScheduleSnapshot,
  createSnapshotData,
} from '@shared/schedule-snapshot-types'
import { ScheduleResult } from '@shared/unified-scheduler'
import { getCurrentTime } from '@shared/time-provider'
import { logger } from '@/logger'

interface ScheduleSnapshotStoreState {
  // Core state
  snapshots: ScheduleSnapshot[]
  todaySnapshot: ScheduleSnapshot | null
  isLoading: boolean
  error: string | null
  isInitialized: boolean

  // Actions
  loadSnapshots: () => Promise<void>
  loadTodaySnapshot: () => Promise<void>
  createSnapshot: (scheduleResult: ScheduleResult, label?: string) => Promise<ScheduleSnapshot>
  deleteSnapshot: (id: string) => Promise<void>
  clearSnapshots: () => void

  // Helpers
  hasSnapshotToday: () => boolean
  getSnapshotById: (id: string) => ScheduleSnapshot | undefined
}

export const useScheduleSnapshotStore = create<ScheduleSnapshotStoreState>()(
  subscribeWithSelector((set, get) => ({
    // Initial state
    snapshots: [],
    todaySnapshot: null,
    isLoading: false,
    error: null,
    isInitialized: false,

    /**
     * Load all snapshots for the current session.
     */
    loadSnapshots: async (): Promise<void> => {
      set({ isLoading: true, error: null })

      try {
        const snapshots = await window.electronAPI.db.getScheduleSnapshots()

        set({
          snapshots,
          isLoading: false,
          isInitialized: true,
        })

        // Also load today's snapshot
        await get().loadTodaySnapshot()

        logger.ui.info('Schedule snapshots loaded', {
          count: snapshots.length,
        }, 'snapshots-loaded')
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        set({ error: errorMessage, isLoading: false, isInitialized: true })
        logger.ui.error('Failed to load schedule snapshots', { error: errorMessage }, 'snapshots-error')
      }
    },

    /**
     * Load today's snapshot (most recent snapshot created today).
     */
    loadTodaySnapshot: async (): Promise<void> => {
      try {
        const todaySnapshot = await window.electronAPI.db.getTodayScheduleSnapshot()
        set({ todaySnapshot })
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        logger.ui.error('Failed to load today snapshot', { error: errorMessage }, 'today-snapshot-error')
      }
    },

    /**
     * Create a new schedule snapshot from the current schedule state.
     */
    createSnapshot: async (scheduleResult: ScheduleResult, label?: string): Promise<ScheduleSnapshot> => {
      try {
        const snapshotData = createSnapshotData(scheduleResult, getCurrentTime())
        const newSnapshot = await window.electronAPI.db.createScheduleSnapshot(snapshotData, label)

        set((state) => ({
          snapshots: [newSnapshot, ...state.snapshots],
          todaySnapshot: newSnapshot, // This is now today's most recent
        }))

        logger.ui.info('Created schedule snapshot', {
          id: newSnapshot.id,
          label,
          scheduledCount: snapshotData.totalScheduled,
        }, 'snapshot-created')

        return newSnapshot
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        logger.ui.error('Failed to create snapshot', { error: errorMessage }, 'snapshot-create-error')
        throw error
      }
    },

    /**
     * Delete a schedule snapshot.
     */
    deleteSnapshot: async (id: string): Promise<void> => {
      try {
        await window.electronAPI.db.deleteScheduleSnapshot(id)

        set((state) => {
          const newSnapshots = state.snapshots.filter((s) => s.id !== id)
          const isTodaySnapshot = state.todaySnapshot?.id === id

          return {
            snapshots: newSnapshots,
            // If we deleted today's snapshot, clear it (could reload to get next most recent)
            todaySnapshot: isTodaySnapshot ? null : state.todaySnapshot,
          }
        })

        logger.ui.info('Deleted schedule snapshot', { id }, 'snapshot-deleted')
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        logger.ui.error('Failed to delete snapshot', { error: errorMessage }, 'snapshot-delete-error')
        throw error
      }
    },

    /**
     * Clear all snapshots from local state (does not delete from database).
     */
    clearSnapshots: (): void => {
      set({
        snapshots: [],
        todaySnapshot: null,
        isInitialized: false,
      })
    },

    /**
     * Check if there's a snapshot for today.
     */
    hasSnapshotToday: (): boolean => {
      return get().todaySnapshot !== null
    },

    /**
     * Get a snapshot by ID.
     */
    getSnapshotById: (id: string): ScheduleSnapshot | undefined => {
      return get().snapshots.find((s) => s.id === id)
    },
  })),
)

// Selector hooks for optimized re-renders
export const useScheduleSnapshots = (): ScheduleSnapshot[] =>
  useScheduleSnapshotStore((state) => state.snapshots)

export const useTodaySnapshot = (): ScheduleSnapshot | null =>
  useScheduleSnapshotStore((state) => state.todaySnapshot)

export const useHasSnapshotToday = (): boolean =>
  useScheduleSnapshotStore((state) => state.todaySnapshot !== null)
