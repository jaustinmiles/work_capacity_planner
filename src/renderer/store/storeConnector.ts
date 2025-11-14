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

let isConnected = false

export const connectStores = () => {
  if (isConnected) {
    logger.ui.warn('Store connector already initialized', {}, 'store-connector')
    return
  }

  logger.ui.info('Initializing reactive store connections', {}, 'store-connector')

  // Connect task store changes to scheduler store
  const unsubTaskStore = useTaskStore.subscribe(
    (state) => ({
      tasks: state.tasks,
      sequencedTasks: state.sequencedTasks,
      workSettings: state.workSettings,
      activeWorkSessions: state.activeWorkSessions,
    }),
    (values) => {
      logger.ui.debug('Task store changed, updating scheduler', {
        taskCount: values.tasks.length,
        sequencedCount: values.sequencedTasks.length,
      }, 'store-sync')

      useSchedulerStore.getState().setInputs({
        tasks: values.tasks,
        sequencedTasks: values.sequencedTasks,
        workSettings: values.workSettings,
        activeWorkSessions: new Set(values.activeWorkSessions.keys()),
      })
    },
  )

  // Connect work pattern changes to scheduler store
  const unsubPatternStore = useWorkPatternStore.subscribe(
    (state) => state.workPatterns,
    (workPatterns) => {
      logger.ui.debug('Work patterns changed, updating scheduler', {
        patternCount: workPatterns.length,
      }, 'store-sync')

      useSchedulerStore.getState().setInputs({ workPatterns })
    },
  )

  // Connect next task skip index from task store to scheduler
  const unsubSkipIndex = useTaskStore.subscribe(
    (state) => state.nextTaskSkipIndex,
    (skipIndex) => {
      useSchedulerStore.getState().setNextTaskSkipIndex(skipIndex)
    },
  )

  isConnected = true

  logger.ui.info('Store connections established', {}, 'store-connector')

  // Return cleanup function
  return () => {
    unsubTaskStore()
    unsubPatternStore()
    unsubSkipIndex()
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
