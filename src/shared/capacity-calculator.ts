/**
 * Unified capacity calculator for work blocks
 * Single source of truth for capacity calculations
 */

import { WorkBlockType } from './constants'

export interface BlockCapacity {
  focus?: number
  admin?: number
  personal?: number
  total?: number  // For flexible blocks
  flexible?: boolean
}

export interface SplitRatio {
  focus?: number
  admin?: number
  personal?: number
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
  type: string,
  startTime: string,
  endTime: string,
  splitRatio?: string | null,
): BlockCapacity {
  const totalMinutes = calculateDuration(startTime, endTime)

  switch (type) {
    case WorkBlockType.FOCUSED:
      return {
        focus: totalMinutes,
        admin: 0,
        personal: 0,
        flexible: false,
      }

    case WorkBlockType.ADMIN:
      return {
        focus: 0,
        admin: totalMinutes,
        personal: 0,
        flexible: false,
      }

    case WorkBlockType.MIXED: {
      // Parse custom split ratio or use default
      const ratio: SplitRatio = splitRatio
        ? JSON.parse(splitRatio)
        : { focus: 0.7, admin: 0.3 }

      return {
        focus: Math.floor(totalMinutes * (ratio.focus || 0)),
        admin: Math.floor(totalMinutes * (ratio.admin || 0)),
        personal: Math.floor(totalMinutes * (ratio.personal || 0)),
        flexible: false,
      }
    }

    case WorkBlockType.FLEXIBLE:
      // Flexible blocks can be allocated to any task type
      return {
        total: totalMinutes,
        flexible: true,
        // Don't pre-allocate to specific types
        focus: 0,
        admin: 0,
        personal: 0,
      }

    case WorkBlockType.PERSONAL:
      return {
        focus: 0,
        admin: 0,
        personal: totalMinutes,
        flexible: false,
      }

    case WorkBlockType.BLOCKED:
    case WorkBlockType.SLEEP:
      // Blocked and sleep blocks have no capacity
      return {
        focus: 0,
        admin: 0,
        personal: 0,
        flexible: false,
      }

    default:
      console.warn(`Unknown block type: ${type}`)
      return {
        focus: 0,
        admin: 0,
        personal: 0,
        flexible: false,
      }
  }
}

/**
 * Allocate flexible capacity to a specific task type
 * Returns the amount allocated (may be less than requested if insufficient capacity)
 */
export function allocateFlexibleCapacity(
  remainingCapacity: number,
  requestedAmount: number,
  _taskType: 'focus' | 'admin' | 'personal',
): { allocated: number; remaining: number } {
  const allocated = Math.min(remainingCapacity, requestedAmount)
  return {
    allocated,
    remaining: remainingCapacity - allocated,
  }
}
