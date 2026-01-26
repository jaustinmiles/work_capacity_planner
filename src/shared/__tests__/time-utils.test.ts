import { describe, it, expect } from 'vitest'
import {
  parseTimeString,
  timeStringToMinutes,
  calculateDuration,
  calculateMinutesBetweenDates,
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
  extractTimeFromISO,
  formatDateStringForDisplay,
  safeParseDateString,
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

  describe('calculateMinutesBetweenDates', () => {
    it('should calculate minutes between two dates', () => {
      const start = new Date('2024-01-15T10:00:00')
      const end = new Date('2024-01-15T11:00:00')
      expect(calculateMinutesBetweenDates(start, end)).toBe(60)
    })

    it('should handle same date returning 0', () => {
      const date = new Date('2024-01-15T10:00:00')
      expect(calculateMinutesBetweenDates(date, date)).toBe(0)
    })

    it('should round to nearest minute', () => {
      const start = new Date('2024-01-15T10:00:00')
      const end = new Date('2024-01-15T10:30:29') // 30 minutes 29 seconds
      expect(calculateMinutesBetweenDates(start, end)).toBe(30)

      const end2 = new Date('2024-01-15T10:30:31') // 30 minutes 31 seconds
      expect(calculateMinutesBetweenDates(start, end2)).toBe(31)
    })

    it('should return 0 if end is before start (no negative values)', () => {
      const start = new Date('2024-01-15T11:00:00')
      const end = new Date('2024-01-15T10:00:00')
      expect(calculateMinutesBetweenDates(start, end)).toBe(0)
    })

    it('should handle multi-hour durations', () => {
      const start = new Date('2024-01-15T09:00:00')
      const end = new Date('2024-01-15T17:30:00')
      expect(calculateMinutesBetweenDates(start, end)).toBe(510) // 8h 30m
    })

    it('should handle crossing midnight', () => {
      const start = new Date('2024-01-15T23:30:00')
      const end = new Date('2024-01-16T00:30:00')
      expect(calculateMinutesBetweenDates(start, end)).toBe(60)
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

  describe('extractTimeFromISO', () => {
    it('should convert UTC times (Z suffix) to local time', () => {
      // Z suffix = UTC, should convert to LOCAL time
      // Create expected values by parsing the same strings
      const expected1 = formatTimeHHMM(new Date('2025-11-26T19:30:00Z'))
      const expected2 = formatTimeHHMM(new Date('2025-01-15T09:05:00.000Z'))
      const expected3 = formatTimeHHMM(new Date('2024-12-25T00:00:00+00:00'))

      expect(extractTimeFromISO('2025-11-26T19:30:00Z')).toBe(expected1)
      expect(extractTimeFromISO('2025-01-15T09:05:00.000Z')).toBe(expected2)
      expect(extractTimeFromISO('2024-12-25T00:00:00+00:00')).toBe(expected3)
    })

    it('should extract time directly from strings WITHOUT timezone', () => {
      // No Z suffix = already local time, extract directly
      expect(extractTimeFromISO('2025-11-26T19:30:00')).toBe('19:30')
      expect(extractTimeFromISO('2025-01-15T09:05:00')).toBe('09:05')
    })

    it('should handle Date objects', () => {
      const date = new Date(2024, 0, 15, 14, 30, 0) // Jan 15, 2024 at 14:30
      const result = extractTimeFromISO(date)
      expect(result).toBe('14:30')
    })

    it('should pass through HH:MM strings directly', () => {
      expect(extractTimeFromISO('19:30')).toBe('19:30')
      expect(extractTimeFromISO('09:05')).toBe('09:05')
    })

    it('should convert UTC times with milliseconds to local', () => {
      // Z suffix with milliseconds - should still convert to local
      const expected = formatTimeHHMM(new Date('2025-11-26T19:30:45.123Z'))
      expect(extractTimeFromISO('2025-11-26T19:30:45.123Z')).toBe(expected)
    })

    it('should fallback to Date parsing for non-ISO, non-HH:MM strings', () => {
      // This hits the last resort fallback path (lines 214-215)
      // Using a format that doesn't match ISO (no T) or HH:MM pattern
      const result = extractTimeFromISO('January 15, 2025 14:30:00')
      // Result depends on local timezone, but should be a valid HH:MM string
      expect(result).toMatch(/^\d{2}:\d{2}$/)
    })
  })

  describe('formatDateStringForDisplay', () => {
    it('should format YYYY-MM-DD date strings', () => {
      const result = formatDateStringForDisplay('2024-01-15')
      // Result will be locale-dependent, but should contain the date parts
      expect(result).toBeTruthy()
      expect(result.length).toBeGreaterThan(0)
    })

    it('should format ISO datetime strings', () => {
      const result = formatDateStringForDisplay('2024-01-15T10:30:00Z')
      expect(result).toBeTruthy()
      expect(result.length).toBeGreaterThan(0)
    })

    it('should handle custom locale', () => {
      const result = formatDateStringForDisplay('2024-01-15', 'en-US')
      expect(result).toBeTruthy()
    })

    it('should handle other date formats as fallback', () => {
      const result = formatDateStringForDisplay('January 15, 2024')
      expect(result).toBeTruthy()
    })
  })

  describe('safeParseDateString', () => {
    it('should return undefined for undefined input', () => {
      expect(safeParseDateString(undefined)).toBeUndefined()
    })

    it('should return undefined for empty string', () => {
      expect(safeParseDateString('')).toBeUndefined()
    })

    it('should parse YYYY-MM-DD date format', () => {
      const result = safeParseDateString('2025-12-09')
      expect(result).toBeInstanceOf(Date)
      expect(result?.getFullYear()).toBe(2025)
      expect(result?.getMonth()).toBe(11) // December (0-indexed)
      expect(result?.getDate()).toBe(9)
    })

    it('should parse ISO datetime with Z suffix respecting UTC', () => {
      // Z suffix means UTC - getUTCHours() should match the string,
      // getHours() returns local time (varies by timezone)
      const result = safeParseDateString('2025-12-09T15:21:00Z')
      expect(result).toBeInstanceOf(Date)
      expect(result?.getFullYear()).toBe(2025)
      // UTC values should be preserved
      expect(result?.getUTCHours()).toBe(15)
      expect(result?.getUTCMinutes()).toBe(21)
      expect(result?.getUTCSeconds()).toBe(0)
    })

    it('should parse ISO datetime with milliseconds respecting UTC', () => {
      const result = safeParseDateString('2025-12-09T15:21:30.123Z')
      expect(result).toBeInstanceOf(Date)
      // UTC values should be preserved
      expect(result?.getUTCHours()).toBe(15)
      expect(result?.getUTCMinutes()).toBe(21)
      expect(result?.getUTCSeconds()).toBe(30)
    })

    it('should parse ISO datetime without seconds respecting UTC', () => {
      const result = safeParseDateString('2025-12-09T15:21Z')
      expect(result).toBeInstanceOf(Date)
      // UTC values should be preserved
      expect(result?.getUTCHours()).toBe(15)
      expect(result?.getUTCMinutes()).toBe(21)
      expect(result?.getUTCSeconds()).toBe(0)
    })

    it('should parse ISO datetime WITHOUT timezone as local time', () => {
      // No Z suffix = local time, getHours() should match the string
      const result = safeParseDateString('2025-12-09T15:21:00')
      expect(result).toBeInstanceOf(Date)
      expect(result?.getHours()).toBe(15) // LOCAL hours
      expect(result?.getMinutes()).toBe(21)
      expect(result?.getSeconds()).toBe(0)
    })

    it('should handle date-only format with time defaulting to midnight', () => {
      const result = safeParseDateString('2025-01-15')
      expect(result).toBeInstanceOf(Date)
      expect(result?.getHours()).toBe(0)
      expect(result?.getMinutes()).toBe(0)
    })

    it('should return undefined for invalid date strings', () => {
      expect(safeParseDateString('not-a-date')).toBeUndefined()
      expect(safeParseDateString('abc123')).toBeUndefined()
      expect(safeParseDateString('hello world')).toBeUndefined()
    })

    it('should handle fallback parsing for non-ISO formats', () => {
      // This tests the Date constructor fallback path
      const result = safeParseDateString('January 15, 2025')
      expect(result).toBeInstanceOf(Date)
      expect(result?.getFullYear()).toBe(2025)
      expect(result?.getMonth()).toBe(0) // January
      expect(result?.getDate()).toBe(15)
    })
  })
})
