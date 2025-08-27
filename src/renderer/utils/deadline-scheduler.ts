/**
 * Unified Deadline-Aware Scheduler
 *
 * Combines Eisenhower matrix prioritization with deadline pressure,
 * async optimization, and cognitive load matching.
 */

import { Task, TaskStep, ProductivityPattern, SchedulingPreferences } from '@shared/types'
import { TaskType } from '@shared/enums'
import { SequencedTask } from '@shared/sequencing-types'
import { WorkSettings } from '@shared/work-settings-types'
import { DailyWorkPattern } from '@shared/work-blocks-types'
import { ScheduledItem } from './flexible-scheduler'

export interface SchedulingContext {
  tasks: Task[]
  workflows: SequencedTask[]
  workPatterns: DailyWorkPattern[]
  productivityPatterns: ProductivityPattern[]
  schedulingPreferences: SchedulingPreferences
  workSettings: WorkSettings
  currentTime: Date
  lastScheduledItem: ScheduledItem | null | undefined
}

export interface SchedulingWarning {
  type: 'soft_deadline_risk' | 'capacity_warning' | 'cognitive_mismatch'
  message: string
  item: Task | TaskStep
  expectedDelay?: number
}

export interface SchedulingFailure {
  type: 'impossible_deadline' | 'capacity_exceeded' | 'dependency_conflict'
  message: string
  affectedItems: string[]
  severity: 'hard' | 'soft'
  suggestions: {
    tasksToDropOrDefer: string[]
    minimumDeadlineExtension: number // hours
    capacityNeeded: { focused: number; admin: number }
    alternativeSchedules?: SchedulingResult[]
  }
}

export interface SchedulingSuggestion {
  type: 'async_optimization' | 'cognitive_load' | 'context_switch'
  message: string
  recommendation: string
}

export interface SchedulingResult {
  schedule: ScheduledItem[]
  warnings: SchedulingWarning[]
  failures: SchedulingFailure[]
  suggestions: SchedulingSuggestion[]
}

/**
 * Calculate deadline pressure using inverse power function
 * Pressure = k / (slackDays + 0.5)^p
 */
export function calculateDeadlinePressure(
  item: Task | TaskStep | SequencedTask,
  context: SchedulingContext,
): number {
  // Check if item has deadline (Task/SequencedTask) or if parent has deadline (TaskStep)
  let deadline: Date | undefined
  let deadlineType: 'hard' | 'soft' | undefined

  if ('deadline' in item) {
    deadline = item.deadline
    deadlineType = item.deadlineType
  } else if ('taskId' in item) {
    // TaskStep - need to find parent task/workflow deadline
    const parentTask = context.tasks.find(t => t.id === item.taskId)
    const parentWorkflow = context.workflows.find(w => w.id === item.taskId)
    const parent = parentTask || parentWorkflow
    if (parent?.deadline) {
      deadline = parent.deadline
      deadlineType = parent.deadlineType
    }
    // Also check if the step is part of any workflow
    if (!deadline) {
      for (const workflow of context.workflows) {
        if (workflow.steps?.some(s => s.id === item.id)) {
          if (workflow.deadline) {
            deadline = workflow.deadline
            deadlineType = workflow.deadlineType
          }
          break
        }
      }
    }
  }

  if (!deadline) return 1.0

  // Calculate critical path remaining
  const criticalPathHours = calculateCriticalPathRemaining(item, context)
  const workHoursPerDay = context.workSettings.defaultCapacity.maxFocusHours +
                          context.workSettings.defaultCapacity.maxAdminHours
  const workDaysNeeded = criticalPathHours / workHoursPerDay

  // Calculate actual days until deadline
  const hoursUntilDeadline = (deadline.getTime() - context.currentTime.getTime()) / (1000 * 60 * 60)
  const daysUntilDeadline = hoursUntilDeadline / 24

  // Slack time in days
  const slackDays = daysUntilDeadline - workDaysNeeded

  if (slackDays <= 0) {
    // Impossible or on critical path
    return 1000
  }

  // Apply inverse power function with careful tuning
  // The key is to have reasonable pressure at different slack levels:
  // - 0.5 days slack: ~15-20 pressure
  // - 1 day slack: ~7-10 pressure
  // - 2 days slack: ~3-5 pressure
  // - 5 days slack: ~1.5-2 pressure
  const k = deadlineType === 'hard' ? 10 : 5
  const p = 1.1  // Slightly superlinear for good curve
  const pressure = k / Math.pow(slackDays + 0.4, p)

  // For large slack (>5 days), add a small base pressure
  const basePressure = slackDays > 5 ? 1.1 : 1.0

  return Math.max(basePressure, Math.min(pressure, 100))
}

/**
 * Calculate async urgency for tasks that trigger async work
 * Uses exponential growth based on schedule compression
 */
export function calculateAsyncUrgency(
  item: Task | TaskStep,
  context: SchedulingContext,
): number {
  // Check if this is an async trigger
  const isAsyncTrigger = item.isAsyncTrigger ||
    (item.asyncWaitTime > 0 && item.duration > 0)

  if (!isAsyncTrigger || !item.asyncWaitTime) return 0

  // Find dependent tasks
  const dependentTasks = findDependentTasks(item, context)
  const dependentWorkHours = dependentTasks.reduce((sum, task) => {
    if ('duration' in task) {
      return sum + task.duration / 60
    }
    return sum
  }, 0)

  // Calculate async wait hours first
  const asyncWaitHours = item.asyncWaitTime / 60

  // Always give async tasks a boost based on their wait time
  // Much more aggressive scaling to ensure async tasks start early:
  // Base boost of 40 + additional boost based on wait time
  // - 30 min (0.5h) wait = 40 + 20 = +60 priority boost
  // - 1 hour wait = 40 + 40 = +80 priority boost
  // - 2 hours wait = 40 + 80 = +120 priority boost
  // - 6 hours wait = 40 + 240 = +280 priority boost
  // - 12 hours wait = 40 + 480 = +520 priority boost (capped at 500)
  // This ensures async tasks almost always get scheduled first
  const baseAsyncBoost = Math.min(500, 40 + (asyncWaitHours * 40))

  // Find earliest deadline in chain (optional - not required for async boost)
  const chainDeadline = findEarliestDeadlineInChain(item, dependentTasks, context)
  if (!chainDeadline) {
    // No deadline, just return the base async boost (no cap needed!)
    return baseAsyncBoost
  }

  // Calculate time dynamics
  const hoursUntilDeadline = (chainDeadline.getTime() - context.currentTime.getTime()) / (1000 * 60 * 60)

  // Time available for dependent work after async completes
  const availableTimeAfterAsync = hoursUntilDeadline - asyncWaitHours

  // Compression ratio - how much of available work time is needed
  const workHoursPerDay = context.workSettings.defaultCapacity.maxFocusHours +
                          context.workSettings.defaultCapacity.maxAdminHours
  // Available work hours (not calendar hours)
  const availableWorkHours = (availableTimeAfterAsync / 24) * workHoursPerDay
  const compressionRatio = availableWorkHours > 0 ? dependentWorkHours / availableWorkHours : 2

  // For truly impossible scenarios (>100% capacity needed)
  if (compressionRatio > 1.5) {
    return 150 // Extreme urgency for impossible scenarios
  }

  // Exponential growth function - more aggressive for async tasks
  // The longer the wait time relative to the deadline, the more urgent
  const asyncRatio = asyncWaitHours / Math.max(1, hoursUntilDeadline)

  // Base urgency grows exponentially with wait time
  // For a task with 24h wait time and 48h deadline, asyncRatio = 0.5
  // For a task with 48h wait time and 72h deadline, asyncRatio = 0.67
  const baseAsyncUrgency = 20 * Math.exp(3 * asyncRatio)

  // Additional exponential boost for long absolute wait times
  // This ensures tasks with long wait times are started early regardless of deadline
  const waitTimeBoost = 10 * Math.exp(asyncWaitHours / 24) // Exponential growth per day of wait

  // Compression ratio still matters but less than wait time
  const compressionBoost = 5 * Math.exp(compressionRatio)

  // Time pressure factor
  const daysUntilDeadline = hoursUntilDeadline / 24
  const timePressure = 10 / (daysUntilDeadline + 1)

  // Combine all factors with emphasis on wait time
  const totalUrgency = baseAsyncUrgency + waitTimeBoost + compressionBoost + timePressure

  // For truly impossible scenarios (>100% capacity needed)
  if (compressionRatio > 1.5) {
    return Math.max(200, totalUrgency) // Extreme urgency for impossible scenarios
  }

  // For high but not impossible compression (0.7-1.5), still give significant urgency
  if (compressionRatio >= 0.7 && compressionRatio <= 1.5) {
    return Math.max(80, totalUrgency) // Higher floor for compressed timelines
  }

  return Math.min(300, totalUrgency) // Cap at 300 to prevent overflow
}

/**
 * Calculate cognitive load match between task and time slot
 */
export function calculateCognitiveMatch(
  item: Task | TaskStep,
  timeSlot: Date,
  context: SchedulingContext,
): number {
  // If no productivity patterns defined, return neutral 1.0
  if (!context.productivityPatterns || context.productivityPatterns.length === 0) {
    return 1.0
  }

  const itemComplexity = item.cognitiveComplexity || 3
  const slotCapacity = getProductivityLevel(timeSlot, context.productivityPatterns)

  const optimalMatches: Record<string, number[]> = {
    'peak': [4, 5],
    'high': [3, 4],
    'moderate': [2, 3],
    'low': [1, 2],
  }

  const isOptimal = optimalMatches[slotCapacity]?.includes(itemComplexity) || false

  if (isOptimal) return 1.2 // 20% bonus

  // Calculate mismatch penalty
  const capacityLevel = { 'peak': 4, 'high': 3, 'moderate': 2, 'low': 1 }[slotCapacity] || 2
  const mismatch = Math.abs(capacityLevel - itemComplexity)

  return Math.max(0.7, 1 - (mismatch * 0.15))
}

/**
 * Priority breakdown for debugging
 */
export interface PriorityBreakdown {
  eisenhower: number
  deadlineBoost: number
  asyncBoost: number
  cognitiveMatch: number
  contextSwitchPenalty: number
  workflowDepthBonus?: number
  total: number
}

/**
 * Calculate integrated priority combining all factors
 * Returns just the total for backward compatibility
 */
export function calculatePriority(
  item: Task | TaskStep,
  context: SchedulingContext,
): number {
  const breakdown = calculatePriorityWithBreakdown(item, context)
  return breakdown.total
}

/**
 * Calculate integrated priority with detailed breakdown
 */
export function calculatePriorityWithBreakdown(
  item: Task | TaskStep,
  context: SchedulingContext,
): PriorityBreakdown {
  // Base Eisenhower score - TaskStep doesn't have importance/urgency, use parent's
  let importance: number
  let urgency: number

  if ('importance' in item && 'urgency' in item) {
    // It's a Task
    importance = item.importance
    urgency = item.urgency
  } else {
    // It's a TaskStep - find parent workflow
    const parentWorkflow = context.workflows.find(w => w.id === item.taskId)
    if (!parentWorkflow) {
      // Try to find workflow containing this step
      const containingWorkflow = context.workflows.find(w =>
        w.steps?.some(s => s.id === item.id),
      )
      importance = containingWorkflow?.importance || 5
      urgency = containingWorkflow?.urgency || 5
    } else {
      importance = parentWorkflow.importance || 5
      urgency = parentWorkflow.urgency || 5
    }
  }

  const eisenhower = importance * urgency

  // Deadline pressure multiplier
  const deadlinePressure = calculateDeadlinePressure(item, context)
  const deadlineBoost = eisenhower * (deadlinePressure - 1) // Just the boost amount

  // Async urgency bonus
  const asyncBoost = calculateAsyncUrgency(item, context)

  // Cognitive match multiplier
  const cognitiveMatchFactor = calculateCognitiveMatch(item, context.currentTime, context)
  const cognitiveMatch = eisenhower * (cognitiveMatchFactor - 1) // Just the boost/penalty

  // Context switch penalty
  let contextSwitchPenalty = 0
  if (context.lastScheduledItem?.originalItem) {
    const lastItem = context.lastScheduledItem.originalItem
    const differentWorkflow = 'taskId' in item && 'taskId' in lastItem &&
                             item.taskId !== lastItem.taskId
    const differentProject = 'projectId' in item && 'projectId' in lastItem &&
                            item.projectId !== lastItem.projectId

    if (differentWorkflow || differentProject) {
      contextSwitchPenalty = -context.schedulingPreferences.contextSwitchPenalty
    }
  }

  // Add workflow depth bonus - longer critical paths get priority
  let workflowDepthBonus = 0
  if ('taskId' in item) {
    // It's a workflow step - find the workflow
    const workflow = context.workflows.find(w => w.id === item.taskId ||
      w.steps?.some(s => s.id === item.id))
    if (workflow) {
      // Give bonus based on critical path length
      // Longer workflows need to start earlier
      const criticalPathHours = (workflow.criticalPathDuration || 0) / 60
      workflowDepthBonus = Math.min(50, criticalPathHours * 5) // 5 points per hour of critical path
    }
  }

  // Calculate total using same formula as before, plus workflow bonus
  const total = (eisenhower * deadlinePressure + asyncBoost) * cognitiveMatchFactor +
    contextSwitchPenalty + workflowDepthBonus

  return {
    eisenhower,
    deadlineBoost,
    asyncBoost,
    cognitiveMatch,
    contextSwitchPenalty,
    workflowDepthBonus,
    total,
  }
}

/**
 * Main scheduling function with deadline awareness
 */
export function scheduleWithDeadlines(context: SchedulingContext): SchedulingResult {
  const result: SchedulingResult = {
    schedule: [],
    warnings: [],
    failures: [],
    suggestions: [],
  }

  // Phase 1: Analyze constraints and detect impossibilities
  const constraints = analyzeConstraints(context)
  for (const failure of constraints.failures) {
    result.failures.push(failure)
  }

  // Phase 2: Prepare work items with calculated priorities
  const workItems = prepareWorkItems(context)

  // Phase 3: Schedule items using enhanced priority
  const scheduledItems = scheduleItems(workItems, context, result)
  result.schedule = scheduledItems

  // Phase 4: Optimize async triggers
  optimizeAsyncTriggers(result.schedule, context, result)

  // Phase 5: Generate suggestions
  generateSuggestions(result.schedule, context, result)

  return result
}

// Helper functions

function calculateCriticalPathRemaining(
  item: Task | TaskStep | SequencedTask,
  context: SchedulingContext,
): number {
  let totalHours = 0

  if ('steps' in item && item.steps) {
    // SequencedTask/Workflow - sum uncompleted steps
    for (const step of item.steps) {
      if (!step.percentComplete || step.percentComplete < 100) {
        totalHours += step.duration / 60
      }
    }
  } else if ('hasSteps' in item && item.hasSteps) {
    // Task with steps - need to find the workflow
    const workflow = context.workflows.find(w => w.id === item.id)
    if (workflow?.steps) {
      for (const step of workflow.steps) {
        if (!step.percentComplete || step.percentComplete < 100) {
          totalHours += step.duration / 60
        }
      }
    }
  } else if ('duration' in item) {
    // Check completion status
    const isCompleted = 'completed' in item ? item.completed :
                       'status' in item ? item.status === 'completed' : false

    if (!isCompleted) {
      totalHours = item.duration / 60
    }
  }

  return totalHours
}

function findDependentTasks(
  item: Task | TaskStep,
  context: SchedulingContext,
): Array<Task | TaskStep> {
  const dependents: Array<Task | TaskStep> = []
  const itemId = item.id

  // Check tasks
  for (const task of context.tasks) {
    if (task.dependencies && task.dependencies.includes(itemId)) {
      dependents.push(task)
    }
  }

  // Check workflow steps
  for (const workflow of context.workflows) {
    if (workflow.steps) {
      for (const step of workflow.steps) {
        if (step.dependsOn && step.dependsOn.includes(itemId)) {
          dependents.push(step)
        }
      }
    }
  }

  return dependents
}

function findEarliestDeadlineInChain(
  item: Task | TaskStep,
  dependents: Array<Task | TaskStep>,
  context: SchedulingContext,
): Date | null {
  let earliestDeadline: Date | null = null

  // Check item's own deadline (for Tasks) or parent workflow deadline (for TaskSteps)
  if ('deadline' in item && item.deadline) {
    earliestDeadline = item.deadline
  } else if ('taskId' in item) {
    // TaskStep - find parent workflow deadline
    const parentWorkflow = context.workflows.find(w =>
      w.steps?.some(s => s.id === item.id),
    )
    if (parentWorkflow?.deadline) {
      earliestDeadline = parentWorkflow.deadline
    }
  }

  // Check dependents' deadlines (or their parent workflows)
  for (const dep of dependents) {
    let depDeadline: Date | null = null

    if ('deadline' in dep && dep.deadline) {
      depDeadline = dep.deadline
    } else if ('taskId' in dep || !('deadline' in dep)) {
      // TaskStep - find parent workflow deadline
      const parentWorkflow = context.workflows.find(w =>
        w.steps?.some(s => s.id === dep.id),
      )
      if (parentWorkflow?.deadline) {
        depDeadline = parentWorkflow.deadline
      }
    }

    if (depDeadline && (!earliestDeadline || depDeadline < earliestDeadline)) {
      earliestDeadline = depDeadline
    }
  }

  return earliestDeadline
}

function getProductivityLevel(
  time: Date,
  patterns: ProductivityPattern[],
): 'peak' | 'high' | 'moderate' | 'low' {
  const timeStr = `${time.getHours().toString().padStart(2, '0')}:${time.getMinutes().toString().padStart(2, '0')}`

  for (const pattern of patterns) {
    if (timeStr >= pattern.timeRangeStart && timeStr < pattern.timeRangeEnd) {
      return pattern.cognitiveCapacity
    }
  }

  // Default pattern if no custom patterns defined
  const hour = time.getHours()
  if (hour >= 9 && hour < 12) return 'peak'
  if (hour >= 12 && hour < 13) return 'low' // lunch
  if (hour >= 13 && hour < 15) return 'moderate'
  if (hour >= 15 && hour < 17) return 'high'
  return 'low'
}

function analyzeConstraints(context: SchedulingContext): {
  failures: SchedulingFailure[]
} {
  const failures: SchedulingFailure[] = []

  // Check for impossible deadlines
  for (const task of context.tasks) {
    if (task.deadline && task.deadlineType === 'hard' && !task.completed) {
      const pressure = calculateDeadlinePressure(task, context)
      if (pressure >= 1000) {
        failures.push({
          type: 'impossible_deadline',
          message: `Task "${task.name}" cannot meet its hard deadline`,
          affectedItems: [task.id],
          severity: 'hard',
          suggestions: {
            tasksToDropOrDefer: findLowPriorityTasks(context),
            minimumDeadlineExtension: calculateMinimumExtension(task, context),
            capacityNeeded: calculateCapacityNeeded(task, context),
          },
        })
      }
    }
  }

  // Check workflows
  for (const workflow of context.workflows) {
    if (workflow.deadline && workflow.deadlineType === 'hard' && !workflow.completed) {
      const pressure = calculateDeadlinePressure(workflow, context)
      if (pressure >= 1000) {
        failures.push({
          type: 'impossible_deadline',
          message: `Workflow "${workflow.name}" cannot meet its hard deadline`,
          affectedItems: [workflow.id],
          severity: 'hard',
          suggestions: {
            tasksToDropOrDefer: findLowPriorityTasks(context),
            minimumDeadlineExtension: calculateMinimumExtension(workflow, context),
            capacityNeeded: calculateCapacityNeeded(workflow, context),
          },
        })
      }
    }
  }

  return { failures }
}

function prepareWorkItems(context: SchedulingContext): Array<{
  item: Task | TaskStep
  priority: number
  type: 'task' | 'workflow-step'
}> {
  const workItems: Array<{
    item: Task | TaskStep
    priority: number
    type: 'task' | 'workflow-step'
  }> = []

  // Add tasks
  for (const task of context.tasks) {
    if (!task.completed && !task.hasSteps) {
      workItems.push({
        item: task,
        priority: calculatePriority(task, context),
        type: 'task',
      })
    }
  }

  // Add workflow steps
  for (const workflow of context.workflows) {
    if (!workflow.completed && workflow.steps) {
      for (const step of workflow.steps) {
        if (step.status !== 'completed') {
          workItems.push({
            item: step,
            priority: calculatePriority(step, context),
            type: 'workflow-step',
          })
        }
      }
    }
  }

  // Sort by priority
  workItems.sort((a, b) => b.priority - a.priority)

  return workItems
}

function scheduleItems(
  workItems: Array<{ item: Task | TaskStep; priority: number; type: string }>,
  context: SchedulingContext,
  result: SchedulingResult,
): ScheduledItem[] {
  // This is a simplified version - the real implementation would use
  // the existing flexible-scheduler logic with our enhanced priorities

  const scheduledItems: ScheduledItem[] = []
  let currentTime = new Date(context.currentTime)
  const completedSteps = new Set<string>()

  for (const workItem of workItems) {
    const { item } = workItem

    // Check dependencies
    if ('dependsOn' in item && item.dependsOn.length > 0) {
      const allDependenciesMet = item.dependsOn.every(dep => completedSteps.has(dep))
      if (!allDependenciesMet) continue
    }

    // Create scheduled item
    const duration = item.duration
    const endTime = new Date(currentTime.getTime() + duration * 60000)

    scheduledItems.push({
      id: item.id,
      name: item.name,
      type: workItem.type as any,
      priority: workItem.priority,
      duration,
      startTime: new Date(currentTime),
      endTime,
      color: '#6B7280',
      originalItem: item,
    })

    // Check deadline
    if ('deadline' in item && item.deadline && endTime > item.deadline) {
      if (item.deadlineType === 'hard') {
        // Already reported in constraints analysis
      } else {
        result.warnings.push({
          type: 'soft_deadline_risk',
          message: `Task "${item.name}" may miss its soft deadline`,
          item,
          expectedDelay: endTime.getTime() - item.deadline.getTime(),
        })
      }
    }

    // Mark as completed for dependency tracking
    completedSteps.add(item.id)

    // Advance time
    currentTime = endTime
  }

  return scheduledItems
}

function optimizeAsyncTriggers(
  schedule: ScheduledItem[],
  context: SchedulingContext,
  result: SchedulingResult,
): void {
  // Identify async triggers and suggest optimal timing
  for (const item of schedule) {
    if (item.originalItem && 'asyncWaitTime' in item.originalItem) {
      // Check if it's an async trigger (not a Meeting)
      const originalItem = item.originalItem as Task | TaskStep
      if (originalItem.isAsyncTrigger || originalItem.asyncWaitTime > 0) {
        const urgency = calculateAsyncUrgency(originalItem, context)
        if (urgency > 50) {
          result.suggestions.push({
            type: 'async_optimization',
            message: `Consider starting "${item.name}" earlier`,
            recommendation: `This async task has high urgency (${urgency.toFixed(0)}). Starting it earlier would provide more flexibility for dependent work.`,
          })
        }
      }
    }
  }
}

function generateSuggestions(
  schedule: ScheduledItem[],
  context: SchedulingContext,
  result: SchedulingResult,
): void {
  // Cognitive load suggestions
  let highComplexityInAfternoon = 0
  let lowComplexityInMorning = 0

  for (const item of schedule) {
    if (item.originalItem && 'cognitiveComplexity' in item.originalItem) {
      const hour = item.startTime.getHours()
      const complexity = (item.originalItem as Task | TaskStep).cognitiveComplexity

      if (complexity) {
        if (hour >= 13 && hour < 17 && complexity >= 4) {
          highComplexityInAfternoon++
        }
        if (hour >= 9 && hour < 12 && complexity <= 2) {
          lowComplexityInMorning++
        }
      }
    }
  }

  if (highComplexityInAfternoon > 2) {
    result.suggestions.push({
      type: 'cognitive_load',
      message: 'Several complex tasks scheduled for afternoon',
      recommendation: 'Consider moving complex tasks to morning peak hours for better performance',
    })
  }

  if (lowComplexityInMorning > 2) {
    result.suggestions.push({
      type: 'cognitive_load',
      message: 'Simple tasks occupying prime morning hours',
      recommendation: 'Consider moving simple tasks to afternoon to reserve morning for complex work',
    })
  }
}

// Utility functions for failure suggestions

function findLowPriorityTasks(context: SchedulingContext): string[] {
  const tasks = [...context.tasks]
    .filter(t => !t.completed)
    .sort((a, b) => (a.importance * a.urgency) - (b.importance * b.urgency))
    .slice(0, 3)
    .map(t => t.id)

  return tasks
}

function calculateMinimumExtension(
  item: Task | SequencedTask,
  context: SchedulingContext,
): number {
  const criticalPath = calculateCriticalPathRemaining(item, context)
  const __workHoursPerDay = context.workSettings.defaultCapacity.maxFocusHours +
                          context.workSettings.defaultCapacity.maxAdminHours

  if (item.deadline) {
    const hoursUntilDeadline = (item.deadline.getTime() - context.currentTime.getTime()) / (1000 * 60 * 60)
    const hoursNeeded = criticalPath
    const shortfall = hoursNeeded - hoursUntilDeadline

    if (shortfall > 0) {
      return Math.ceil(shortfall)
    }
  }

  return 0
}

function calculateCapacityNeeded(
  item: Task | SequencedTask,
  _context: SchedulingContext,
): { focused: number; admin: number } {
  let focusedHours = 0
  let adminHours = 0

  if ('hasSteps' in item && item.hasSteps && item.steps) {
    for (const step of item.steps) {
      if (step.status !== 'completed') {
        if (step.type === TaskType.Focused) {
          focusedHours += step.duration / 60
        } else {
          adminHours += step.duration / 60
        }
      }
    }
  } else if ('duration' in item) {
    if (item.type === TaskType.Focused) {
      focusedHours = item.duration / 60
    } else {
      adminHours = item.duration / 60
    }
  }

  return { focused: focusedHours, admin: adminHours }
}

// Export for testing
export const testHelpers = {
  calculateCriticalPathRemaining,
  findDependentTasks,
  findEarliestDeadlineInChain,
  getProductivityLevel,
}
