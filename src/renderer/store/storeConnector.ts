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

  // SIMPLIFIED: Subscribe to tasks directly
  const unsubTasks = useTaskStore.subscribe(
    (state) => state.tasks,
    (tasks) => {
      logger.ui.info('Tasks changed, updating scheduler', {
        taskCount: tasks.length,
        taskNames: tasks.map(t => t.name),
      }, 'tasks-changed')

      useSchedulerStore.getState().setInputs({
        tasks,
        sequencedTasks: useTaskStore.getState().sequencedTasks,
      })
    },
  )

  // Subscribe to sequenced tasks directly
  const unsubSequencedTasks = useTaskStore.subscribe(
    (state) => state.sequencedTasks,
    (sequencedTasks) => {
      logger.ui.info('Sequenced tasks changed, updating scheduler', {
        sequencedCount: sequencedTasks.length,
        workflowNames: sequencedTasks.map(w => w.name),
      }, 'workflows-changed')

      useSchedulerStore.getState().setInputs({
        tasks: useTaskStore.getState().tasks,
        sequencedTasks,
      })
    },
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
    unsubTasks()
    unsubSequencedTasks()
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
