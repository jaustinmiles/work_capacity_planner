export interface WorkHours {
  startTime: string // "09:00"
  endTime: string   // "17:00"
  lunchStart?: string // "12:00"
  lunchDuration?: number // minutes
}

export interface DailyCapacity {
  maxFocusHours: number
  maxAdminHours: number
  blockedTimes: BlockedTime[]
}

export interface BlockedTime {
  id: string
  name: string
  startTime: string // "14:00"
  endTime: string   // "15:00"
  recurring: 'none' | 'daily' | 'weekly' | 'custom'
  daysOfWeek?: number[] // 0-6, Sunday-Saturday
}

export interface WorkSettings {
  defaultWorkHours: WorkHours
  customWorkHours: Record<number, WorkHours> // day of week (0-6) -> custom hours
  defaultCapacity: DailyCapacity
  customCapacity: Record<string, DailyCapacity> // date string -> custom capacity
  timeZone: string
}

export const DEFAULT_WORK_SETTINGS: WorkSettings = {
  defaultWorkHours: {
    startTime: '09:00',
    endTime: '18:00',
    lunchStart: '12:00',
    lunchDuration: 60,
  },
  customWorkHours: {
    // Example: Friday shorter hours
    // 5: { startTime: "09:00", endTime: "16:00" }
  },
  defaultCapacity: {
    maxFocusHours: 4,
    maxAdminHours: 3,
    blockedTimes: [],
  },
  customCapacity: {},
  timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
}
