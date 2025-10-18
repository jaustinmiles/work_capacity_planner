/**
 * UnifiedSchedulerAdapter - Type conversion utilities for UI components
 * Provides compatibility layer between existing UI interfaces and UnifiedScheduler
 */

import { UnifiedScheduler, ScheduleContext, ScheduleConfig, ScheduleResult as UnifiedScheduleResult, SchedulingDebugInfo } from './unified-scheduler'
import { UnifiedScheduleItem } from './unified-scheduler'
import { Task, TaskStep } from './types'
import { SequencedTask } from './sequencing-types'
import { TaskStatus } from './enums'
import { WorkBlockType } from './constants'
import { DailyWorkPattern } from './work-blocks-types'
import { calculateBlockCapacity } from './capacity-calculator'
import { getCurrentTime } from './time-provider'

// Adapter types for backward compatibility with existing UI components
export interface ScheduleResult {
  scheduledTasks: ScheduledItem[]
  unscheduledTasks: Task[]
  conflicts: string[]
  totalDuration: number
  debugInfo?: SchedulingDebugInfo // Preserve debug info from UnifiedScheduler
}

export interface ScheduledItem {
  task: Task
  startTime: Date
  endTime: Date
  blockId?: string
  priority?: number
}

export interface SchedulingOptions {
  startDate?: string | Date
  endDate?: string | Date
  respectDeadlines?: boolean
  allowSplitting?: boolean
  debug?: boolean
}

export interface SchedulingMetrics {
  totalTasks: number
  scheduledTasks: number
  unscheduledTasks: number
  totalDuration: number
  averagePriority: number
  utilizationRate: number
}

/**
 * Adapter class to bridge existing UI components with UnifiedScheduler
 */
export class UnifiedSchedulerAdapter {
  private scheduler: UnifiedScheduler

  constructor() {
    this.scheduler = new UnifiedScheduler()
  }

  /**
   * Convert scheduling options to ScheduleConfig
   */
  adaptOptions(options: SchedulingOptions): ScheduleConfig {
    // Keep the full date/time if provided, otherwise use current date string
    let startDate: string | Date
    if (options.startDate instanceof Date) {
      // Keep as Date object to preserve time
      startDate = options.startDate
    } else if (typeof options.startDate === 'string') {
      startDate = options.startDate
    } else {
      // Default to current date string (for compatibility)
      startDate = getCurrentTime().toISOString().split('T')[0]
    }

    return {
      startDate,
      endDate: options.endDate,
      allowTaskSplitting: options.allowSplitting,
      respectMeetings: true,
      debugMode: options.debug || false,
      includeWeekends: false,
      optimizationMode: 'realistic',
    }
  }

  /**
   * Convert UnifiedScheduler result to adapter format for UI components
   */
  adaptUnifiedResult(result: UnifiedScheduleResult): ScheduleResult {
    const scheduledTasks: ScheduledItem[] = []
    const unscheduledTasks: Task[] = []

    // Convert scheduled items (excluding meetings)
    for (const item of result.scheduled) {
      // Skip meeting items - they should not appear in scheduledTasks
      if (item.type === 'meeting') {
        continue
      }

      if (item.originalItem && 'type' in item.originalItem && item.startTime && item.endTime) {
        // Handle both Task and TaskStep items
        const originalItem = item.originalItem as Task | TaskStep

        // Convert TaskStep to Task-like format for legacy compatibility
        let taskItem: Task
        if ('taskId' in originalItem) {
          // This is a TaskStep - convert to Task format
          const taskStep = originalItem as TaskStep
          taskItem = {
            id: taskStep.id,
            name: taskStep.name,
            duration: taskStep.duration,
            type: taskStep.type,
            importance: taskStep.importance || 5,
            urgency: taskStep.urgency || 5,
            asyncWaitTime: taskStep.asyncWaitTime,
            dependencies: taskStep.dependsOn || [],
            completed: taskStep.status === 'completed',
            completedAt: taskStep.completedAt,
            cognitiveComplexity: taskStep.cognitiveComplexity || 3,
            // Required Task properties
            sessionId: taskStep.taskId, // Use parent task ID as session ID
            createdAt: getCurrentTime(),
            updatedAt: getCurrentTime(),
            hasSteps: false, // TaskStep is a leaf item
            overallStatus: taskStep.status === 'completed' ? TaskStatus.Completed :
                         taskStep.status === 'in_progress' ? TaskStatus.InProgress :
                         taskStep.status === 'waiting' ? TaskStatus.Waiting : TaskStatus.NotStarted,
            criticalPathDuration: taskStep.duration,
            worstCaseDuration: taskStep.duration,
            archived: false,
          }
        } else {
          // This is already a Task
          taskItem = originalItem as Task
        }

        const scheduledItem = {
          task: taskItem,
          startTime: item.startTime,
          endTime: item.endTime,
          blockId: item.blockId,
          priority: item.priority,
        }

        // Preserve workflow metadata if this is a workflow step
        if (item.workflowId) {
          ;(scheduledItem as any).workflowId = item.workflowId
          ;(scheduledItem as any).workflowName = item.workflowName
          ;(scheduledItem as any).stepIndex = item.stepIndex
          ;(scheduledItem as any).isWorkflowStep = true
        }

        scheduledTasks.push(scheduledItem)
      }
    }

    // Convert unscheduled items
    for (const item of result.unscheduled) {
      if (item.originalItem && 'type' in item.originalItem) {
        const originalItem = item.originalItem as Task | TaskStep

        // Convert TaskStep to Task format if needed
        if ('taskId' in originalItem) {
          // This is a TaskStep - convert to Task format
          const taskStep = originalItem as TaskStep
          const taskItem: Task = {
            id: taskStep.id,
            name: taskStep.name,
            duration: taskStep.duration,
            type: taskStep.type,
            importance: taskStep.importance || 5,
            urgency: taskStep.urgency || 5,
            asyncWaitTime: taskStep.asyncWaitTime,
            dependencies: taskStep.dependsOn || [],
            completed: taskStep.status === 'completed',
            completedAt: taskStep.completedAt,
            cognitiveComplexity: taskStep.cognitiveComplexity || 3,
            // Required Task properties
            sessionId: taskStep.taskId, // Use parent task ID as session ID
            createdAt: getCurrentTime(),
            updatedAt: getCurrentTime(),
            hasSteps: false, // TaskStep is a leaf item
            overallStatus: taskStep.status === 'completed' ? TaskStatus.Completed :
                         taskStep.status === 'in_progress' ? TaskStatus.InProgress :
                         taskStep.status === 'waiting' ? TaskStatus.Waiting : TaskStatus.NotStarted,
            criticalPathDuration: taskStep.duration,
            worstCaseDuration: taskStep.duration,
            archived: false,
          }
          unscheduledTasks.push(taskItem)
        } else {
          // This is already a Task
          unscheduledTasks.push(originalItem as Task)
        }
      }
    }

    return {
      scheduledTasks,
      unscheduledTasks,
      conflicts: [
        ...(result.conflicts || []).map(c => c.description),
        ...(result.debugInfo?.warnings || []),
      ],
      totalDuration: scheduledTasks.reduce((sum, item) => sum + item.task.duration, 0),
      debugInfo: result.debugInfo, // Preserve debug info from UnifiedScheduler
    }
  }

  /**
   * Main scheduling method for UI components
   */
  scheduleTasks(
    tasks: Task[],
    workPatterns: DailyWorkPattern[],
    options: SchedulingOptions = {},
    sequencedTasks: SequencedTask[] = [],
  ): ScheduleResult {
    // Filter out completed tasks to reduce processing
    const incompleteTasks = tasks.filter(t => !t.completed)
    const incompleteWorkflows = sequencedTasks.filter(w => w.overallStatus !== 'completed')


    // Ensure we have a valid Date for currentTime
    let currentTime: Date
    if (options.startDate instanceof Date) {
      currentTime = options.startDate
    } else if (typeof options.startDate === 'string') {
      currentTime = new Date(options.startDate)
      if (isNaN(currentTime.getTime())) {
        throw new Error(`Invalid startDate string: ${options.startDate}`)
      }
    } else {
      currentTime = getCurrentTime() // Default to now if no startDate provided
    }

    // Create config WITH currentTime
    const config = this.adaptOptions(options)
    // CRITICAL FIX: Pass currentTime to the scheduler config
    const configWithCurrentTime = { ...config, currentTime }


    const context: ScheduleContext = {
      // For startDate in context, we need the date string for pattern matching
      // But we preserve currentTime with full time info
      startDate: typeof config.startDate === 'string'
        ? config.startDate
        : config.startDate instanceof Date
          ? config.startDate.toISOString().split('T')[0]
          : getCurrentTime().toISOString().split('T')[0],
      currentTime,
      tasks: [],
      workflows: incompleteWorkflows,
      workPatterns: this.fixWorkPatternCapacities(workPatterns),
      workSettings: {
        defaultWorkHours: {
          startTime: '09:00',
          endTime: '17:00',
          lunchStart: '12:00',
          lunchDuration: 60,
        },
        customWorkHours: {},
        defaultCapacity: {
          maxFocusHours: 4,
          maxAdminHours: 2,
          blockedTimes: [],
        },
        customCapacity: {},
        timeZone: 'UTC',
      },
    }

    // Combine items for scheduling - filter out workflow tasks to avoid duplicates
    // UnifiedScheduler will expand sequencedTasks into their steps internally
    const standaloneTasks = incompleteTasks.filter(t => !t.hasSteps)
    const allItems: (Task | SequencedTask | TaskStep)[] = [
      ...standaloneTasks,
      ...incompleteWorkflows,
    ]

    const result = this.scheduler.scheduleForDisplay(allItems, context, configWithCurrentTime)
    const adapterResult = this.adaptUnifiedResult(result)

    return adapterResult
  }

  /**
   * Get next scheduled task (commonly used in service layer)
   */
  getNextScheduledTask(
    tasks: Task[],
    workPatterns: DailyWorkPattern[],
    options: SchedulingOptions = {},
    sequencedTasks: SequencedTask[] = [],
  ): ScheduledItem | null {
    const result = this.scheduleTasks(tasks, workPatterns, options, sequencedTasks)

    if (result.scheduledTasks.length === 0) {
      return null
    }

    // Find the next task that hasn't started yet
    const now = getCurrentTime()
    const nextTasks = result.scheduledTasks
      .filter(item => item.startTime > now)
      .sort((a, b) => a.startTime.getTime() - b.startTime.getTime())

    return nextTasks.length > 0 ? nextTasks[0] : null
  }

  /**
   * Calculate task priority using UnifiedScheduler
   */
  calculateTaskPriority(task: Task, context?: Partial<ScheduleContext>): number {
    const fullContext: ScheduleContext = {
      startDate: getCurrentTime().toISOString().split('T')[0],
      currentTime: getCurrentTime(),
      tasks: [],
      workflows: [],
      workPatterns: [],
      workSettings: {
        defaultWorkHours: {
          startTime: '09:00',
          endTime: '17:00',
          lunchStart: '12:00',
          lunchDuration: 60,
        },
        customWorkHours: {},
        defaultCapacity: {
          maxFocusHours: 4,
          maxAdminHours: 2,
          blockedTimes: [],
        },
        customCapacity: {},
        timeZone: 'UTC',
      },
      ...context,
    }

    return this.scheduler.calculatePriority(task, fullContext)
  }

  /**
   * Check if tasks have dependency conflicts
   */
  validateDependencies(tasks: Task[]): { isValid: boolean; errors: string[] } {
    try {
      const items = tasks.map(task => this.convertTaskToUnifiedItem(task))
      const validation = this.scheduler['validateDependencies'](items) // Access private method for validation

      return {
        isValid: validation.isValid,
        errors: validation.errors.map(error => error.description),
      }
    } catch (error) {
      return {
        isValid: false,
        errors: [`Validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`],
      }
    }
  }

  /**
   * Convert Task to UnifiedScheduleItem for internal processing
   */
  private convertTaskToUnifiedItem(task: Task): UnifiedScheduleItem {
    return {
      id: task.id,
      name: task.name,
      duration: task.duration,
      dependencies: task.dependencies || [],
      priority: 0, // Will be calculated later
      taskType: task.type,
      originalItem: task,
      type: 'task',
    }
  }

  /**
   * Batch schedule multiple task sets (useful for workflow processing)
   */
  batchSchedule(
    taskSets: { tasks: Task[]; workPatterns: DailyWorkPattern[]; options?: SchedulingOptions }[],
  ): ScheduleResult[] {
    return taskSets.map(({ tasks, workPatterns, options }) =>
      this.scheduleTasks(tasks, workPatterns, options),
    )
  }

  /**
   * Get scheduling metrics
   */
  getSchedulingMetrics(
    tasks: Task[],
    workPatterns: DailyWorkPattern[],
    options: SchedulingOptions = {},
    sequencedTasks: SequencedTask[] = [],
  ): SchedulingMetrics {
    const result = this.scheduleTasks(tasks, workPatterns, options, sequencedTasks)
    const avgPriority = tasks.length > 0
      ? tasks.reduce((sum, task) => sum + this.calculateTaskPriority(task), 0) / tasks.length
      : 0

    return {
      totalTasks: tasks.length,
      scheduledTasks: result.scheduledTasks.length,
      unscheduledTasks: result.unscheduledTasks.length,
      totalDuration: result.totalDuration,
      averagePriority: avgPriority,
      utilizationRate: this.calculateUtilizationRate(result.totalDuration, workPatterns),
    }
  }

  /**
   * Calculate utilization rate as scheduled duration / total capacity
   */
  private calculateUtilizationRate(scheduledDuration: number, workPatterns: DailyWorkPattern[]): number {
    if (!workPatterns || workPatterns.length === 0) return 0

    const totalCapacity = workPatterns.reduce((sum, pattern) => {
      const blocks = pattern.blocks || []
      return sum + blocks.reduce((blockSum, block) => {
        return blockSum + (block.capacity?.totalMinutes || 0)
      }, 0)
    }, 0)

    return totalCapacity > 0 ? scheduledDuration / totalCapacity : 0
  }

  /**
   * Create a simple schedule context from minimal data
   */
  createSimpleContext(
    workPatterns: DailyWorkPattern[],
    startDate?: string | Date,
    tasks: Task[] = [],
    workflows: SequencedTask[] = [],
  ): ScheduleContext {
    return {
      startDate: typeof startDate === 'string' ? startDate : startDate?.toISOString().split('T')[0] || getCurrentTime().toISOString().split('T')[0],
      currentTime: getCurrentTime(),
      tasks,
      workflows,
      workPatterns,
      schedulingPreferences: {
        id: 'default',
        sessionId: 'default',
        allowWeekendWork: false,
        weekendPenalty: 0.8,
        contextSwitchPenalty: 5,
        asyncParallelizationBonus: 10,
        createdAt: getCurrentTime(),
        updatedAt: getCurrentTime(),
      },
      workSettings: {
        defaultWorkHours: {
          startTime: '09:00',
          endTime: '17:00',
          lunchStart: '12:00',
          lunchDuration: 60,
        },
        customWorkHours: {},
        defaultCapacity: {
          maxFocusHours: 4,
          maxAdminHours: 2,
          blockedTimes: [],
        },
        customCapacity: {},
        timeZone: 'UTC',
      },
      lastScheduledItem: null,
    }
  }

  /**
   * Fix work pattern capacities that might be null
   * Calculate sensible defaults based on block type and duration
   */
  private fixWorkPatternCapacities(workPatterns: DailyWorkPattern[]): DailyWorkPattern[] {
    return workPatterns.map(pattern => ({
      ...pattern,
      blocks: pattern.blocks.map(block => {
        // Check if block has required time properties
        if (!block.startTime || !block.endTime) {
          // Return block as-is, let downstream handle the missing properties
          return block
        }

        if (block.capacity) {
          return block // Already has capacity, keep as is
        }

        // Use the unified capacity calculator
        const capacity = calculateBlockCapacity(block.type as WorkBlockType, block.startTime, block.endTime)

        return {
          ...block,
          capacity,
        }
      }),
    }))
  }

  /**
   * Direct access to UnifiedScheduler instance for advanced usage
   */
  getUnifiedScheduler(): UnifiedScheduler {
    return this.scheduler
  }
}
