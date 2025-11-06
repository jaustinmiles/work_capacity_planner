/**
 * Priority calculation utilities for the UnifiedScheduler
 *
 * This module handles all priority calculations including:
 * - Eisenhower matrix scoring
 * - Deadline pressure calculation
 * - Cognitive match optimization
 * - Context switch penalties
 * - Workflow depth bonuses
 */

import { Task, TaskStep } from './types'
import { ScheduleContext, PriorityBreakdown } from './unified-scheduler-types'
import { parseTimeString, getCurrentTime } from './time-utils'

/**
 * Calculate priority for a single item
 */
export function calculatePriority(
  item: Task | TaskStep,
  context: ScheduleContext,
): number {
  const breakdown = calculatePriorityWithBreakdown(item, context)
  return breakdown.total
}

/**
 * Calculate priority with detailed breakdown for debugging
 */
export function calculatePriorityWithBreakdown(
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
  const deadlinePressure = calculateDeadlinePressure(item, context)
  const deadlineBoost = deadlinePressure > 1 ? deadlinePressure * 100 : 0 // Additive boost amount

  // Async urgency bonus
  const asyncBoost = calculateAsyncUrgency(item, context)

  // Cognitive match multiplier
  const cognitiveMatchFactor = calculateCognitiveMatch(item, context.currentTime, context)
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
    eisenhower,  // Raw importance × urgency (not weighted)
    deadlineBoost,  // Actual deadline boost applied (0 or pressure * 100)
    asyncBoost,
    cognitiveMatch,  // Amount of boost/penalty from cognitive match
    contextSwitchPenalty,
    workflowDepthBonus,
    total,
    importance,
    urgency,
    deadlinePressure,  // Raw pressure value (1.0+ if deadline applies)
    cognitiveMatchFactor,  // Raw factor (1.0 = neutral, >1 = boost, <1 = penalty)
  }
}

/**
 * Calculate deadline pressure based on time until deadline
 */
export function calculateDeadlinePressure(
  item: Task | TaskStep,
  context: ScheduleContext,
): number {
  // Check if item has a deadline
  const deadline = 'deadline' in item ? item.deadline : undefined
  const deadlineType = 'deadlineType' in item ? item.deadlineType : 'soft'

  if (!deadline) return 1 // No deadline, no pressure

  const now = context.currentTime || getCurrentTime()
  const hoursUntilDeadline = (deadline.getTime() - now.getTime()) / (1000 * 60 * 60)

  // If deadline has passed, maximum pressure
  if (hoursUntilDeadline <= 0) {
    return deadlineType === 'hard' ? 10 : 5 // Hard deadlines are more urgent when overdue
  }

  // Calculate pressure based on time remaining
  // Use exponential curve for more realistic pressure increase
  if (deadlineType === 'hard') {
    // Hard deadlines have steep pressure curve
    if (hoursUntilDeadline <= 4) return 8    // Less than 4 hours: critical
    if (hoursUntilDeadline <= 8) return 5    // Less than 8 hours: very high
    if (hoursUntilDeadline <= 24) return 3   // Less than a day: high
    if (hoursUntilDeadline <= 48) return 2   // Less than 2 days: moderate
    if (hoursUntilDeadline <= 72) return 1.5 // Less than 3 days: low
    return 1.2 // More than 3 days: minimal
  } else {
    // Soft deadlines have gentler pressure curve
    if (hoursUntilDeadline <= 8) return 3    // Less than 8 hours: high
    if (hoursUntilDeadline <= 24) return 2   // Less than a day: moderate
    if (hoursUntilDeadline <= 48) return 1.5 // Less than 2 days: low
    if (hoursUntilDeadline <= 72) return 1.2 // Less than 3 days: minimal
    return 1 // More than 3 days: no pressure
  }
}

/**
 * Calculate async urgency based on wait times
 */
export function calculateAsyncUrgency(
  item: Task | TaskStep,
  _context: ScheduleContext,
): number {
  // Check if item has async wait time
  const asyncWaitTime = item.asyncWaitTime
  if (!asyncWaitTime || asyncWaitTime <= 0) return 0

  // Async tasks get bonus to start them earlier
  // The longer the wait time, the higher the bonus (up to a cap)
  const hoursOfWait = asyncWaitTime / 60
  return Math.min(50, hoursOfWait * 10) // 10 points per hour of wait, capped at 50
}

/**
 * Calculate cognitive match factor based on current energy levels
 */
export function calculateCognitiveMatch(
  item: Task | TaskStep,
  currentTime: Date,
  context: ScheduleContext,
): number {
  const complexity = item.cognitiveComplexity || 3 // Default to medium
  const currentCapacity = getCognitiveCapacityAtTime(currentTime, context.productivityPatterns)

  // Map capacity levels to numeric values
  const capacityLevels: Record<string, number> = {
    'low': 2,
    'moderate': 3,
    'high': 4,
    'peak': 5,
  }

  const capacityValue = capacityLevels[currentCapacity] || 3

  // Calculate match score
  // Perfect match = 1.2x multiplier
  // One level off = 1.0x (neutral)
  // Two levels off = 0.8x penalty
  const difference = Math.abs(complexity - capacityValue)

  if (difference === 0) return 1.2  // Perfect match
  if (difference === 1) return 1.0  // One level off
  if (difference === 2) return 0.9  // Two levels off
  return 0.8 // Three or more levels off
}

/**
 * Get cognitive capacity at a specific time
 */
function getCognitiveCapacityAtTime(
  timeSlot: Date,
  productivityPatterns?: Array<{
    timeRangeStart?: string
    timeRangeEnd?: string
    cognitiveCapacity: 'low' | 'moderate' | 'high' | 'peak'
  }>,
): 'low' | 'moderate' | 'high' | 'peak' {
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

