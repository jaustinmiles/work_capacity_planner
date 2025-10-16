import { useMemo, useCallback } from 'react'
import { UnifiedSchedulerAdapter, SchedulingOptions, ScheduleResult, ScheduledItem, SchedulingMetrics } from '@shared/unified-scheduler-adapter'
import { Task } from '@shared/types'
import { SequencedTask } from '@shared/sequencing-types'
import { DailyWorkPattern } from '@shared/work-blocks-types'
import { logger } from '@/logger'
import { getCurrentTime as _getCurrentTime } from '@shared/time-provider'

/**
 * React hook for using UnifiedScheduler in UI components
 * Provides logging-enhanced scheduling functionality with performance monitoring
 */
export function useUnifiedScheduler(): {
  scheduleForGantt: (tasks: Task[], workPatterns: DailyWorkPattern[], options?: SchedulingOptions, sequencedTasks?: SequencedTask[]) => ScheduleResult
  getNextScheduledTask: (tasks: Task[], workPatterns: DailyWorkPattern[], options?: SchedulingOptions, sequencedTasks?: SequencedTask[]) => ScheduledItem | null
  validateDependencies: (tasks: Task[]) => { isValid: boolean; errors: string[] }
  calculateTaskPriority: (task: Task) => number
  getSchedulingMetrics: (tasks: Task[], workPatterns: DailyWorkPattern[], options?: SchedulingOptions, sequencedTasks?: SequencedTask[]) => SchedulingMetrics
  adapter: UnifiedSchedulerAdapter
} {
  const adapter = useMemo(() => {
    // LOGGER_REMOVED: logger.ui.info('🔄 Creating UnifiedScheduler adapter instance')
    return new UnifiedSchedulerAdapter()
  }, [])

  const scheduleForGantt = useCallback((
    tasks: Task[],
    workPatterns: DailyWorkPattern[],
    options: SchedulingOptions = {},
    sequencedTasks: SequencedTask[] = [],
  ): ScheduleResult => {
    const startTime = globalThis.performance.now()

    // [WorkPatternLifeCycle] START: UnifiedScheduler scheduling tasks
    // LOGGER_REMOVED: logger.ui.info('[WorkPatternLifeCycle] useUnifiedScheduler.scheduleForGantt - START', {
    //   tasksCount: tasks.length,
    //   sequencedTasksCount: sequencedTasks.length,
    //   workPatternsCount: workPatterns.length,
    //   patternsWithBlocks: workPatterns.filter(p => p.blocks && p.blocks.length > 0).length,
    //   totalCapacityMinutes: workPatterns.reduce((sum, p) => {
    //     return sum + (p.blocks || []).reduce((blockSum: number, b: any) => {
    //       const capacity = b.capacity || {}
    //       return blockSum + (capacity.focus || 0) + (capacity.admin || 0)
    //     }, 0)
    //   }, 0),
    //   options: {
    //     startDate: options.startDate instanceof Date ? options.startDate.toISOString() : options.startDate,
    //     endDate: options.endDate instanceof Date ? options.endDate.toISOString() : options.endDate,
    //     respectDeadlines: options.respectDeadlines,
    //     allowSplitting: options.allowSplitting,
    //   },
    //   timestamp: getCurrentTime().toISOString(),
    //   localTime: getCurrentTime().toLocaleTimeString('en-US', { hour12: false }),
    // })

    // LOGGER_REMOVED: logger.ui.info('📊 [GANTT] Starting UnifiedScheduler calculation', {
      // LOGGER_REMOVED: tasksCount: tasks.length,
      // LOGGER_REMOVED: sequencedTasksCount: sequencedTasks.length,
      // LOGGER_REMOVED: workPatternsCount: workPatterns.length,
      // LOGGER_REMOVED: options: {
        // LOGGER_REMOVED: startDate: options.startDate,
        // LOGGER_REMOVED: endDate: options.endDate,
        // LOGGER_REMOVED: respectDeadlines: options.respectDeadlines,
        // LOGGER_REMOVED: allowSplitting: options.allowSplitting,
        // LOGGER_REMOVED: debug: true, // Always enable debug for now
      // LOGGER_REMOVED: },
    // LOGGER_REMOVED: })

    try {
      // Pass currentTime explicitly if startDate is a Date
      const enhancedOptions = {
        ...options,
        currentTime: options.startDate instanceof Date ? options.startDate : undefined,
      }
      const result = adapter.scheduleTasks(tasks, workPatterns, enhancedOptions, sequencedTasks)

      const duration = globalThis.performance.now() - startTime

      // [WorkPatternLifeCycle] COMPLETE: UnifiedScheduler finished scheduling
      logger.ui.debug('useUnifiedScheduler.scheduleForGantt - COMPLETE', {
        scheduledCount: result.scheduledTasks.length,
        unscheduledCount: result.unscheduledTasks.length,
        conflicts: result.conflicts.length,
        totalDuration: result.totalDuration,
        performanceMs: Math.round(duration * 100) / 100,
        timestamp: _getCurrentTime().toISOString(),
      }, 'gantt-schedule-complete')

      // LOGGER_REMOVED: logger.ui.info('✅ [GANTT] UnifiedScheduler completed', {
      //   scheduledCount: result.scheduledTasks.length,
      //   unscheduledCount: result.unscheduledTasks.length,
      //   conflicts: result.conflicts.length,
      //   totalDuration: result.totalDuration,
      //   performanceMs: Math.round(duration * 100) / 100,
      // })

      // Log debug info if available (from the result we already have)
      if (result.debugInfo) {
        // LOGGER_REMOVED: logger.ui.debug('🔍 [GANTT] Debug Info', {
          // LOGGER_REMOVED: unscheduledItems: result.debugInfo.unscheduledItems,
          // LOGGER_REMOVED: blockUtilization: result.debugInfo.blockUtilization,
          // LOGGER_REMOVED: warnings: result.debugInfo.warnings,
          // LOGGER_REMOVED: totalScheduled: result.debugInfo.totalScheduled,
          // LOGGER_REMOVED: totalUnscheduled: result.debugInfo.totalUnscheduled,
          // LOGGER_REMOVED: scheduleEfficiency: result.debugInfo.scheduleEfficiency,
        // LOGGER_REMOVED: })
      }

      // Log unscheduled tasks for debugging
      if (result.unscheduledTasks.length > 0) {
        // [WorkPatternLifeCycle] Log unscheduled tasks
        // LOGGER_REMOVED: logger.ui.debug('[WorkPatternLifeCycle] useUnifiedScheduler - Unscheduled tasks', {
          // count: result.unscheduledTasks.length,
          // tasks: result.unscheduledTasks.map(task => ({
            // id: task.id,
            // name: task.name,
            // duration: task.duration,
            // type: task.type,
            // priority: task.importance * task.urgency,
          // })),
          // timestamp: getCurrentTime().toISOString(),
        // })

        result.unscheduledTasks.forEach(task => {
          logger.ui.debug('Task unscheduled', {
            taskId: task.id,
            taskName: task.name,
            duration: task.duration,
            taskType: task.type,
            importance: task.importance,
            urgency: task.urgency,
            reason: 'No available capacity or constraints not met',
          }, 'gantt-task-unscheduled')
        })
      }

      // Log conflicts if any
      if (result.conflicts.length > 0) {
        // LOGGER_REMOVED: logger.ui.warn('🚨 [GANTT] Scheduling conflicts detected', {
          // LOGGER_REMOVED: conflictCount: result.conflicts.length,
          // LOGGER_REMOVED: conflicts: result.conflicts,
        // LOGGER_REMOVED: })
      }

      return result
    } catch (error) {
      // LOGGER_REMOVED: logger.ui.error('❌ [GANTT] UnifiedScheduler failed', error)

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
    options: SchedulingOptions = {},
    sequencedTasks: SequencedTask[] = [],
  ) => {
    // LOGGER_REMOVED: logger.ui.debug('🎯 [GANTT] Getting next scheduled task')

    try {
      const nextTask = adapter.getNextScheduledTask(tasks, workPatterns, options, sequencedTasks)

      if (nextTask) {
        // LOGGER_REMOVED: logger.ui.info('📋 [GANTT] Next task identified', {
          // taskId: nextTask.task.id,
          // taskName: nextTask.task.name,
          // startTime: nextTask.startTime.toISOString(),
          // endTime: nextTask.endTime.toISOString(),
          // priority: nextTask.priority,
        // })
      } else {
        // LOGGER_REMOVED: logger.ui.debug('🔍 [GANTT] No next task found')
      }

      return nextTask
    } catch (error) {
      logger.ui.error('Failed to get next scheduled task', {
        error: error instanceof Error ? error.message : String(error),
      }, 'gantt-next-task-error')
      return null
    }
  }, [adapter])

  const validateDependencies = useCallback((tasks: Task[]) => {
    // LOGGER_REMOVED: logger.ui.debug('🔗 [GANTT] Validating task dependencies', {
      // LOGGER_REMOVED: tasksCount: tasks.length,
    // LOGGER_REMOVED: })

    const validation = adapter.validateDependencies(tasks)

    if (!validation.isValid) {
      // LOGGER_REMOVED: logger.ui.warn('⚠️ [GANTT] Dependency validation failed', {
        // LOGGER_REMOVED: errors: validation.errors,
      // LOGGER_REMOVED: })
    } else {
      // LOGGER_REMOVED: logger.ui.debug('✅ [GANTT] Dependencies validated successfully')
    }

    return validation
  }, [adapter])

  const calculateTaskPriority = useCallback((task: Task) => {
    const priority = adapter.calculateTaskPriority(task)

    // LOGGER_REMOVED: logger.ui.debug('📊 [GANTT] Task priority calculated', {
      // taskId: task.id,
      // taskName: task.name,
      // priority: Math.round(priority * 100) / 100,
      // importance: task.importance,
      // urgency: task.urgency,
      // deadline: task.deadline?.toISOString(),
    // })

    return priority
  }, [adapter])

  const getSchedulingMetrics = useCallback((
    tasks: Task[],
    workPatterns: DailyWorkPattern[],
    options: SchedulingOptions = {},
    sequencedTasks: SequencedTask[] = [],
  ) => {
    // LOGGER_REMOVED: logger.ui.debug('📈 [GANTT] Calculating scheduling metrics')

    const metrics = adapter.getSchedulingMetrics(tasks, workPatterns, options, sequencedTasks)

    // LOGGER_REMOVED: logger.ui.info('📊 [GANTT] Scheduling metrics calculated', {
      // totalTasks: metrics.totalTasks,
      // scheduledTasks: metrics.scheduledTasks,
      // unscheduledTasks: metrics.unscheduledTasks,
      // utilizationRate: Math.round(metrics.utilizationRate * 1000) / 10, // Convert to percentage
      // averagePriority: Math.round(metrics.averagePriority * 100) / 100,
      // totalDurationHours: Math.round(metrics.totalDuration / 60 * 100) / 100,
    // })

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
export type { ScheduleResult, SchedulingOptions, SchedulingMetrics } from '@shared/unified-scheduler-adapter'
