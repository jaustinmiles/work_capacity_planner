/**
 * Unified capacity calculator for work blocks
 * Single source of truth for capacity calculations
 *
 * This module handles capacity calculations for user-configurable task types.
 * It works with BlockTypeConfig (single/combo/system) for dynamic type definitions.
 */

import {
  BlockTypeConfig,
  isSystemBlock,
  isSingleTypeBlock,
  isComboBlock,
} from './user-task-types'

/**
 * Capacity information for a work block.
 */
export interface BlockCapacity {
  totalMinutes: number
  typeConfig: BlockTypeConfig
}

/**
 * Calculate duration in minutes between two time strings
 */
function calculateDuration(startTime: string, endTime: string): number {
  const startParts = startTime.split(':').map(Number)
  const endParts = endTime.split(':').map(Number)
  const startHour = startParts[0] ?? 0
  const startMin = startParts[1] ?? 0
  const endHour = endParts[0] ?? 0
  const endMin = endParts[1] ?? 0
  return endHour * 60 + endMin - (startHour * 60 + startMin)
}

/**
 * Get total capacity in minutes for a specific user task type from a block.
 * This is for display purposes (showing total capacity by type).
 *
 * @param block - The block capacity info
 * @param taskTypeId - The user task type ID to check
 * @returns Minutes of capacity for that type
 */
export function getCapacityForType(block: BlockCapacity, taskTypeId: string): number {
  if (isSystemBlock(block.typeConfig)) {
    return 0 // System blocks have no task capacity
  }

  if (isSingleTypeBlock(block.typeConfig)) {
    return block.typeConfig.typeId === taskTypeId ? block.totalMinutes : 0
  }

  if (isComboBlock(block.typeConfig)) {
    const allocation = block.typeConfig.allocations.find((a) => a.typeId === taskTypeId)
    return allocation ? Math.floor(block.totalMinutes * allocation.ratio) : 0
  }

  return 0
}

/**
 * Check if a user task type is compatible with a block's type config.
 *
 * @param block - The block capacity info
 * @param taskTypeId - The user task type ID to check
 * @returns True if the task type can be scheduled in this block
 */
export function isTypeCompatibleWithBlock(block: BlockCapacity, taskTypeId: string): boolean {
  if (isSystemBlock(block.typeConfig)) {
    return false
  }

  if (isSingleTypeBlock(block.typeConfig)) {
    return block.typeConfig.typeId === taskTypeId
  }

  if (isComboBlock(block.typeConfig)) {
    return block.typeConfig.allocations.some((a) => a.typeId === taskTypeId)
  }

  return false
}

/**
 * Calculate capacity for a block using the type config system.
 *
 * @param typeConfig - The block's type configuration
 * @param startTime - Block start time (HH:MM)
 * @param endTime - Block end time (HH:MM)
 * @returns Block capacity info
 */
export function calculateBlockCapacity(
  typeConfig: BlockTypeConfig,
  startTime: string,
  endTime: string,
): BlockCapacity {
  const totalMinutes = calculateDuration(startTime, endTime)

  // System blocks have zero capacity
  if (isSystemBlock(typeConfig)) {
    return {
      totalMinutes: 0,
      typeConfig,
    }
  }

  return {
    totalMinutes,
    typeConfig,
  }
}
