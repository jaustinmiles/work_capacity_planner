import { SchedulingEngine } from './scheduling-engine'
import { Task } from './types'
import { SequencedTask } from './sequencing-types'
import { TaskType } from './enums'
import {
  WorkDayConfiguration,
  SchedulingConstraints,
  SchedulingResult,
  WeeklySchedule,
  TimeBreak,
} from './scheduling-models'
import { UnifiedSchedulerAdapter, ScheduleResult as AdapterScheduleResult } from './unified-scheduler-adapter'
import { SchedulingDebugInfo } from './unified-scheduler'
import { DailyWorkPattern } from './work-blocks-types'
import { logger } from './logger'
import { timeProvider } from './time-provider'
import dayjs from 'dayjs'

/**
 * Service layer that provides high-level scheduling operations
 * Acts as a bridge between the UI components and the scheduling engine
 */
// Database interface for pattern loading
export interface DatabaseInterface {
  getWorkPattern(date: string): Promise<any>
}

export class SchedulingService {
  private engine: SchedulingEngine
  private unifiedAdapter: UnifiedSchedulerAdapter
  private db?: DatabaseInterface
  private timeProvider = timeProvider

  constructor(db?: DatabaseInterface) {
    this.engine = new SchedulingEngine()
    this.unifiedAdapter = new UnifiedSchedulerAdapter()
    this.db = db
    // timeProvider is already initialized as singleton
  }

  /**
   * Load user work patterns from database for date range
   * Returns empty array if no patterns are configured
   */
  private async loadUserWorkPatterns(startDate: Date, days: number = 30): Promise<DailyWorkPattern[]> {
    if (!this.db) {
      logger.scheduler.warn('No database available, no work patterns to load')
      return []
    }

    const patterns: DailyWorkPattern[] = []
    const today = dayjs(startDate).startOf('day')

    try {
      // Load patterns for the specified date range
      for (let i = 0; i < days; i++) {
        const date = today.add(i, 'day')
        const dateStr = date.format('YYYY-MM-DD')
        const _dayOfWeek = date.day()

        try {
          const pattern = await this.db.getWorkPattern(dateStr)
          if (pattern) {
            patterns.push({
              date: dateStr,
              blocks: pattern.blocks,
              meetings: pattern.meetings || [],
              accumulated: { focus: 0, admin: 0, personal: 0 },
            })
            logger.scheduler.debug('Loaded user work pattern', { date: dateStr, blocks: pattern.blocks.length })
          }
          // No pattern for this date - skip it
        } catch (patternError) {
          logger.scheduler.warn('Failed to load pattern for date, skipping', { date: dateStr, error: patternError })
          // Skip this date if pattern load fails
        }
      }

      logger.scheduler.info('Loaded user work patterns from database', {
        totalPatterns: patterns.length,
        dateRange: `${patterns[0]?.date || 'none'} to ${patterns[patterns.length - 1]?.date || 'none'}`,
      })

      return patterns
    } catch (error) {
      logger.scheduler.error('Failed to load user work patterns', error)
      return []
    }
  }


  /**
   * Get the next available time within user's work schedule
   * Returns current time if within work hours, otherwise next work block start
   */
  private async getNextAvailableTime(workPatterns?: DailyWorkPattern[]): Promise<Date> {
    const now = this.timeProvider.now()

    if (!workPatterns || workPatterns.length === 0) {
      // If no patterns available, load them
      workPatterns = await this.loadUserWorkPatterns(now, 7) // Load next week
    }

    // Check if current time is within any work block
    const currentDate = now.toISOString().split('T')[0]
    const currentPattern = workPatterns.find(p => p.date === currentDate)

    if (currentPattern) {
      const currentTime = now.getHours() * 60 + now.getMinutes() // minutes since midnight

      for (const block of currentPattern.blocks) {
        const [startHour, startMin] = block.startTime.split(':').map(Number)
        const [endHour, endMin] = block.endTime.split(':').map(Number)
        const blockStart = startHour * 60 + startMin
        const blockEnd = endHour * 60 + endMin

        // If we're currently within this block, use current time
        if (currentTime >= blockStart && currentTime < blockEnd) {
          logger.scheduler.debug('Current time is within work block', {
            currentTime: now.toISOString(),
            block: `${block.startTime}-${block.endTime}`,
            blockType: block.type,
          })
          return now
        }
      }
    }

    // Current time is outside work hours, find next available work block
    const nextWorkTime = this.findNextWorkBlockStart(now, workPatterns)

    logger.scheduler.info('Current time outside work hours, using next work block', {
      currentTime: now.toISOString(),
      nextWorkTime: nextWorkTime.toISOString(),
    })

    return nextWorkTime
  }

  /**
   * Find the start time of the next work block after the given time
   */
  private findNextWorkBlockStart(fromTime: Date, workPatterns: DailyWorkPattern[]): Date {
    const currentDate = new Date(fromTime)

    // Check remaining blocks today
    const todayStr = currentDate.toISOString().split('T')[0]
    const todayPattern = workPatterns.find(p => p.date === todayStr)

    if (todayPattern) {
      const currentTimeMinutes = fromTime.getHours() * 60 + fromTime.getMinutes()

      for (const block of todayPattern.blocks) {
        const [startHour, startMin] = block.startTime.split(':').map(Number)
        const blockStartMinutes = startHour * 60 + startMin

        if (blockStartMinutes > currentTimeMinutes) {
          const nextBlockTime = new Date(fromTime)
          nextBlockTime.setHours(startHour, startMin, 0, 0)
          return nextBlockTime
        }
      }
    }

    // No blocks remaining today, check future days
    for (let i = 1; i <= 7; i++) { // Check next 7 days
      const futureDate = new Date(currentDate)
      futureDate.setDate(currentDate.getDate() + i)
      const futureDateStr = futureDate.toISOString().split('T')[0]

      const futurePattern = workPatterns.find(p => p.date === futureDateStr)
      if (futurePattern && futurePattern.blocks.length > 0) {
        const firstBlock = futurePattern.blocks[0]
        const [startHour, startMin] = firstBlock.startTime.split(':').map(Number)

        const nextBlockTime = new Date(futureDate)
        nextBlockTime.setHours(startHour, startMin, 0, 0)
        return nextBlockTime
      }
    }

    // No work blocks found - return current time as fallback
    logger.scheduler.warn('No work blocks found in next 7 days, returning current time')
    return currentDate
  }


  /**
   * Convert FROM UnifiedScheduler's ScheduleResult TO the old SchedulingResult format
   */
  private convertFromSchedulingResult(
    result: AdapterScheduleResult,
    tasks: Task[],
    sequencedTasks: SequencedTask[],
  ): SchedulingResult {
    // Convert scheduled tasks to ScheduledWorkItem format
    const scheduledItems = result.scheduledTasks.map(item => ({
      // Base SchedulableItem properties
      id: item.task.id,
      name: item.task.name,
      type: item.task.type,
      duration: item.task.duration,
      importance: item.task.importance,
      urgency: item.task.urgency,
      cognitiveComplexity: item.task.cognitiveComplexity || 3,
      dependsOn: item.task.dependencies || [],
      asyncWaitTime: item.task.asyncWaitTime || 0,
      isAsyncTrigger: false,
      deadline: item.task.deadline,
      deadlineType: item.task.deadlineType,
      sourceType: 'simple_task' as const,
      sourceId: item.task.id,
      status: 'scheduled' as const,
      // ScheduledWorkItem specific properties
      scheduledDate: new Date(item.startTime.toDateString()),
      scheduledStartTime: item.startTime,
      scheduledEndTime: item.endTime,
      timeSlotId: item.blockId || 'unknown',
      consumesFocusedTime: item.task.type === TaskType.Focused,
      consumesAdminTime: item.task.type === TaskType.Admin,
      isOptimallyPlaced: true, // Assume UnifiedScheduler places optimally
      wasRescheduled: false,
    }))

    // Convert unscheduled tasks and workflow steps to SchedulableItem format
    const unscheduledItems: any[] = []

    // Add unscheduled regular tasks
    result.unscheduledTasks.forEach(task => {
      unscheduledItems.push({
        id: task.id,
        name: task.name,
        type: task.type,
        duration: task.duration,
        importance: task.importance,
        urgency: task.urgency,
        cognitiveComplexity: task.cognitiveComplexity || 3,
        dependsOn: task.dependencies || [],
        asyncWaitTime: task.asyncWaitTime || 0,
        deadline: task.deadline,
        deadlineType: task.deadlineType,
        sourceType: 'simple_task' as const,
        sourceId: task.id,
        status: 'pending' as const,
      })
    })

    // Add unscheduled workflow steps (find steps not in scheduledItems)
    const scheduledIds = new Set(scheduledItems.map(item => item.id))
    sequencedTasks.forEach(workflow => {
      workflow.steps?.forEach(step => {
        if (!scheduledIds.has(step.id) && step.status !== 'completed') {
          unscheduledItems.push({
            id: step.id,
            name: step.name,
            type: step.type || TaskType.Focused,
            duration: step.duration,
            importance: step.importance || workflow.importance,
            urgency: step.urgency || workflow.urgency,
            cognitiveComplexity: step.cognitiveComplexity || 3,
            dependsOn: step.dependsOn || [],
            asyncWaitTime: step.asyncWaitTime || 0,
            deadline: workflow.deadline,
            deadlineType: workflow.deadlineType,
            sourceType: 'workflow_step' as const,
            sourceId: workflow.id,
            workflowStepIndex: step.stepIndex,
            status: 'pending' as const,
          })
        }
      })
    })

    // Calculate completion date
    let projectedCompletionDate = this.timeProvider.now()
    if (scheduledItems.length > 0) {
      const lastEndTime = Math.max(...scheduledItems.map(item => item.scheduledEndTime.getTime()))
      projectedCompletionDate = new Date(lastEndTime)
    }

    return {
      success: true,
      scheduledItems,
      unscheduledItems,
      totalWorkDays: Math.ceil(result.totalDuration / (8 * 60)), // Assume 8-hour work days
      totalFocusedHours: scheduledItems
        .filter(item => item.type === TaskType.Focused)
        .reduce((sum, item) => sum + item.duration / 60, 0),
      totalAdminHours: scheduledItems
        .filter(item => item.type === TaskType.Admin)
        .reduce((sum, item) => sum + item.duration / 60, 0),
      projectedCompletionDate,
      overCapacityDays: this.extractOverCapacityDays(result.debugInfo),
      underUtilizedDays: this.extractUnderUtilizedDays(result.debugInfo),
      conflicts: result.conflicts.map(conflict => ({
        type: 'dependency_cycle' as const,
        affectedItems: [],
        description: conflict,
        severity: 'error' as const,
        suggestedResolution: 'Review task dependencies',
      })),
      warnings: [],
      suggestions: [],
    }
  }

  /**
   * Extract over-capacity days from debug info
   */
  private extractOverCapacityDays(debugInfo?: SchedulingDebugInfo): Date[] {
    if (!debugInfo?.blockUtilization) return []

    const overCapacityDays: Date[] = []
    const dayMap = new Map<string, boolean>()

    // Check each block for over-capacity (utilization > 100%)
    debugInfo.blockUtilization.forEach(block => {
      if (block.utilization > 1.0) {
        dayMap.set(block.date, true)
      }
    })

    // Convert unique dates to Date objects
    dayMap.forEach((_, dateStr) => {
      overCapacityDays.push(new Date(dateStr))
    })

    return overCapacityDays.sort((a, b) => a.getTime() - b.getTime())
  }

  /**
   * Extract under-utilized days from debug info
   */
  private extractUnderUtilizedDays(debugInfo?: SchedulingDebugInfo): Date[] {
    if (!debugInfo?.blockUtilization) return []

    const underUtilizedDays: Date[] = []
    const dayUtilization = new Map<string, { totalUsed: number; totalCapacity: number }>()

    // Aggregate utilization by day
    debugInfo.blockUtilization.forEach(block => {
      const existing = dayUtilization.get(block.date) || { totalUsed: 0, totalCapacity: 0 }

      const used = block.used
      const capacity = block.capacity

      dayUtilization.set(block.date, {
        totalUsed: existing.totalUsed + used,
        totalCapacity: existing.totalCapacity + capacity,
      })
    })

    // Find days with < 50% utilization
    dayUtilization.forEach((stats, dateStr) => {
      if (stats.totalCapacity > 0) {
        const utilization = stats.totalUsed / stats.totalCapacity
        if (utilization < 0.5) {
          underUtilizedDays.push(new Date(dateStr))
        }
      }
    })

    return underUtilizedDays.sort((a, b) => a.getTime() - b.getTime())
  }

  /**
   * Create a complete schedule from tasks and workflows
   */
  async createSchedule(
    tasks: Task[],
    sequencedTasks: SequencedTask[],
    options: {
      startDate?: Date
      endDate?: Date
      tieBreaking?: 'creation_date' | 'duration_shortest' | 'duration_longest' | 'alphabetical'
      allowOverflow?: boolean
      workDayConfig?: Partial<WorkDayConfiguration>
      workPatterns?: DailyWorkPattern[]
      debug?: boolean
    } = {},
  ): Promise<SchedulingResult> {
    const startDate = options.startDate || this.timeProvider.now()

    logger.scheduler.info('🔄 [SchedulingService] Creating schedule with UnifiedScheduler', {
      taskCount: tasks.length,
      workflowCount: sequencedTasks.length,
      startDate: startDate.toISOString(),
      debug: options.debug || false,
    })

    // Load work patterns if not provided
    let workPatterns = options.workPatterns
    if (!workPatterns || workPatterns.length === 0) {
      logger.scheduler.info('🏗️ [SchedulingService] Loading user work patterns from database')
      workPatterns = await this.loadUserWorkPatterns(startDate, 30)
    }

    logger.scheduler.info('📅 [SchedulingService] Work patterns loaded', {
      patternsCount: workPatterns.length,
      dateRange: {
        start: workPatterns[0]?.date || 'none',
        end: workPatterns[workPatterns.length - 1]?.date || 'none',
      },
    })

    // Use UnifiedSchedulerAdapter for scheduling
    const legacyOptions = {
      startDate,
      endDate: options.endDate,
      respectDeadlines: true,
      allowSplitting: true,
      debug: options.debug || false,
    }

    const result = this.unifiedAdapter.scheduleTasks(
      tasks,
      workPatterns,
      legacyOptions,
      sequencedTasks,
    )

    logger.scheduler.info('✅ [SchedulingService] UnifiedScheduler completed', {
      scheduledCount: result.scheduledTasks.length,
      unscheduledCount: result.unscheduledTasks.length,
      totalDuration: result.totalDuration,
      conflicts: result.conflicts.length,
    })

    // Convert back to legacy SchedulingResult format
    return this.convertFromSchedulingResult(result, tasks, sequencedTasks)
  }

  /**
   * Generate a weekly schedule view
   */
  async createWeeklySchedule(
    tasks: Task[],
    sequencedTasks: SequencedTask[],
    weekStartDate: Date,
    options: {
      tieBreaking?: 'creation_date' | 'duration_shortest' | 'duration_longest' | 'alphabetical'
      workDayConfig?: Partial<WorkDayConfiguration>
    } = {},
  ): Promise<WeeklySchedule> {
    const weekEndDate = new Date(weekStartDate)
    weekEndDate.setDate(weekEndDate.getDate() + 6)

    const schedulingResult = await this.createSchedule(tasks, sequencedTasks, {
      startDate: weekStartDate,
      endDate: weekEndDate,
      tieBreaking: options.tieBreaking,
      workDayConfig: options.workDayConfig,
    })

    const workDayConfigs = this.createDefaultWorkDayConfigs(options.workDayConfig)

    // Calculate total capacity for the week
    const totalCapacity = workDayConfigs.reduce((total, config) => {
      if (config.isWorkingDay) {
        return {
          focus: total.focus + config.maxFocusedMinutes,
          admin: total.admin + config.maxAdminMinutes,
        }
      }
      return total
    }, { focus: 0, admin: 0 })

    // Calculate utilization
    const focusUsed = schedulingResult.scheduledItems
      .filter(item => item.type === TaskType.Focused)
      .reduce((total, item) => total + item.duration, 0)

    const adminUsed = schedulingResult.scheduledItems
      .filter(item => item.type === TaskType.Admin)
      .reduce((total, item) => total + item.duration, 0)

    const utilization = {
      focusUsed,
      adminUsed,
      focusPercentage: totalCapacity.focus > 0
        ? (focusUsed / totalCapacity.focus) * 100
        : 0,
      adminPercentage: totalCapacity.admin > 0
        ? (adminUsed / totalCapacity.admin) * 100
        : 0,
    }

    return {
      weekStartDate,
      workDays: workDayConfigs,
      scheduledItems: schedulingResult.scheduledItems,
      totalCapacity,
      utilization,
      asyncWaitPeriods: [], // Would be populated by async wait optimization
    }
  }

  /**
   * Simulate scheduling to show what would happen without persisting
   */
  async simulateScheduling(
    tasks: Task[],
    sequencedTasks: SequencedTask[],
    options: {
      startDate?: Date
      scenarios?: Array<{
        name: string
        tieBreaking: 'creation_date' | 'duration_shortest' | 'duration_longest' | 'alphabetical'
        allowOverflow: boolean
      }>
    } = {},
  ): Promise<Array<{ scenario: string; result: SchedulingResult }>> {
    const scenarios = options.scenarios || [
      { name: 'Default (FIFO)', tieBreaking: 'creation_date' as const, allowOverflow: false },
      { name: 'Quick Wins First', tieBreaking: 'duration_shortest' as const, allowOverflow: false },
      { name: 'Big Rocks First', tieBreaking: 'duration_longest' as const, allowOverflow: false },
    ]

    const results: Array<{ scenario: string; result: SchedulingResult }> = []
    for (const scenario of scenarios) {
      const result = await this.createSchedule(tasks, sequencedTasks, {
        startDate: options.startDate,
        tieBreaking: scenario.tieBreaking,
        allowOverflow: scenario.allowOverflow,
      })
      results.push({ scenario: scenario.name, result })
    }

    return results
  }

  /**
   * Get scheduling recommendations based on current workload
   */
  async getSchedulingRecommendations(
    tasks: Task[],
    sequencedTasks: SequencedTask[],
  ): Promise<{
    workloadAnalysis: {
      totalFocusedHours: number
      totalAdminHours: number
      estimatedDays: number
      capacityUtilization: number
    }
    recommendations: Array<{
      type: 'capacity' | 'priority' | 'dependency' | 'optimization'
      title: string
      description: string
      impact: 'high' | 'medium' | 'low'
    }>
  }> {
    const simulationResult = await this.createSchedule(tasks, sequencedTasks)

    const workloadAnalysis = {
      totalFocusedHours: simulationResult.totalFocusedHours,
      totalAdminHours: simulationResult.totalAdminHours,
      estimatedDays: simulationResult.totalWorkDays,
      capacityUtilization: (simulationResult.totalFocusedHours + simulationResult.totalAdminHours) / (7 * simulationResult.totalWorkDays) * 100,
    }

    const recommendations: Array<{
      type: 'capacity' | 'priority' | 'dependency' | 'optimization'
      title: string
      description: string
      impact: 'high' | 'medium' | 'low'
    }> = []

    // Capacity recommendations
    if (workloadAnalysis.capacityUtilization > 85) {
      recommendations.push({
        type: 'capacity' as const,
        title: 'High Capacity Utilization',
        description: 'Your workload is near capacity limits. Consider extending work days or reducing scope.',
        impact: 'high' as const,
      })
    }

    // Priority recommendations
    const highPriorityTasks = tasks.filter(task => task.importance >= 8 && task.urgency >= 8).length
    if (highPriorityTasks > 5) {
      recommendations.push({
        type: 'priority' as const,
        title: 'Too Many High-Priority Items',
        description: `You have ${highPriorityTasks} high-priority tasks. Consider re-evaluating priorities.`,
        impact: 'medium' as const,
      })
    }

    // Dependency recommendations
    if (simulationResult.conflicts.some(conflict => conflict.type === 'dependency_cycle')) {
      recommendations.push({
        type: 'dependency' as const,
        title: 'Dependency Issues Detected',
        description: 'Some tasks have circular dependencies that prevent scheduling.',
        impact: 'high' as const,
      })
    }

    // Optimization recommendations
    const totalAsyncWait = [...tasks, ...sequencedTasks.flatMap(st => st.steps)]
      .reduce((total, item) => total + (item.asyncWaitTime || 0), 0)

    if (totalAsyncWait > 120) { // More than 2 hours of wait time
      recommendations.push({
        type: 'optimization' as const,
        title: 'Async Wait Optimization Opportunity',
        description: 'Your tasks have significant wait times that could be filled with other work.',
        impact: 'medium' as const,
      })
    }

    return { workloadAnalysis, recommendations }
  }

  /**
   * Get the next scheduled item that should be worked on
   * Filters out completed/in-progress items and returns the highest priority item
   */
  async getNextScheduledItem(
    tasks: Task[],
    sequencedTasks: SequencedTask[],
  ): Promise<{
    type: 'task' | 'step'
    id: string
    workflowId?: string
    title: string
    estimatedDuration: number
    scheduledStartTime?: Date
  } | null> {
    logger.scheduler.debug('getNextScheduledItem called', {
      tasksLength: tasks?.length,
      sequencedTasksLength: sequencedTasks?.length,
      tasksType: typeof tasks,
      sequencedTasksType: typeof sequencedTasks,
    })

    try {
      logger.scheduler.info('Getting next scheduled item', {
        totalTasks: tasks.length,
        totalSequenced: sequencedTasks.length,
      })

      // Filter out completed tasks (Task uses 'completed' boolean)
      const incompleteTasks = tasks.filter(task => !task.completed)

      logger.scheduler.info('Filtered incomplete tasks', {
        originalTasks: tasks.length,
        incompleteTasks: incompleteTasks.length,
      })

      // Debug: Check what steps look like
      if (sequencedTasks.length > 0 && sequencedTasks[0].steps?.length > 0) {
        logger.scheduler.debug('Sample step data', {
          firstStep: sequencedTasks[0].steps[0],
          stepStatus: sequencedTasks[0].steps[0].status,
          statusType: typeof sequencedTasks[0].steps[0].status,
        })
      }

      // Filter out completed workflow steps (TaskStep uses StepStatus enum)
      // Check if steps exist and filter properly
      const incompleteSequenced = sequencedTasks
        .filter(seq => seq.steps && Array.isArray(seq.steps) && seq.steps.length > 0)
        .map(seq => ({
          ...seq,
          steps: seq.steps.filter(step => {
            // Log what we're seeing
            logger.scheduler.debug('Step status check', {
              stepId: step.id,
              status: step.status,
              statusType: typeof step.status,
              isPending: step.status === 'pending',
              isInProgress: step.status === 'in_progress',
              isCompleted: step.status === 'completed',
            })
            // Be more lenient with status checking
            return step.status !== 'completed' && step.status !== 'skipped'
          }),
        }))
        .filter(seq => seq.steps.length > 0)

      logger.scheduler.info('Filtered incomplete workflows', {
        originalWorkflows: sequencedTasks.length,
        incompleteWorkflows: incompleteSequenced.length,
        totalIncompleteSteps: incompleteSequenced.reduce((sum, seq) => sum + seq.steps.length, 0),
      })

      // If no incomplete items, return null
      if (incompleteTasks.length === 0 && incompleteSequenced.length === 0) {
        logger.scheduler.info('No incomplete items found, returning null')
        return null
      }

      // Load user work patterns and determine next available time
      logger.scheduler.info('Loading user work patterns for next scheduled item...')
      const workPatterns = await this.loadUserWorkPatterns(this.timeProvider.now(), 7)
      const nextAvailableTime = await this.getNextAvailableTime(workPatterns)

      logger.scheduler.info('Using next available time for scheduling', {
        currentTime: this.timeProvider.now().toISOString(),
        nextAvailableTime: nextAvailableTime.toISOString(),
        isCurrentTime: nextAvailableTime.getTime() === this.timeProvider.now().getTime(),
      })

      // Use the scheduling engine to determine priorities
      logger.scheduler.info('Creating schedule with UnifiedScheduler...')
      const schedulingResult = await this.createSchedule(
        incompleteTasks,
        incompleteSequenced,
        {
          startDate: nextAvailableTime,
          workPatterns,
          tieBreaking: 'creation_date',
          allowOverflow: false,
          debug: true, // Enable debug logging for dependency resolution
        },
      )

      logger.scheduler.info('Schedule created', {
        totalScheduledItems: schedulingResult.scheduledItems.length,
        firstItemId: schedulingResult.scheduledItems[0]?.id || 'none',
      })

      // Get the first scheduled item (highest priority)
      const firstItem = schedulingResult.scheduledItems[0]
      if (!firstItem) {
        logger.scheduler.info('No items in schedule, returning null')
        return null
      }


      // Handle potential ID prefixes from scheduling engine
      // Format can be: 'task_id', 'step_id', or 'workflow_id_step_step-id'
      let stepIdToFind = firstItem.id
      let taskIdToFind = firstItem.id

      if (firstItem.id.includes('_step_')) {
        // Handle workflow step format: 'workflow_..._step_step-...'
        const parts = firstItem.id.split('_step_')
        if (parts.length === 2) {
          stepIdToFind = parts[1] // Extract 'step-...' part
        }
      } else if (firstItem.id.startsWith('step_')) {
        stepIdToFind = firstItem.id.slice(5)
      } else if (firstItem.id.startsWith('task_')) {
        taskIdToFind = firstItem.id.slice(5)
      }

      logger.scheduler.debug('ID parsing:', {
        originalId: firstItem.id,
        stepIdToFind,
        taskIdToFind,
        hasWorkflowStepFormat: firstItem.id.includes('_step_'),
      })

      // Determine if it's a task or workflow step (check both original and cleaned IDs)
      const isWorkflowStep = incompleteSequenced.some(seq =>
        seq.steps.some(step => step.id === firstItem.id || step.id === stepIdToFind),
      )


      if (isWorkflowStep) {
        // Find the workflow and step (check both original and cleaned IDs)
        const workflow = incompleteSequenced.find(seq =>
          seq.steps.some(step => step.id === firstItem.id || step.id === stepIdToFind),
        )
        const step = workflow?.steps.find(step => step.id === firstItem.id || step.id === stepIdToFind)

        if (workflow && step) {
          const result = {
            type: 'step' as const,
            id: step.id,
            workflowId: workflow.id,
            title: step.name, // TaskStep uses 'name'
            estimatedDuration: step.duration, // TaskStep uses 'duration'
            scheduledStartTime: firstItem.scheduledStartTime,
          }
          logger.scheduler.info('Returning workflow step', result)
          return result
        }
      } else {
        // Find the task with cleaned ID (remove 'task_' prefix if present)
        const task = incompleteTasks.find(task => task.id === taskIdToFind)

        if (task) {
          const result = {
            type: 'task' as const,
            id: task.id,
            title: task.name, // Task uses 'name'
            estimatedDuration: task.duration, // Task uses 'duration'
            scheduledStartTime: firstItem.scheduledStartTime,
          }
          logger.scheduler.info('Returning regular task', result)
          return result
        }
      }

      logger.scheduler.warn('Could not find matching task or step, returning null')
      return null
    } catch (error) {
      logger.scheduler.error('Failed to get next scheduled item:', error)
      return null
    }
  }

  /**
   * Create default work day configurations
   */
  private createDefaultWorkDayConfigs(overrides: Partial<WorkDayConfiguration> = {}): WorkDayConfiguration[] {
    const defaultBreaks: TimeBreak[] = [
      {
        id: 'lunch',
        name: 'Lunch Break',
        startTime: '12:00',
        endTime: '13:00',
        recurring: true,
      },
    ]

    const workDays: Array<WorkDayConfiguration['dayOfWeek']> = [
      'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday',
    ]

    const weekendDays: Array<WorkDayConfiguration['dayOfWeek']> = [
      'Saturday', 'Sunday',
    ]

    return [
      ...workDays.map((day, index) => ({
        id: `workday_${index}`,
        dayOfWeek: day,
        workStartTime: '09:00',
        workEndTime: '17:00',
        breaks: defaultBreaks,
        maxFocusedMinutes: 240, // 4 hours
        maxAdminMinutes: 180,   // 3 hours
        meetings: [],
        isWorkingDay: true,
        ...overrides,
      })),
      ...weekendDays.map((day, index) => ({
        id: `weekend_${index}`,
        dayOfWeek: day,
        workStartTime: '09:00',
        workEndTime: '17:00',
        breaks: [],
        maxFocusedMinutes: 0,
        maxAdminMinutes: 0,
        meetings: [],
        isWorkingDay: false,
        ...overrides,
      })),
    ]
  }

  /**
   * Validate scheduling constraints
   */
  validateConstraints(
    tasks: Task[],
    sequencedTasks: SequencedTask[],
    _constraints: SchedulingConstraints,
  ): { isValid: boolean; errors: string[]; warnings: string[] } {
    const errors: string[] = []
    const warnings: string[] = []

    // Check for dependency cycles
    const allItems = [...tasks, ...sequencedTasks.flatMap(st => st.steps)]
    const dependencyMap = new Map<string, string[]>()

    allItems.forEach(item => {
      const deps = 'dependencies' in item ? item.dependencies : item.dependsOn || []
      dependencyMap.set(item.id, deps)
    })

    // Simple cycle detection (could be enhanced)
    const visited = new Set<string>()
    const recursionStack = new Set<string>()

    const hasCycle = (nodeId: string): boolean => {
      if (recursionStack.has(nodeId)) return true
      if (visited.has(nodeId)) return false

      visited.add(nodeId)
      recursionStack.add(nodeId)

      const deps = dependencyMap.get(nodeId) || []
      for (const dep of deps) {
        if (hasCycle(dep)) return true
      }

      recursionStack.delete(nodeId)
      return false
    }

    for (const item of allItems) {
      if (hasCycle(item.id)) {
        errors.push(`Dependency cycle detected involving task: ${item.name}`)
        break
      }
    }

    // Check capacity constraints
    const totalFocusedMinutes = allItems
      .filter(item => item.type === TaskType.Focused)
      .reduce((total, item) => total + item.duration, 0)

    if (totalFocusedMinutes > 240 * 30) { // More than 30 days of focused work
      warnings.push('Total focused work exceeds 30 days - consider breaking down tasks')
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    }
  }
}
