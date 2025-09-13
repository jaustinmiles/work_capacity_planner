import { describe, it, expect } from 'vitest'
import { DEFAULT_WORK_SETTINGS } from './work-settings-types'
import type { WorkHours, DailyCapacity, BlockedTime, WorkSettings } from './work-settings-types'

describe('work-settings-types', () => {
  describe('DEFAULT_WORK_SETTINGS', () => {
    it('should have correct default work hours', () => {
      expect(DEFAULT_WORK_SETTINGS.defaultWorkHours).toEqual({
        startTime: '09:00',
        endTime: '18:00',
        lunchStart: '12:00',
        lunchDuration: 60,
      })
    })

    it('should have empty custom work hours by default', () => {
      expect(DEFAULT_WORK_SETTINGS.customWorkHours).toEqual({})
    })

    it('should have correct default capacity', () => {
      expect(DEFAULT_WORK_SETTINGS.defaultCapacity).toEqual({
        maxFocusHours: 4,
        maxAdminHours: 3,
        blockedTimes: [],
      })
    })

    it('should have empty custom capacity by default', () => {
      expect(DEFAULT_WORK_SETTINGS.customCapacity).toEqual({})
    })

    it('should use system timezone', () => {
      const systemTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
      expect(DEFAULT_WORK_SETTINGS.timeZone).toBe(systemTimeZone)
    })

    it('should be a valid WorkSettings object', () => {
      const settings: WorkSettings = DEFAULT_WORK_SETTINGS
      expect(settings).toBeDefined()
      expect(settings.defaultWorkHours).toBeDefined()
      expect(settings.customWorkHours).toBeDefined()
      expect(settings.defaultCapacity).toBeDefined()
      expect(settings.customCapacity).toBeDefined()
      expect(settings.timeZone).toBeDefined()
    })
  })

  describe('Type validation', () => {
    it('should allow valid WorkHours structure', () => {
      const workHours: WorkHours = {
        startTime: '08:30',
        endTime: '17:30',
        lunchStart: '12:30',
        lunchDuration: 45,
      }
      
      expect(workHours.startTime).toBe('08:30')
      expect(workHours.endTime).toBe('17:30')
      expect(workHours.lunchStart).toBe('12:30')
      expect(workHours.lunchDuration).toBe(45)
    })

    it('should allow WorkHours without lunch', () => {
      const workHours: WorkHours = {
        startTime: '09:00',
        endTime: '17:00',
      }
      
      expect(workHours.lunchStart).toBeUndefined()
      expect(workHours.lunchDuration).toBeUndefined()
    })

    it('should allow valid DailyCapacity structure', () => {
      const capacity: DailyCapacity = {
        maxFocusHours: 6,
        maxAdminHours: 2,
        blockedTimes: [
          {
            id: 'meeting-1',
            name: 'Daily Standup',
            startTime: '10:00',
            endTime: '10:30',
            recurring: 'daily',
          }
        ],
      }
      
      expect(capacity.maxFocusHours).toBe(6)
      expect(capacity.maxAdminHours).toBe(2)
      expect(capacity.blockedTimes).toHaveLength(1)
    })

    it('should allow valid BlockedTime structures', () => {
      const blockedTime: BlockedTime = {
        id: 'block-1',
        name: 'Team Meeting',
        startTime: '14:00',
        endTime: '15:00',
        recurring: 'weekly',
        daysOfWeek: [1, 3, 5], // Monday, Wednesday, Friday
      }
      
      expect(blockedTime.id).toBe('block-1')
      expect(blockedTime.name).toBe('Team Meeting')
      expect(blockedTime.recurring).toBe('weekly')
      expect(blockedTime.daysOfWeek).toEqual([1, 3, 5])
    })

    it('should handle all recurring types', () => {
      const noneRecurring: BlockedTime = {
        id: '1',
        name: 'One-time event',
        startTime: '10:00',
        endTime: '11:00',
        recurring: 'none',
      }
      
      const dailyRecurring: BlockedTime = {
        id: '2',
        name: 'Daily standup',
        startTime: '09:00',
        endTime: '09:15',
        recurring: 'daily',
      }
      
      const weeklyRecurring: BlockedTime = {
        id: '3',
        name: 'Weekly review',
        startTime: '16:00',
        endTime: '17:00',
        recurring: 'weekly',
        daysOfWeek: [5], // Friday
      }
      
      const customRecurring: BlockedTime = {
        id: '4',
        name: 'Custom schedule',
        startTime: '13:00',
        endTime: '14:00',
        recurring: 'custom',
        daysOfWeek: [1, 2, 4],
      }
      
      expect(noneRecurring.recurring).toBe('none')
      expect(dailyRecurring.recurring).toBe('daily')
      expect(weeklyRecurring.recurring).toBe('weekly')
      expect(customRecurring.recurring).toBe('custom')
    })

    it('should allow custom work hours per day', () => {
      const settings: WorkSettings = {
        ...DEFAULT_WORK_SETTINGS,
        customWorkHours: {
          0: { startTime: '10:00', endTime: '16:00' }, // Sunday
          5: { startTime: '09:00', endTime: '15:00' }, // Friday
          6: { startTime: '10:00', endTime: '14:00' }, // Saturday
        },
      }
      
      expect(settings.customWorkHours[0]).toBeDefined()
      expect(settings.customWorkHours[5]).toBeDefined()
      expect(settings.customWorkHours[6]).toBeDefined()
      expect(settings.customWorkHours[0].startTime).toBe('10:00')
      expect(settings.customWorkHours[5].endTime).toBe('15:00')
    })

    it('should allow custom capacity per date', () => {
      const settings: WorkSettings = {
        ...DEFAULT_WORK_SETTINGS,
        customCapacity: {
          '2025-01-01': {
            maxFocusHours: 2,
            maxAdminHours: 1,
            blockedTimes: [],
          },
          '2025-12-25': {
            maxFocusHours: 0,
            maxAdminHours: 0,
            blockedTimes: [],
          },
        },
      }
      
      expect(settings.customCapacity['2025-01-01']).toBeDefined()
      expect(settings.customCapacity['2025-01-01'].maxFocusHours).toBe(2)
      expect(settings.customCapacity['2025-12-25'].maxFocusHours).toBe(0)
    })
  })

  describe('Edge cases', () => {
    it('should handle days of week array', () => {
      const blockedTime: BlockedTime = {
        id: 'test',
        name: 'Test',
        startTime: '10:00',
        endTime: '11:00',
        recurring: 'custom',
        daysOfWeek: [0, 1, 2, 3, 4, 5, 6], // All days
      }
      
      expect(blockedTime.daysOfWeek).toHaveLength(7)
      expect(blockedTime.daysOfWeek).toContain(0) // Sunday
      expect(blockedTime.daysOfWeek).toContain(6) // Saturday
    })

    it('should handle empty blocked times array', () => {
      const capacity: DailyCapacity = {
        maxFocusHours: 8,
        maxAdminHours: 0,
        blockedTimes: [],
      }
      
      expect(capacity.blockedTimes).toEqual([])
      expect(capacity.blockedTimes).toHaveLength(0)
    })

    it('should handle different time zones', () => {
      const settings: WorkSettings = {
        ...DEFAULT_WORK_SETTINGS,
        timeZone: 'America/New_York',
      }
      
      expect(settings.timeZone).toBe('America/New_York')
      
      const settings2: WorkSettings = {
        ...DEFAULT_WORK_SETTINGS,
        timeZone: 'Europe/London',
      }
      
      expect(settings2.timeZone).toBe('Europe/London')
    })

    it('should handle zero capacity', () => {
      const capacity: DailyCapacity = {
        maxFocusHours: 0,
        maxAdminHours: 0,
        blockedTimes: [],
      }
      
      expect(capacity.maxFocusHours).toBe(0)
      expect(capacity.maxAdminHours).toBe(0)
    })

    it('should handle overlapping blocked times', () => {
      const capacity: DailyCapacity = {
        maxFocusHours: 4,
        maxAdminHours: 2,
        blockedTimes: [
          {
            id: '1',
            name: 'Meeting 1',
            startTime: '10:00',
            endTime: '11:00',
            recurring: 'none',
          },
          {
            id: '2',
            name: 'Meeting 2',
            startTime: '10:30',
            endTime: '11:30',
            recurring: 'none',
          },
        ],
      }
      
      expect(capacity.blockedTimes).toHaveLength(2)
      // The types don't enforce non-overlapping, just store the data
    })
  })
})