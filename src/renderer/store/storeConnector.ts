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
import { SCHEDULING_CONSTANTS } from '@shared/constants/scheduling'
import {
  haveTasksChanged,
  haveSequencedTasksChanged,
  haveWorkSettingsChanged,
  haveActiveSessionsChanged,
  filterSchedulableItems,
  filterSchedulableWorkflows,
  filterSprintTasks,
  filterSprintWorkflows,
} from '@shared/utils/store-comparison'

let isConnected = false

// Track previous state at module level so it can be reset on session switch
let previousState = {
  tasks: [] as Task[],
  sequencedTasks: [] as SequencedTask[],
  workSettings: null as WorkSettings | null,
  activeWorkSessions: new Map() as Map<string, UnifiedWorkSession>,
  nextTaskSkipIndex: 0,
}

/**
 * Resets the store connector's previous state tracking.
 * MUST be called before session switch to prevent stale data comparisons.
 */
export const resetStoreConnectorState = (): void => {
  logger.ui.info('Resetting store connector state for session switch', {}, 'store-connector-reset')
  previousState = {
    tasks: [],
    sequencedTasks: [],
    workSettings: null,
    activeWorkSessions: new Map(),
    nextTaskSkipIndex: 0,
  }
}

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

  // Note: previousState is now at module level to allow reset on session switch

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
        // Detect which properties actually changed using proper content comparison
        const changes: {
          tasks?: Task[]
          sequencedTasks?: SequencedTask[]
          workSettings?: WorkSettings | null
          activeWorkSessions?: Set<string>
        } = {}

        // Get sprint mode status for filtering
        const sprintModeEnabled = useTaskStore.getState().sprintModeEnabled

        // Compare tasks using proper content comparison that includes ALL scheduling-relevant properties
        if (haveTasksChanged(current.tasks, previousState.tasks)) {
          // CRITICAL: Filter out completed tasks before passing to scheduler
          // This prevents the scheduler from trying to schedule completed tasks
          let schedulableTasks = filterSchedulableItems(current.tasks)

          // Apply sprint filtering when sprint mode is enabled
          if (sprintModeEnabled) {
            schedulableTasks = filterSprintTasks(schedulableTasks)
          }

          changes.tasks = schedulableTasks
        }

        // Compare sequenced tasks (workflows) with proper content comparison
        if (haveSequencedTasksChanged(current.sequencedTasks, previousState.sequencedTasks)) {
          // Filter out completed workflows before passing to scheduler
          let schedulableWorkflows = filterSchedulableWorkflows(current.sequencedTasks)

          // Apply sprint filtering when sprint mode is enabled
          if (sprintModeEnabled) {
            schedulableWorkflows = filterSprintWorkflows(schedulableWorkflows)
          }

          changes.sequencedTasks = schedulableWorkflows
        }

        // Compare work settings with all relevant properties
        if (haveWorkSettingsChanged(current.workSettings, previousState.workSettings)) {
          changes.workSettings = current.workSettings
        }

        // Compare active sessions for changes
        if (haveActiveSessionsChanged(current.activeWorkSessions, previousState.activeWorkSessions)) {
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
      }, SCHEDULING_CONSTANTS.TASK_STORE_DEBOUNCE_MS)
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
            typeConfig: b.typeConfig,
            capacity: b.capacity ? {
              totalMinutes: (b.capacity as any).totalMinutes,
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

// Auto-connect on module load if in browser environment (not in tests)
if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'test') {
  // Delay connection slightly to ensure stores are initialized
  setTimeout(() => {
    connectStores()
  }, SCHEDULING_CONSTANTS.AUTO_CONNECT_DELAY_MS)
}
