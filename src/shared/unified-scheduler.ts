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
import { UnifiedScheduleItemType } from './enums'
import {
  DailyWorkPattern,
  WorkMeeting,
} from './work-blocks-types'
import {
  BlockTypeConfig,
  isSingleTypeBlock,
  isComboBlock,
} from './user-task-types'
import { WorkSettings } from './work-settings-types'
import { ProductivityPattern, SchedulingPreferences } from './types'
import { logger } from '../logger'
import { getCurrentTime, getLocalDateString, timeProvider as _timeProvider } from './time-provider'
import { parseTimeString } from './time-utils'
import {
  buildDependencyGraph,
  topologicalSort,
  detectDependencyCycles,
  calculateCriticalPath,
  calculateDependencyChainLength,
} from './graph-utils'
import { convertToUnifiedItems, validateConvertedItems } from './scheduler-converters'
import {
  calculatePriority,
  calculatePriorityWithBreakdown,
  calculateDeadlinePressure,
  calculateAsyncUrgency,
  calculateCognitiveMatch,
} from './scheduler-priority'
import { calculateSchedulingMetrics } from './scheduler-metrics'
import {
  buildBlockTimeline,
  parseTimeOnDate as parseTimeOnDateString,
  TimelineBlock,
} from './scheduler/block-timeline'
import { allocateItems, UnscheduledEntry } from './scheduler/wavefront-allocator'
import {
  applyEndeavorDependencies,
  EndeavorDependencyEdge,
} from './scheduler/endeavor-dependencies'

// ============================================================================
// ENUMS
// ============================================================================

export enum SchedulingConflictType {
  DependencyCycle = 'dependency_cycle',
  MissingDependency = 'missing_dependency',
  CapacityExceeded = 'capacity_exceeded',
  DeadlineImpossible = 'deadline_impossible',
  ResourceConflict = 'resource_conflict'
}

export enum SchedulingWarningType {
  SoftDeadlineRisk = 'soft_deadline_risk',
  CapacityWarning = 'capacity_warning',
  CognitiveMismatch = 'cognitive_mismatch',
  ContextSwitch = 'context_switch',
  MissingBlockId = 'missing_block_id',
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
export interface UnifiedScheduleItem {
  id: string
  name: string
  type: UnifiedScheduleItemType
  duration: number
  priority: number

  // Core task properties
  importance?: number
  urgency?: number
  cognitiveComplexity?: number
  taskTypeId?: string // References user-defined task type

  // Scheduling properties
  startTime?: Date
  endTime?: Date
  deadline?: Date
  deadlineType?: 'hard' | 'soft'
  dependencies?: string[]
  asyncWaitTime?: number

  // Status
  completed?: boolean
  completedAt?: Date  // When the item was completed (for wait time calculation)
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
  isWaitingOnAsync?: boolean  // Step is in waiting status (async work happening externally)
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

/**
 * Block utilization info from scheduler debug output.
 * Used for displaying block usage in debug panels and metrics.
 */
export interface BlockUtilizationInfo {
  date: string                            // Always present
  blockId: string                         // Always present
  startTime: string                       // Always present
  endTime: string                         // Always present
  capacity: number                        // Always present (minutes)
  used: number                            // Always present (minutes)
  typeConfig: BlockTypeConfig             // Always present - block type configuration
  utilization: number                     // Always present (0-1 ratio)
  capacityByType?: Record<string, number> // Optional - per-type capacity for combo blocks
  usedByType?: Record<string, number>     // Optional - per-type usage for combo blocks
  isCurrent?: boolean                     // Optional - true if this is the current block
  reasonNotFilled?: string[]              // Optional - reasons why block wasn't fully utilized
  perTypeUtilization?: Record<string, number> // Optional - utilization by type
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
  blockUtilization: BlockUtilizationInfo[]
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

/**
 * Scheduling metrics used throughout the application:
 * - ScheduleMetricsPanel.tsx: Displays metrics in the UI with cards and visualizations
 * - GanttChart.tsx: Shows metrics alongside the timeline visualization
 * - scheduler-metrics.ts: Calculates all these metrics from scheduled items
 * - useUnifiedScheduler.ts: Hook that provides metrics to components
 */
export interface SchedulingMetrics {
  totalWorkDays?: number
  /** Dynamic hours by user-defined type ID */
  hoursByType?: Record<string, number>
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
  /**
   * Cross-workflow endeavor dependencies. Hard blocks (isHardBlock=true)
   * gate scheduling of the blocked task/workflow until the blocking step
   * completes. See scheduler/endeavor-dependencies.ts.
   */
  endeavorDependencies?: EndeavorDependencyEdge[]
}

export interface ScheduleConfig {
  startDate: string | Date
  endDate?: string | Date
  includeWeekends?: boolean
  allowTaskSplitting?: boolean
  minimumSplitMinutes?: number // Minimum minutes per split part (default 30)
  respectMeetings?: boolean
  optimizationMode?: OptimizationMode
  debugMode?: boolean
  maxDays?: number // Backwards compatibility
  currentTime?: Date // Optional current time for work block scheduling
}

// ============================================================================
// UNIFIED SCHEDULER CLASS
// ============================================================================

export class UnifiedScheduler {
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
    const { activeItems: unifiedItems, completedItemIds } = convertToUnifiedItems(items)

    // Validate converted items for data integrity
    validateConvertedItems(unifiedItems)

    // Apply priority calculation
    // originalItem stores the source task/step/meeting that created this unified item
    // It's used to preserve the original data for priority calculation and debugging
    unifiedItems.forEach(item => {
      // Only calculate priority for tasks and steps, not meetings
      if (item.originalItem && item.type !== 'meeting') {
        // Type guard: meetings don't have priority calculation
        const taskOrStep = item.originalItem as Task | TaskStep
        const priority = this.calculatePriority(taskOrStep, context)
        item.priority = priority
      }
    })

    // Inject cross-workflow endeavor hard blocks as first-class dependency edges
    const injection = applyEndeavorDependencies(
      unifiedItems,
      completedItemIds,
      context.endeavorDependencies || [],
    )

    // Validate dependencies for reporting (conflicts surface in the UI).
    // The allocator itself ignores unknown dependency ids ("healing") and
    // excludes cycle members, so scheduling proceeds either way.
    const validation = this.validateDependencies(injection.items, completedItemIds)

    const currentTime = context.currentTime || getCurrentTime()

    // Interval-based allocation: block windows are hard boundaries by construction
    const timeline = buildBlockTimeline(context.workPatterns, currentTime)
    const meetingItems = this.buildMeetingItems(context.workPatterns, timeline)

    const allocation = allocateItems(
      injection.items,
      completedItemIds,
      timeline,
      currentTime,
      {
        allowTaskSplitting: config.allowTaskSplitting !== false,
        minimumSplitMinutes: config.minimumSplitMinutes ?? 30,
      },
      injection.preBlocked,
    )

    if (config.debugMode) {
      allocation.scheduled.forEach((item, index) => {
        logger.system.debug(`Scheduled item ${index + 1}`, {
          name: item.name,
          priority: item.priority?.toFixed(2),
          startTime: item.startTime?.toISOString(),
          blockId: item.blockId,
        }, 'unified-scheduler-item')
      })
    }
    for (const healed of allocation.healedDependencies) {
      logger.system.warn('Ignored unknown dependency id during scheduling', healed, 'scheduler-healed-dep')
    }

    const scheduled = [...meetingItems, ...allocation.scheduled]

    // Debug info enhanced with: deadline analysis, per-item unscheduled reasons
    const debugInfo = this.generateDebugInfo(
      scheduled,
      allocation.unscheduled,
      context,
      allocation.warnings,
    )

    const metrics = this.calculateMetrics(scheduled, context)

    return {
      scheduled,
      unscheduled: allocation.unscheduled.map(entry => entry.item),
      debugInfo,
      metrics,
      conflicts: validation.isValid ? [] : validation.errors,
      warnings: validation.warnings,
    }
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
    return calculatePriority(item, context)
  }

  /**
   * Calculate priority with detailed breakdown for debugging
   */
  calculatePriorityWithBreakdown(
    item: Task | TaskStep,
    context: ScheduleContext,
  ): PriorityBreakdown {
    return calculatePriorityWithBreakdown(item, context)
  }

  /**
   * Calculate deadline pressure using inverse power function
   * Pressure = k / (slackDays + 0.5)^p
   */
  calculateDeadlinePressure(
    item: Task | TaskStep | SequencedTask,
    context: ScheduleContext,
  ): number {
    // Delegate to imported function if it's a Task or TaskStep
    if (!('steps' in item)) {
      return calculateDeadlinePressure(item as Task | TaskStep, context)
    }
    // For SequencedTask, use the first step or return no pressure
    if (item.steps && item.steps.length > 0 && item.steps[0]) {
      return calculateDeadlinePressure(item.steps[0], context)
    }
    return 1.0
  }

  /**
   * Calculate async urgency boost for tasks before wait times
   */
  calculateAsyncUrgency(
    item: Task | TaskStep,
    context: ScheduleContext,
  ): number {
    return calculateAsyncUrgency(item, context)
  }

  /**
   * Calculate cognitive load matching to user energy patterns
   */
  calculateCognitiveMatch(
    item: Task | TaskStep,
    currentTime: Date,
    context: ScheduleContext,
  ): number {
    return calculateCognitiveMatch(item, currentTime, context)
  }

  // ============================================================================
  // DEPENDENCY MANAGEMENT (from scheduling-engine)
  // ============================================================================


  // ============================================================================
  // TASK ALLOCATION (from flexible-scheduler)
  // ============================================================================

  /**
   * Allocate items to work blocks via the interval-based wavefront allocator.
   *
   * Kept as a public method for direct use in tests; scheduleForDisplay uses
   * the same core (plus meeting placement and endeavor-dependency injection).
   */
  allocateToWorkBlocks(
    items: UnifiedScheduleItem[],
    workPatterns: DailyWorkPattern[],
    config: ScheduleConfig & { currentTime?: Date },
    completedItemIds: Set<string> = new Set(),
    _isForDisplay: boolean = false,
  ): UnifiedScheduleItem[] {
    const now = config.currentTime
      ?? (config.startDate instanceof Date
        ? config.startDate
        : config.startDate
          ? new Date(`${config.startDate}T00:00:00`)
          : getCurrentTime())

    const timeline = buildBlockTimeline(workPatterns, now)
    const allocation = allocateItems(items, completedItemIds, timeline, now, {
      allowTaskSplitting: config.allowTaskSplitting !== false,
      minimumSplitMinutes: config.minimumSplitMinutes ?? 30,
    })

    logger.info('allocateToWorkBlocks complete', {
      scheduledCount: allocation.scheduled.length,
      unscheduledCount: allocation.unscheduled.length,
      unscheduledReasons: allocation.unscheduled.map(e => `${e.item.name}: ${e.reason}`),
    })

    return allocation.scheduled
  }

  /**
   * Materialize meetings as fixed display items. Their time is already
   * subtracted from block free intervals by buildBlockTimeline; this only
   * produces the visible schedule entries.
   */
  private buildMeetingItems(
    workPatterns: DailyWorkPattern[],
    timeline: TimelineBlock[],
  ): UnifiedScheduleItem[] {
    const meetingItems: UnifiedScheduleItem[] = []
    for (const pattern of workPatterns) {
      for (const meeting of pattern.meetings || []) {
        const startTime = parseTimeOnDateString(pattern.date, meeting.startTime)
        let endTime = parseTimeOnDateString(pattern.date, meeting.endTime)
        if (endTime <= startTime) {
          // Meeting crosses midnight
          endTime = new Date(endTime.getTime() + 24 * 60 * 60000)
        }
        const containingBlock = timeline.find(
          block => startTime >= block.start && startTime < block.end,
        ) ?? timeline.find(
          block => startTime < block.end && endTime > block.start,
        )
        meetingItems.push({
          id: meeting.id,
          name: meeting.name,
          type: UnifiedScheduleItemType.Meeting,
          duration: (endTime.getTime() - startTime.getTime()) / 60000,
          priority: 1000, // High priority to avoid conflicts
          startTime,
          endTime,
          locked: true,
          originalItem: meeting,
          ...(containingBlock && { blockId: containingBlock.blockId }),
        })
      }
    }
    return meetingItems
  }

  // ============================================================================
  // OPTIMIZATION (from optimal-scheduler) - TEST ONLY
  // ============================================================================

  /**
   * Calculate optimal schedule ignoring capacity constraints
   * Uses algorithms from optimal-scheduler to find mathematically optimal arrangement
   * @deprecated This method is only used in tests, not in production code
   */
  calculateOptimalSchedule(
    items: UnifiedScheduleItem[],
    context: ScheduleContext,
  ): ScheduleResult {
    // Sort items topologically first to respect dependencies
    const sortedItems = topologicalSort(items)

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
        criticalPathLength: calculateCriticalPath(scheduled),
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


  // ============================================================================
  // TEST-ONLY METHODS (exported for test compatibility)
  // These are wrappers around the imported utility functions
  // ============================================================================

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

  modelParallelExecution(items: UnifiedScheduleItem[]): {
    parallelGroups: UnifiedScheduleItem[][]
    maxParallelism: number
    timeReduction: number
  } {
    const graph = buildDependencyGraph(items)
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

  calculateCriticalPath(items: UnifiedScheduleItem[]): number {
    // Delegate to imported function
    return calculateCriticalPath(items)
  }

  buildDependencyGraph(items: UnifiedScheduleItem[]): Map<string, string[]> {
    // Delegate to imported function
    return buildDependencyGraph(items)
  }

  detectDependencyCycles(graph: Map<string, string[]>): {
    hasCycle: boolean
    cycleItems: string[]
  } {
    // Delegate to imported function but adapt the return type
    const result = detectDependencyCycles(graph)
    return {
      hasCycle: result.hasCycle,
      cycleItems: result.cycles.flat(),
    }
  }

  topologicalSort(items: UnifiedScheduleItem[]): UnifiedScheduleItem[] {
    // Delegate to imported function
    return topologicalSort(items)
  }

  convertToUnifiedItems(items: (Task | SequencedTask | TaskStep)[]): {
    activeItems: UnifiedScheduleItem[]
    completedItemIds: Set<string>
  } {
    // Delegate to imported function
    return convertToUnifiedItems(items)
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
            type: SchedulingConflictType.MissingDependency,
            affectedItems: [item.id, depId],
            description: `Item "${item.name}" depends on missing item "${depId}"`,
            severity: SeverityLevel.Error,
            suggestedResolution: `Remove dependency on "${depId}" or add the missing item`,
          })
        }
      }
    }

    // Check for circular dependencies
    const graph = buildDependencyGraph(items)
    const cycleCheck = detectDependencyCycles(graph)
    if (cycleCheck.hasCycle) {
      const cycleItems = cycleCheck.cycles.flat()
      errors.push({
        type: SchedulingConflictType.DependencyCycle,
        affectedItems: cycleItems,
        description: 'Circular dependency detected between items',
        severity: SeverityLevel.Error,
        suggestedResolution: 'Remove or modify dependencies to break the cycle',
      })
    }

    // Check for complex dependency chains (warning)
    for (const item of items) {
      const chainLength = calculateDependencyChainLength(item.id, graph)
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
      // AUTO-HEAL: Strip broken dependencies instead of failing entirely
      const healedItems = this.stripInvalidDependencies(items, completedItemIds)
      const resolved = topologicalSort(healedItems)
      return {
        resolved,
        conflicts: validation.errors,    // Still report what was wrong
        warnings: validation.warnings,
      }
    }

    // If validation passes, perform topological sort
    const resolved = topologicalSort(items)

    return {
      resolved,
      conflicts: [],
      warnings: validation.warnings,
    }
  }

  /**
   * Strip invalid dependencies from items so scheduling can proceed.
   * Removes any dependency ID not found in the item set or completed set.
   */
  private stripInvalidDependencies(
    items: UnifiedScheduleItem[],
    completedItemIds: Set<string> = new Set(),
  ): UnifiedScheduleItem[] {
    const itemIds = new Set(items.map(item => item.id))

    return items.map(item => {
      const deps = item.dependencies || []
      const validDeps = deps.filter(depId => {
        const isValid = itemIds.has(depId) || completedItemIds.has(depId)
        if (!isValid) {
          logger.system.warn(`Auto-healed: removed invalid dependency "${depId}" from "${item.name}"`, {
            itemId: item.id,
            itemName: item.name,
            invalidDepId: depId,
          }, 'scheduler-auto-heal')
        }
        return isValid
      })

      if (validDeps.length !== deps.length) {
        return { ...item, dependencies: validDeps }
      }
      return item
    })
  }

  // ============================================================================
  // PRIORITY CALCULATION HELPERS
  // ============================================================================

  /**
   * Calculate critical path remaining hours for deadline pressure calculation
   */

  // ============================================================================
  // UTILITIES AND HELPERS
  // ============================================================================


  /**
   * Generate debug information for scheduled and unscheduled items
   * Always called - debug info is mandatory in ScheduleResult
   */
  private generateDebugInfo(
    scheduled: UnifiedScheduleItem[],
    unscheduledEntries: UnscheduledEntry[],
    context: ScheduleContext,
    warnings: string[] = [],
  ): SchedulingDebugInfo {
    const unscheduled = unscheduledEntries.map(entry => entry.item)
    // Add priority breakdown for both scheduled and unscheduled items
    const scheduledItems = scheduled.map(item => ({
      id: item.id,
      name: item.name,
      type: item.type,
      duration: item.duration,
      priority: item.priority,
      startTime: item.startTime?.toISOString(),
      priorityBreakdown: item.originalItem && item.type !== 'meeting' ?
        this.calculatePriorityWithBreakdown(item.originalItem as Task | TaskStep, context) :
        undefined,
    }))

    // Unscheduled reasons come from the allocator — the authority on WHY an
    // item was not placed (dependency blocks, no compatible block, etc.)
    const unscheduledItems = unscheduledEntries.map(({ item, reason }) => ({
      id: item.id,
      name: item.name,
      type: item.type,
      duration: item.duration,
      reason,
      priorityBreakdown: item.originalItem && item.type !== 'meeting' ?
        this.calculatePriorityWithBreakdown(item.originalItem as Task | TaskStep, context) :
        undefined,
    }))

    const totalItems = scheduled.length + unscheduled.length
    const efficiency = totalItems > 0 ? (scheduled.length / totalItems) * 100 : 100

    // Calculate block utilization - only show today's blocks by default
    const todayDateStr = getLocalDateString(context.currentTime || getCurrentTime())
    const blockUtilization = this.calculateBlockUtilization(scheduled, context.workPatterns, context.currentTime, todayDateStr)

    // Calculate total duration
    const totalDuration = scheduled.reduce((sum, item) => sum + item.duration, 0)

    // Analyze deadlines
    const deadlineAnalysis = {
      missedDeadlines: scheduled.filter(item =>
        item.deadline && item.endTime && item.endTime > item.deadline,
      ).length,
      atRiskDeadlines: scheduled.filter(item => {
        if (!item.deadline || !item.endTime) return false
        const bufferHours = (item.deadline.getTime() - item.endTime.getTime()) / (1000 * 60 * 60)
        return bufferHours > 0 && bufferHours < 24
      }).length,
      totalWithDeadlines: scheduled.filter(item => item.deadline).length,
    }

    return {
      scheduledItems,  // Add scheduled items with priority breakdown
      unscheduledItems,
      blockUtilization,
      warnings,
      totalScheduled: scheduled.length,
      totalUnscheduled: unscheduled.length,
      scheduleEfficiency: efficiency,
      totalDuration,
      deadlineAnalysis,
      sortOrder: 'Priority-based with dependency resolution',
    }
  }

  /**
   * Calculate block utilization for debug info
   * @param scheduled - Scheduled items to analyze
   * @param workPatterns - Work patterns to check utilization for
   * @param currentTime - Current time for determining "today"
   * @param targetDate - Optional date filter (YYYY-MM-DD format). If provided, only shows blocks for that date.
   */
  private calculateBlockUtilization(
    scheduled: UnifiedScheduleItem[],
    workPatterns: DailyWorkPattern[],
    currentTime?: Date,
    targetDate?: string,
  ): Array<{
    date: string
    blockId: string
    startTime: string
    endTime: string
    capacity: number
    used: number
    typeConfig: BlockTypeConfig
    utilization: number
    perTypeUtilization?: Record<string, number>
    capacityByType?: Record<string, number>
    usedByType?: Record<string, number>
    isCurrent?: boolean
    reasonNotFilled?: string[]
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
    logger.debug('Block utilization START - checking workPatterns', {
      workPatternsIsNull: workPatterns === null,
      workPatternsIsUndefined: workPatterns === undefined,
      workPatternsLength: workPatterns?.length || 0,
      firstPatternDate: workPatterns?.[0]?.date || 'no patterns',
      firstPatternHasBlocks: !!(workPatterns?.[0]?.blocks),
      firstPatternBlockCount: workPatterns?.[0]?.blocks?.length || 0,
    })

    // Early return if no patterns
    if (!workPatterns || workPatterns.length === 0) {
      logger.warn('No work patterns provided to calculateBlockUtilization - returning empty array!')
      return utilization
    }

    // Filter work patterns by targetDate if provided
    const patternsToProcess = targetDate
      ? workPatterns.filter(p => p.date === targetDate)
      : workPatterns

    if (targetDate && patternsToProcess.length === 0) {
      logger.debug('No work patterns found for target date', { targetDate })
      return utilization
    }

    patternsToProcess.forEach(pattern => {
      const dateItems = itemsByDate.get(pattern.date) || []

      // Check if blocks exist
      if (!pattern.blocks || pattern.blocks.length === 0) {
        logger.warn('Work pattern has no blocks!', {
          date: pattern.date,
          patternKeys: Object.keys(pattern),
          hasBlocks: 'blocks' in pattern,
          blocksValue: pattern.blocks,
        })
        return
      }

      logger.debug('Processing pattern with blocks', {
        date: pattern.date,
        blockCount: pattern.blocks.length,
        firstBlock: pattern.blocks[0],
      })

      pattern.blocks.forEach(block => {
        const blockStart = this.parseTimeOnDate(new Date(pattern.date), block.startTime)
        const blockEnd = this.parseTimeOnDate(new Date(pattern.date), block.endTime)
        const totalMinutes = (blockEnd.getTime() - blockStart.getTime()) / 60000

        // Calculate items scheduled in this block
        // Use blockId for matching if available, otherwise fall back to time window
        const itemsInBlock = dateItems.filter(item => {
          // Prefer blockId matching (more accurate)
          if (item.blockId) {
            return item.blockId === block.id
          }
          // Fallback to time window matching for items without blockId
          if (!item.startTime || !item.endTime) return false
          return item.startTime >= blockStart && item.endTime <= blockEnd
        })

        // Calculate total used capacity (all task types)
        const usedCapacity = itemsInBlock.reduce((sum, item) => sum + item.duration, 0)

        // Get total capacity from the block
        const totalCapacity = block.capacity?.totalMinutes || totalMinutes

        // Calculate utilization percentage
        const utilizationPercent = totalCapacity > 0 ? (usedCapacity / totalCapacity) * 100 : 0

        // Check if this is the current block
        const isCurrent = currentTime &&
          currentTime >= blockStart &&
          currentTime < blockEnd

        // Create base utilization object
        const blockUtil: any = {
          date: pattern.date,
          blockId: block.id,
          startTime: block.startTime,
          endTime: block.endTime,
          capacity: totalCapacity,
          used: usedCapacity,
          typeConfig: block.typeConfig,
          utilization: Math.round(utilizationPercent),
          isCurrent,
        }

        // Calculate detailed capacity breakdown
        const capacityByType: Record<string, number> = {}
        const usedByType: Record<string, number> = {}
        const reasonsNotFilled: string[] = []

        // For combo blocks, add per-type utilization breakdown
        if (isComboBlock(block.typeConfig)) {
          // Calculate capacity per type based on allocation ratios
          for (const allocation of block.typeConfig.allocations) {
            const typeCapacity = Math.floor(totalMinutes * allocation.ratio)
            capacityByType[allocation.typeId] = typeCapacity

            // Calculate used minutes for this type
            const typeUsed = itemsInBlock
              .filter(item => item.taskTypeId === allocation.typeId)
              .reduce((sum, item) => sum + item.duration, 0)
            usedByType[allocation.typeId] = typeUsed

            // Track underutilization
            if (typeUsed < typeCapacity) {
              const unused = typeCapacity - typeUsed
              reasonsNotFilled.push(`${unused}min ${allocation.typeId} capacity unused`)
            }
          }

          // Calculate per-type utilization percentages
          const perTypeUtilization: Record<string, number> = {}
          for (const [typeId, typeCapacity] of Object.entries(capacityByType)) {
            const typeUsed = usedByType[typeId] || 0
            perTypeUtilization[typeId] = typeCapacity > 0 ? Math.round((typeUsed / typeCapacity) * 100) : 0
          }

          blockUtil.perTypeUtilization = perTypeUtilization
          blockUtil.capacityByType = capacityByType
          blockUtil.usedByType = usedByType
        } else if (isSingleTypeBlock(block.typeConfig)) {
          // For single-type blocks
          const typeId = block.typeConfig.typeId
          capacityByType[typeId] = totalCapacity
          usedByType[typeId] = usedCapacity

          blockUtil.capacityByType = capacityByType
          blockUtil.usedByType = usedByType

          if (usedCapacity < totalCapacity) {
            const unusedCapacity = totalCapacity - usedCapacity
            reasonsNotFilled.push(`${unusedCapacity}min capacity unused`)
          }
        }

        if (reasonsNotFilled.length > 0) {
          blockUtil.reasonNotFilled = reasonsNotFilled
        }

        utilization.push(blockUtil)
        logger.debug('Added block to utilization', {
          blockId: blockUtil.blockId,
          date: blockUtil.date,
          utilizationArrayLength: utilization.length,
        })
      })
    })

    logger.debug('Block utilization calculation complete', {
      totalBlocksAdded: utilization.length,
      dates: Array.from(new Set(utilization.map(u => u.date))),
      blockIds: utilization.map(u => u.blockId),
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
    // Use the comprehensive metrics calculation from scheduler-metrics module
    return calculateSchedulingMetrics(schedule, context)
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

// Create singleton instance for consistent usage
export const unifiedScheduler = new UnifiedScheduler()

// Types are already exported as interfaces above, no need to re-export
