import { Task } from './types'
import { SequencedTask, TaskStep } from './sequencing-types'
import { TaskType } from '../shared/enums'
import { parseTimeString } from './time-utils'
import {
  SchedulableItem,
  ScheduledWorkItem,
  WorkDayConfiguration,
  TimeSlot,
  SchedulingConstraints,
  SchedulingResult,
  PriorityScore,
  SchedulingConverter,
} from './scheduling-models'

/**
 * Core scheduling engine that converts tasks and workflows into an optimized timeline
 * Implements the algorithm documented in /docs/scheduling-algorithm.md
 */
export class SchedulingEngine {

  /**
   * Main entry point for scheduling
   */
  async scheduleItems(
    tasks: Task[],
    sequencedTasks: SequencedTask[],
    workDayConfigs: WorkDayConfiguration[],
    constraints: SchedulingConstraints,
  ): Promise<SchedulingResult> {
    try {
      // Phase 1: Data Preparation
      const schedulableItems = this.convertToSchedulableItems(tasks, sequencedTasks)
      const priorityScores = this.calculatePriorityScores(schedulableItems, constraints)
      const dependencyGraph = this.buildDependencyGraph(schedulableItems)

      // Check for dependency cycles
      const cycleCheck = this.detectDependencyCycles(dependencyGraph)
      if (cycleCheck.hasCycle) {
        return {
          success: false,
          scheduledItems: [],
          unscheduledItems: schedulableItems,
          totalWorkDays: 0,
          totalFocusedHours: 0,
          totalAdminHours: 0,
          projectedCompletionDate: new Date(),
          overCapacityDays: [],
          underUtilizedDays: [],
          conflicts: [{
            type: 'dependency_cycle',
            affectedItems: cycleCheck.cycleItems,
            description: 'Circular dependency detected',
            severity: 'error',
            suggestedResolution: 'Remove or modify dependencies to break the cycle',
          }],
          warnings: [],
          suggestions: [],
        }
      }

      // Phase 2: Time Slot Generation
      const timeSlots = this.generateTimeSlots(workDayConfigs, constraints)

      // Phase 3: Dependency-Aware Scheduling
      const schedulingResult = this.scheduleWithDependencies(
        schedulableItems,
        priorityScores,
        dependencyGraph,
        timeSlots,
        constraints,
      )

      // Phase 4: Async Wait Optimization
      const optimizedResult = this.optimizeAsyncWaits(schedulingResult, constraints)

      // Phase 5: Analysis and Suggestions
      const finalResult = this.analyzeScheduleAndGenerateSuggestions(optimizedResult, workDayConfigs)

      return finalResult

    } catch (error) {
      // Return error result - error will be handled by the calling code
      return {
        success: false,
        scheduledItems: [],
        unscheduledItems: [],
        totalWorkDays: 0,
        totalFocusedHours: 0,
        totalAdminHours: 0,
        projectedCompletionDate: new Date(),
        overCapacityDays: [],
        underUtilizedDays: [],
        conflicts: [{
          type: 'capacity_exceeded',
          affectedItems: [],
          description: `Scheduling failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          severity: 'error',
        }],
        warnings: [],
        suggestions: [],
      }
    }
  }

  /**
   * Phase 1: Convert tasks and workflows to schedulable items
   */
  private convertToSchedulableItems(tasks: Task[], sequencedTasks: SequencedTask[]): SchedulableItem[] {
    const converter: SchedulingConverter = {
      convertSimpleTask: (task: Task): SchedulableItem => {
        const converted = {
          id: `task_${task.id}`,
          name: task.name,
          duration: task.duration,
          type: task.type,
          importance: task.importance,
          urgency: task.urgency,
          dependsOn: task.dependencies.map(dep => `task_${dep}`),
          asyncWaitTime: task.asyncWaitTime,
          isAsyncTrigger: task.isAsyncTrigger,
          deadline: task.deadline,
          deadlineType: task.deadlineType,
          sourceType: 'simple_task' as const,
          sourceId: task.id,
          status: (task.completed ? 'completed' : 'pending') as 'completed' | 'pending',
        }
        return converted
      },

      convertSequencedTask: (sequencedTask: SequencedTask): SchedulableItem[] => {
        return sequencedTask.steps.map((step, index) =>
          converter.convertTaskStep(step, sequencedTask, index),
        )
      },

      convertTaskStep: (step: TaskStep, workflow: SequencedTask, stepIndex: number): SchedulableItem => ({
        id: `workflow_${workflow.id}_step_${step.id}`,
        name: `${step.name}`,
        duration: step.duration,
        type: step.type,
        // Use step values if they exist and are not null, otherwise inherit from parent workflow
        importance: (step.importance !== null && step.importance !== undefined) ? step.importance : (workflow.importance || 8),
        urgency: (step.urgency !== null && step.urgency !== undefined) ? step.urgency : (workflow.urgency || 8),
        dependsOn: step.dependsOn.map(dep => `workflow_${workflow.id}_step_${dep}`),
        asyncWaitTime: step.asyncWaitTime,
        isAsyncTrigger: step.isAsyncTrigger,
        deadline: workflow.deadline, // Inherit deadline from parent workflow
        deadlineType: workflow.deadlineType,
        sourceType: 'workflow_step',
        sourceId: workflow.id,
        workflowStepIndex: stepIndex,
        status: step.status === 'completed' ? 'completed' : 'pending',
      }),
    }

    const items: SchedulableItem[] = []

    // Convert simple tasks
    tasks.forEach(task => {
      items.push(converter.convertSimpleTask(task))
    })

    // Convert sequenced tasks
    sequencedTasks.forEach(sequencedTask => {
      items.push(...converter.convertSequencedTask(sequencedTask))
    })

    return items
  }

  /**
   * Calculate priority scores for all items
   */
  private calculatePriorityScores(items: SchedulableItem[], constraints: SchedulingConstraints): PriorityScore[] {
    return items.map(item => {
      // Base Eisenhower score
      const rawScore = item.importance * item.urgency

      // Calculate dependency weighting (items with more dependents get slight boost)
      const dependentCount = items.filter(other =>
        other.dependsOn.includes(item.id),
      ).length
      const dependencyWeight = Math.log(dependentCount + 1) * 2

      // Calculate deadline pressure
      const deadlinePressure = this.calculateDeadlinePressure(item, constraints)

      // Calculate async urgency for async triggers
      const asyncUrgency = this.calculateAsyncUrgency(item, items)

      // Deadline pressure should be additive, not multiplicative, to ensure urgent deadlines take priority
      // A task with a critical deadline (pressure=1000) should always outrank non-deadline tasks
      const adjustedScore = rawScore + (deadlinePressure > 1 ? deadlinePressure * 100 : 0) + dependencyWeight + asyncUrgency

      // Tie-breaking value
      let tieBreakingValue: number | string = 0
      switch (constraints.tieBreakingMethod) {
        case 'creation_date':
          tieBreakingValue = Date.now() // Placeholder - would use actual creation date
          break
        case 'duration_shortest':
          tieBreakingValue = item.duration
          break
        case 'duration_longest':
          tieBreakingValue = -item.duration
          break
        case 'alphabetical':
          tieBreakingValue = item.name
          break
      }

      return {
        itemId: item.id,
        rawScore,
        adjustedScore,
        tieBreakingValue,
        finalRank: 0, // Will be set after sorting
      }
    }).sort((a, b) => {
      if (a.adjustedScore !== b.adjustedScore) {
        return b.adjustedScore - a.adjustedScore // Higher scores first
      }

      // Tie-breaking
      if (typeof a.tieBreakingValue === 'number' && typeof b.tieBreakingValue === 'number') {
        return a.tieBreakingValue - b.tieBreakingValue
      } else {
        return String(a.tieBreakingValue).localeCompare(String(b.tieBreakingValue))
      }
    }).map((score, index) => ({
      ...score,
      finalRank: index + 1,
    }))
  }

  /**
   * Build dependency graph for topological sorting
   */
  private buildDependencyGraph(items: SchedulableItem[]): Map<string, string[]> {
    const graph = new Map<string, string[]>()

    items.forEach(item => {
      graph.set(item.id, item.dependsOn)
    })

    return graph
  }

  /**
   * Detect dependency cycles using DFS
   */
  private detectDependencyCycles(dependencyGraph: Map<string, string[]>): { hasCycle: boolean; cycleItems: string[] } {
    const visited = new Set<string>()
    const recursionStack = new Set<string>()
    const cycleItems: string[] = []

    const dfs = (node: string): boolean => {
      if (recursionStack.has(node)) {
        cycleItems.push(node)
        return true
      }
      if (visited.has(node)) {
        return false
      }

      visited.add(node)
      recursionStack.add(node)

      const dependencies = dependencyGraph.get(node) || []
      for (const dep of dependencies) {
        if (dfs(dep)) {
          cycleItems.push(node)
          return true
        }
      }

      recursionStack.delete(node)
      return false
    }

    for (const node of dependencyGraph.keys()) {
      if (!visited.has(node)) {
        if (dfs(node)) {
          return { hasCycle: true, cycleItems }
        }
      }
    }

    return { hasCycle: false, cycleItems: [] }
  }

  /**
   * Generate time slots based on work day configurations
   */
  private generateTimeSlots(workDayConfigs: WorkDayConfiguration[], constraints: SchedulingConstraints): TimeSlot[] {
    const timeSlots: TimeSlot[] = []
    const startDate = constraints.earliestStartDate
    const endDate = constraints.latestEndDate || new Date(startDate.getTime() + 30 * 24 * 60 * 60 * 1000) // 30 days default

    const currentDate = new Date(startDate)
    let slotId = 0

    while (currentDate <= endDate) {
      const dayOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][currentDate.getDay()]
      const workDayConfig = workDayConfigs.find(config =>
        config.dayOfWeek === dayOfWeek && config.isWorkingDay,
      )

      if (workDayConfig) {
        // Create time slots for this work day
        const [startHour, startMinute] = parseTimeString(workDayConfig.workStartTime)
        const [endHour, endMinute] = parseTimeString(workDayConfig.workEndTime)
        const dayStart = new Date(currentDate)
        dayStart.setHours(startHour, startMinute, 0, 0)

        const dayEnd = new Date(currentDate)
        dayEnd.setHours(endHour, endMinute, 0, 0)

        // Calculate available minutes (total work time - breaks - meetings)
        const totalWorkMinutes = (dayEnd.getTime() - dayStart.getTime()) / (1000 * 60)
        const breakMinutes = workDayConfig.breaks.reduce((total, breakItem) => {
          const [breakStartHour, breakStartMinute] = parseTimeString(breakItem.startTime)
          const [breakEndHour, breakEndMinute] = parseTimeString(breakItem.endTime)
          const breakStart = new Date(currentDate)
          breakStart.setHours(breakStartHour, breakStartMinute, 0, 0)
          const breakEnd = new Date(currentDate)
          breakEnd.setHours(breakEndHour, breakEndMinute, 0, 0)
          return total + (breakEnd.getTime() - breakStart.getTime()) / (1000 * 60)
        }, 0)

        const meetingMinutes = workDayConfig.meetings.reduce((total, meeting) => {
          // Calculate meeting duration from start and end times
          const [startHour, startMinute] = parseTimeString(meeting.startTime)
          const [endHour, endMinute] = parseTimeString(meeting.endTime)
          const startMinutes = startHour * 60 + startMinute
          const endMinutes = endHour * 60 + endMinute
          const duration = endMinutes - startMinutes
          return total + duration
        }, 0)

        const availableMinutes = totalWorkMinutes - breakMinutes - meetingMinutes
        const focusedCapacity = Math.min(workDayConfig.maxFocusedMinutes, availableMinutes * 0.57) // ~4h of 7h
        const adminCapacity = Math.min(workDayConfig.maxAdminMinutes, availableMinutes - focusedCapacity)

        // Create a single time slot for the entire day (can be refined later)
        timeSlots.push({
          id: `slot_${slotId++}`,
          date: new Date(currentDate),
          startTime: new Date(dayStart),
          endTime: new Date(dayEnd),
          durationMinutes: availableMinutes,
          availableForFocused: true,
          availableForAdmin: true,
          allocatedItems: [],
          remainingFocusedMinutes: focusedCapacity,
          remainingAdminMinutes: adminCapacity,
          slotType: 'work',
          isBlocked: false,
        })
      }

      currentDate.setDate(currentDate.getDate() + 1)
    }

    return timeSlots
  }

  /**
   * Schedule items with dependency resolution
   */
  private scheduleWithDependencies(
    items: SchedulableItem[],
    priorityScores: PriorityScore[],
    dependencyGraph: Map<string, string[]>,
    timeSlots: TimeSlot[],
    constraints: SchedulingConstraints,
  ): { scheduledItems: ScheduledWorkItem[]; unscheduledItems: SchedulableItem[] } {
    const scheduledItems: ScheduledWorkItem[] = []
    const unscheduledItems: SchedulableItem[] = []
    const completedDependencies = new Set<string>()

    // Add already completed items to dependencies
    items.filter(item => item.status === 'completed').forEach(item => {
      completedDependencies.add(item.id)
    })

    // Topological sort with priority consideration
    const sortedItems = this.topologicalSort(items, dependencyGraph, priorityScores)

    for (const item of sortedItems) {
      if (item.status === 'completed') {
        continue // Skip already completed items
      }

      // Check if all dependencies are satisfied
      const canSchedule = item.dependsOn.every(dep => completedDependencies.has(dep))

      if (!canSchedule) {
        unscheduledItems.push(item)
        continue
      }

      // Find best time slot for this item
      const bestSlot = this.findBestTimeSlot(item, timeSlots, constraints)

      if (!bestSlot) {
        unscheduledItems.push(item)
        continue
      }

      // Schedule the item
      const scheduledItem = this.scheduleItemInSlot(item, bestSlot)
      scheduledItems.push(scheduledItem)

      // Update time slot capacity
      this.updateSlotCapacity(bestSlot, scheduledItem)

      // Mark as completed for dependency resolution
      completedDependencies.add(item.id)
    }

    return { scheduledItems, unscheduledItems }
  }

  /**
   * Topological sort with priority consideration
   */
  private topologicalSort(
    items: SchedulableItem[],
    dependencyGraph: Map<string, string[]>,
    priorityScores: PriorityScore[],
  ): SchedulableItem[] {
    const inDegree = new Map<string, number>()
    const itemMap = new Map<string, SchedulableItem>()
    const priorityMap = new Map<string, PriorityScore>()

    // Initialize
    items.forEach(item => {
      inDegree.set(item.id, 0)
      itemMap.set(item.id, item)
    })

    priorityScores.forEach(score => {
      priorityMap.set(score.itemId, score)
    })

    // Calculate in-degrees
    items.forEach(item => {
      // Set the in-degree for this item based on its dependencies
      inDegree.set(item.id, item.dependsOn.length)
    })

    // Priority queue (items with no dependencies, sorted by priority)
    const queue = items
      .filter(item => inDegree.get(item.id) === 0)
      .sort((a, b) => {
        const scoreA = priorityMap.get(a.id)?.adjustedScore || 0
        const scoreB = priorityMap.get(b.id)?.adjustedScore || 0
        return scoreB - scoreA // Higher priority first
      })

    const result: SchedulableItem[] = []

    while (queue.length > 0) {
      const current = queue.shift()!
      result.push(current)

      // Update dependencies - find items that depend on the current item
      items.forEach(item => {
        if (item.dependsOn.includes(current.id)) {
          const newInDegree = (inDegree.get(item.id) || 0) - 1
          inDegree.set(item.id, newInDegree)

          if (newInDegree === 0) {
            // Insert in priority order
            const priority = priorityMap.get(item.id)?.adjustedScore || 0
            let insertIndex = 0
            while (insertIndex < queue.length &&
                   (priorityMap.get(queue[insertIndex].id)?.adjustedScore || 0) > priority) {
              insertIndex++
            }
            queue.splice(insertIndex, 0, item)
          }
        }
      })
    }

    return result
  }

  /**
   * Find the best time slot for an item
   */
  private findBestTimeSlot(
    item: SchedulableItem,
    timeSlots: TimeSlot[],
    constraints: SchedulingConstraints,
  ): TimeSlot | null {
    for (const slot of timeSlots) {
      if (this.canFitInSlot(item, slot, constraints)) {
        return slot
      }
    }
    return null
  }

  /**
   * Check if item can fit in a time slot
   */
  private canFitInSlot(
    item: SchedulableItem,
    slot: TimeSlot,
    _constraints: SchedulingConstraints,
  ): boolean {
    if (slot.isBlocked || slot.slotType !== 'work') {
      return false
    }

    if (item.type === TaskType.Focused) {
      return slot.availableForFocused && slot.remainingFocusedMinutes >= item.duration
    } else {
      return slot.availableForAdmin && slot.remainingAdminMinutes >= item.duration
    }
  }

  /**
   * Schedule an item in a specific time slot
   */
  private scheduleItemInSlot(item: SchedulableItem, slot: TimeSlot): ScheduledWorkItem {
    const startTime = new Date(slot.startTime.getTime() +
      (slot.durationMinutes - (item.type === TaskType.Focused ? slot.remainingFocusedMinutes : slot.remainingAdminMinutes)) * 60000)
    const endTime = new Date(startTime.getTime() + item.duration * 60000)

    return {
      ...item,
      scheduledDate: new Date(slot.date),
      scheduledStartTime: startTime,
      scheduledEndTime: endTime,
      timeSlotId: slot.id,
      consumesFocusedTime: item.type === TaskType.Focused,
      consumesAdminTime: item.type === TaskType.Admin,
      isOptimallyPlaced: true, // Could be enhanced with more sophisticated logic
      wasRescheduled: false,
      status: 'scheduled',
    }
  }

  /**
   * Update time slot capacity after scheduling an item
   */
  private updateSlotCapacity(slot: TimeSlot, scheduledItem: ScheduledWorkItem): void {
    slot.allocatedItems.push(scheduledItem)

    if (scheduledItem.type === TaskType.Focused) {
      slot.remainingFocusedMinutes -= scheduledItem.duration
    } else {
      slot.remainingAdminMinutes -= scheduledItem.duration
    }
  }

  /**
   * Optimize async wait periods by filling with other tasks
   */
  private optimizeAsyncWaits(
    result: { scheduledItems: ScheduledWorkItem[]; unscheduledItems: SchedulableItem[] },
    _constraints: SchedulingConstraints,
  ): { scheduledItems: ScheduledWorkItem[]; unscheduledItems: SchedulableItem[] } {
    // Phase 4 implementation would go here
    // For now, return the result as-is
    return result
  }

  /**
   * Analyze the schedule and generate optimization suggestions
   */
  private analyzeScheduleAndGenerateSuggestions(
    result: { scheduledItems: ScheduledWorkItem[]; unscheduledItems: SchedulableItem[] },
    _workDayConfigs: WorkDayConfiguration[],
  ): SchedulingResult {
    const { scheduledItems, unscheduledItems } = result

    // Calculate totals
    const totalFocusedHours = scheduledItems
      .filter(item => item.type === TaskType.Focused)
      .reduce((total, item) => total + item.duration, 0) / 60

    const totalAdminHours = scheduledItems
      .filter(item => item.type === TaskType.Admin)
      .reduce((total, item) => total + item.duration, 0) / 60

    const projectedCompletionDate = scheduledItems.length > 0
      ? new Date(Math.max(...scheduledItems.map(item => item.scheduledEndTime.getTime())))
      : new Date()

    const uniqueDays = new Set(scheduledItems.map(item =>
      item.scheduledDate.toDateString(),
    )).size

    return {
      success: scheduledItems.length > 0 || unscheduledItems.length === 0,
      scheduledItems,
      unscheduledItems,
      totalWorkDays: uniqueDays,
      totalFocusedHours,
      totalAdminHours,
      projectedCompletionDate,
      overCapacityDays: [], // Would be calculated based on capacity analysis
      underUtilizedDays: [], // Would be calculated based on utilization analysis
      conflicts: [], // Would include capacity conflicts, impossible deadlines, etc.
      warnings: unscheduledItems.length > 0 ? [`${unscheduledItems.length} items could not be scheduled`] : [],
      suggestions: [], // Would include optimization suggestions
    }
  }

  /**
   * Calculate deadline pressure for an item
   * Returns a multiplier from 1.0 to 1000 based on deadline urgency
   */
  private calculateDeadlinePressure(item: SchedulableItem, constraints: SchedulingConstraints): number {
    // If no deadline, return base pressure
    if (!item.deadline) return 1.0

    // Calculate work days needed
    const workHoursPerDay = 7 // Default assumption: 4 focus + 3 admin
    const workDaysNeeded = item.duration / 60 / workHoursPerDay

    // Calculate days until deadline
    const currentTime = constraints.earliestStartDate || new Date()
    const hoursUntilDeadline = (item.deadline.getTime() - currentTime.getTime()) / (1000 * 60 * 60)
    const daysUntilDeadline = hoursUntilDeadline / 24

    // Slack time in days
    const slackDays = daysUntilDeadline - workDaysNeeded

    if (slackDays <= 0) {
      // Impossible or on critical path
      return 1000
    }

    // Apply inverse power function
    const k = item.deadlineType === 'hard' ? 10 : 5
    const p = 1.1  // Slightly superlinear for good curve
    const pressure = k / Math.pow(slackDays + 0.4, p)

    // For large slack (>5 days), add a small base pressure
    const basePressure = slackDays > 5 ? 1.1 : 1.0

    return Math.max(basePressure, Math.min(pressure, 1000))
  }

  /**
   * Calculate async urgency for tasks that trigger async work
   * Returns additional priority points for async triggers
   */
  private calculateAsyncUrgency(item: SchedulableItem, allItems: SchedulableItem[]): number {
    // Check if this is an async trigger
    const isAsyncTrigger = item.isAsyncTrigger || (item.asyncWaitTime > 0 && item.duration > 0)

    if (!isAsyncTrigger || !item.asyncWaitTime) return 0

    // Find dependent tasks
    const dependentItems = allItems.filter(other => other.dependsOn.includes(item.id))
    const dependentWorkHours = dependentItems.reduce((sum, dep) => sum + dep.duration / 60, 0)

    if (dependentWorkHours === 0) return 0

    // Find earliest deadline in dependency chain
    let earliestDeadline: Date | undefined
    const checkDeadlines = (items: SchedulableItem[]) => {
      for (const dep of items) {
        if (dep.deadline && (!earliestDeadline || dep.deadline < earliestDeadline)) {
          earliestDeadline = dep.deadline
        }
        // Check transitively dependent items
        const transitiveDeps = allItems.filter(other => other.dependsOn.includes(dep.id))
        if (transitiveDeps.length > 0) {
          checkDeadlines(transitiveDeps)
        }
      }
    }
    checkDeadlines(dependentItems)

    if (!earliestDeadline) return 0

    // Calculate urgency based on time compression
    const currentTime = new Date()
    const totalTimeNeeded = item.duration + item.asyncWaitTime + (dependentWorkHours * 60)
    const timeAvailable = (earliestDeadline.getTime() - currentTime.getTime()) / (1000 * 60)

    if (timeAvailable <= 0) return 50 // Critical urgency

    const compressionRatio = totalTimeNeeded / timeAvailable

    if (compressionRatio >= 1) {
      return 30 // Very high urgency
    } else if (compressionRatio >= 0.8) {
      return 20 // High urgency
    } else if (compressionRatio >= 0.6) {
      return 10 // Moderate urgency
    } else {
      return 5 // Low urgency
    }
  }
}
