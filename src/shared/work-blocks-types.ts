/**
 * Work Blocks Types
 *
 * Defines the data structures for work blocks and daily patterns.
 * Work blocks represent time slots in a day that can be allocated to different task types.
 *
 * Key concepts:
 * - WorkBlock: A time slot with a type configuration (single, combo, or system)
 * - DailyWorkPattern: A day's schedule with blocks and accumulated time by type
 * - Meeting: Events that block out time (meetings, breaks, etc.)
 */

/**
 * Semantic type for date strings in "YYYY-MM-DD" format.
 * Used throughout the codebase for date-only values (no time component).
 * Example: "2024-01-15"
 */
export type DateString = string

/**
 * Historical work data for a date or date range.
 * Used when viewing past work distribution or aggregating across multiple days.
 */
export interface HistoricalWorkData {
  accumulatedByType: Record<string, number>
  accumulatedBySink: Record<string, number>
  capacityByType: Record<string, number>
  meetingMinutes: number
  totalPlannedMinutes: number
  accumulatedTotal: number
}

import { calculateDuration } from './time-utils'
import {
  BlockTypeConfig,
  AccumulatedTimeByType,
  UserTaskType,
  isSystemBlock,
  isSingleTypeBlock,
  isComboBlock,
  getTypeRatioInBlock,
  createEmptyAccumulatedTime,
} from './user-task-types'
import { WorkBlockType, BlockConfigKind, MeetingType } from './enums'

// Re-export for convenience
export type { BlockTypeConfig } from './user-task-types'
export { WorkBlockType, MeetingType } from './enums'

/**
 * A work block represents a time slot in a day's schedule.
 * The typeConfig determines what kinds of tasks can be scheduled in this block.
 */
export interface WorkBlock {
  id: string
  startTime: string // "HH:MM" format (e.g., "09:00")
  endTime: string // "HH:MM" format (e.g., "12:00")
  typeConfig: BlockTypeConfig // Determines what task types this block accepts
  capacity?: WorkBlockCapacity // Calculated capacity info
}

/**
 * Capacity information for a work block.
 */
export interface WorkBlockCapacity {
  totalMinutes: number
  // For combo blocks, this stores the per-type allocation
  typeAllocations?: Record<string, number> // typeId -> minutes
}

/**
 * A daily work pattern contains all blocks and meetings for a specific date.
 */
export interface DailyWorkPattern {
  date: string // "YYYY-MM-DD" format
  blocks: WorkBlock[]
  accumulated: AccumulatedTimeByType // Dynamic: { [typeId]: minutes }
  meetings: Meeting[]
}

/**
 * A meeting or event that occupies time in the schedule.
 */
export interface Meeting {
  id: string
  name: string
  startTime: string // "HH:MM" format
  endTime: string // "HH:MM" format
  type: MeetingType
  recurring?: 'daily' | 'weekly' | 'none'
  daysOfWeek?: number[] // 0-6 for weekly recurring (0 = Sunday)
}

// Alias for compatibility
export type WorkMeeting = Meeting

/**
 * A template for creating work patterns.
 * Templates are user-created presets they can apply to days.
 */
export interface WorkTemplate {
  id: string
  name: string
  description?: string
  blocks: Omit<WorkBlock, 'id'>[]
  isDefault?: boolean
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Calculate total capacity for each user type across all blocks.
 *
 * @param blocks - The work blocks to calculate capacity for
 * @param _userTypes - All user-defined task types for the session (unused but kept for API consistency)
 * @returns A record mapping typeId to total available minutes
 */
export function getTotalCapacityByType(
  blocks: WorkBlock[],
  _userTypes: UserTaskType[],
): AccumulatedTimeByType {
  const capacity = createEmptyAccumulatedTime()

  for (const block of blocks) {
    const durationMinutes = calculateDuration(block.startTime, block.endTime)
    const typeConfig = block.typeConfig

    if (isSystemBlock(typeConfig)) {
      // System blocks (blocked, sleep) don't contribute capacity
      continue
    }

    if (isSingleTypeBlock(typeConfig)) {
      // Single-type block: all capacity goes to that type
      const typeId = typeConfig.typeId
      capacity[typeId] = (capacity[typeId] ?? 0) + durationMinutes
    }

    if (isComboBlock(typeConfig)) {
      // Combo block: distribute capacity by ratio
      for (const allocation of typeConfig.allocations) {
        const minutes = Math.floor(durationMinutes * allocation.ratio)
        capacity[allocation.typeId] = (capacity[allocation.typeId] ?? 0) + minutes
      }
    }
  }

  return capacity
}

/**
 * Calculate remaining capacity by subtracting accumulated from total.
 *
 * @param blocks - The work blocks
 * @param accumulated - Time already used per type
 * @param userTypes - All user-defined task types
 * @returns Remaining minutes per type
 */
export function getRemainingCapacityByType(
  blocks: WorkBlock[],
  accumulated: AccumulatedTimeByType,
  userTypes: UserTaskType[],
): AccumulatedTimeByType {
  const total = getTotalCapacityByType(blocks, userTypes)
  const remaining: AccumulatedTimeByType = {}

  // Calculate remaining for each type in total capacity
  for (const [typeId, totalMinutes] of Object.entries(total)) {
    const usedMinutes = accumulated[typeId] ?? 0
    remaining[typeId] = Math.max(0, totalMinutes - usedMinutes)
  }

  return remaining
}

/**
 * Get the work block active at a specific time.
 *
 * @param blocks - The work blocks to search
 * @param time - The time to check (defaults to now)
 * @returns The current block or null if none active
 */
export function getCurrentBlock(blocks: WorkBlock[], time: Date = new Date()): WorkBlock | null {
  const timeStr = time.toTimeString().slice(0, 5) // "HH:MM"

  return (
    blocks.find((block) => {
      // Handle blocks that cross midnight (e.g., 23:00 to 02:00)
      if (block.endTime < block.startTime) {
        // Block crosses midnight
        // We're in this block if we're after start OR before end
        return timeStr >= block.startTime || timeStr < block.endTime
      } else {
        // Normal block within same day
        return timeStr >= block.startTime && timeStr < block.endTime
      }
    }) || null
  )
}

/**
 * Get the next work block after a specific time.
 *
 * @param blocks - The work blocks to search
 * @param time - The reference time (defaults to now)
 * @returns The next block or null if none remaining
 */
export function getNextBlock(blocks: WorkBlock[], time: Date = new Date()): WorkBlock | null {
  const timeStr = time.toTimeString().slice(0, 5) // "HH:MM"

  // Filter blocks that haven't started yet
  const futureBlocks = blocks
    .filter((block) => {
      // For midnight-crossing blocks, be more careful
      if (block.endTime < block.startTime) {
        // If we're before the end time (early morning), this block is current, not next
        if (timeStr < block.endTime) {
          return false
        }
      }
      return block.startTime > timeStr
    })
    .sort((a, b) => a.startTime.localeCompare(b.startTime))

  return futureBlocks[0] || null
}

/**
 * Check if a task type can be scheduled in a block.
 *
 * @param block - The work block to check
 * @param taskTypeId - The task type ID to check
 * @returns True if the task type is compatible with the block
 */
export function isTaskTypeCompatibleWithBlock(block: WorkBlock, taskTypeId: string): boolean {
  const typeConfig = block.typeConfig

  if (isSystemBlock(typeConfig)) {
    return false // System blocks don't accept tasks
  }

  if (isSingleTypeBlock(typeConfig)) {
    return typeConfig.typeId === taskTypeId
  }

  if (isComboBlock(typeConfig)) {
    return typeConfig.allocations.some((a) => a.typeId === taskTypeId)
  }

  return false
}

/**
 * Get the capacity in minutes for a specific task type in a block.
 *
 * @param block - The work block
 * @param taskTypeId - The task type to get capacity for
 * @returns Available minutes for that type, or 0 if not compatible
 */
export function getBlockCapacityForType(block: WorkBlock, taskTypeId: string): number {
  const durationMinutes = calculateDuration(block.startTime, block.endTime)
  const typeConfig = block.typeConfig
  const ratio = getTypeRatioInBlock(taskTypeId, typeConfig)
  return Math.floor(durationMinutes * ratio)
}

/**
 * Create a single-type work block.
 */
export function createSingleTypeBlock(
  id: string,
  startTime: string,
  endTime: string,
  typeId: string,
): WorkBlock {
  return {
    id,
    startTime,
    endTime,
    typeConfig: { kind: BlockConfigKind.Single, typeId },
  }
}

/**
 * Create a combo (multi-type) work block.
 */
export function createComboBlock(
  id: string,
  startTime: string,
  endTime: string,
  allocations: Array<{ typeId: string; ratio: number }>,
): WorkBlock {
  return {
    id,
    startTime,
    endTime,
    typeConfig: { kind: BlockConfigKind.Combo, allocations },
  }
}

/**
 * Create a system block (blocked or sleep).
 */
export function createSystemBlock(
  id: string,
  startTime: string,
  endTime: string,
  systemType: WorkBlockType,
): WorkBlock {
  return {
    id,
    startTime,
    endTime,
    typeConfig: { kind: BlockConfigKind.System, systemType },
  }
}
