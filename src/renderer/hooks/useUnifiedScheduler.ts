import { useMemo, useCallback } from 'react'
import { UnifiedSchedulerAdapter, LegacySchedulingOptions, LegacyScheduleResult } from '@shared/unified-scheduler-adapter'
import { Task } from '@shared/types'
import { SequencedTask } from '@shared/sequencing-types'
import { DailyWorkPattern } from '@shared/work-blocks-types'
import { logger } from '../utils/logger'

/**
 * React hook for using UnifiedScheduler in UI components
 * Provides logging-enhanced scheduling functionality with performance monitoring
 */
export function useUnifiedScheduler(): {
  scheduleForGantt: (tasks: Task[], workPatterns: DailyWorkPattern[], options?: LegacySchedulingOptions, sequencedTasks?: SequencedTask[]) => LegacyScheduleResult
  getNextScheduledTask: (tasks: Task[], workPatterns: DailyWorkPattern[], options?: LegacySchedulingOptions, sequencedTasks?: SequencedTask[]) => any
  validateDependencies: (tasks: Task[]) => { isValid: boolean; errors: string[] }
  calculateTaskPriority: (task: Task) => number
  getSchedulingMetrics: (tasks: Task[], workPatterns: DailyWorkPattern[], options?: LegacySchedulingOptions, sequencedTasks?: SequencedTask[]) => any
  adapter: UnifiedSchedulerAdapter
} {
  const adapter = useMemo(() => {
    logger.ui.info('🔄 Creating UnifiedScheduler adapter instance')
    return new UnifiedSchedulerAdapter()
  }, [])

  const scheduleForGantt = useCallback((
    tasks: Task[],
    workPatterns: DailyWorkPattern[],
    options: LegacySchedulingOptions = {},
    sequencedTasks: SequencedTask[] = [],
  ): LegacyScheduleResult => {
    const startTime = globalThis.performance.now()

    logger.ui.info('📊 [GANTT] Starting UnifiedScheduler calculation', {
      tasksCount: tasks.length,
      sequencedTasksCount: sequencedTasks.length,
      workPatternsCount: workPatterns.length,
      options: {
        startDate: options.startDate,
        endDate: options.endDate,
        respectDeadlines: options.respectDeadlines,
        allowSplitting: options.allowSplitting,
        debug: true, // Always enable debug for now
      },
    })

    try {
      const result = adapter.scheduleTasks(tasks, workPatterns, options, sequencedTasks)

      const duration = globalThis.performance.now() - startTime

      logger.ui.info('✅ [GANTT] UnifiedScheduler completed', {
        scheduledCount: result.scheduledTasks.length,
        unscheduledCount: result.unscheduledTasks.length,
        conflicts: result.conflicts.length,
        totalDuration: result.totalDuration,
        performanceMs: Math.round(duration * 100) / 100,
      })

      // Log debug info if available
      // Filter out workflow tasks to avoid duplicates - UnifiedScheduler will expand workflows internally
      const standaloneTasks = tasks.filter(t => !t.hasSteps)
      const unifiedResult = adapter.getUnifiedScheduler().scheduleForDisplay([...standaloneTasks, ...sequencedTasks], adapter.createSimpleContext(workPatterns, options.startDate, tasks, sequencedTasks), {
        startDate: options.startDate || new Date().toISOString().split('T')[0],
        debugMode: true,
        allowTaskSplitting: options.allowSplitting,
        respectMeetings: true,
      })

      if (unifiedResult.debugInfo) {
        logger.ui.debug('🔍 [GANTT] Debug Info', {
          unscheduledItems: unifiedResult.debugInfo.unscheduledItems,
          blockUtilization: unifiedResult.debugInfo.blockUtilization,
          warnings: unifiedResult.debugInfo.warnings,
          totalScheduled: unifiedResult.debugInfo.totalScheduled,
          totalUnscheduled: unifiedResult.debugInfo.totalUnscheduled,
          scheduleEfficiency: unifiedResult.debugInfo.scheduleEfficiency,
        })
      }

      // Log unscheduled tasks for debugging
      if (result.unscheduledTasks.length > 0) {
        result.unscheduledTasks.forEach(task => {
          logger.ui.debug('⚠️ [GANTT] Task unscheduled', {
            taskId: task.id,
            taskName: task.name,
            duration: task.duration,
            taskType: task.type,
            importance: task.importance,
            urgency: task.urgency,
            reason: 'No available capacity or constraints not met',
          })
        })
      }

      // Log conflicts if any
      if (result.conflicts.length > 0) {
        logger.ui.warn('🚨 [GANTT] Scheduling conflicts detected', {
          conflictCount: result.conflicts.length,
          conflicts: result.conflicts,
        })
      }

      return result
    } catch (error) {
      logger.ui.error('❌ [GANTT] UnifiedScheduler failed', error)

      // Return empty result on error to prevent UI crashes
      return {
        scheduledTasks: [],
        unscheduledTasks: tasks,
        conflicts: ['Scheduling failed: ' + (error instanceof Error ? error.message : 'Unknown error')],
        totalDuration: 0,
      }
    }
  }, [adapter])

  const getNextScheduledTask = useCallback((
    tasks: Task[],
    workPatterns: DailyWorkPattern[],
    options: LegacySchedulingOptions = {},
    sequencedTasks: SequencedTask[] = [],
  ) => {
    logger.ui.debug('🎯 [GANTT] Getting next scheduled task')

    try {
      const nextTask = adapter.getNextScheduledTask(tasks, workPatterns, options, sequencedTasks)

      if (nextTask) {
        logger.ui.info('📋 [GANTT] Next task identified', {
          taskId: nextTask.task.id,
          taskName: nextTask.task.name,
          startTime: nextTask.startTime.toISOString(),
          endTime: nextTask.endTime.toISOString(),
          priority: nextTask.priority,
        })
      } else {
        logger.ui.debug('🔍 [GANTT] No next task found')
      }

      return nextTask
    } catch (error) {
      logger.ui.error('❌ [GANTT] Failed to get next scheduled task', error)
      return null
    }
  }, [adapter])

  const validateDependencies = useCallback((tasks: Task[]) => {
    logger.ui.debug('🔗 [GANTT] Validating task dependencies', {
      tasksCount: tasks.length,
    })

    const validation = adapter.validateDependencies(tasks)

    if (!validation.isValid) {
      logger.ui.warn('⚠️ [GANTT] Dependency validation failed', {
        errors: validation.errors,
      })
    } else {
      logger.ui.debug('✅ [GANTT] Dependencies validated successfully')
    }

    return validation
  }, [adapter])

  const calculateTaskPriority = useCallback((task: Task) => {
    const priority = adapter.calculateTaskPriority(task)

    logger.ui.debug('📊 [GANTT] Task priority calculated', {
      taskId: task.id,
      taskName: task.name,
      priority: Math.round(priority * 100) / 100,
      importance: task.importance,
      urgency: task.urgency,
      deadline: task.deadline?.toISOString(),
    })

    return priority
  }, [adapter])

  const getSchedulingMetrics = useCallback((
    tasks: Task[],
    workPatterns: DailyWorkPattern[],
    options: LegacySchedulingOptions = {},
    sequencedTasks: SequencedTask[] = [],
  ) => {
    logger.ui.debug('📈 [GANTT] Calculating scheduling metrics')

    const metrics = adapter.getSchedulingMetrics(tasks, workPatterns, options, sequencedTasks)

    logger.ui.info('📊 [GANTT] Scheduling metrics calculated', {
      totalTasks: metrics.totalTasks,
      scheduledTasks: metrics.scheduledTasks,
      unscheduledTasks: metrics.unscheduledTasks,
      utilizationRate: Math.round(metrics.utilizationRate * 1000) / 10, // Convert to percentage
      averagePriority: Math.round(metrics.averagePriority * 100) / 100,
      totalDurationHours: Math.round(metrics.totalDuration / 60 * 100) / 100,
    })

    return metrics
  }, [adapter])

  return {
    // Core scheduling functions
    scheduleForGantt,
    getNextScheduledTask,

    // Utility functions
    validateDependencies,
    calculateTaskPriority,
    getSchedulingMetrics,

    // Direct adapter access for advanced usage
    adapter,
  }
}

// Export types for convenience
export type { LegacyScheduleResult, LegacySchedulingOptions } from '@shared/unified-scheduler-adapter'
