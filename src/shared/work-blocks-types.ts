// Types for flexible work blocks system

export interface WorkBlock {
  id: string
  startTime: string // "09:00"
  endTime: string // "12:00"
  type: 'focused' | 'admin' | 'mixed'
  capacity?: {
    focusMinutes?: number
    adminMinutes?: number
  }
}

export interface DailyWorkPattern {
  date: string // "2025-08-07"
  blocks: WorkBlock[]
  accumulated: {
    focusMinutes: number
    adminMinutes: number
  }
  meetings: Meeting[]
}

export interface Meeting {
  id: string
  name: string
  startTime: string // "14:00" format
  endTime: string // "15:00" format
  type: 'meeting' | 'break' | 'personal' | 'blocked'
  recurring?: {
    pattern: 'daily' | 'weekly' | 'none'
    daysOfWeek?: number[] // 0-6
  }
}

// Alias for compatibility
export type WorkMeeting = Meeting

export interface WorkSession {
  id: string
  taskId?: string
  workflowId?: string
  startTime: Date
  endTime?: Date
  type: 'focused' | 'admin'
  plannedDuration: number
  actualDuration?: number
  notes?: string
}

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
export function getTotalCapacity(blocks: WorkBlock[]): { focusMinutes: number; adminMinutes: number } {
  return blocks.reduce((acc, block) => {
    const [startHour, startMin] = block.startTime.split(':').map(Number)
    const [endHour, endMin] = block.endTime.split(':').map(Number)
    const durationMinutes = (endHour * 60 + endMin) - (startHour * 60 + startMin)

    if (block.capacity) {
      acc.focusMinutes += block.capacity.focusMinutes || 0
      acc.adminMinutes += block.capacity.adminMinutes || 0
    } else if (block.type === 'focused') {
      acc.focusMinutes += durationMinutes
    } else if (block.type === 'admin') {
      acc.adminMinutes += durationMinutes
    } else { // mixed
      acc.focusMinutes += durationMinutes / 2
      acc.adminMinutes += durationMinutes / 2
    }

    return acc
  }, { focusMinutes: 0, adminMinutes: 0 })
}

export function getRemainingCapacity(
  blocks: WorkBlock[],
  accumulated: { focusMinutes: number; adminMinutes: number },
): { focusMinutes: number; adminMinutes: number } {
  const total = getTotalCapacity(blocks)
  return {
    focusMinutes: Math.max(0, total.focusMinutes - accumulated.focusMinutes),
    adminMinutes: Math.max(0, total.adminMinutes - accumulated.adminMinutes),
  }
}

export function getCurrentBlock(blocks: WorkBlock[], time: Date = new Date()): WorkBlock | null {
  const timeStr = time.toTimeString().slice(0, 5) // "HH:MM"

  return blocks.find(block => {
    return timeStr >= block.startTime && timeStr < block.endTime
  }) || null
}

export function getNextBlock(blocks: WorkBlock[], time: Date = new Date()): WorkBlock | null {
  const timeStr = time.toTimeString().slice(0, 5) // "HH:MM"

  const futureBlocks = blocks
    .filter(block => block.startTime > timeStr)
    .sort((a, b) => a.startTime.localeCompare(b.startTime))

  return futureBlocks[0] || null
}
