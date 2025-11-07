/**
 * Unified capacity calculator for work blocks
 * Single source of truth for capacity calculations
 */

import { TaskType, WorkBlockType } from './enums'
import { logger } from '../logger'

export interface BlockCapacity {
  totalMinutes: number
  type: WorkBlockType
  splitRatio?: SplitRatio  // Only for mixed blocks
}

export interface SplitRatio {
  focus: number
  admin: number
}

/**
 * Calculate duration in minutes between two time strings
 */
function calculateDuration(startTime: string, endTime: string): number {
  const [startHour, startMin] = startTime.split(':').map(Number)
  const [endHour, endMin] = endTime.split(':').map(Number)
  return (endHour * 60 + endMin) - (startHour * 60 + startMin)
}

/**
 * Calculate capacity for a work block based on type
 * This is the single source of truth for all capacity calculations
 */
export function calculateBlockCapacity(
  type: WorkBlockType,
  startTime: string,
  endTime: string,
  splitRatio?: SplitRatio | null,
): BlockCapacity {
  const totalMinutes = calculateDuration(startTime, endTime)

  switch (type) {
    case WorkBlockType.Focused:
    case WorkBlockType.Admin:
    case WorkBlockType.Personal:
    case WorkBlockType.Flexible:
      return {
        totalMinutes,
        type,
      }

    case WorkBlockType.Mixed: {
      // Mixed blocks MUST have an explicit split ratio
      if (!splitRatio) {
        throw new Error('Mixed blocks require an explicit split ratio')
      }

      return {
        totalMinutes,
        type,
        splitRatio,
      }
    }

    case WorkBlockType.Blocked:
    case WorkBlockType.Sleep:
      // Blocked and sleep blocks have no capacity
      return {
        totalMinutes: 0,
        type,
      }

    default:
      logger.warn('Unknown block type', { type }, 'capacity-calculator')
      return {
        totalMinutes: 0,
        type,
      }
  }
}

/**
 * Get total capacity for a specific task type from a block (for display purposes)
 * Note: This returns TOTAL capacity, not remaining available capacity
 * For flexible blocks, this only returns capacity when querying for flexible type
 */
export function getTotalCapacityForTaskType(
  block: BlockCapacity,
  taskType: TaskType,
): number {
  // Flexible blocks should ONLY count toward flexible capacity
  // This prevents double-counting in capacity displays
  if (block.type === WorkBlockType.Flexible) {
    return taskType === TaskType.Flexible ? block.totalMinutes : 0
  }

  // Block type must match task type (except for mixed)
  if (block.type === WorkBlockType.Mixed && block.splitRatio) {
    // Mixed blocks split between focus and admin only
    if (taskType === TaskType.Focused) {
      return Math.floor(block.totalMinutes * block.splitRatio.focus)
    } else if (taskType === TaskType.Admin) {
      return Math.floor(block.totalMinutes * block.splitRatio.admin)
    }
    return 0  // Mixed blocks don't support personal tasks
  }

  // For single-type blocks, must match exactly
  if (block.type === WorkBlockType.Focused && taskType === TaskType.Focused) {
    return block.totalMinutes
  }
  if (block.type === WorkBlockType.Admin && taskType === TaskType.Admin) {
    return block.totalMinutes
  }
  if (block.type === WorkBlockType.Personal && taskType === TaskType.Personal) {
    return block.totalMinutes
  }

  return 0
}

/**
 * Get scheduler capacity for a specific task type from a block
 * Unlike getTotalCapacityForTaskType, this treats flexible blocks as available for ANY task type
 * Used by the scheduler to determine if a task can fit in a block
 */
export function getSchedulerCapacityForTaskType(
  block: BlockCapacity,
  taskType: TaskType,
): number {
  // Flexible blocks can be used for ANY task type (except Flexible itself which is not a real task type)
  if (block.type === WorkBlockType.Flexible && taskType !== TaskType.Flexible) {
    return block.totalMinutes
  }

  // For all other blocks, use the standard capacity calculation
  return getTotalCapacityForTaskType(block, taskType)
}
