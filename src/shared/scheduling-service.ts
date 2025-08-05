import { SchedulingEngine } from './scheduling-engine'
import { Task } from './types'
import { SequencedTask } from './sequencing-types'
import {
  WorkDayConfiguration,
  SchedulingConstraints,
  SchedulingResult,
  WeeklySchedule,
  TimeBreak,
} from './scheduling-models'

/**
 * Service layer that provides high-level scheduling operations
 * Acts as a bridge between the UI components and the scheduling engine
 */
export class SchedulingService {
  private engine: SchedulingEngine

  constructor() {
    this.engine = new SchedulingEngine()
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
    } = {},
  ): Promise<SchedulingResult> {
    const workDayConfigs = this.createDefaultWorkDayConfigs(options.workDayConfig)

    const constraints: SchedulingConstraints = {
      tieBreakingMethod: options.tieBreaking || 'creation_date',
      allowOverflow: options.allowOverflow || false,
      earliestStartDate: options.startDate || new Date(),
      latestEndDate: options.endDate,
      strictDependencies: true,
      enforceDailyLimits: true,
      allowFocusedOvertime: false,
      allowAdminOvertime: false,
    }

    return await this.engine.scheduleItems(tasks, sequencedTasks, workDayConfigs, constraints)
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
          focusedMinutes: total.focusedMinutes + config.maxFocusedMinutes,
          adminMinutes: total.adminMinutes + config.maxAdminMinutes,
        }
      }
      return total
    }, { focusedMinutes: 0, adminMinutes: 0 })

    // Calculate utilization
    const focusedMinutesUsed = schedulingResult.scheduledItems
      .filter(item => item.type === 'focused')
      .reduce((total, item) => total + item.duration, 0)

    const adminMinutesUsed = schedulingResult.scheduledItems
      .filter(item => item.type === 'admin')
      .reduce((total, item) => total + item.duration, 0)

    const utilization = {
      focusedMinutesUsed,
      adminMinutesUsed,
      focusedPercentage: totalCapacity.focusedMinutes > 0
        ? (focusedMinutesUsed / totalCapacity.focusedMinutes) * 100
        : 0,
      adminPercentage: totalCapacity.adminMinutes > 0
        ? (adminMinutesUsed / totalCapacity.adminMinutes) * 100
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

    const results = []
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

    const recommendations = []

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
    constraints: SchedulingConstraints,
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
      .filter(item => item.type === 'focused')
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
