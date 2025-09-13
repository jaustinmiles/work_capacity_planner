/**
 * UnifiedSchedulerAdapter - Type conversion utilities for UI components
 * Provides compatibility layer between existing UI interfaces and UnifiedScheduler
 */

import { UnifiedScheduler, ScheduleContext, ScheduleConfig, ScheduleResult as UnifiedScheduleResult, SchedulingDebugInfo } from './unified-scheduler'
import { UnifiedScheduleItem } from './unified-scheduler'
import { Task, TaskStep } from './types'
import { SequencedTask } from './sequencing-types'
import { TaskStatus } from './enums'
import { DailyWorkPattern } from './work-blocks-types'

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
    return {
      startDate: options.startDate || new Date().toISOString().split('T')[0],
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

    // Convert scheduled items
    for (const item of result.scheduled) {
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
            createdAt: new Date(),
            updatedAt: new Date(),
            hasSteps: false, // TaskStep is a leaf item
            overallStatus: taskStep.status === 'completed' ? TaskStatus.Completed :
                         taskStep.status === 'in_progress' ? TaskStatus.InProgress :
                         taskStep.status === 'waiting' ? TaskStatus.Waiting : TaskStatus.NotStarted,
            criticalPathDuration: taskStep.duration,
            worstCaseDuration: taskStep.duration,
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
            createdAt: new Date(),
            updatedAt: new Date(),
            hasSteps: false, // TaskStep is a leaf item
            overallStatus: taskStep.status === 'completed' ? TaskStatus.Completed :
                         taskStep.status === 'in_progress' ? TaskStatus.InProgress :
                         taskStep.status === 'waiting' ? TaskStatus.Waiting : TaskStatus.NotStarted,
            criticalPathDuration: taskStep.duration,
            worstCaseDuration: taskStep.duration,
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
      conflicts: (result.conflicts || []).map(c => c.description),
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

    // Log comprehensive data flow
    console.info('[UnifiedSchedulerAdapter] 📊 DATA FLOW START:', {
      input: {
        totalTasks: tasks.length,
        incompleteTasks: incompleteTasks.length,
        totalWorkflows: sequencedTasks.length,
        incompleteWorkflows: incompleteWorkflows.length,
        workPatterns: workPatterns.length,
        totalWorkflowSteps: incompleteWorkflows.reduce((sum, w) => sum + w.steps.length, 0),
      },
      options: {
        startDate: options.startDate,
        respectDeadlines: options.respectDeadlines,
        allowSplitting: options.allowSplitting,
      },
    })

    const config = this.adaptOptions(options)

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
      throw new Error(`Invalid startDate type: expected Date or string, got ${typeof options.startDate}`)
    }

    const context: ScheduleContext = {
      startDate: typeof config.startDate === 'string' ? config.startDate : config.startDate.toISOString(),
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

    const result = this.scheduler.scheduleForDisplay(allItems, context, config)
    const adapterResult = this.adaptUnifiedResult(result)

    // Log comprehensive data flow result
    console.info('[UnifiedSchedulerAdapter] ✅ DATA FLOW COMPLETE:', {
      output: {
        scheduled: adapterResult.scheduledTasks.length,
        unscheduled: adapterResult.unscheduledTasks.length,
        conflicts: adapterResult.conflicts.length,
        totalDuration: adapterResult.totalDuration,
        hasDebugInfo: !!adapterResult.debugInfo,
      },
      efficiency: {
        schedulingRate: `${Math.round((adapterResult.scheduledTasks.length / Math.max(1, incompleteTasks.length + incompleteWorkflows.length)) * 100)}%`,
        capacityUsed: `${Math.round((adapterResult.totalDuration / Math.max(1, workPatterns.reduce((sum, p) => sum + p.blocks.reduce((bs, b) => {
          const [sh, sm] = b.startTime.split(':').map(Number)
          const [eh, em] = b.endTime.split(':').map(Number)
          return bs + (eh * 60 + em) - (sh * 60 + sm)
        }, 0), 0))) * 100)}%`,
      },
    })

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
    const now = new Date()
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
      startDate: new Date().toISOString().split('T')[0],
      currentTime: new Date(),
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
      utilizationRate: result.scheduledTasks.length / Math.max(tasks.length, 1),
    }
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
      startDate: typeof startDate === 'string' ? startDate : startDate?.toISOString().split('T')[0] || new Date().toISOString().split('T')[0],
      currentTime: new Date(),
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
        createdAt: new Date(),
        updatedAt: new Date(),
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
        if (block.capacity) {
          return block // Already has capacity, keep as is
        }

        // Calculate total minutes in the block
        const [startHour, startMin] = block.startTime.split(':').map(Number)
        const [endHour, endMin] = block.endTime.split(':').map(Number)
        const startMinutes = startHour * 60 + startMin
        const endMinutes = endHour * 60 + endMin
        const totalMinutes = endMinutes - startMinutes

        // Calculate capacity based on block type
        let capacity: { focusMinutes?: number; adminMinutes?: number; personalMinutes?: number }

        switch (block.type) {
          case 'focused':
            capacity = {
              focusMinutes: totalMinutes,
              adminMinutes: 0,
              personalMinutes: 0,
            }
            break
          case 'admin':
            capacity = {
              focusMinutes: 0,
              adminMinutes: totalMinutes,
              personalMinutes: 0,
            }
            break
          case 'personal':
            capacity = {
              focusMinutes: 0,
              adminMinutes: 0,
              personalMinutes: totalMinutes,
            }
            break
          case 'mixed':
            // Split 60% focus, 40% admin for mixed blocks
            capacity = {
              focusMinutes: Math.floor(totalMinutes * 0.6),
              adminMinutes: Math.floor(totalMinutes * 0.4),
              personalMinutes: 0,
            }
            break
          case 'flexible':
          default:
            // For flexible blocks, allow both types of work
            capacity = {
              focusMinutes: Math.floor(totalMinutes * 0.7),
              adminMinutes: Math.floor(totalMinutes * 0.3),
              personalMinutes: 0,
            }
            break
        }

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
