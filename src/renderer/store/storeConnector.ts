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

let isConnected = false

export const connectStores = () => {
  if (isConnected) {
    logger.ui.warn('Store connector already initialized', {}, 'store-connector')
    return
  }

  logger.ui.info('Initializing reactive store connections', {}, 'store-connector')

  // Subscribe to tasks AND sequencedTasks together to avoid race conditions
  // This ensures when both change simultaneously, scheduler gets both new values
  const unsubTaskData = useTaskStore.subscribe(
    (state) => ({ tasks: state.tasks, sequencedTasks: state.sequencedTasks }),
    ({ tasks, sequencedTasks }) => {
      logger.ui.info('Task data changed, updating scheduler', {
        taskCount: tasks.length,
        workflowCount: sequencedTasks.length,
        taskNames: tasks.map(t => t.name),
        workflowNames: sequencedTasks.map(w => w.name),
      }, 'task-data-changed')

      useSchedulerStore.getState().setInputs({ tasks, sequencedTasks })
    },
    { equalityFn: shallow }, // Use shallow comparison - fires when tasks OR sequencedTasks reference changes
  )

  // Subscribe to work settings directly
  const unsubWorkSettings = useTaskStore.subscribe(
    (state) => state.workSettings,
    (workSettings) => {
      logger.ui.info('Work settings changed, updating scheduler', {}, 'work-settings-changed')
      useSchedulerStore.getState().setInputs({ workSettings })
    },
  )

  // Subscribe to active work sessions directly
  const unsubActiveWorkSessions = useTaskStore.subscribe(
    (state) => state.activeWorkSessions,
    (activeWorkSessions) => {
      logger.ui.debug('Active work sessions changed, updating scheduler', {
        sessionCount: activeWorkSessions.size,
      }, 'sessions-changed')

      useSchedulerStore.getState().setInputs({
        activeWorkSessions: new Set(activeWorkSessions.keys()),
      })
    },
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
    unsubTaskData()
    unsubWorkSettings()
    unsubActiveWorkSessions()
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
