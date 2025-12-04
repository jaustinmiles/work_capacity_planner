/**
 * Metrics calculation utilities for the UnifiedScheduler
 *
 * This module provides sophisticated metrics calculations for
 * schedule analysis and visualization.
 */

import { UnifiedScheduleItem, ScheduleContext, SchedulingMetrics } from './unified-scheduler'

// Re-export SchedulingMetrics for convenience
export type { SchedulingMetrics }
import { DailyWorkPattern } from './work-blocks-types'
import { parseTimeString } from './time-utils'

/**
 * Calculate comprehensive scheduling metrics from scheduled items
 */
export function calculateSchedulingMetrics(
  scheduled: UnifiedScheduleItem[],
  context: ScheduleContext,
): SchedulingMetrics {
  // Filter out wait time items and meetings
  const actualTasks = scheduled.filter(item =>
    !item.isWaitTime && item.type !== 'meeting',
  )

  // Calculate basic time metrics
  const { totalWorkDays, projectedCompletionDate } = calculateTimeMetrics(actualTasks, context)

  // Calculate hours by type (dynamic)
  const hoursByType = calculateHoursByType(actualTasks)

  // Calculate utilization metrics
  const { averageUtilization, peakUtilization, capacityUtilization } =
    calculateUtilizationMetrics(scheduled, context.workPatterns)

  // Calculate deadline risk
  const { deadlineRiskScore, deadlinesMissed } = calculateDeadlineRisk(actualTasks, context)

  // Calculate priority metrics
  const averagePriority = calculateAveragePriority(actualTasks)

  // Calculate critical path
  const criticalPathLength = calculateCriticalPathHours(actualTasks)

  // Calculate total duration from hoursByType
  const totalHours = Object.values(hoursByType).reduce((sum, hours) => sum + hours, 0)

  return {
    totalWorkDays,
    hoursByType,
    projectedCompletionDate,
    averageUtilization,
    peakUtilization,
    capacityUtilization,
    deadlineRiskScore,
    deadlinesMissed,
    averagePriority,
    criticalPathLength,
    alternativeScenariosCount: 0, // Not yet implemented
    utilizationRate: averageUtilization, // For backward compatibility
    scheduledCount: actualTasks.length,
    unscheduledCount: 0, // Will be set by scheduler
    totalDuration: totalHours,
  }
}

/**
 * Calculate time-based metrics
 */
function calculateTimeMetrics(
  scheduled: UnifiedScheduleItem[],
  context: ScheduleContext,
): { totalWorkDays: number; projectedCompletionDate: Date } {
  if (scheduled.length === 0) {
    return {
      totalWorkDays: 0,
      projectedCompletionDate: context.currentTime,
    }
  }

  // Find the last scheduled item
  const lastItem = scheduled
    .filter(item => item.endTime)
    .sort((a, b) => (b.endTime?.getTime() || 0) - (a.endTime?.getTime() || 0))[0]

  const projectedCompletionDate = lastItem?.endTime || context.currentTime

  // Calculate work days from start to completion
  const startDate = context.currentTime
  const daysDiff = Math.ceil(
    (projectedCompletionDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24),
  )

  return {
    totalWorkDays: Math.max(1, daysDiff),
    projectedCompletionDate,
  }
}

/**
 * Calculate hours by task type dynamically.
 * Returns a Record<typeId, hours> for all types present in the scheduled items.
 */
function calculateHoursByType(scheduled: UnifiedScheduleItem[]): Record<string, number> {
  const hoursByType: Record<string, number> = {}

  scheduled.forEach(item => {
    const typeId = item.taskTypeId || 'unknown'
    const hours = item.duration / 60
    hoursByType[typeId] = (hoursByType[typeId] || 0) + hours
  })

  return hoursByType
}

/**
 * Calculate utilization metrics
 */
function calculateUtilizationMetrics(
  scheduled: UnifiedScheduleItem[],
  workPatterns: DailyWorkPattern[],
): { averageUtilization: number; peakUtilization: number; capacityUtilization: number } {
  if (workPatterns.length === 0 || scheduled.length === 0) {
    return {
      averageUtilization: 0,
      peakUtilization: 0,
      capacityUtilization: 0,
    }
  }

  // Group scheduled items by date
  const itemsByDate = new Map<string, UnifiedScheduleItem[]>()
  scheduled.forEach(item => {
    if (item.startTime) {
      const dateStr = item.startTime.toISOString().split('T')[0]
      if (!dateStr) return // Satisfy noUncheckedIndexedAccess
      const items = itemsByDate.get(dateStr) || []
      items.push(item)
      itemsByDate.set(dateStr, items)
    }
  })

  // Calculate utilization for each day
  const dailyUtilizations: number[] = []
  let totalCapacityMinutes = 0
  let totalUsedMinutes = 0

  workPatterns.forEach(pattern => {
    const dateItems = itemsByDate.get(pattern.date) || []
    const dayCapacityMinutes = calculateDayCapacity(pattern)
    const dayUsedMinutes = dateItems.reduce((sum, item) => sum + item.duration, 0)

    if (dayCapacityMinutes > 0) {
      const dayUtilization = dayUsedMinutes / dayCapacityMinutes
      dailyUtilizations.push(dayUtilization)
      totalCapacityMinutes += dayCapacityMinutes
      totalUsedMinutes += dayUsedMinutes
    }
  })

  // Calculate metrics
  const averageUtilization = totalCapacityMinutes > 0
    ? totalUsedMinutes / totalCapacityMinutes
    : 0

  const peakUtilization = dailyUtilizations.length > 0
    ? Math.max(...dailyUtilizations)
    : 0

  return {
    averageUtilization: Math.min(1, averageUtilization), // Cap at 100%
    peakUtilization: Math.min(1, peakUtilization), // Cap at 100%
    capacityUtilization: averageUtilization,
  }
}

/**
 * Calculate total capacity for a day in minutes
 */
function calculateDayCapacity(pattern: DailyWorkPattern): number {
  return pattern.blocks.reduce((sum, block) => {
    const [startHour, startMinute] = parseTimeString(block.startTime)
    const [endHour, endMinute] = parseTimeString(block.endTime)
    const startMinutes = startHour * 60 + startMinute
    const endMinutes = endHour * 60 + endMinute
    return sum + (endMinutes - startMinutes)
  }, 0)
}

/**
 * Calculate deadline risk metrics
 */
function calculateDeadlineRisk(
  scheduled: UnifiedScheduleItem[],
  _context: ScheduleContext,
): { deadlineRiskScore: number; deadlinesMissed: number } {
  const itemsWithDeadlines = scheduled.filter(item =>
    item.deadline && item.endTime,
  )

  if (itemsWithDeadlines.length === 0) {
    return { deadlineRiskScore: 0, deadlinesMissed: 0 }
  }

  let totalRisk = 0
  let missedCount = 0
  let atRiskCount = 0

  itemsWithDeadlines.forEach(item => {
    if (!item.deadline || !item.endTime) return

    const bufferHours = (item.deadline.getTime() - item.endTime.getTime()) / (1000 * 60 * 60)

    if (bufferHours < 0) {
      // Deadline already missed
      missedCount++
      totalRisk += 1
    } else if (bufferHours < 24) {
      // Less than 24 hours buffer - high risk
      atRiskCount++
      totalRisk += 0.8
    } else if (bufferHours < 48) {
      // Less than 48 hours buffer - medium risk
      totalRisk += 0.5
    } else if (bufferHours < 72) {
      // Less than 72 hours buffer - low risk
      totalRisk += 0.2
    }
  })

  const averageRisk = itemsWithDeadlines.length > 0
    ? totalRisk / itemsWithDeadlines.length
    : 0

  return {
    deadlineRiskScore: Math.min(1, averageRisk),
    deadlinesMissed: missedCount + atRiskCount,
  }
}

/**
 * Calculate average priority of scheduled items
 */
function calculateAveragePriority(scheduled: UnifiedScheduleItem[]): number {
  if (scheduled.length === 0) return 0

  const totalPriority = scheduled.reduce((sum, item) =>
    sum + (item.priority || 0), 0,
  )

  return totalPriority / scheduled.length
}

/**
 * Calculate critical path length in hours
 */
function calculateCriticalPathHours(scheduled: UnifiedScheduleItem[]): number {
  // Build dependency graph from scheduled items
  const dependencyChains = new Map<string, number>()

  // Calculate the longest path for each item
  scheduled.forEach(item => {
    const dependencies = item.dependencies || []
    let maxDependencyPath = 0

    dependencies.forEach(depId => {
      const depPath = dependencyChains.get(depId) || 0
      maxDependencyPath = Math.max(maxDependencyPath, depPath)
    })

    const itemPath = maxDependencyPath + (item.duration / 60)
    dependencyChains.set(item.id, itemPath)
  })

  // Find the maximum path
  let maxPath = 0
  dependencyChains.forEach(pathLength => {
    maxPath = Math.max(maxPath, pathLength)
  })

  return maxPath
}

/**
 * Get a friendly description for utilization level
 */
export function getUtilizationDescription(utilization: number): {
  label: string
  color: string
  description: string
} {
  if (utilization >= 0.95) {
    return {
      label: 'Overloaded',
      color: '#ff4d4f',
      description: 'Schedule is over capacity - consider redistributing tasks',
    }
  } else if (utilization >= 0.85) {
    return {
      label: 'Very High',
      color: '#fa8c16',
      description: 'Near maximum capacity - limited flexibility',
    }
  } else if (utilization >= 0.70) {
    return {
      label: 'High',
      color: '#faad14',
      description: 'Well utilized with some buffer time',
    }
  } else if (utilization >= 0.50) {
    return {
      label: 'Moderate',
      color: '#52c41a',
      description: 'Good balance of work and flexibility',
    }
  } else if (utilization >= 0.25) {
    return {
      label: 'Light',
      color: '#13c2c2',
      description: 'Plenty of available capacity',
    }
  } else {
    return {
      label: 'Very Light',
      color: '#722ed1',
      description: 'Significant unused capacity',
    }
  }
}

/**
 * Get deadline risk level description
 */
export function getDeadlineRiskDescription(riskScore: number): {
  label: string
  color: string
  icon: string
  description: string
} {
  if (riskScore >= 0.8) {
    return {
      label: 'Critical',
      color: '#ff4d4f',
      icon: '🚨',
      description: 'Immediate action required - deadlines at risk',
    }
  } else if (riskScore >= 0.6) {
    return {
      label: 'High',
      color: '#fa8c16',
      icon: '⚠️',
      description: 'Several deadlines have minimal buffer',
    }
  } else if (riskScore >= 0.3) {
    return {
      label: 'Medium',
      color: '#faad14',
      icon: '📅',
      description: 'Some deadline pressure but manageable',
    }
  } else if (riskScore > 0) {
    return {
      label: 'Low',
      color: '#52c41a',
      icon: '✓',
      description: 'Deadlines are well-buffered',
    }
  } else {
    return {
      label: 'None',
      color: '#95de64',
      icon: '✨',
      description: 'No deadline concerns',
    }
  }
}
