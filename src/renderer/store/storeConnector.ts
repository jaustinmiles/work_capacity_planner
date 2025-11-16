/**
 * STORE CONNECTOR
 *
 * Connects reactive stores together to ensure data flows automatically
 * between them. This replaces the event-based system with pure reactivity.
 */

import { useTaskStore } from './useTaskStore'
import { useSchedulerStore } from './useSchedulerStore'
import { useWorkPatternStore } from './useWorkPatternStore'
import { logger } from '@/logger'
import { shallow } from 'zustand/shallow'
import type { Task } from '@shared/types'
import type { SequencedTask } from '@shared/sequencing-types'
import type { WorkSettings } from '@shared/work-settings-types'
import type { UnifiedWorkSession } from '@shared/unified-work-session-types'

let isConnected = false

export const connectStores = () => {
  if (isConnected) {
    logger.ui.warn('Store connector already initialized', {}, 'store-connector')
    return
  }

  logger.ui.info('Initializing reactive store connections', {}, 'store-connector')

  // MERGED SUBSCRIPTION with debouncing to prevent subscription storm
  // When a single set() updates multiple properties, this ensures we only trigger
  // scheduler recomputation ONCE instead of 3+ times
  let taskStoreUpdateTimeout: NodeJS.Timeout | null = null
  const TASK_STORE_DEBOUNCE_MS = 100 // Debounce to batch rapid updates and prevent race conditions

  // Track previous state to detect which properties actually changed
  // This preserves critical optimizations (e.g., activeWorkSessions-only changes
  // don't trigger full schedule recomputation)
  let previousState = {
    tasks: [] as Task[],
    sequencedTasks: [] as SequencedTask[],
    workSettings: null as WorkSettings | null,
    activeWorkSessions: new Map() as Map<string, UnifiedWorkSession>,
    nextTaskSkipIndex: 0,
  }

  const unsubTaskStore = useTaskStore.subscribe(
    (state) => ({
      tasks: state.tasks,
      sequencedTasks: state.sequencedTasks,
      workSettings: state.workSettings,
      activeWorkSessions: state.activeWorkSessions,
      nextTaskSkipIndex: state.nextTaskSkipIndex,
    }),
    (current) => {
      // Clear any pending update
      if (taskStoreUpdateTimeout) {
        clearTimeout(taskStoreUpdateTimeout)
      }

      // Debounce: Wait for all property changes from a single set() to settle
      taskStoreUpdateTimeout = setTimeout(() => {
        // Detect which properties actually changed using reference equality
        // This preserves the activeWorkSessions-only optimization path
        const changes: {
          tasks?: Task[]
          sequencedTasks?: SequencedTask[]
          workSettings?: WorkSettings | null
          activeWorkSessions?: Set<string>
        } = {}

        if (current.tasks !== previousState.tasks) {
          changes.tasks = current.tasks
        }
        if (current.sequencedTasks !== previousState.sequencedTasks) {
          changes.sequencedTasks = current.sequencedTasks
        }
        if (current.workSettings !== previousState.workSettings) {
          changes.workSettings = current.workSettings
        }
        if (current.activeWorkSessions !== previousState.activeWorkSessions) {
          changes.activeWorkSessions = new Set(current.activeWorkSessions.keys())
        }

        logger.ui.info('Task store state changed, updating scheduler', {
          taskCount: current.tasks.length,
          workflowCount: current.sequencedTasks.length,
          sessionCount: current.activeWorkSessions.size,
          skipIndex: current.nextTaskSkipIndex,
          changedProperties: Object.keys(changes), // Shows exactly what changed
        }, 'task-store-changed')

        // CRITICAL: Only pass properties that actually changed
        // This allows setInputs() to take the optimization path for activeWorkSessions-only changes
        if (Object.keys(changes).length > 0) {
          useSchedulerStore.getState().setInputs(changes)
        }

        // Update skip index separately (doesn't trigger full recompute)
        if (current.nextTaskSkipIndex !== previousState.nextTaskSkipIndex) {
          useSchedulerStore.getState().setNextTaskSkipIndex(current.nextTaskSkipIndex)
        }

        // Update previous state tracking for next comparison
        previousState = {
          tasks: current.tasks,
          sequencedTasks: current.sequencedTasks,
          workSettings: current.workSettings,
          activeWorkSessions: current.activeWorkSessions,
          nextTaskSkipIndex: current.nextTaskSkipIndex,
        }

        taskStoreUpdateTimeout = null
      }, TASK_STORE_DEBOUNCE_MS)
    },
    { equalityFn: shallow }, // Shallow comparison for all watched fields
  )

  // Connect work pattern changes to scheduler store
  const unsubPatternStore = useWorkPatternStore.subscribe(
    (state) => state.workPatterns,
    (workPatterns) => {
      logger.ui.info('Work patterns changed, updating scheduler', {
        patternCount: workPatterns.length,
        dates: workPatterns.map(p => p.date),
        totalBlocks: workPatterns.reduce((sum, p) => sum + p.blocks.length, 0),
        blockDetails: workPatterns.flatMap(p =>
          p.blocks.map(b => ({
            date: p.date,
            id: b.id,
            time: `${b.startTime}-${b.endTime}`,
            type: b.type,
            capacity: b.capacity ? {
              totalMinutes: (b.capacity as any).totalMinutes,
              type: (b.capacity as any).type,
              splitRatio: (b.capacity as any).splitRatio || null,
            } : null,
          })),
        ),
      }, 'work-patterns-updated')

      useSchedulerStore.getState().setInputs({ workPatterns })
    },
  )

  isConnected = true

  logger.ui.info('Store connections established', {}, 'store-connector')

  // Return cleanup function
  return () => {
    // Clean up debounce timeout if pending
    if (taskStoreUpdateTimeout) {
      clearTimeout(taskStoreUpdateTimeout)
    }
    unsubTaskStore()
    unsubPatternStore()
    isConnected = false
  }
}

// Auto-connect on module load if in browser environment
if (typeof window !== 'undefined') {
  // Delay connection slightly to ensure stores are initialized
  setTimeout(() => {
    connectStores()
  }, 100)
}
