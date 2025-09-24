/**
 * Unified capacity calculator for work blocks
 * Single source of truth for capacity calculations
 */

import { WorkBlockType } from './constants'
import { TaskType } from './enums'

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
  splitRatio?: SplitRatio | string | null,
): BlockCapacity {
  const totalMinutes = calculateDuration(startTime, endTime)

  switch (type) {
    case WorkBlockType.FOCUSED:
    case WorkBlockType.ADMIN:
    case WorkBlockType.PERSONAL:
    case WorkBlockType.FLEXIBLE:
      return {
        totalMinutes,
        type,
      }

    case WorkBlockType.MIXED: {
      // Parse custom split ratio or use default (70% focus, 30% admin)
      const ratio: SplitRatio = splitRatio
        ? (typeof splitRatio === 'string' ? JSON.parse(splitRatio) : splitRatio)
        : { focus: 0.7, admin: 0.3 }

      return {
        totalMinutes,
        type,
        splitRatio: ratio,
      }
    }

    case WorkBlockType.BLOCKED:
    case WorkBlockType.SLEEP:
      // Blocked and sleep blocks have no capacity
      return {
        totalMinutes: 0,
        type,
      }

    default:
      console.warn(`Unknown block type: ${type}`)
      return {
        totalMinutes: 0,
        type,
      }
  }
}

/**
 * Get available capacity for a specific task type from a block
 */
export function getAvailableCapacityForTaskType(
  block: BlockCapacity,
  taskType: TaskType,
): number {
  // Flexible blocks work with any task type
  if (block.type === WorkBlockType.FLEXIBLE) {
    return block.totalMinutes
  }

  // Block type must match task type (except for mixed)
  if (block.type === WorkBlockType.MIXED && block.splitRatio) {
    // Mixed blocks split between focus and admin only
    if (taskType === TaskType.Focused) {
      return Math.floor(block.totalMinutes * block.splitRatio.focus)
    } else if (taskType === TaskType.Admin) {
      return Math.floor(block.totalMinutes * block.splitRatio.admin)
    }
    return 0  // Mixed blocks don't support personal tasks
  }

  // For single-type blocks, must match exactly
  if (block.type === WorkBlockType.FOCUSED && taskType === TaskType.Focused) {
    return block.totalMinutes
  }
  if (block.type === WorkBlockType.ADMIN && taskType === TaskType.Admin) {
    return block.totalMinutes
  }
  if (block.type === WorkBlockType.PERSONAL && taskType === TaskType.Personal) {
    return block.totalMinutes
  }

  return 0
}

/**
 * Allocate flexible capacity to a specific task type
 * Returns the amount allocated (may be less than requested if insufficient capacity)
 */
export function allocateFlexibleCapacity(
  remainingCapacity: number,
  requestedAmount: number,
  _taskType: TaskType,
): { allocated: number; remaining: number } {
  const allocated = Math.min(remainingCapacity, requestedAmount)
  return {
    allocated,
    remaining: remainingCapacity - allocated,
  }
}
