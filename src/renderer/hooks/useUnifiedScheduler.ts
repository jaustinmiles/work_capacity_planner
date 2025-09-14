import { useMemo, useCallback } from 'react'
import { UnifiedSchedulerAdapter, SchedulingOptions, ScheduleResult, ScheduledItem, SchedulingMetrics } from '@shared/unified-scheduler-adapter'
import { Task } from '@shared/types'
import { SequencedTask } from '@shared/sequencing-types'
import { DailyWorkPattern } from '@shared/work-blocks-types'
import { logger } from '../utils/logger'
import { getCurrentTime } from '@shared/time-provider'

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
    logger.ui.info('🔄 Creating UnifiedScheduler adapter instance')
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
    logger.ui.info('[WorkPatternLifeCycle] useUnifiedScheduler.scheduleForGantt - START', {
      tasksCount: tasks.length,
      sequencedTasksCount: sequencedTasks.length,
      workPatternsCount: workPatterns.length,
      patternsWithBlocks: workPatterns.filter(p => p.blocks && p.blocks.length > 0).length,
      totalCapacityMinutes: workPatterns.reduce((sum, p) => {
        return sum + (p.blocks || []).reduce((blockSum: number, b: any) => {
          const capacity = b.capacity || {}
          return blockSum + (capacity.focusMinutes || 0) + (capacity.adminMinutes || 0)
        }, 0)
      }, 0),
      options: {
        startDate: options.startDate instanceof Date ? options.startDate.toISOString() : options.startDate,
        endDate: options.endDate instanceof Date ? options.endDate.toISOString() : options.endDate,
        respectDeadlines: options.respectDeadlines,
        allowSplitting: options.allowSplitting,
      },
      timestamp: getCurrentTime().toISOString(),
      localTime: getCurrentTime().toLocaleTimeString('en-US', { hour12: false })
    })

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
      // Pass currentTime explicitly if startDate is a Date
      const enhancedOptions = {
        ...options,
        currentTime: options.startDate instanceof Date ? options.startDate : undefined
      }
      const result = adapter.scheduleTasks(tasks, workPatterns, enhancedOptions, sequencedTasks)

      const duration = globalThis.performance.now() - startTime

      // [WorkPatternLifeCycle] COMPLETE: UnifiedScheduler finished scheduling
      logger.ui.info('[WorkPatternLifeCycle] useUnifiedScheduler.scheduleForGantt - COMPLETE', {
        scheduledCount: result.scheduledTasks.length,
        unscheduledCount: result.unscheduledTasks.length,
        conflicts: result.conflicts.length,
        totalDuration: result.totalDuration,
        performanceMs: Math.round(duration * 100) / 100,
        blockUtilization: result.debugInfo?.blockUtilization || [],
        warnings: result.debugInfo?.warnings || [],
        timestamp: getCurrentTime().toISOString()
      })

      logger.ui.info('✅ [GANTT] UnifiedScheduler completed', {
        scheduledCount: result.scheduledTasks.length,
        unscheduledCount: result.unscheduledTasks.length,
        conflicts: result.conflicts.length,
        totalDuration: result.totalDuration,
        performanceMs: Math.round(duration * 100) / 100,
      })

      // Log debug info if available (from the result we already have)
      if (result.debugInfo) {
        logger.ui.debug('🔍 [GANTT] Debug Info', {
          unscheduledItems: result.debugInfo.unscheduledItems,
          blockUtilization: result.debugInfo.blockUtilization,
          warnings: result.debugInfo.warnings,
          totalScheduled: result.debugInfo.totalScheduled,
          totalUnscheduled: result.debugInfo.totalUnscheduled,
          scheduleEfficiency: result.debugInfo.scheduleEfficiency,
        })
      }

      // Log unscheduled tasks for debugging
      if (result.unscheduledTasks.length > 0) {
        // [WorkPatternLifeCycle] Log unscheduled tasks
        logger.ui.debug('[WorkPatternLifeCycle] useUnifiedScheduler - Unscheduled tasks', {
          count: result.unscheduledTasks.length,
          tasks: result.unscheduledTasks.map(task => ({
            id: task.id,
            name: task.name,
            duration: task.duration,
            type: task.type,
            priority: task.importance * task.urgency
          })),
          timestamp: getCurrentTime().toISOString()
        })
        
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
    options: SchedulingOptions = {},
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
    options: SchedulingOptions = {},
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
export type { ScheduleResult, SchedulingOptions, SchedulingMetrics } from '@shared/unified-scheduler-adapter'
