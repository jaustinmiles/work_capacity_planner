// Types for flexible work blocks system

import { calculateDuration } from './time-utils'
import { getTotalCapacityForTaskType, BlockCapacity } from './capacity-calculator'
import { TaskType, WorkBlockType } from './enums'

export interface WorkBlock {
  id: string
  startTime: string // "09:00"
  endTime: string // "12:00"
  type: 'focused' | 'admin' | 'mixed' | 'personal' | 'flexible' | 'universal'
  capacity?: {
    totalMinutes: number
    type: WorkBlockType
    splitRatio?: { focus: number; admin: number }
  }
}

export interface DailyWorkPattern {
  date: string // "2025-08-07"
  blocks: WorkBlock[]
  accumulated: {
    focus: number
    admin: number
    personal: number
  }
  meetings: Meeting[]
}

export interface Meeting {
  id: string
  name: string
  startTime: string // "14:00" format
  endTime: string // "15:00" format
  type: 'meeting' | 'break' | 'personal' | 'blocked'
  recurring?: 'daily' | 'weekly' | 'none'
  daysOfWeek?: number[] // 0-6 for weekly recurring
}

// Alias for compatibility
export type WorkMeeting = Meeting

export interface WorkTemplate {
  id: string
  name: string
  description?: string
  blocks: Omit<WorkBlock, 'id'>[]
  isDefault?: boolean
}

// Default templates
export const DEFAULT_WORK_TEMPLATES: WorkTemplate[] = [
  {
    id: 'standard-9-5',
    name: 'Standard 9-5',
    description: 'Traditional work day with lunch break',
    blocks: [
      { startTime: '09:00', endTime: '12:00', type: 'mixed' },
      { startTime: '13:00', endTime: '17:00', type: 'mixed' },
    ],
    isDefault: true,
  },
  {
    id: 'early-bird',
    name: 'Early Bird',
    description: 'Start early with focused morning time',
    blocks: [
      { startTime: '06:00', endTime: '09:00', type: 'focused' },
      { startTime: '09:30', endTime: '12:00', type: 'admin' },
      { startTime: '13:00', endTime: '15:00', type: 'mixed' },
    ],
  },
  {
    id: 'night-owl',
    name: 'Night Owl',
    description: 'Later start with evening focus time',
    blocks: [
      { startTime: '10:00', endTime: '12:00', type: 'admin' },
      { startTime: '13:00', endTime: '16:00', type: 'mixed' },
      { startTime: '19:00', endTime: '22:00', type: 'focused' },
    ],
  },
  {
    id: 'split-day',
    name: 'Split Day',
    description: 'Work in multiple focused blocks',
    blocks: [
      { startTime: '08:00', endTime: '10:00', type: 'focused' },
      { startTime: '11:00', endTime: '13:00', type: 'focused' },
      { startTime: '15:00', endTime: '17:00', type: 'admin' },
      { startTime: '20:00', endTime: '21:30', type: 'focused' },
    ],
  },
]

// Helper functions
export function getTotalCapacity(blocks: WorkBlock[]): { focus: number; admin: number; personal: number } {
  return blocks.reduce((acc, block) => {
    const durationMinutes = calculateDuration(block.startTime, block.endTime)

    if (block.capacity) {
      // Use shared capacity calculator functions
      const blockCapacity = block.capacity as BlockCapacity
      acc.focus += getTotalCapacityForTaskType(blockCapacity, TaskType.Focused)
      acc.admin += getTotalCapacityForTaskType(blockCapacity, TaskType.Admin)
      acc.personal += getTotalCapacityForTaskType(blockCapacity, TaskType.Personal)
    } else if (block.type === 'focused') {
      acc.focus += durationMinutes
    } else if (block.type === 'admin') {
      acc.admin += durationMinutes
    } else if (block.type === 'personal') {
      acc.personal += durationMinutes
    } else if (block.type === 'mixed') {
      acc.focus += durationMinutes / 2
      acc.admin += durationMinutes / 2
    } else if (block.type === 'flexible' || block.type === 'universal') {
      // flexible and universal blocks can be used for any task type
      // Full duration is available for EITHER focus OR admin work
      // Set both to full duration to indicate either can use the full time
      acc.focus += durationMinutes
      acc.admin += durationMinutes
    }

    return acc
  }, { focus: 0, admin: 0, personal: 0 })
}

export function getRemainingCapacity(
  blocks: WorkBlock[],
  accumulated: { focus: number; admin: number; personal: number },
): { focus: number; admin: number; personal: number } {
  const total = getTotalCapacity(blocks)
  return {
    focus: Math.max(0, total.focus - accumulated.focus),
    admin: Math.max(0, total.admin - accumulated.admin),
    personal: Math.max(0, total.personal - (accumulated.personal || 0)),
  }
}

export function getCurrentBlock(blocks: WorkBlock[], time: Date = new Date()): WorkBlock | null {
  const timeStr = time.toTimeString().slice(0, 5) // "HH:MM"

  return blocks.find(block => {
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
}

export function getNextBlock(blocks: WorkBlock[], time: Date = new Date()): WorkBlock | null {
  const timeStr = time.toTimeString().slice(0, 5) // "HH:MM"

  // Filter blocks that haven't started yet
  const futureBlocks = blocks
    .filter(block => {
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
