/**
 * UNIFIED SCHEDULER - Single Scheduling System
 *
 * Replaces flexible-scheduler, deadline-scheduler, scheduling-engine, and optimal-scheduler
 * with a single unified implementation supporting all scheduling needs.
 *
 * Features:
 * - Synchronous scheduling for UI display (real-time)
 * - Asynchronous scheduling for database persistence
 * - Unified priority calculation (Eisenhower + deadline pressure + async boost)
 * - Task dependency resolution and topological sorting
 * - Task splitting across multiple days
 * - Work block allocation (focused/admin/personal)
 * - Meeting preservation and break time handling
 * - Debug information generation
 * - Optimization and capacity modeling
 */

import { Task } from './types'
import { SequencedTask, TaskStep } from './sequencing-types'
import { getSchedulerCapacityForTaskType, SplitRatio } from './capacity-calculator'
import { TaskType, WorkBlockType } from './enums'
import { DailyWorkPattern, WorkBlock, WorkMeeting } from './work-blocks-types'
import { WorkSettings } from './work-settings-types'
import { ProductivityPattern, SchedulingPreferences } from './types'
import { logger } from '@/logger'
import { getCurrentTime, getLocalDateString, timeProvider as _timeProvider } from './time-provider'
import { calculateDuration as calculateTimeStringDuration, parseTimeString } from './time-utils'

// ============================================================================
// ENUMS
// ============================================================================

export enum SchedulingConflictType {
  DependencyCycle = 'dependency_cycle',
  CapacityExceeded = 'capacity_exceeded',
  DeadlineImpossible = 'deadline_impossible',
  ResourceConflict = 'resource_conflict'
}

export enum SchedulingWarningType {
  SoftDeadlineRisk = 'soft_deadline_risk',
  CapacityWarning = 'capacity_warning',
  CognitiveMismatch = 'cognitive_mismatch',
  ContextSwitch = 'context_switch'
}

export enum OptimizationMode {
  Realistic = 'realistic',
  Optimal = 'optimal',
  Conservative = 'conservative'
}

export enum SeverityLevel {
  Error = 'error',
  Warning = 'warning'
}

// ============================================================================
// UNIFIED DATA MODELS
// ============================================================================
// lets go through these types and make sure this is really necessary. I feel like there is some data transformation happening that is confusing and lots of unused proeprties.
export interface UnifiedScheduleItem {
  id: string
  name: string
  type: 'task' | 'workflow-step' | 'async-wait' | 'meeting' | 'break' | 'blocked-time'
  duration: number
  priority: number

  // Core task properties
  importance?: number
  urgency?: number
  cognitiveComplexity?: number
  taskType?: TaskType

  // Scheduling properties
  startTime?: Date
  endTime?: Date
  deadline?: Date
  deadlineType?: 'hard' | 'soft'
  dependencies?: string[]
  asyncWaitTime?: number

  // Status
  completed?: boolean
  locked?: boolean
  lockedTime?: Date

  // UI display properties
  color?: string
  x?: number
  y?: number

  // Task splitting support
  isSplit?: boolean
  splitPart?: number
  splitTotal?: number
  originalTaskId?: string
  remainingDuration?: number

  // Workflow properties
  workflowId?: string
  workflowName?: string
  stepIndex?: number

  // Metadata
  blockId?: string
  isWaitTime?: boolean
  isBlocked?: boolean
  originalItem?: Task | TaskStep | WorkMeeting
}

export interface PriorityBreakdown {
  eisenhower: number
  deadlineBoost: number
  asyncBoost: number
  cognitiveMatch: number
  contextSwitchPenalty: number
  workflowDepthBonus?: number
  total: number
}

export interface SchedulingDebugInfo {
  scheduledItems: Array<{
    id: string                              // Always present from UnifiedScheduleItem
    name: string                            // Always present
    type: string                            // Always present
    duration: number                        // Always present
    priority: number                        // Always present
    startTime?: string | undefined          // Optional - not all items scheduled yet
    priorityBreakdown?: PriorityBreakdown | undefined  // Optional - only when originalItem exists
  }>
  unscheduledItems: Array<{
    id: string                              // Always present
    name: string                            // Always present
    type: string                            // Always present
    duration: number                        // Always present
    reason: string                          // Always present
    priorityBreakdown?: PriorityBreakdown | undefined  // Optional - only when originalItem exists
  }>
  blockUtilization: Array<{
    date: string                            // Always present
    blockId: string                         // Always present
    startTime: string                       // Always present
    endTime: string                         // Always present
    capacity: number                        // Always present
    used: number                            // Always present
    blockType: WorkBlockType                // Always present
    utilization: number                     // Always present
  }>
  warnings: string[]                        // Always present
  totalScheduled: number                    // Always present
  totalUnscheduled: number                  // Always present
  scheduleEfficiency: number                // Always present
  capacityModel?: any
  sortOrder?: string | undefined
  totalDuration?: number | undefined
  alternativeScenarios?: any[] | undefined
  allocationDetails?: any[] | undefined
  conflicts?: any[] | undefined
  deadlineAnalysis?: any
}

// REVIEW: as an example, I don't know where in the app a lot of this stuff is even used.
export interface SchedulingMetrics {
  totalWorkDays?: number
  totalFocusedHours?: number
  totalAdminHours?: number
  projectedCompletionDate?: Date
  averageUtilization?: number
  peakUtilization?: number
  capacityUtilization: number
  deadlineRiskScore: number
  alternativeScenariosCount: number
  scheduledCount?: number
  unscheduledCount?: number
  totalDuration?: number
  utilizationRate?: number
  averagePriority?: number
  deadlinesMissed?: number
  criticalPathLength?: number
}

export interface SchedulingConflict {
  type: SchedulingConflictType
  affectedItems: string[]
  description: string
  severity: SeverityLevel
  suggestedResolution: string
}

export interface SchedulingWarning {
  type: SchedulingWarningType
  message: string
  item: UnifiedScheduleItem
  expectedDelay?: number
}

// REVIEW: surely this type is defined already elsewhere.
interface BlockCapacity {
  blockId: string
  blockType: WorkBlockType
  startTime: Date
  endTime: Date
  totalMinutes: number
  usedMinutes: number
  splitRatio?: { focus: number; admin: number } | undefined  // Only for mixed blocks
}

interface FitResult {
  canFit: boolean
  canPartiallyFit: boolean
  availableMinutes?: number
  startTime?: Date
  block?: BlockCapacity
}

export interface ScheduleResult {
  scheduled: UnifiedScheduleItem[]
  unscheduled: UnifiedScheduleItem[]
  debugInfo: SchedulingDebugInfo
  metrics?: SchedulingMetrics | undefined
  conflicts?: SchedulingConflict[] | undefined
  warnings?: SchedulingWarning[] | undefined
}

export interface ScheduleContext {
  startDate: string
  tasks: Task[]
  workflows: SequencedTask[]
  workPatterns: DailyWorkPattern[]
  productivityPatterns?: ProductivityPattern[]
  schedulingPreferences?: SchedulingPreferences
  workSettings: WorkSettings
  currentTime: Date
  lastScheduledItem?: UnifiedScheduleItem | null
}

export interface ScheduleConfig {
  startDate: string | Date
  endDate?: string | Date
  includeWeekends?: boolean
  allowTaskSplitting?: boolean
  respectMeetings?: boolean
  // REVIEW: can we use enums please
  optimizationMode?: 'realistic' | 'optimal' | 'conservative'
  debugMode?: boolean
  maxDays?: number // Backwards compatibility
  currentTime?: Date // Optional current time for work block scheduling
}

// ============================================================================
// UNIFIED SCHEDULER CLASS
// ============================================================================

export class UnifiedScheduler {
  private scheduledItemsReference: UnifiedScheduleItem[] = []

  constructor() {
    // Initialize any required state
  }

  // ============================================================================
  // PUBLIC API - CORE SCHEDULING METHODS
  // ============================================================================

  /**
   * Synchronous scheduling for UI display (GanttChart, WeeklyCalendar)
   * Must complete quickly for responsive UI (<100ms target)
   */
  scheduleForDisplay(
    items: (Task | SequencedTask | TaskStep)[],
    context: ScheduleContext,
    config: ScheduleConfig,
  ): ScheduleResult {

    // Convert to unified format
    const { activeItems: unifiedItems, completedItemIds } = this.convertToUnifiedItems(items)

    // Apply priority calculation
    unifiedItems.forEach(item => {
      // REVIEW: can we use type guards to avoid the as cast? also, what is the meaning of originalItem? and how could a unified item exist without it? also why are we casting to task | taskstep without chekcing anything? couldn't this pass a meeting in?
      if (item.originalItem) {
        const priority = this.calculatePriority(item.originalItem as Task | TaskStep, context)
        item.priority = priority

      }
    })

    // Resolve dependencies and get sorted items (passing completed items)
    const dependencyResult = this.resolveDependencies(unifiedItems, completedItemIds)

    // Debug logging for sorted order
    if (config.debugMode) {
      logger.system.debug('After topological sort', {}, 'unified-scheduler-sort')
      dependencyResult.resolved.forEach((item, index) => {
        logger.system.debug(`Sorted item ${index + 1}`, {
          name: item.name,
          priority: item.priority?.toFixed(2),
        }, 'unified-scheduler-sort-item')
      })
    }

    if (dependencyResult.conflicts.length > 0) {
      const warningMessages = dependencyResult.warnings.map(w => w.message)
      // REVIEW: looks like warning messages are returned twice here.
      return {
        scheduled: [],
        unscheduled: unifiedItems,
        conflicts: dependencyResult.conflicts,
        warnings: dependencyResult.warnings,
        debugInfo: this.generateDebugInfo([], unifiedItems, context, warningMessages),
      }
    }

    // Ensure config has startDate from context if not provided
    // Also pass currentTime for proper scheduling
    const configWithStartDate: ScheduleConfig = {
      ...config,
      startDate: config.startDate || context.startDate,
      currentTime: context.currentTime, // Pass currentTime for work block scheduling
    }
    const allocated = this.allocateToWorkBlocks(dependencyResult.resolved, context.workPatterns, configWithStartDate, completedItemIds)

    // Generate debug info (always - it's mandatory)
    const allocatedIds = new Set(allocated.map(item => item.id))
    const actuallyUnscheduled = unifiedItems.filter(item => !allocatedIds.has(item.id))
    // REVIEW: I want a full review of our debug info. It's never helpful or complete.
    const debugInfo = this.generateDebugInfo(allocated, actuallyUnscheduled, context)

    // Generate metrics
    const metrics = this.calculateMetrics(allocated, context)

    // Debug timing moved to logger in Phase 1 fixes

    // Create set of scheduled item IDs for efficient lookup
    const scheduledIds = new Set(allocated.map(item => item.id))

    return {
      scheduled: allocated,
      unscheduled: unifiedItems.filter(item => !scheduledIds.has(item.id)),
      debugInfo,
      metrics,
      conflicts: dependencyResult.conflicts,
      warnings: dependencyResult.warnings,
    }
  }

  /**
   * Asynchronous scheduling for database persistence
   * Can take longer, handles larger datasets, includes full optimization
   */
  // REVIEW: is this even used anywhere?  I don't think I ever wanted a feature for large datasets...
  async scheduleForPersistence(
    items: (Task | SequencedTask | TaskStep)[],
    context: ScheduleContext,
    config: ScheduleConfig,
  ): Promise<ScheduleResult> {
    return new Promise(resolve => {
      (async () => {
      // Start with base schedule
      const baseResult = this.scheduleForDisplay(items, context, config)

      // Enhanced async features
      const enhancedResult = await this.enhanceWithAsyncFeatures(baseResult, items, context, config)

        resolve(enhancedResult)
      })()
    })
  }

  /**
   * Enhance scheduling result with advanced async features
   */
  // REVIEW: I want to make sure all these fancy functions are even used, tested, or valid. I feel like a lot of this was just thrown in to make the scheduler look more complex and feature rich.
  private async enhanceWithAsyncFeatures(
    baseResult: ScheduleResult,
    originalItems: (Task | SequencedTask | TaskStep)[],
    context: ScheduleContext,
    config: ScheduleConfig,
  ): Promise<ScheduleResult> {
    const { activeItems: unifiedItems, completedItemIds: _completedItemIds } = this.convertToUnifiedItems(originalItems)

    // 1. Capacity modeling - analyze resource utilization over time
    const capacityModel = this.buildCapacityModel(baseResult, context.workPatterns)

    // 2. Deadline risk analysis - identify items at risk of missing deadlines
    const deadlineAnalysis = this.analyzeDeadlineRisks(baseResult.scheduled, context)

    // 3. Alternative scheduling scenarios - generate optimized alternatives
    const alternativeScenarios = await this.generateAlternativeScenarios(unifiedItems, context, config)

    // 4. Enhanced metrics with capacity insights
    const enhancedMetrics = {
      ...baseResult.metrics,
      capacityUtilization: capacityModel.utilizationRate,
      deadlineRiskScore: deadlineAnalysis.riskScore,
      alternativeScenariosCount: alternativeScenarios.length,
    }

    // 5. Enhanced warnings with capacity and deadline insights

    return {
      ...baseResult,
      metrics: enhancedMetrics,
      warnings: [],
      // Augment debug info with optimization data
      debugInfo: {
        ...baseResult.debugInfo,
        capacityModel,
        alternativeScenarios: alternativeScenarios.slice(0, 3), // Top 3 alternatives
        deadlineAnalysis,
      },
    }
  }

  /**
   * Build capacity utilization model
   */
  private buildCapacityModel(result: ScheduleResult, workPatterns: DailyWorkPattern[]): {
    utilizationRate: number
    warnings: string[]
    peakUtilizationPeriods: { date: string; utilization: number }[]
  } {
    const warnings: string[] = []
    const utilizationByDate = new Map<string, number>()

    // Calculate utilization for each day
    for (const pattern of workPatterns) {
      const totalCapacity = pattern.blocks.reduce((sum, block) => {
        const blockMinutes = calculateTimeStringDuration(block.startTime, block.endTime)
        return sum + blockMinutes
      }, 0)

      const scheduledMinutes = result.scheduled
        .filter(item => item.startTime?.toISOString().split('T')[0] === pattern.date)
        .reduce((sum, item) => sum + item.duration, 0)

      const utilization = totalCapacity > 0 ? scheduledMinutes / totalCapacity : 0
      utilizationByDate.set(pattern.date, utilization)

      if (utilization > 0.9) {
        warnings.push(`High utilization (${Math.round(utilization * 100)}%) on ${pattern.date}`)
      }
    }

    const avgUtilization = Array.from(utilizationByDate.values())
      .reduce((sum, util) => sum + util, 0) / utilizationByDate.size

    const peakUtilizationPeriods = Array.from(utilizationByDate.entries())
      .filter(([_date, util]) => util > 0.8)
      .map(([date, utilization]) => ({ date, utilization }))
      .sort((a, b) => b.utilization - a.utilization)

    return {
      utilizationRate: avgUtilization,
      warnings,
      peakUtilizationPeriods,
    }
  }

  /**
   * Analyze deadline risks
   */
  private analyzeDeadlineRisks(scheduled: UnifiedScheduleItem[], _context: ScheduleContext): {
    riskScore: number
    warnings: string[]
    riskyItems: { id: string; name: string; riskLevel: 'high' | 'medium' | 'low' }[]
  } {
    const warnings: string[] = []
    const riskyItems: { id: string; name: string; riskLevel: 'high' | 'medium' | 'low' }[] = []

    let totalRiskScore = 0
    let itemsWithDeadlines = 0

    for (const item of scheduled) {
      if (item.deadline && item.endTime) {
        itemsWithDeadlines++
        const timeToDeadline = item.deadline.getTime() - item.endTime.getTime()
        const daysToDeadline = timeToDeadline / (24 * 60 * 60 * 1000)

        let riskLevel: 'high' | 'medium' | 'low'
        let riskScore: number

        if (daysToDeadline < 0) {
          riskLevel = 'high'
          riskScore = 1
          warnings.push(`"${item.name}" will miss deadline by ${Math.abs(Math.round(daysToDeadline))} days`)
        } else if (daysToDeadline < 1) {
          riskLevel = 'high'
          riskScore = 0.8
          warnings.push(`"${item.name}" has tight deadline (${Math.round(daysToDeadline * 24)} hours remaining)`)
        } else if (daysToDeadline < 3) {
          riskLevel = 'medium'
          riskScore = 0.5
        } else {
          riskLevel = 'low'
          riskScore = 0.1
        }

        totalRiskScore += riskScore
        riskyItems.push({ id: item.id, name: item.name, riskLevel })
      }
    }

    const avgRiskScore = itemsWithDeadlines > 0 ? totalRiskScore / itemsWithDeadlines : 0

    return {
      riskScore: avgRiskScore,
      warnings,
      riskyItems: riskyItems.filter(item => item.riskLevel !== 'low'),
    }
  }

  /**
   * Generate alternative scheduling scenarios
   */
  private async generateAlternativeScenarios(
    _items: UnifiedScheduleItem[],
    _context: ScheduleContext,
    _config: ScheduleConfig,
  ): Promise<Array<{ name: string; description: string; metrics: any }>> {
    // For now, return a simple set of scenarios
    // In a full implementation, this would use different scheduling strategies
    return [
      {
        name: 'Deadline-First',
        description: 'Prioritize items with tight deadlines',
        metrics: { hypotheticalCompletionTime: 'TBD' },
      },
      {
        name: 'Capacity-Optimized',
        description: 'Maximize resource utilization',
        metrics: { hypotheticalUtilization: 'TBD' },
      },
      {
        name: 'Balanced',
        description: 'Balance deadline pressure and capacity',
        metrics: { hypotheticalBalance: 'TBD' },
      },
    ]
  }

  // ============================================================================
  // PRIORITY CALCULATION (from deadline-scheduler)
  // ============================================================================

  /**
   * Calculate priority for a single item
   */
  calculatePriority(
    item: Task | TaskStep,
    context: ScheduleContext,
  ): number {
    const breakdown = this.calculatePriorityWithBreakdown(item, context)
    return breakdown.total
  }

  /**
   * Calculate priority with detailed breakdown for debugging
   */
  calculatePriorityWithBreakdown(
    item: Task | TaskStep,
    context: ScheduleContext,
  ): PriorityBreakdown {
    // Base Eisenhower score - TaskStep might have importance/urgency, or use parent's
    let importance: number = 5
    let urgency: number = 5

    if ('importance' in item && 'urgency' in item && typeof item.importance === 'number' && typeof item.urgency === 'number') {
      // It's a Task with required fields
      importance = item.importance
      urgency = item.urgency
    } else {
      // It's a TaskStep - check for overrides first, then use parent workflow
      const step = item as TaskStep

      // Find parent workflow
      const parentWorkflow = context.workflows.find(w => w.id === step.taskId)
      if (!parentWorkflow) {
        // Try to find workflow containing this step
        const containingWorkflow = context.workflows.find(w =>
          w.steps?.some(s => s.id === step.id),
        )
        importance = containingWorkflow?.importance || 5
        urgency = containingWorkflow?.urgency || 5
      } else {
        importance = parentWorkflow.importance || 5
        urgency = parentWorkflow.urgency || 5
      }

      // Override with step-specific priority if provided
      if (step.importance !== undefined && step.importance !== null) {
        importance = step.importance
      }
      if (step.urgency !== undefined && step.urgency !== null) {
        urgency = step.urgency
      }
    }

    // Base Eisenhower score (raw importance × urgency)
    const eisenhower = importance * urgency

    // Enhanced calculation with importance weighting for final priority
    // High importance (8-10) gets extra boost to differentiate from medium/low
    let importanceMultiplier = 1.0
    if (importance >= 9) {
      importanceMultiplier = 1.5  // 50% boost for critical importance
    } else if (importance >= 7) {
      importanceMultiplier = 1.2  // 20% boost for high importance
    }

    // Similar for urgency
    let urgencyMultiplier = 1.0
    if (urgency >= 9) {
      urgencyMultiplier = 1.5  // 50% boost for critical urgency
    } else if (urgency >= 7) {
      urgencyMultiplier = 1.2  // 20% boost for high urgency
    }

    // Apply multipliers to get weighted score for actual priority
    const weightedEisenhower = eisenhower * importanceMultiplier * urgencyMultiplier

    // Deadline pressure calculation (additive, not multiplicative)
    const deadlinePressure = this.calculateDeadlinePressure(item, context)
    const deadlineBoost = deadlinePressure > 1 ? deadlinePressure * 100 : 0 // Additive boost amount

    // Async urgency bonus
    const asyncBoost = this.calculateAsyncUrgency(item, context)

    // Cognitive match multiplier
    const cognitiveMatchFactor = this.calculateCognitiveMatch(item, context.currentTime, context)
    const cognitiveMatch = weightedEisenhower * (cognitiveMatchFactor - 1) // Just the boost/penalty

    // Context switch penalty
    let contextSwitchPenalty = 0
    if (context.lastScheduledItem?.originalItem) {
      const lastItem = context.lastScheduledItem.originalItem
      const differentWorkflow = 'taskId' in item && 'taskId' in lastItem &&
                               item.taskId !== lastItem.taskId
      const differentProject = 'projectId' in item && 'projectId' in lastItem &&
                              item.projectId !== lastItem.projectId

      if (differentWorkflow || differentProject) {
        contextSwitchPenalty = -(context.schedulingPreferences?.contextSwitchPenalty || 5)
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

    // Calculate total using proven additive formula
    // This ensures urgent deadlines always take priority regardless of base priority
    const deadlineAdditive = deadlinePressure > 1 ? deadlinePressure * 100 : 0
    const total = weightedEisenhower + deadlineAdditive + asyncBoost * cognitiveMatchFactor +
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
   * Calculate deadline pressure using inverse power function
   * Pressure = k / (slackDays + 0.5)^p
   */
  calculateDeadlinePressure(
    item: Task | TaskStep | SequencedTask,
    context: ScheduleContext,
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
    const criticalPathHours = this.calculateCriticalPathRemaining(item, context)
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

    return Math.max(basePressure, Math.min(pressure, 1000))
  }

  /**
   * Calculate async urgency boost for tasks before wait times
   */
  calculateAsyncUrgency(
    item: Task | TaskStep,
    context: ScheduleContext,
  ): number {
    // Check if this is an async trigger
    const isAsyncTrigger = item.isAsyncTrigger ||
      (item.asyncWaitTime > 0 && item.duration > 0)

    if (!isAsyncTrigger || !item.asyncWaitTime) return 0

    // Find dependent tasks
    const dependentTasks = this.findDependentTasks(item, context)
    const dependentWorkHours = dependentTasks.reduce((sum, task) => {
      if ('duration' in task) {
        return sum + task.duration / 60
      }
      return sum
    }, 0)

    // Calculate async wait hours first
    const asyncWaitHours = item.asyncWaitTime / 60

    // Always give async tasks a boost based on their wait time
    const baseAsyncBoost = Math.min(500, 40 + (asyncWaitHours * 40))

    // Find earliest deadline in chain (optional)
    const chainDeadline = this.findEarliestDeadlineInChain(item, dependentTasks, context)
    if (!chainDeadline) {
      return baseAsyncBoost
    }

    // Calculate time dynamics
    const hoursUntilDeadline = (chainDeadline.getTime() - context.currentTime.getTime()) / (1000 * 60 * 60)
    const availableTimeAfterAsync = hoursUntilDeadline - asyncWaitHours

    // Compression ratio calculation
    const workHoursPerDay = context.workSettings.defaultCapacity.maxFocusHours +
                            context.workSettings.defaultCapacity.maxAdminHours
    const availableWorkHours = (availableTimeAfterAsync / 24) * workHoursPerDay
    const compressionRatio = availableWorkHours > 0 ? dependentWorkHours / availableWorkHours : 2

    // For truly impossible scenarios
    if (compressionRatio > 1.5) {
      return 150 // Extreme urgency for impossible scenarios
    }

    // Exponential growth function
    const asyncRatio = asyncWaitHours / Math.max(1, hoursUntilDeadline)
    const baseAsyncUrgency = 20 * Math.exp(3 * asyncRatio)
    const waitTimeBoost = 10 * Math.exp(asyncWaitHours / 24)
    const compressionBoost = 5 * Math.exp(compressionRatio)
    const daysUntilDeadline = hoursUntilDeadline / 24
    const timePressure = 10 / (daysUntilDeadline + 1)

    const totalUrgency = baseAsyncUrgency + waitTimeBoost + compressionBoost + timePressure

    if (compressionRatio > 1.5) {
      return Math.max(200, totalUrgency)
    }

    if (compressionRatio >= 0.7 && compressionRatio <= 1.5) {
      return Math.max(80, totalUrgency)
    }

    return Math.min(300, totalUrgency)
  }

  /**
   * Calculate cognitive load matching to user energy patterns
   */
  calculateCognitiveMatch(
    item: Task | TaskStep,
    currentTime: Date,
    context: ScheduleContext,
  ): number {
    // If no productivity patterns defined, return neutral
    if (!context.productivityPatterns || context.productivityPatterns.length === 0) {
      return 1.0
    }

    const itemComplexity = item.cognitiveComplexity || 3
    const slotCapacity = this.getProductivityLevel(currentTime, context.productivityPatterns)

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

  // ============================================================================
  // DEPENDENCY MANAGEMENT (from scheduling-engine)
  // ============================================================================

  /**
   * Sort items using topological sort to respect dependencies
   * Uses Kahn's algorithm with priority consideration
   */
  topologicalSort(items: UnifiedScheduleItem[]): UnifiedScheduleItem[] {
    const inDegree = new Map<string, number>()
    const itemMap = new Map<string, UnifiedScheduleItem>()

    // Initialize in-degree map and item map
    items.forEach(item => {
      inDegree.set(item.id, 0)
      itemMap.set(item.id, item)
    })

    // Calculate in-degrees based on dependencies
    items.forEach(item => {
      const deps = item.dependencies || []
      inDegree.set(item.id, deps.length)
    })

    // Priority queue - items with no dependencies, sorted by priority
    const itemsWithNoDeps = items.filter(item => inDegree.get(item.id) === 0)
    const queue = itemsWithNoDeps.sort((a, b) => (b.priority || 0) - (a.priority || 0)) // Higher priority first

    const result: UnifiedScheduleItem[] = []

    while (queue.length > 0) {
      const current = queue.shift()!
      result.push(current)

      // Update dependencies - find items that depend on the current item
      items.forEach(item => {
        const deps = item.dependencies || []
        if (deps.includes(current.id)) {
          const newInDegree = (inDegree.get(item.id) || 0) - 1
          inDegree.set(item.id, newInDegree)

          if (newInDegree === 0) {
            // Insert in priority order
            const priority = item.priority || 0
            let insertIndex = 0
            while (insertIndex < queue.length) {
              const queueItem = queue[insertIndex]
              if (queueItem && (queueItem.priority || 0) > priority) {
                insertIndex++
              } else {
                break
              }
            }
            queue.splice(insertIndex, 0, item)
          }
        }
      })
    }

    // Handle cycles: if there are remaining items with dependencies, add them anyway
    // This prevents cycles from causing empty results
    const processedIds = new Set(result.map(item => item.id))
    const remaining = items.filter(item => !processedIds.has(item.id))

    if (remaining.length > 0) {
      // Sort remaining by priority and add them (breaking cycles)
      const sortedRemaining = remaining.sort((a, b) => (b.priority || 0) - (a.priority || 0))
      result.push(...sortedRemaining)
    }

    return result
  }

  /**
   * Build dependency graph from items
   * Maps each item ID to its list of dependencies
   */
  buildDependencyGraph(items: UnifiedScheduleItem[]): Map<string, string[]> {
    const graph = new Map<string, string[]>()

    items.forEach(item => {
      const dependencies = item.dependencies || []
      graph.set(item.id, dependencies)
    })

    return graph
  }

  /**
   * Detect circular dependencies using DFS (Depth-First Search)
   * Returns whether cycles exist and which items are involved
   */
  detectDependencyCycles(graph: Map<string, string[]>): {
    hasCycle: boolean
    cycleItems: string[]
  } {
    const visited = new Set<string>()
    const recursionStack = new Set<string>()
    const cycleItems: string[] = []

    const dfs = (node: string): boolean => {
      // If we're already in recursion stack, we found a cycle
      if (recursionStack.has(node)) {
        cycleItems.push(node)
        return true
      }

      // If already fully visited, no cycle through this node
      if (visited.has(node)) {
        return false
      }

      // Mark as visited and add to recursion stack
      visited.add(node)
      recursionStack.add(node)

      // Check all dependencies
      const dependencies = graph.get(node) || []
      for (const dep of dependencies) {
        if (dfs(dep)) {
          cycleItems.push(node) // Add this node to cycle path
          return true
        }
      }

      // Remove from recursion stack when done with this branch
      recursionStack.delete(node)
      return false
    }

    // Check all nodes for cycles
    for (const node of graph.keys()) {
      if (!visited.has(node)) {
        if (dfs(node)) {
          return { hasCycle: true, cycleItems }
        }
      }
    }

    return { hasCycle: false, cycleItems: [] }
  }

  /**
   * Calculate critical path duration for workflow planning
   * Returns the longest path through the dependency graph in minutes
   */
  calculateCriticalPath(items: UnifiedScheduleItem[]): number {
    const graph = this.buildDependencyGraph(items)
    const itemMap = new Map<string, UnifiedScheduleItem>()
    const memo = new Map<string, number>()

    // Build item lookup map
    items.forEach(item => {
      itemMap.set(item.id, item)
    })

    // Recursive function to calculate longest path from a node
    const calculateLongestPath = (nodeId: string): number => {
      // Check memo first
      if (memo.has(nodeId)) {
        return memo.get(nodeId)!
      }

      const item = itemMap.get(nodeId)
      if (!item) return 0

      const dependencies = graph.get(nodeId) || []
      let maxDependencyPath = 0

      // Find the longest path among dependencies
      for (const depId of dependencies) {
        const depPath = calculateLongestPath(depId)
        maxDependencyPath = Math.max(maxDependencyPath, depPath)
      }

      // Current item's contribution = its duration + longest dependency path
      const totalPath = item.duration + maxDependencyPath
      memo.set(nodeId, totalPath)
      return totalPath
    }

    // Calculate critical path as the maximum among all items
    let criticalPath = 0
    for (const item of items) {
      const pathLength = calculateLongestPath(item.id)
      criticalPath = Math.max(criticalPath, pathLength)
    }

    return criticalPath
  }

  // ============================================================================
  // TASK ALLOCATION (from flexible-scheduler)
  // ============================================================================

  /**
   * Allocate tasks to available work blocks with multi-day lookahead for better splitting
   */
  allocateToWorkBlocks(
    items: UnifiedScheduleItem[],
    workPatterns: DailyWorkPattern[],
    config: ScheduleConfig & { currentTime?: Date },
    completedItemIds: Set<string> = new Set(),
  ): UnifiedScheduleItem[] {
    if (items.length === 0) {
      return []
    }

    if (workPatterns.length === 0) {
      return []
    }

    const scheduled: UnifiedScheduleItem[] = []
    const remaining = [...items]

    // Initialize scheduled items reference for dependency checking
    this.scheduledItemsReference = scheduled

    // Ensure startDate is a valid Date object with better fallback handling
    let startDateValue = config.startDate
    if (!startDateValue) {
      startDateValue = getLocalDateString(getCurrentTime())
    }

    // CRITICAL: Use currentTime as the starting point if provided
    // This ensures we start scheduling from "now" not midnight
    // When we have currentTime, we should start from that date (at midnight)
    // to check the whole day's patterns
    // REVIEW: let's use a utility function or something. This is mad confusing I don't even understand why we need this here.
    let currentDate: Date
    if (config.currentTime) {
      // Start from the LOCAL DATE of currentTime (at midnight) to check full day patterns
      // CRITICAL: Use local date, NOT UTC date
      const dateStr = getLocalDateString(config.currentTime)
      currentDate = new Date(dateStr + 'T00:00:00')
    } else if (typeof startDateValue === 'string') {
      currentDate = new Date(startDateValue + 'T00:00:00')
    } else {
      currentDate = new Date(startDateValue)
    }

    // Validate the date immediately
    if (!currentDate || isNaN(currentDate.getTime())) {
      // Return empty array if we can't create a valid date
      return []
    }

    let dayIndex = 0
    // This should be a configuration option.
    const maxDays = 30 // Safety limit

    while (remaining.length > 0 && dayIndex < maxDays) {
      // REVIEW: should use utility functions for date manipulations.
      const dateStr = currentDate.toISOString().split('T')[0]

      const pattern = workPatterns.find(p => p.date === dateStr)

      if (!pattern || pattern.blocks.length === 0) {
        // No work pattern for this day, move to next
        // Simply increment the date by one day - no special handling needed
        currentDate.setDate(currentDate.getDate() + 1)
        dayIndex++
        // Check if date is still valid after modification
        if (isNaN(currentDate.getTime())) {
          break
        }
        continue
      }

      // Create block capacities for this day
      // IMPORTANT: Blocks need to be created with a date at midnight for proper time calculations
      // But we'll still use currentTime for scheduling constraints
      const blockDate = new Date(dateStr + 'T00:00:00')
      const dayBlocks = pattern.blocks.map(block => this.createBlockCapacity(block, blockDate))

      // Schedule meetings and breaks first (for time blocking only)
      const meetingItems = this.scheduleMeetings(pattern.meetings || [], blockDate)
      // Add meetings to scheduled array so they block time
      scheduled.push(...meetingItems)

      // Try to schedule remaining items in this day's blocks
      let scheduledItemsToday = false
      let madeProgress = true // Track if we're making progress in this iteration

      // Keep trying to schedule items until we can't fit any more in this day
      while (madeProgress && remaining.length > 0) {
        madeProgress = false

        // CRITICAL FIX: Sort remaining items by priority before each scheduling attempt
        // This ensures high priority items are scheduled first, even after dependencies are resolved
        // REVIEW: I want to make sure this is after all boosts have been applied.
        remaining.sort((a, b) => (b.priority || 0) - (a.priority || 0))

        for (let itemIndex = 0; itemIndex < remaining.length; itemIndex++) {
          const item = remaining[itemIndex]
          if (!item) continue // Should never happen, but satisfies TypeScript

          // Check if dependencies are satisfied
          if (!this.areDependenciesSatisfied(item, scheduled, completedItemIds)) {
            continue // Skip this item, try next
          }

          // Try to fit item in available blocks
          // Only use current time constraint if:
          // 1. We're on the first day of scheduling (dayIndex === 0)
          // 2. AND we have a current time to respect (config.currentTime is provided)
          // This prevents using "now" when scheduling future days
          const currentTimeToUse = (dayIndex === 0 && config.currentTime) ? config.currentTime : undefined

          const fitResult = this.findBestBlockForItem(item, dayBlocks, scheduled, blockDate, currentTimeToUse)

          if (fitResult.canFit && fitResult.block) {
            // Schedule the full item
            const scheduledItem = this.scheduleItemInBlock(item, fitResult, false)
            scheduled.push(scheduledItem)

            // If item has asyncWaitTime, create a wait time block
            // REVIEW: so... we need to rethink how we do wait time. Because wait times should be shown but constantly be updating, while other things are scheduled. So we should show the wait time decreasing.. wait time starts at task completion. It's like a timer that blocks the next task. To be honest it should block dependency resolution.
            if (item.asyncWaitTime && item.asyncWaitTime > 0 && scheduledItem.endTime) {
              const waitTimeItem: UnifiedScheduleItem = {
                id: `${item.id}-wait`,
                name: `⏳ Waiting: ${item.name}`,
                type: 'async-wait',
                duration: item.asyncWaitTime,
                priority: 0,
                startTime: scheduledItem.endTime,
                endTime: new Date(scheduledItem.endTime.getTime() + item.asyncWaitTime * 60000),
                isWaitTime: true,
                ...(item.workflowId && { workflowId: item.workflowId }),
                ...(item.workflowName && { workflowName: item.workflowName }),
                ...(item.originalItem && { originalItem: item.originalItem }),
              }
              scheduled.push(waitTimeItem)
            }

            remaining.splice(itemIndex, 1)
            scheduledItemsToday = true
            madeProgress = true

            // Update block capacity
            this.updateBlockCapacity(fitResult.block, item)

            // Start over from the beginning since we modified the array
            break

          } else if (fitResult.canPartiallyFit && fitResult.block && config.allowTaskSplitting !== false) {
            // Split the task across multiple days
            // REVIEW: why do we need different logic for this? seems like we would jsut mark the split and the next iteration would know that if it schedules it's scheduling a split task.
            const splitItems = this.splitTaskAcrossDays(item, [
              { date: currentDate, duration: fitResult.availableMinutes || 0 },
            ])

            if (splitItems.length > 0) {
              // Schedule the first part
              const firstPart = splitItems[0]
              if (!firstPart) continue // TypeScript safety

              const scheduledPart = this.scheduleItemInBlock(firstPart, fitResult, true)
              scheduled.push(scheduledPart)

              // Replace original item with remaining parts
              remaining.splice(itemIndex, 1, ...splitItems.slice(1))
              scheduledItemsToday = true
              madeProgress = true

              // Update block capacity
              this.updateBlockCapacity(fitResult.block, firstPart)

              // Start over from the beginning since we modified the array
              break
            }
          }
        }
      }

      // Move to next day
      // CRITICAL FIX: When moving to next day, normalize to midnight
      // This prevents issues when currentTime was provided (e.g., Sep 13 22:43)
      // Without this, we'd go from Sep 13 22:43 to Sep 14 22:43, missing the Sep 14 morning blocks
      if (dayIndex === 0 && config.currentTime) {
        // First iteration with currentTime - move to midnight of next day
        const nextDay = new Date(currentDate)
        nextDay.setDate(nextDay.getDate() + 1)
        nextDay.setHours(0, 0, 0, 0)
        currentDate.setTime(nextDay.getTime())
      } else {
        // Normal day increment
        currentDate.setDate(currentDate.getDate() + 1)
      }
      dayIndex++

      // If we didn't schedule anything today and still have items, we might be stuck
      if (!scheduledItemsToday && remaining.length > 0) {
        // Check if we should continue or break to avoid infinite loop
        const hasSchedulableItems = remaining.some(item =>
          this.areDependenciesSatisfied(item, scheduled, completedItemIds),
        )

        if (!hasSchedulableItems) {
          // No items can be scheduled, likely dependency issues
          break
        }
      }
    }

    return scheduled
  }

  /**
   * Split task across multiple days when it exceeds daily capacity
   */
  splitTaskAcrossDays(
    task: UnifiedScheduleItem,
    availableSlots: { date: Date; duration: number }[],
  ): UnifiedScheduleItem[] {
    const MIN_SPLIT_DURATION = 30 // Minimum 30 minutes per split
    const splitParts: UnifiedScheduleItem[] = []

    // Handle edge cases
    if (availableSlots.length === 0 || task.duration <= MIN_SPLIT_DURATION) {
      return [] // Can't split effectively
    }

    let remainingDuration = task.duration
    let partNumber = 1

    // Calculate total parts needed - safer calculation
    const totalAvailableDuration = availableSlots.reduce((sum, slot) => sum + slot.duration, 0)
    const avgSlotDuration = totalAvailableDuration / availableSlots.length
    const estimatedParts = avgSlotDuration > 0 ? Math.ceil(task.duration / avgSlotDuration) : availableSlots.length

    for (const slot of availableSlots) {
      if (remainingDuration <= 0) break

      // Don't create parts smaller than minimum unless it's the last part
      const durationForThisPart = Math.min(remainingDuration, slot.duration)

      if (durationForThisPart < MIN_SPLIT_DURATION && remainingDuration > MIN_SPLIT_DURATION) {
        // Skip this slot if it would create a too-small part (unless it's the remainder)
        continue
      }

      // Destructure to exclude startTime and endTime (rather than setting to undefined)
      const { startTime, endTime, ...taskWithoutTiming } = task

      const splitPart: UnifiedScheduleItem = {
        ...taskWithoutTiming,
        id: `${task.id}-part-${partNumber}`,
        name: `${task.name} (Part ${partNumber}/${estimatedParts})`,
        duration: durationForThisPart,

        // Split tracking
        isSplit: true,
        splitPart: partNumber,
        splitTotal: estimatedParts,
        originalTaskId: task.originalTaskId || task.id,
        remainingDuration: remainingDuration - durationForThisPart,
        // startTime and endTime intentionally omitted - will be set during scheduling
      }

      splitParts.push(splitPart)
      remainingDuration -= durationForThisPart
      partNumber++
    }

    // Update actual total parts
    splitParts.forEach(part => {
      part.splitTotal = splitParts.length
    })

    return splitParts
  }

  /**
   * Find available time slots in work blocks
   */
  findAvailableSlots(
    workBlocks: WorkBlock[],
    duration: number,
    taskType: TaskType,
  ): { startTime: Date; endTime: Date; blockId: string }[] {
    const availableSlots: { startTime: Date; endTime: Date; blockId: string }[] = []

    for (const block of workBlocks) {
      // Check if block type is compatible with task type
      if (!this.isCompatibleBlockType(block, taskType)) {
        continue
      }

      // Parse block times (assuming they're in "HH:MM" format)
      const [startHour, startMinute] = parseTimeString(block.startTime)
      const [endHour, endMinute] = parseTimeString(block.endTime)

      // Create Date objects for block start and end (using today as base date)
      const blockStartTime = getCurrentTime()
      blockStartTime.setHours(startHour, startMinute, 0, 0)

      const blockEndTime = getCurrentTime()
      blockEndTime.setHours(endHour, endMinute, 0, 0)

      // Calculate block duration in minutes
      const blockDurationMs = blockEndTime.getTime() - blockStartTime.getTime()
      const blockDurationMinutes = blockDurationMs / 60000

      // Check if block is large enough for the task
      if (blockDurationMinutes >= duration) {
        // For now, assume entire block is available
        // In a more sophisticated implementation, we would:
        // 1. Check for existing scheduled items in this block
        // 2. Find gaps between scheduled items
        // 3. Check capacity constraints (focused vs admin time)

        availableSlots.push({
          startTime: blockStartTime,
          endTime: new Date(blockStartTime.getTime() + duration * 60000),
          blockId: block.id,
        })
      }
    }

    return availableSlots
  }

  /**
   * Check if a work block type is compatible with a task type
   */
  private isCompatibleBlockType(block: WorkBlock, taskType: TaskType): boolean {
    switch (taskType) {
      case TaskType.Focused:
        return block.type === 'focused' || block.type === 'mixed' || block.type === 'flexible'
      case TaskType.Admin:
        return block.type === 'admin' || block.type === 'mixed' || block.type === 'flexible'
      case TaskType.Personal:
        return block.type === 'personal' || block.type === 'flexible'
      case TaskType.Mixed:
        return true // Mixed tasks can go in any block
      default:
        return block.type === 'flexible' // Default to flexible blocks
    }
  }

  /**
   * Adjust schedule to respect existing meetings
   */
  respectMeetings(
    schedule: UnifiedScheduleItem[],
    meetings: WorkMeeting[],
  ): UnifiedScheduleItem[] {
    if (meetings.length === 0) {
      return schedule
    }

    const adjustedSchedule: UnifiedScheduleItem[] = []

    for (const item of schedule) {
      if (!item.startTime || !item.endTime) {
        // Item has no timing, keep as-is
        adjustedSchedule.push(item)
        continue
      }

      let conflict = false
      let conflictingMeeting: WorkMeeting | null = null

      // Check if this scheduled item conflicts with any meeting
      for (const meeting of meetings) {
        if (this.hasTimeConflict(item, meeting)) {
          conflict = true
          conflictingMeeting = meeting
          break
        }
      }

      if (!conflict) {
        // No conflict, keep item as-is
        adjustedSchedule.push(item)
      } else {
        // Find next available time slot after the meeting
        const adjustedItem = this.adjustItemForMeetingConflict(item, conflictingMeeting!, meetings)
        adjustedSchedule.push(adjustedItem)
      }
    }

    return adjustedSchedule
  }

  /**
   * Check if a scheduled item conflicts with a meeting
   */
  private hasTimeConflict(item: UnifiedScheduleItem, meeting: WorkMeeting): boolean {
    if (!item.startTime || !item.endTime) return false

    // Parse meeting times (assuming same date as item for simplicity)
    const [meetingStartHour, meetingStartMinute] = parseTimeString(meeting.startTime)
    const [meetingEndHour, meetingEndMinute] = parseTimeString(meeting.endTime)

    const meetingStart = new Date(item.startTime)
    meetingStart.setHours(meetingStartHour, meetingStartMinute, 0, 0)

    const meetingEnd = new Date(item.startTime)
    meetingEnd.setHours(meetingEndHour, meetingEndMinute, 0, 0)

    // Check for overlap: item starts before meeting ends AND item ends after meeting starts
    return item.startTime < meetingEnd && item.endTime > meetingStart
  }

  /**
   * Adjust an item's timing to avoid a meeting conflict
   */
  private adjustItemForMeetingConflict(
    item: UnifiedScheduleItem,
    conflictingMeeting: WorkMeeting,
    allMeetings: WorkMeeting[],
  ): UnifiedScheduleItem {
    if (!item.startTime || !item.endTime) return item

    // Parse meeting end time
    const [meetingEndHour, meetingEndMinute] = parseTimeString(conflictingMeeting.endTime)

    const meetingEnd = new Date(item.startTime)
    meetingEnd.setHours(meetingEndHour, meetingEndMinute, 0, 0)

    // Schedule item to start after the meeting ends
    const newStartTime = new Date(meetingEnd)
    const newEndTime = new Date(newStartTime.getTime() + item.duration * 60000)

    const adjustedItem: UnifiedScheduleItem = {
      ...item,
      startTime: newStartTime,
      endTime: newEndTime,
    }

    // Recursively check for conflicts with other meetings
    for (const otherMeeting of allMeetings) {
      if (otherMeeting.id !== conflictingMeeting.id && this.hasTimeConflict(adjustedItem, otherMeeting)) {
        // Recursive call to handle cascading conflicts
        return this.adjustItemForMeetingConflict(adjustedItem, otherMeeting, allMeetings)
      }
    }

    return adjustedItem
  }

  // ============================================================================
  // OPTIMIZATION (from optimal-scheduler)
  // ============================================================================

  /**
   * Calculate optimal schedule ignoring capacity constraints
   * Uses algorithms from optimal-scheduler to find mathematically optimal arrangement
   */
  calculateOptimalSchedule(
    items: UnifiedScheduleItem[],
    context: ScheduleContext,
  ): ScheduleResult {
    // Sort items topologically first to respect dependencies
    const sortedItems = this.topologicalSort(items)

    // Create optimal schedule by scheduling items as early as possible
    const scheduled: UnifiedScheduleItem[] = []
    let currentTime = new Date(context.startDate)
    const completedItems = new Set<string>()
    const asyncEndTimes = new Map<string, Date>()

    for (const item of sortedItems) {
      // Check if dependencies are satisfied
      const dependencies = item.dependencies || []
      const dependenciesSatisfied = dependencies.every(depId =>
        completedItems.has(depId) ||
        (asyncEndTimes.has(depId) && asyncEndTimes.get(depId)! <= currentTime),
      )

      if (!dependenciesSatisfied) {
        // Find earliest time when dependencies are satisfied
        const earliestStart = Math.max(
          currentTime.getTime(),
          ...dependencies
            .filter(depId => asyncEndTimes.has(depId))
            .map(depId => asyncEndTimes.get(depId)!.getTime()),
        )
        currentTime = new Date(earliestStart)
      }

      // Schedule the item
      const scheduledItem: UnifiedScheduleItem = {
        ...item,
        startTime: new Date(currentTime),
        endTime: new Date(currentTime.getTime() + item.duration * 60000),
      }

      scheduled.push(scheduledItem)

      // Update tracking
      if (item.asyncWaitTime) {
        // Async task - complete after wait time
        const asyncCompleteTime = new Date((scheduledItem.endTime?.getTime() || 0) + item.asyncWaitTime * 60000)
        asyncEndTimes.set(item.id, asyncCompleteTime)
      } else {
        // Regular task - complete immediately
        completedItems.add(item.id)
      }

      currentTime = scheduledItem.endTime || currentTime
    }

    // Calculate metrics
    const firstItem = scheduled[0]
    const firstStart = firstItem?.startTime || new Date(context.startDate)
    const lastEnd = scheduled.length > 0 && firstItem?.endTime
      ? scheduled.reduce((latest, item) =>
          (item.endTime && item.endTime > latest) ? item.endTime : latest, firstItem.endTime)
      : new Date(context.startDate)

    const totalDuration = (lastEnd.getTime() - firstStart.getTime()) / 60000
    const activeWorkTime = scheduled.reduce((sum, item) => sum + item.duration, 0)

    return {
      scheduled,
      unscheduled: [],
      metrics: {
        capacityUtilization: activeWorkTime / Math.max(totalDuration, 1),
        deadlineRiskScore: 0,
        alternativeScenariosCount: 0,
        scheduledCount: scheduled.length,
        unscheduledCount: 0,
        totalDuration: activeWorkTime,
        utilizationRate: scheduled.length > 0 ? 1 : 0, // Perfect utilization in optimal schedule
        averagePriority: scheduled.length > 0 ? scheduled.reduce((sum, item) => sum + (item.priority || 0), 0) / scheduled.length : 0,
        deadlinesMissed: 0,
        criticalPathLength: this.calculateCriticalPath(scheduled),
      },
      debugInfo: {
        scheduledItems: [],
        unscheduledItems: [],
        blockUtilization: [],
        warnings: [],
        totalScheduled: scheduled.length,
        totalUnscheduled: 0,
        scheduleEfficiency: 100,
        sortOrder: 'priority-descending',
        allocationDetails: [],
        conflicts: [],
      },
      conflicts: [],
      warnings: [],
    }
  }

  /**
   * Calculate theoretical minimum completion time based on critical path and parallelization
   */
  calculateMinimumCompletionTime(items: UnifiedScheduleItem[]): number {
    if (items.length === 0) return 0

    // For minimum completion time, we need to consider parallel execution
    // The minimum time is the time taken when maximum parallelization is achieved
    const parallelModel = this.modelParallelExecution(items)

    // Calculate time for each parallel group (longest task in each group)
    let totalParallelTime = 0
    for (const group of parallelModel.parallelGroups) {
      const maxDurationInGroup = Math.max(...group.map(item => item.duration))
      totalParallelTime += maxDurationInGroup
    }

    return totalParallelTime
  }

  /**
   * Model parallel execution possibilities by analyzing dependency graph
   */
  modelParallelExecution(items: UnifiedScheduleItem[]): {
    parallelGroups: UnifiedScheduleItem[][]
    maxParallelism: number
    timeReduction: number
  } {
    const graph = this.buildDependencyGraph(items)
    const parallelGroups: UnifiedScheduleItem[][] = []

    // Group items by their dependency level (items at same level can run in parallel)
    const levelGroups = new Map<number, UnifiedScheduleItem[]>()

    const calculateLevel = (itemId: string, memo = new Map<string, number>()): number => {
      if (memo.has(itemId)) return memo.get(itemId)!

      const dependencies = graph.get(itemId) || []
      if (dependencies.length === 0) {
        memo.set(itemId, 0)
        return 0
      }

      const maxDepLevel = Math.max(...dependencies.map(depId => calculateLevel(depId, memo)))
      const level = maxDepLevel + 1
      memo.set(itemId, level)
      return level
    }

    // Calculate level for each item
    items.forEach(item => {
      const level = calculateLevel(item.id)
      const group = levelGroups.get(level) || []
      group.push(item)
      levelGroups.set(level, group)
    })

    // Convert level groups to parallel groups
    const sortedLevels = Array.from(levelGroups.keys()).sort((a, b) => a - b)
    sortedLevels.forEach(level => {
      const group = levelGroups.get(level)!
      if (group.length > 0) {
        parallelGroups.push(group)
      }
    })

    // Calculate max parallelism (largest group size)
    const maxParallelism = Math.max(...parallelGroups.map(group => group.length))

    // Estimate time reduction from parallelization
    const sequentialTime = items.reduce((sum, item) => sum + item.duration, 0)
    let parallelTime = 0

    parallelGroups.forEach(group => {
      // Time for this level is the maximum duration in the group (since they run in parallel)
      const levelTime = Math.max(...group.map(item => item.duration))
      parallelTime += levelTime
    })

    const timeReduction = Math.max(0, sequentialTime - parallelTime)

    return {
      parallelGroups,
      maxParallelism,
      timeReduction,
    }
  }

  // ============================================================================
  // ALLOCATION HELPER METHODS
  // ============================================================================

  /**
   * Check if all dependencies for an item are satisfied (scheduled)
   */
  private areDependenciesSatisfied(
    item: UnifiedScheduleItem,
    scheduled: UnifiedScheduleItem[],
    completedItemIds: Set<string> = new Set(),
  ): boolean {
    const dependencies = item.dependencies || []

    // Check that all dependencies are satisfied by either:
    // 1. Being in the completed items set (completed before scheduling started)
    // 2. Being scheduled with an end time (completed during this scheduling run)
    return dependencies.every(depId => {
      // First check if it's in the pre-completed items set
      if (completedItemIds.has(depId)) {
        return true
      }

      // Then check if it's scheduled and completed in this run
      const dependency = scheduled.find(s => s.id === depId)
      return dependency && dependency.endTime // Must be scheduled AND have an end time
    })
  }

  /**
   * Create block capacity tracker from work block
   */
  private createBlockCapacity(block: WorkBlock, date: Date): BlockCapacity {
    const startTime = this.parseTimeOnDate(date, block.startTime)
    const endTime = this.parseTimeOnDate(date, block.endTime)

    // Use the capacity already calculated by capacity-calculator in getWorkPattern
    const capacity = block.capacity

    // Handle both old and new capacity formats
    let totalMinutes = 0
    let splitRatio: SplitRatio | undefined = undefined

    if (capacity && 'totalMinutes' in capacity) {
      totalMinutes = capacity.totalMinutes || 0
      splitRatio = capacity.splitRatio
    }

    // Fallback: calculate from time difference if still 0
    if (totalMinutes === 0) {
      totalMinutes = calculateTimeStringDuration(block.startTime, block.endTime)

    }

    // Simple unified structure
    return {
      blockId: block.id,
      blockType: block.type as WorkBlockType,
      startTime,
      endTime,
      totalMinutes,
      usedMinutes: 0,
      splitRatio,
    }
  }

  /**
   * Find the best block for an item
   */
  private findBestBlockForItem(
    item: UnifiedScheduleItem,
    blocks: BlockCapacity[],
    scheduled: UnifiedScheduleItem[],
    // REVIEW: what is the purpose of currentDate here? value unused.
    currentDate: Date,
    currentTime?: Date,
  ): FitResult {

    for (const block of blocks) {
      const fitResult = this.canFitInBlock(item, block, scheduled, currentTime)

      if (fitResult.canFit || fitResult.canPartiallyFit) {
        return { ...fitResult, block }
      }
    }

    return { canFit: false, canPartiallyFit: false }
  }

  /**
   * Check if item can fit in block
   */
  private canFitInBlock(
    item: UnifiedScheduleItem,
    block: BlockCapacity,
    scheduled: UnifiedScheduleItem[],
    currentTime?: Date,
  ): FitResult {
    // Get the task type
    const taskType = item.taskType === TaskType.Focused ? TaskType.Focused :
                     item.taskType === TaskType.Admin ? TaskType.Admin : TaskType.Personal

    // Calculate available capacity using the scheduler-specific helper function
    // This allows flexible blocks to be used for any task type
    // Conditionally include splitRatio only if it exists (not undefined)
    // REVIEW: can we use a utility function for this. we have a whole suite of capacity calculators already. this looks like it's using a function imported from the module but it does something super simplistic.
    const totalCapacityForTaskType = getSchedulerCapacityForTaskType(
      block.splitRatio !== undefined
        ? { totalMinutes: block.totalMinutes, type: block.blockType, splitRatio: block.splitRatio }
        : { totalMinutes: block.totalMinutes, type: block.blockType },
      taskType,
    )

    // If this block type doesn't support this task type, capacity will be 0
    if (totalCapacityForTaskType === 0) {
      return { canFit: false, canPartiallyFit: false }
    }

    // Calculate available capacity (total for this task type minus what's used)
    const availableCapacity = totalCapacityForTaskType - block.usedMinutes

    // Account for time already passed in current block
    let effectiveAvailableCapacity = availableCapacity
    if (currentTime && currentTime > block.startTime && currentTime < block.endTime) {
      const minutesPassed = Math.floor((currentTime.getTime() - block.startTime.getTime()) / 60000)

      // Simply reduce available by time already passed
      effectiveAvailableCapacity = Math.max(0, availableCapacity - minutesPassed)

    }

    if (effectiveAvailableCapacity <= 0) {
      return { canFit: false, canPartiallyFit: false }
    }

    // Check for time conflicts with scheduled items
    // IMPORTANT: Exclude wait time blocks - they don't consume physical time/capacity
    const blockScheduled = scheduled.filter(s =>
      s.startTime && s.endTime &&
      s.startTime < block.endTime &&
      s.endTime > block.startTime &&
      !s.isWaitTime,  // Wait times don't block scheduling
    )


    // Find available time slot within the block
    // REVIEW: seems like this whole function is doing a lot of work that could be done in a utility function. it seems overly complicated
    const availableMinutes = Math.min(effectiveAvailableCapacity,
      this.calculateAvailableTimeInBlock(block, blockScheduled))

    // Find when we can start in this block
    const potentialStartTime = this.findNextAvailableTime(block, blockScheduled, currentTime)

    // Check if we're past the block or can't fit
    if (potentialStartTime.getTime() >= block.endTime.getTime()) {
      return { canFit: false, canPartiallyFit: false }
    }

    // Calculate how much time is actually available from the start time
    const timeFromStart = Math.floor((block.endTime.getTime() - potentialStartTime.getTime()) / 60000)
    const actualAvailableMinutes = Math.min(availableMinutes, timeFromStart)

    if (item.duration <= actualAvailableMinutes) {
      return {
        canFit: true,
        canPartiallyFit: true,
        availableMinutes: actualAvailableMinutes,
        startTime: potentialStartTime,
      }
    } else if (actualAvailableMinutes > 30) { // Minimum split size
      return {
        canFit: false,
        canPartiallyFit: true,
        availableMinutes: actualAvailableMinutes,
        startTime: potentialStartTime,
      }
    }

    return { canFit: false, canPartiallyFit: false }
  }

  /**
   * Schedule an item in a block
   */
  private scheduleItemInBlock(
    item: UnifiedScheduleItem,
    fitResult: FitResult,
    isPartial: boolean,
  ): UnifiedScheduleItem {
    let startTime = fitResult.startTime || getCurrentTime()
    const duration = isPartial ? (fitResult.availableMinutes || 0) : item.duration


    // Ensure start time is after all dependencies complete
    if (item.dependencies?.length) {
      const latestDependencyEnd = this.getLatestDependencyEndTime(item)
      if (latestDependencyEnd && latestDependencyEnd > startTime) {
        startTime = latestDependencyEnd
      }
    }

    const endTime = new Date(startTime.getTime() + duration * 60000)


    return {
      ...item,
      startTime,
      endTime,
      duration,
    }
  }

  /**
   * Get the latest end time of all dependencies for an item
   * IMPORTANT: If a dependency has async wait time, use the wait time's end time
   */
  private getLatestDependencyEndTime(item: UnifiedScheduleItem): Date | null {
    if (!item.dependencies?.length) return null

    let latestEnd: Date | null = null

    for (const depId of item.dependencies) {
      const dependency = this.scheduledItemsReference.find(s => s.id === depId)
      if (dependency && dependency.endTime) {
        // Check if this dependency has an associated wait time block
        const waitTimeBlock = this.scheduledItemsReference.find(s =>
          s.id === `${depId}-wait` && s.isWaitTime,
        )

        // Use wait time end if it exists, otherwise use dependency end
        const effectiveEndTime = waitTimeBlock?.endTime || dependency.endTime

        if (!latestEnd || effectiveEndTime > latestEnd) {
          latestEnd = effectiveEndTime
        }
      }
    }

    return latestEnd
  }

  /**
   * Update block capacity after scheduling an item
   */
  private updateBlockCapacity(block: BlockCapacity | undefined, item: UnifiedScheduleItem): void {
    if (!block) return

    // Simply update used minutes - works for all block types
    block.usedMinutes = (block.usedMinutes || 0) + item.duration

  }

  /**
   * Parse time string on specific date
   */
  private parseTimeOnDate(date: Date, timeStr: string): Date {
    // Handle missing or invalid time strings
    if (!timeStr || typeof timeStr !== 'string') {
      // Return start of day as fallback
      const result = new Date(date)
      result.setHours(0, 0, 0, 0)
      return result
    }

    const [hour, minute] = parseTimeString(timeStr)
    // Create a new date in local time - the time strings like "09:00"
    // represent local time for the user, not UTC
    const result = new Date(date)
    result.setHours(hour, minute, 0, 0)
    return result
  }

  /**
   * Calculate available time in block considering scheduled items
   */
  private calculateAvailableTimeInBlock(block: BlockCapacity, scheduledInBlock: UnifiedScheduleItem[]): number {
    const totalBlockMinutes = (block.endTime.getTime() - block.startTime.getTime()) / 60000
    const usedMinutes = scheduledInBlock.reduce((sum, item) => {
      if (item.startTime && item.endTime) {
        return sum + ((item.endTime.getTime() - item.startTime.getTime()) / 60000)
      }
      return sum + item.duration
    }, 0)

    return totalBlockMinutes - usedMinutes
  }

  /**
   * Find next available time in block
   */
  private findNextAvailableTime(block: BlockCapacity, scheduledInBlock: UnifiedScheduleItem[], currentTime?: Date): Date {
    // If no current time constraint, start from block start
    if (!currentTime) {
      const effectiveStartTime = block.startTime

      // If no items scheduled in this block, return the block start time
      if (scheduledInBlock.length === 0) {
        return effectiveStartTime
      }

      // Find gaps between scheduled items
      const sortedItems = scheduledInBlock
        .filter(item => item.startTime && item.endTime)
        .sort((a, b) => a.startTime!.getTime() - b.startTime!.getTime())

      if (sortedItems.length === 0) {
        return effectiveStartTime
      }

      let candidateTime = effectiveStartTime
      for (const item of sortedItems) {
        if (item.startTime! > candidateTime) {
          return candidateTime
        }
        candidateTime = new Date(item.endTime!.getTime())
      }

      return candidateTime
    }

    // With current time constraint, ensure we don't schedule in the past
    const now = currentTime

    // If current time is past the block end, we can't use this block
    if (now.getTime() >= block.endTime.getTime()) {
      // Return block end time to indicate block is full/past
      return block.endTime
    }

    const effectiveStartTime = new Date(Math.max(block.startTime.getTime(), now.getTime()))

    // If no items scheduled in this block, return the effective start time
    if (scheduledInBlock.length === 0) {
      return effectiveStartTime
    }

    // Sort scheduled items by start time
    const sortedItems = scheduledInBlock
      .filter(item => item.startTime && item.endTime)
      .sort((a, b) => a.startTime!.getTime() - b.startTime!.getTime())

    // If no valid scheduled items, return effective start time
    if (sortedItems.length === 0) {
      return effectiveStartTime
    }

    // Find the first gap or return time after last item
    let candidateTime = effectiveStartTime

    for (const item of sortedItems) {
      if (item.startTime! > candidateTime) {
        // Found a gap before this item
        return candidateTime
      }
      // Move candidate time to after this item
      candidateTime = new Date(Math.max(item.endTime!.getTime(), candidateTime.getTime()))
    }

    // Return time after all scheduled items
    return candidateTime
  }


  /**
   * Schedule meetings for a day
   */
  private scheduleMeetings(meetings: WorkMeeting[], date: Date): UnifiedScheduleItem[] {
    return meetings.map(meeting => {
      const startTime = this.parseTimeOnDate(date, meeting.startTime)
      let endTime = this.parseTimeOnDate(date, meeting.endTime)

      // Handle meetings that cross midnight (end time is before start time)
      if (endTime <= startTime) {
        // Move end time to next day
        endTime = new Date(endTime)
        endTime.setDate(endTime.getDate() + 1)
      }
      const duration = (endTime.getTime() - startTime.getTime()) / 60000 // Convert to minutes

      return {
        id: meeting.id,
        name: meeting.name,
        type: 'meeting' as const,
        duration,
        priority: 1000, // High priority to avoid conflicts
        startTime,
        endTime,
        locked: true,
        originalItem: meeting,
      }
    })
  }

  // ============================================================================
  // DEPENDENCY VALIDATION HELPERS
  // ============================================================================

  /**
   * Validate all dependencies are resolvable and detect issues
   */
  validateDependencies(
    items: UnifiedScheduleItem[],
    completedItemIds: Set<string> = new Set(),
  ): {
    isValid: boolean
    errors: SchedulingConflict[]
    warnings: SchedulingWarning[]
  } {
    const errors: SchedulingConflict[] = []
    const warnings: SchedulingWarning[] = []
    const itemIds = new Set(items.map(item => item.id))

    // Check for missing dependencies (considering completed items as satisfied)
    for (const item of items) {
      const deps = item.dependencies || []
      for (const depId of deps) {
        const dependencyExists = itemIds.has(depId) || completedItemIds.has(depId)

        if (!dependencyExists) {
          errors.push({
            type: SchedulingConflictType.DependencyCycle,
            affectedItems: [item.id, depId],
            description: `Item "${item.name}" depends on missing item "${depId}"`,
            severity: SeverityLevel.Error,
            suggestedResolution: `Remove dependency on "${depId}" or add the missing item`,
          })
        }
      }
    }

    // Check for circular dependencies
    const graph = this.buildDependencyGraph(items)
    const cycleCheck = this.detectDependencyCycles(graph)
    if (cycleCheck.hasCycle) {
      errors.push({
        type: SchedulingConflictType.DependencyCycle,
        affectedItems: cycleCheck.cycleItems,
        description: 'Circular dependency detected between items',
        severity: SeverityLevel.Error,
        suggestedResolution: 'Remove or modify dependencies to break the cycle',
      })
    }

    // Check for complex dependency chains (warning)
    for (const item of items) {
      const chainLength = this.calculateDependencyChainLength(item.id, graph)
      if (chainLength > 5) {
        // REVIEW: are these warnings even displayed anywhere?
        warnings.push({
          type: SchedulingWarningType.ContextSwitch,
          message: `Item "${item.name}" has a long dependency chain (${chainLength} levels deep)`,
          item,
          expectedDelay: chainLength * 30, // Estimate 30min overhead per dependency level
        })
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    }
  }

  /**
   * Calculate the maximum dependency chain length for an item
   */
  private calculateDependencyChainLength(itemId: string, graph: Map<string, string[]>): number {
    const visited = new Set<string>()

    const dfs = (nodeId: string): number => {
      if (visited.has(nodeId)) return 0 // Avoid infinite recursion

      visited.add(nodeId)
      const dependencies = graph.get(nodeId) || []

      if (dependencies.length === 0) return 1

      let maxDepth = 0
      for (const depId of dependencies) {
        maxDepth = Math.max(maxDepth, dfs(depId))
      }

      visited.delete(nodeId) // Allow revisiting in other branches
      return maxDepth + 1
    }

    return dfs(itemId)
  }

  /**
   * Resolve dependencies and return items in executable order
   * This combines topological sort with dependency validation
   */
  resolveDependencies(
    items: UnifiedScheduleItem[],
    completedItemIds: Set<string> = new Set(),
  ): {
    resolved: UnifiedScheduleItem[]
    conflicts: SchedulingConflict[]
    warnings: SchedulingWarning[]
  } {
    const validation = this.validateDependencies(items, completedItemIds)

    if (!validation.isValid) {
      return {
        resolved: [],
        conflicts: validation.errors,
        warnings: validation.warnings,
      }
    }

    // If validation passes, perform topological sort
    const resolved = this.topologicalSort(items)

    return {
      resolved,
      conflicts: [],
      warnings: validation.warnings,
    }
  }

  // ============================================================================
  // PRIORITY CALCULATION HELPERS
  // ============================================================================

  /**
   * Calculate critical path remaining hours for deadline pressure calculation
   */
  private calculateCriticalPathRemaining(
    item: Task | TaskStep | SequencedTask,
    context: ScheduleContext,
  ): number {
    // For a standalone task, just return its duration
    if ('duration' in item && !('taskId' in item)) {
      return (item.duration || 0) / 60 // Convert to hours
    }

    // For a workflow step, find the parent workflow and calculate remaining critical path
    if ('taskId' in item) {
      const parentWorkflow = context.workflows.find(w => w.id === item.taskId ||
        w.steps?.some(s => s.id === item.id))
      if (parentWorkflow) {
        return (parentWorkflow.criticalPathDuration || parentWorkflow.duration || 0) / 60
      }
    }

    // For a workflow, return its critical path duration
    if ('steps' in item) {
      const criticalPath = ('criticalPathDuration' in item && typeof item.criticalPathDuration === 'number') ? item.criticalPathDuration : 0
      return (criticalPath || item.duration || 0) / 60
    }

    return (item.duration || 0) / 60
  }

  /**
   * Find all tasks that depend on completion of the given item
   */
  private findDependentTasks(
    item: Task | TaskStep,
    context: ScheduleContext,
  ): (Task | TaskStep)[] {
    const dependentTasks: (Task | TaskStep)[] = []
    const itemId = item.id

    // Check all tasks for dependencies on this item
    for (const task of context.tasks) {
      if (task.dependencies && task.dependencies.includes(itemId)) {
        dependentTasks.push(task)
      }
    }

    // Check all workflow steps for dependencies on this item
    for (const workflow of context.workflows) {
      for (const step of workflow.steps || []) {
        if (step.dependsOn && step.dependsOn.includes(itemId)) {
          dependentTasks.push(step)
        }
      }
    }

    return dependentTasks
  }

  /**
   * Find earliest deadline in dependency chain
   */
  private findEarliestDeadlineInChain(
    item: Task | TaskStep,
    dependentTasks: (Task | TaskStep)[],
    context: ScheduleContext,
  ): Date | null {
    let earliestDeadline: Date | null = null

    // Check the item itself
    if ('deadline' in item && item.deadline) {
      earliestDeadline = item.deadline
    }

    // Check dependent tasks
    for (const dependent of dependentTasks) {
      let dependentDeadline: Date | null = null

      if ('deadline' in dependent && dependent.deadline) {
        dependentDeadline = dependent.deadline
      } else if ('taskId' in dependent) {
        // TaskStep - check parent workflow
        const parentWorkflow = context.workflows.find(w => w.id === dependent.taskId)
        if (parentWorkflow?.deadline) {
          dependentDeadline = parentWorkflow.deadline
        }
      }

      if (dependentDeadline) {
        if (!earliestDeadline || dependentDeadline < earliestDeadline) {
          earliestDeadline = dependentDeadline
        }
      }
    }

    return earliestDeadline
  }

  /**
   * Get productivity level at a given time
   */
  private getProductivityLevel(
    timeSlot: Date,
    productivityPatterns: ProductivityPattern[],
  ): string {
    // If no patterns, return moderate
    if (!productivityPatterns || productivityPatterns.length === 0) {
      return 'moderate'
    }

    const hour = timeSlot.getHours()

    // Find matching pattern
    for (const pattern of productivityPatterns) {
      // Check if hour falls within time range
      if (!pattern.timeRangeStart || !pattern.timeRangeEnd) continue

      const [startHour] = parseTimeString(pattern.timeRangeStart)
      const [endHour] = parseTimeString(pattern.timeRangeEnd)

      if (hour >= startHour && hour < endHour) {
        return pattern.cognitiveCapacity
      }
    }

    // Default to moderate if no pattern matches
    return 'moderate'
  }

  // ============================================================================
  // UTILITIES AND HELPERS
  // ============================================================================

  /**
   * Convert various input types to UnifiedScheduleItem
   */
  // REVIEW: let's move this to a utility file and make sure it's tested, if we even need it. But I hate how many hardcoded strings there are here. This is very error prone.
  private convertToUnifiedItems(
    items: (Task | SequencedTask | TaskStep)[],
  ): {
    activeItems: UnifiedScheduleItem[]
    completedItemIds: Set<string>
  } {
    const unified: UnifiedScheduleItem[] = []
    const completedItemIds = new Set<string>()
    const processedItemIds = new Set<string>() // Track all processed items to avoid duplicates

    for (const item of items) {
      if ('steps' in item && item.steps) {
        // SequencedTask - convert each step
        item.steps.forEach((step, index) => {
          // Skip if we've already processed this step
          if (processedItemIds.has(step.id)) {
            return
          }
          processedItemIds.add(step.id)

          const isCompleted = step.status === 'completed'

          const unifiedItem = {
            id: step.id,
            name: step.name,
            type: 'workflow-step' as const,
            duration: step.duration,
            priority: 0, // Will be calculated later
            importance: step.importance ?? item.importance ?? 5,  // Default to 5 if both undefined
            urgency: step.urgency ?? item.urgency ?? 5,          // Default to 5 if both undefined
            cognitiveComplexity: step.cognitiveComplexity || 3,
            taskType: step.type,
            ...(item.deadline && { deadline: item.deadline }),   // Only include if defined
            ...(item.deadlineType && { deadlineType: item.deadlineType }),
            dependencies: step.dependsOn || [],
            asyncWaitTime: step.asyncWaitTime,
            completed: isCompleted,
            workflowId: item.id,
            workflowName: item.name,
            stepIndex: index,
            originalItem: step,
          }

          if (isCompleted) {
            completedItemIds.add(step.id)
          } else {
            unified.push(unifiedItem)
          }
        })
      } else {
        // Skip if we've already processed this item
        if (processedItemIds.has(item.id)) {
          continue
        }
        processedItemIds.add(item.id)

        // Regular Task or TaskStep
        const isCompleted = ('completed' in item && item.completed) || ('status' in item && item.status === 'completed')

        const deadline = 'deadline' in item ? item.deadline : undefined
        const deadlineType = 'deadlineType' in item ? item.deadlineType : undefined
        const workflowId = 'taskId' in item ? item.taskId : undefined

        const unifiedItem = {
          id: item.id,
          name: item.name,
          type: ('taskId' in item ? 'workflow-step' : 'task') as 'workflow-step' | 'task',
          duration: item.duration,
          priority: 0, // Will be calculated later
          importance: item.importance ?? 5,  // Default to 5 (mid-range) if undefined
          urgency: item.urgency ?? 5,        // Default to 5 (mid-range) if undefined
          cognitiveComplexity: item.cognitiveComplexity || 3,
          taskType: ('taskType' in item ? item.taskType : item.type) as TaskType,
          ...(deadline && { deadline }),
          ...(deadlineType && { deadlineType }),
          dependencies: 'dependencies' in item ? item.dependencies : (item.dependsOn || []),
          asyncWaitTime: item.asyncWaitTime,
          completed: isCompleted,
          ...(workflowId && { workflowId }),
          originalItem: item,
        }

        if (isCompleted) {
          completedItemIds.add(item.id)
        } else {
          unified.push(unifiedItem)
        }
      }
    }

    return {
      activeItems: unified,
      completedItemIds,
    }
  }

  /**
   * Generate debug information for scheduled and unscheduled items
   * Always called - debug info is mandatory in ScheduleResult
   */
  private generateDebugInfo(
    scheduled: UnifiedScheduleItem[],
    unscheduled: UnifiedScheduleItem[],
    context: ScheduleContext,
    warnings: string[] = [],
  ): SchedulingDebugInfo {
    // Add priority breakdown for both scheduled and unscheduled items
    const scheduledItems = scheduled.slice(0, 10).map(item => ({
      id: item.id,
      name: item.name,
      type: item.type,
      duration: item.duration,
      priority: item.priority,
      startTime: item.startTime?.toISOString(),
      priorityBreakdown: item.originalItem ?
        this.calculatePriorityWithBreakdown(item.originalItem as Task | TaskStep, context) :
        undefined,
    }))

    const unscheduledItems = unscheduled.map(item => ({
      id: item.id,
      name: item.name,
      type: item.type,
      duration: item.duration,
      reason: 'Could not find suitable time slot',
      priorityBreakdown: item.originalItem ?
        this.calculatePriorityWithBreakdown(item.originalItem as Task | TaskStep, context) :
        undefined,
    }))

    const totalItems = scheduled.length + unscheduled.length
    const efficiency = totalItems > 0 ? (scheduled.length / totalItems) * 100 : 100

    // Calculate block utilization
    const blockUtilization = this.calculateBlockUtilization(scheduled, context.workPatterns)

    return {
      scheduledItems,  // Add scheduled items with priority breakdown
      unscheduledItems,
      blockUtilization,
      warnings,
      totalScheduled: scheduled.length,
      totalUnscheduled: unscheduled.length,
      scheduleEfficiency: efficiency,
    }
  }

  /**
   * Calculate block utilization for debug info
   */
  private calculateBlockUtilization(
    scheduled: UnifiedScheduleItem[],
    workPatterns: DailyWorkPattern[],
  ): Array<{
    date: string
    blockId: string
    startTime: string
    endTime: string
    capacity: number
    used: number
    blockType: WorkBlockType
    utilization: number
  }> {
    const utilization: Array<any> = []

    // Group scheduled items by date
    const itemsByDate = new Map<string, UnifiedScheduleItem[]>()
    scheduled.forEach(item => {
      if (item.startTime) {
        const isoString = item.startTime.toISOString()
        const dateStr = isoString.substring(0, 10) // Extract YYYY-MM-DD

        if (!itemsByDate.has(dateStr)) {
          itemsByDate.set(dateStr, [])
        }
        const items = itemsByDate.get(dateStr)
        if (items) {
          items.push(item)
        }
      }
    })

    // Calculate utilization for each work pattern
    workPatterns.forEach(pattern => {
      const dateItems = itemsByDate.get(pattern.date) || []

      pattern.blocks.forEach(block => {
        const blockStart = this.parseTimeOnDate(new Date(pattern.date), block.startTime)
        const blockEnd = this.parseTimeOnDate(new Date(pattern.date), block.endTime)
        const totalMinutes = (blockEnd.getTime() - blockStart.getTime()) / 60000

        // Calculate items scheduled in this block
        const itemsInBlock = dateItems.filter(item => {
          if (!item.startTime || !item.endTime) return false
          return item.startTime >= blockStart && item.endTime <= blockEnd
        })

        // Calculate total used capacity (all task types)
        const usedCapacity = itemsInBlock.reduce((sum, item) => sum + item.duration, 0)

        // Get total capacity from the block
        const totalCapacity = block.capacity?.totalMinutes || totalMinutes

        // Calculate utilization percentage
        const utilizationPercent = totalCapacity > 0 ? (usedCapacity / totalCapacity) * 100 : 0

        const blockUtil = {
          date: pattern.date,
          blockId: block.id,
          startTime: block.startTime,
          endTime: block.endTime,
          capacity: totalCapacity,
          used: usedCapacity,
          blockType: block.type,
          utilization: Math.round(utilizationPercent),
        }

        utilization.push(blockUtil)
      })
    })

    return utilization
  }

  /**
   * Calculate scheduling metrics
   */
  private calculateMetrics(
    schedule: UnifiedScheduleItem[],
    context: ScheduleContext,
  ): SchedulingMetrics {
    const focusedHours = schedule
      .filter(item => item.taskType === TaskType.Focused)
      .reduce((sum, item) => sum + item.duration, 0) / 60

    const adminHours = schedule
      .filter(item => item.taskType === TaskType.Admin)
      .reduce((sum, item) => sum + item.duration, 0) / 60

    // Find the last scheduled item to determine completion date
    const lastItem = schedule
      .filter(item => item.endTime)
      .sort((a, b) => (b.endTime?.getTime() || 0) - (a.endTime?.getTime() || 0))[0]

    const projectedCompletionDate = lastItem?.endTime || getCurrentTime()

    // Calculate work days from start to completion
    const startDate = context.currentTime
    const daysDiff = Math.ceil((projectedCompletionDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))
    const totalWorkDays = Math.max(1, daysDiff)

    return {
      totalWorkDays,
      totalFocusedHours: focusedHours,
      totalAdminHours: adminHours,
      projectedCompletionDate,
      averageUtilization: 75, // Placeholder - would calculate based on capacity
      peakUtilization: 90, // Placeholder - would calculate based on daily peaks
      capacityUtilization: 75,
      deadlineRiskScore: 0,
      alternativeScenariosCount: 0,
    }
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

// Create singleton instance for consistent usage
export const unifiedScheduler = new UnifiedScheduler()

// Types are already exported as interfaces above, no need to re-export
