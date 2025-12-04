import { describe, it, expect } from 'vitest'
import {
  parseTimeString,
  timeStringToMinutes,
  calculateDuration,
  formatMinutes,
  formatElapsedWithSeconds,
  parseDateString,
  formatTimeHHMM,
  formatTimeFromParts,
  calculateRemainingWaitTime,
  formatCountdown,
  getWaitStatus,
  dateToYYYYMMDD,
  parseTimeOnDate,
  addDays,
  isSameDay,
} from '../time-utils'

describe('time-utils', () => {
  describe('parseTimeString', () => {
    it('should parse valid time string', () => {
      expect(parseTimeString('14:30')).toEqual([14, 30])
      expect(parseTimeString('09:05')).toEqual([9, 5])
      expect(parseTimeString('00:00')).toEqual([0, 0])
      expect(parseTimeString('23:59')).toEqual([23, 59])
    })

    it('should handle defaults for invalid input', () => {
      expect(parseTimeString('')).toEqual([0, 0])
      expect(parseTimeString('invalid')).toEqual([0, 0])
      expect(parseTimeString('14', 12, 30)).toEqual([14, 30])
    })
  })

  describe('timeStringToMinutes', () => {
    it('should convert time strings to minutes since midnight', () => {
      expect(timeStringToMinutes('00:00')).toBe(0)
      expect(timeStringToMinutes('00:30')).toBe(30)
      expect(timeStringToMinutes('01:00')).toBe(60)
      expect(timeStringToMinutes('12:00')).toBe(720)
      expect(timeStringToMinutes('23:59')).toBe(1439)
    })
  })

  describe('calculateDuration', () => {
    it('should calculate duration between two times', () => {
      expect(calculateDuration('09:00', '10:00')).toBe(60)
      expect(calculateDuration('09:00', '17:00')).toBe(480)
      expect(calculateDuration('09:30', '10:15')).toBe(45)
      expect(calculateDuration('23:30', '23:45')).toBe(15)
    })

    it('should handle same start and end time', () => {
      expect(calculateDuration('10:00', '10:00')).toBe(0)
    })
  })

  describe('formatMinutes', () => {
    it('should format minutes correctly', () => {
      expect(formatMinutes(0)).toBe('0m')
      expect(formatMinutes(30)).toBe('30m')
      expect(formatMinutes(59)).toBe('59m')
      expect(formatMinutes(60)).toBe('1h')
      expect(formatMinutes(90)).toBe('1h 30m')
      expect(formatMinutes(120)).toBe('2h')
      expect(formatMinutes(150)).toBe('2h 30m')
    })
  })

  describe('formatElapsedWithSeconds', () => {
    it('should format seconds only for short durations', () => {
      const startTime = new Date('2024-01-15T10:00:00')
      const currentTime = new Date('2024-01-15T10:00:30') // 30 seconds later
      expect(formatElapsedWithSeconds(startTime, currentTime)).toBe('30s')
    })

    it('should format minutes and seconds', () => {
      const startTime = new Date('2024-01-15T10:00:00')
      const currentTime = new Date('2024-01-15T10:05:30') // 5 min 30 sec later
      expect(formatElapsedWithSeconds(startTime, currentTime)).toBe('5m 30s')
    })

    it('should format hours, minutes and seconds', () => {
      const startTime = new Date('2024-01-15T10:00:00')
      const currentTime = new Date('2024-01-15T11:30:45') // 1h 30m 45s later
      expect(formatElapsedWithSeconds(startTime, currentTime)).toBe('1h 30m 45s')
    })

    it('should handle zero seconds correctly', () => {
      const startTime = new Date('2024-01-15T10:00:00')
      const currentTime = new Date('2024-01-15T10:05:00') // Exactly 5 minutes
      expect(formatElapsedWithSeconds(startTime, currentTime)).toBe('5m 0s')
    })

    it('should handle exact hour', () => {
      const startTime = new Date('2024-01-15T10:00:00')
      const currentTime = new Date('2024-01-15T11:00:00') // Exactly 1 hour
      expect(formatElapsedWithSeconds(startTime, currentTime)).toBe('1h 0m 0s')
    })
  })

  describe('parseDateString', () => {
    it('should parse valid date strings', () => {
      expect(parseDateString('2024-01-15')).toEqual([2024, 1, 15])
      expect(parseDateString('2024-12-31')).toEqual([2024, 12, 31])
    })

    it('should handle invalid inputs with defaults', () => {
      const result = parseDateString('invalid')
      expect(result[0]).toBeGreaterThan(2000) // Should use current year
      expect(result[1]).toBe(1)
      expect(result[2]).toBe(1)
    })
  })

  describe('formatTimeHHMM', () => {
    it('should format Date to HH:MM string', () => {
      const date1 = new Date('2024-01-15T09:30:00')
      expect(formatTimeHHMM(date1)).toBe('09:30')

      const date2 = new Date('2024-01-15T14:05:00')
      expect(formatTimeHHMM(date2)).toBe('14:05')

      const date3 = new Date('2024-01-15T00:00:00')
      expect(formatTimeHHMM(date3)).toBe('00:00')
    })
  })

  describe('formatTimeFromParts', () => {
    it('should format hours and minutes to HH:MM', () => {
      expect(formatTimeFromParts(9, 30)).toBe('09:30')
      expect(formatTimeFromParts(14, 5)).toBe('14:05')
      expect(formatTimeFromParts(0, 0)).toBe('00:00')
      expect(formatTimeFromParts(23, 59)).toBe('23:59')
    })
  })

  describe('calculateRemainingWaitTime', () => {
    it('should calculate remaining wait time correctly', () => {
      const completedAt = new Date('2024-01-15T10:00:00')
      const currentTime = new Date('2024-01-15T10:30:00')

      // 60 minutes wait, 30 minutes elapsed, 30 remaining
      expect(calculateRemainingWaitTime(completedAt, 60, currentTime)).toBe(30)
    })

    it('should return 0 for expired waits', () => {
      const completedAt = new Date('2024-01-15T10:00:00')
      const currentTime = new Date('2024-01-15T12:00:00')

      // 60 minutes wait, 120 minutes elapsed, expired
      expect(calculateRemainingWaitTime(completedAt, 60, currentTime)).toBe(0)
    })
  })

  describe('formatCountdown', () => {
    it('should format countdown correctly', () => {
      expect(formatCountdown(0)).toBe('Ready')
      expect(formatCountdown(-10)).toBe('Ready')
      expect(formatCountdown(30)).toBe('30m remaining')
      expect(formatCountdown(90)).toBe('1h 30m remaining')
    })
  })

  describe('getWaitStatus', () => {
    it('should return correct wait status', () => {
      const completedAt = new Date('2024-01-15T10:00:00')
      const currentTime = new Date('2024-01-15T10:30:00')

      const status = getWaitStatus(completedAt, 60, currentTime)
      expect(status.expired).toBe(false)
      expect(status.remainingMinutes).toBe(30)
      expect(status.displayText).toBe('30m remaining')
    })

    it('should handle expired waits', () => {
      const completedAt = new Date('2024-01-15T10:00:00')
      const currentTime = new Date('2024-01-15T12:00:00')

      const status = getWaitStatus(completedAt, 60, currentTime)
      expect(status.expired).toBe(true)
      expect(status.remainingMinutes).toBe(0)
      expect(status.displayText).toBe('Ready')
    })
  })

  describe('dateToYYYYMMDD', () => {
    it('should format date to YYYY-MM-DD', () => {
      const date1 = new Date('2024-01-15T10:00:00')
      expect(dateToYYYYMMDD(date1)).toBe('2024-01-15')

      const date2 = new Date('2024-12-31T23:59:59')
      expect(dateToYYYYMMDD(date2)).toBe('2024-12-31')

      const date3 = new Date('2024-01-05T00:00:00')
      expect(dateToYYYYMMDD(date3)).toBe('2024-01-05')
    })

    it('should handle single-digit months and days', () => {
      const date = new Date('2024-03-05T10:00:00')
      expect(dateToYYYYMMDD(date)).toBe('2024-03-05')
    })
  })

  describe('parseTimeOnDate', () => {
    it('should parse time string on a specific date', () => {
      const baseDate = new Date('2024-01-15T00:00:00')
      const result = parseTimeOnDate(baseDate, '14:30')

      expect(result.getFullYear()).toBe(2024)
      expect(result.getMonth()).toBe(0) // January
      expect(result.getDate()).toBe(15)
      expect(result.getHours()).toBe(14)
      expect(result.getMinutes()).toBe(30)
      expect(result.getSeconds()).toBe(0)
    })

    it('should preserve date while changing time', () => {
      const baseDate = new Date('2024-12-25T18:45:30')
      const result = parseTimeOnDate(baseDate, '09:00')

      expect(result.getFullYear()).toBe(2024)
      expect(result.getMonth()).toBe(11) // December
      expect(result.getDate()).toBe(25)
      expect(result.getHours()).toBe(9)
      expect(result.getMinutes()).toBe(0)
    })
  })

  describe('addDays', () => {
    it('should add days to a date', () => {
      const date = new Date('2024-01-15T10:00:00')

      const tomorrow = addDays(date, 1)
      expect(tomorrow.getDate()).toBe(16)

      const nextWeek = addDays(date, 7)
      expect(nextWeek.getDate()).toBe(22)
    })

    it('should subtract days with negative numbers', () => {
      const date = new Date('2024-01-15T10:00:00')

      const yesterday = addDays(date, -1)
      expect(yesterday.getDate()).toBe(14)
    })

    it('should handle month boundaries', () => {
      const date = new Date('2024-01-31T10:00:00')
      const nextDay = addDays(date, 1)

      expect(nextDay.getMonth()).toBe(1) // February
      expect(nextDay.getDate()).toBe(1)
    })
  })

  describe('isSameDay', () => {
    it('should return true for same day', () => {
      const date1 = new Date('2024-01-15T10:00:00')
      const date2 = new Date('2024-01-15T14:30:00')

      expect(isSameDay(date1, date2)).toBe(true)
    })

    it('should return false for different days', () => {
      const date1 = new Date('2024-01-15T10:00:00')
      const date2 = new Date('2024-01-16T10:00:00')

      expect(isSameDay(date1, date2)).toBe(false)
    })

    it('should return false for different months', () => {
      const date1 = new Date('2024-01-15T10:00:00')
      const date2 = new Date('2024-02-15T10:00:00')

      expect(isSameDay(date1, date2)).toBe(false)
    })

    it('should return false for different years', () => {
      const date1 = new Date('2024-01-15T10:00:00')
      const date2 = new Date('2025-01-15T10:00:00')

      expect(isSameDay(date1, date2)).toBe(false)
    })
  })
})
