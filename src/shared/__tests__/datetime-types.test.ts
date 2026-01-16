/**
 * Tests for Branded DateTime Types
 *
 * Tests the type-safe LocalTime and LocalDate types.
 */

import { describe, it, expect } from 'vitest'
import {
  LocalTime,
  LocalDate,
  toLocalTime,
  toLocalDate,
  isLocalTime,
  isLocalDate,
  getCurrentLocalTime,
  getCurrentLocalDate,
  localDateTimeToDate,
  compareLocalTime,
  isTimeBetween,
  getMinutesBetween,
  addMinutesToTime,
  formatTimeForDisplay,
  formatDateForDisplay,
  localTimeToMinutes,
  minutesToLocalTime,
} from '../datetime-types'

describe('datetime-types', () => {
  // ===========================================================================
  // LocalTime Tests
  // ===========================================================================

  describe('toLocalTime', () => {
    describe('HH:MM format', () => {
      it('should accept valid HH:MM format', () => {
        expect(toLocalTime('09:30')).toBe('09:30')
        expect(toLocalTime('00:00')).toBe('00:00')
        expect(toLocalTime('23:59')).toBe('23:59')
        expect(toLocalTime('12:00')).toBe('12:00')
      })

      it('should reject invalid hours', () => {
        expect(() => toLocalTime('24:00')).toThrow('Invalid LocalTime')
        expect(() => toLocalTime('25:00')).toThrow('Invalid LocalTime')
        expect(() => toLocalTime('-1:00')).toThrow('Invalid LocalTime')
      })

      it('should reject invalid minutes', () => {
        expect(() => toLocalTime('12:60')).toThrow('Invalid LocalTime')
        expect(() => toLocalTime('12:99')).toThrow('Invalid LocalTime')
      })
    })

    describe('H:MM format (single digit hour)', () => {
      it('should normalize single digit hours', () => {
        expect(toLocalTime('9:30')).toBe('09:30')
        expect(toLocalTime('0:00')).toBe('00:00')
        expect(toLocalTime('1:15')).toBe('01:15')
      })

      it('should reject invalid single digit formats', () => {
        expect(() => toLocalTime('9:60')).toThrow('Invalid LocalTime')
      })
    })

    describe('ISO datetime strings', () => {
      it('should extract time from ISO strings (treating as local time)', () => {
        expect(toLocalTime('2025-11-23T10:45:00Z')).toBe('10:45')
        expect(toLocalTime('2025-11-23T10:45:00.000Z')).toBe('10:45')
        expect(toLocalTime('2025-01-15T18:45:00Z')).toBe('18:45')
        expect(toLocalTime('2025-01-15T00:30:00+00:00')).toBe('00:30')
      })

      it('should handle various ISO formats', () => {
        expect(toLocalTime('2025-11-23T09:00:00')).toBe('09:00')
        expect(toLocalTime('2025-11-23T23:59:59.999Z')).toBe('23:59')
      })
    })

    describe('12-hour format with AM/PM', () => {
      it('should parse AM times', () => {
        expect(toLocalTime('9:30 AM')).toBe('09:30')
        expect(toLocalTime('9:30 am')).toBe('09:30')
        expect(toLocalTime('12:00 AM')).toBe('00:00') // Midnight
        expect(toLocalTime('1:00 AM')).toBe('01:00')
      })

      it('should parse PM times', () => {
        expect(toLocalTime('9:30 PM')).toBe('21:30')
        expect(toLocalTime('9:30 pm')).toBe('21:30')
        expect(toLocalTime('12:00 PM')).toBe('12:00') // Noon
        expect(toLocalTime('1:00 PM')).toBe('13:00')
      })

      it('should handle edge cases', () => {
        expect(toLocalTime('11:59 AM')).toBe('11:59')
        expect(toLocalTime('11:59 PM')).toBe('23:59')
      })
    })

    describe('Date objects', () => {
      it('should extract local time from Date objects', () => {
        const date = new Date(2025, 10, 23, 14, 30, 0) // Nov 23, 2025, 14:30:00 local
        expect(toLocalTime(date)).toBe('14:30')
      })

      it('should handle midnight', () => {
        const midnight = new Date(2025, 0, 1, 0, 0, 0)
        expect(toLocalTime(midnight)).toBe('00:00')
      })

      it('should handle end of day', () => {
        const endOfDay = new Date(2025, 0, 1, 23, 59, 59)
        expect(toLocalTime(endOfDay)).toBe('23:59')
      })

      it('should throw for invalid Date', () => {
        const invalidDate = new Date('invalid')
        expect(() => toLocalTime(invalidDate)).toThrow('Invalid LocalTime: Date object is invalid')
      })
    })

    describe('invalid inputs', () => {
      it('should throw for empty string', () => {
        expect(() => toLocalTime('')).toThrow('Invalid LocalTime')
      })

      it('should throw for null', () => {
        expect(() => toLocalTime(null as unknown as string)).toThrow('Invalid LocalTime')
      })

      it('should throw for undefined', () => {
        expect(() => toLocalTime(undefined as unknown as string)).toThrow('Invalid LocalTime')
      })

      it('should throw for invalid strings', () => {
        expect(() => toLocalTime('invalid')).toThrow('Invalid LocalTime')
        expect(() => toLocalTime('abc:def')).toThrow('Invalid LocalTime')
        expect(() => toLocalTime('12')).toThrow('Invalid LocalTime')
        expect(() => toLocalTime('12:')).toThrow('Invalid LocalTime')
        expect(() => toLocalTime(':30')).toThrow('Invalid LocalTime')
      })
    })
  })

  describe('isLocalTime', () => {
    it('should return true for valid LocalTime format', () => {
      expect(isLocalTime('09:30')).toBe(true)
      expect(isLocalTime('00:00')).toBe(true)
      expect(isLocalTime('23:59')).toBe(true)
    })

    it('should return false for invalid formats', () => {
      expect(isLocalTime('9:30')).toBe(false) // Single digit hour
      expect(isLocalTime('24:00')).toBe(false)
      expect(isLocalTime('12:60')).toBe(false)
      expect(isLocalTime('invalid')).toBe(false)
    })

    it('should return false for non-strings', () => {
      expect(isLocalTime(null)).toBe(false)
      expect(isLocalTime(undefined)).toBe(false)
      expect(isLocalTime(123)).toBe(false)
      expect(isLocalTime({})).toBe(false)
      expect(isLocalTime(new Date())).toBe(false)
    })
  })

  // ===========================================================================
  // LocalDate Tests
  // ===========================================================================

  describe('toLocalDate', () => {
    describe('YYYY-MM-DD format', () => {
      it('should accept valid YYYY-MM-DD format', () => {
        expect(toLocalDate('2025-01-15')).toBe('2025-01-15')
        expect(toLocalDate('2025-12-31')).toBe('2025-12-31')
        expect(toLocalDate('2000-01-01')).toBe('2000-01-01')
      })

      it('should reject invalid months', () => {
        expect(() => toLocalDate('2025-00-15')).toThrow('Invalid LocalDate')
        expect(() => toLocalDate('2025-13-15')).toThrow('Invalid LocalDate')
      })

      it('should reject invalid days', () => {
        expect(() => toLocalDate('2025-01-00')).toThrow('Invalid LocalDate')
        expect(() => toLocalDate('2025-01-32')).toThrow('Invalid LocalDate')
      })
    })

    describe('ISO datetime strings', () => {
      it('should extract date from ISO strings', () => {
        expect(toLocalDate('2025-11-23T10:45:00Z')).toBe('2025-11-23')
        expect(toLocalDate('2025-01-15T18:45:00.000Z')).toBe('2025-01-15')
      })
    })

    describe('Date objects', () => {
      it('should extract local date from Date objects', () => {
        const date = new Date(2025, 10, 23, 14, 30, 0) // Nov 23, 2025 (month is 0-indexed)
        expect(toLocalDate(date)).toBe('2025-11-23')
      })

      it('should throw for invalid Date', () => {
        const invalidDate = new Date('invalid')
        expect(() => toLocalDate(invalidDate)).toThrow('Invalid LocalDate: Date object is invalid')
      })
    })

    describe('invalid inputs', () => {
      it('should throw for empty string', () => {
        expect(() => toLocalDate('')).toThrow('Invalid LocalDate')
      })

      it('should throw for null', () => {
        expect(() => toLocalDate(null as unknown as string)).toThrow('Invalid LocalDate')
      })

      it('should throw for invalid strings', () => {
        expect(() => toLocalDate('invalid')).toThrow('Invalid LocalDate')
        expect(() => toLocalDate('2025-1-15')).toThrow('Invalid LocalDate') // Single digit month
        expect(() => toLocalDate('2025/01/15')).toThrow('Invalid LocalDate') // Wrong separator
      })
    })
  })

  describe('isLocalDate', () => {
    it('should return true for valid LocalDate format', () => {
      expect(isLocalDate('2025-01-15')).toBe(true)
      expect(isLocalDate('2025-12-31')).toBe(true)
    })

    it('should return false for invalid formats', () => {
      expect(isLocalDate('2025-1-15')).toBe(false)
      expect(isLocalDate('2025-00-15')).toBe(false)
      expect(isLocalDate('invalid')).toBe(false)
    })

    it('should return false for non-strings', () => {
      expect(isLocalDate(null)).toBe(false)
      expect(isLocalDate(undefined)).toBe(false)
      expect(isLocalDate(new Date())).toBe(false)
    })
  })

  // ===========================================================================
  // Utility Function Tests
  // ===========================================================================

  describe('getCurrentLocalTime', () => {
    it('should return current time in HH:MM format', () => {
      const time = getCurrentLocalTime()
      expect(isLocalTime(time)).toBe(true)
    })

    it('should accept a custom Date', () => {
      const customDate = new Date(2025, 5, 15, 14, 30, 0)
      expect(getCurrentLocalTime(customDate)).toBe('14:30')
    })
  })

  describe('getCurrentLocalDate', () => {
    it('should return current date in YYYY-MM-DD format', () => {
      const date = getCurrentLocalDate()
      expect(isLocalDate(date)).toBe(true)
    })

    it('should accept a custom Date', () => {
      const customDate = new Date(2025, 5, 15, 14, 30, 0) // June 15, 2025
      expect(getCurrentLocalDate(customDate)).toBe('2025-06-15')
    })
  })

  describe('localDateTimeToDate', () => {
    it('should create Date from LocalDate and LocalTime', () => {
      const date = toLocalDate('2025-11-23')
      const time = toLocalTime('14:30')
      const result = localDateTimeToDate(date, time)

      expect(result.getFullYear()).toBe(2025)
      expect(result.getMonth()).toBe(10) // November (0-indexed)
      expect(result.getDate()).toBe(23)
      expect(result.getHours()).toBe(14)
      expect(result.getMinutes()).toBe(30)
    })
  })

  describe('compareLocalTime', () => {
    it('should return -1 when a < b', () => {
      expect(compareLocalTime(toLocalTime('09:00'), toLocalTime('10:00'))).toBe(-1)
      expect(compareLocalTime(toLocalTime('09:00'), toLocalTime('09:01'))).toBe(-1)
    })

    it('should return 0 when a == b', () => {
      expect(compareLocalTime(toLocalTime('09:00'), toLocalTime('09:00'))).toBe(0)
    })

    it('should return 1 when a > b', () => {
      expect(compareLocalTime(toLocalTime('10:00'), toLocalTime('09:00'))).toBe(1)
      expect(compareLocalTime(toLocalTime('09:01'), toLocalTime('09:00'))).toBe(1)
    })
  })

  describe('isTimeBetween', () => {
    it('should handle normal ranges', () => {
      expect(isTimeBetween(toLocalTime('10:00'), toLocalTime('09:00'), toLocalTime('17:00'))).toBe(true)
      expect(isTimeBetween(toLocalTime('08:00'), toLocalTime('09:00'), toLocalTime('17:00'))).toBe(false)
      expect(isTimeBetween(toLocalTime('18:00'), toLocalTime('09:00'), toLocalTime('17:00'))).toBe(false)
    })

    it('should handle boundary values', () => {
      expect(isTimeBetween(toLocalTime('09:00'), toLocalTime('09:00'), toLocalTime('17:00'))).toBe(true)
      expect(isTimeBetween(toLocalTime('17:00'), toLocalTime('09:00'), toLocalTime('17:00'))).toBe(true)
    })

    it('should handle overnight ranges', () => {
      // Range from 23:00 to 01:00 (overnight)
      expect(isTimeBetween(toLocalTime('23:30'), toLocalTime('23:00'), toLocalTime('01:00'))).toBe(true)
      expect(isTimeBetween(toLocalTime('00:30'), toLocalTime('23:00'), toLocalTime('01:00'))).toBe(true)
      expect(isTimeBetween(toLocalTime('12:00'), toLocalTime('23:00'), toLocalTime('01:00'))).toBe(false)
    })
  })

  describe('getMinutesBetween', () => {
    it('should calculate duration correctly', () => {
      expect(getMinutesBetween(toLocalTime('09:00'), toLocalTime('10:00'))).toBe(60)
      expect(getMinutesBetween(toLocalTime('09:00'), toLocalTime('09:30'))).toBe(30)
      expect(getMinutesBetween(toLocalTime('09:30'), toLocalTime('10:00'))).toBe(30)
    })

    it('should return negative for end before start (same day assumption)', () => {
      expect(getMinutesBetween(toLocalTime('10:00'), toLocalTime('09:00'))).toBe(-60)
    })
  })

  describe('addMinutesToTime', () => {
    it('should add minutes correctly', () => {
      expect(addMinutesToTime(toLocalTime('09:00'), 30)).toBe('09:30')
      expect(addMinutesToTime(toLocalTime('09:30'), 30)).toBe('10:00')
      expect(addMinutesToTime(toLocalTime('09:00'), 90)).toBe('10:30')
    })

    it('should wrap around midnight', () => {
      expect(addMinutesToTime(toLocalTime('23:30'), 60)).toBe('00:30')
      expect(addMinutesToTime(toLocalTime('23:00'), 120)).toBe('01:00')
    })

    it('should handle negative minutes', () => {
      expect(addMinutesToTime(toLocalTime('09:30'), -30)).toBe('09:00')
      expect(addMinutesToTime(toLocalTime('00:30'), -60)).toBe('23:30')
    })
  })

  describe('formatTimeForDisplay', () => {
    it('should return 24-hour format when use24Hour is true', () => {
      expect(formatTimeForDisplay(toLocalTime('14:30'), true)).toBe('14:30')
      expect(formatTimeForDisplay(toLocalTime('09:00'), true)).toBe('09:00')
    })

    it('should return 12-hour format by default', () => {
      expect(formatTimeForDisplay(toLocalTime('14:30'))).toBe('2:30 PM')
      expect(formatTimeForDisplay(toLocalTime('09:00'))).toBe('9:00 AM')
      expect(formatTimeForDisplay(toLocalTime('00:00'))).toBe('12:00 AM')
      expect(formatTimeForDisplay(toLocalTime('12:00'))).toBe('12:00 PM')
    })
  })

  describe('formatDateForDisplay', () => {
    it('should format date using locale', () => {
      const date = toLocalDate('2025-11-23')
      const formatted = formatDateForDisplay(date)
      // The exact format depends on locale, but it should contain the date parts
      expect(formatted).toBeTruthy()
    })
  })

  describe('localTimeToMinutes', () => {
    it('should convert time to minutes since midnight', () => {
      expect(localTimeToMinutes(toLocalTime('00:00'))).toBe(0)
      expect(localTimeToMinutes(toLocalTime('01:00'))).toBe(60)
      expect(localTimeToMinutes(toLocalTime('12:00'))).toBe(720)
      expect(localTimeToMinutes(toLocalTime('23:59'))).toBe(1439)
    })
  })

  describe('minutesToLocalTime', () => {
    it('should convert minutes to LocalTime', () => {
      expect(minutesToLocalTime(0)).toBe('00:00')
      expect(minutesToLocalTime(60)).toBe('01:00')
      expect(minutesToLocalTime(720)).toBe('12:00')
      expect(minutesToLocalTime(1439)).toBe('23:59')
    })

    it('should throw for out of range values', () => {
      expect(() => minutesToLocalTime(-1)).toThrow('Invalid minutes')
      expect(() => minutesToLocalTime(1440)).toThrow('Invalid minutes')
    })
  })

  // ===========================================================================
  // Type Safety Tests
  // ===========================================================================

  describe('Type Safety (compile-time)', () => {
    it('LocalTime values are strings at runtime', () => {
      const time: LocalTime = toLocalTime('09:30')
      expect(typeof time).toBe('string')
      expect(time.length).toBe(5)
    })

    it('LocalDate values are strings at runtime', () => {
      const date: LocalDate = toLocalDate('2025-01-15')
      expect(typeof date).toBe('string')
      expect(date.length).toBe(10)
    })

    it('Can use string methods on branded types', () => {
      const time: LocalTime = toLocalTime('09:30')
      const date: LocalDate = toLocalDate('2025-01-15')

      expect(time.includes(':')).toBe(true)
      expect(date.includes('-')).toBe(true)
      expect(time.split(':').length).toBe(2)
      expect(date.split('-').length).toBe(3)
    })
  })

  // ===========================================================================
  // Edge Case Tests (THE BUG SCENARIOS)
  // ===========================================================================

  describe('Timezone Bug Prevention', () => {
    it('should treat ISO Z suffix as local time (the fix)', () => {
      // This is THE critical test for the timezone bug fix
      // When AI sends "10:45:00Z", we extract "10:45" as LOCAL time
      // NOT as UTC that needs conversion
      const isoString = '2026-01-15T10:45:00Z'
      const extracted = toLocalTime(isoString)

      // The time should be 10:45, not shifted by timezone
      expect(extracted).toBe('10:45')
    })

    it('should extract consistent times regardless of timezone suffix', () => {
      // All of these represent "user wants 10:45"
      expect(toLocalTime('2026-01-15T10:45:00Z')).toBe('10:45')
      expect(toLocalTime('2026-01-15T10:45:00+00:00')).toBe('10:45')
      expect(toLocalTime('2026-01-15T10:45:00')).toBe('10:45')
      expect(toLocalTime('10:45')).toBe('10:45')
    })

    it('should survive JSON serialization round-trip', () => {
      // This tests that LocalTime survives being saved to database
      const originalTime = toLocalTime('10:45')
      const serialized = JSON.stringify({ time: originalTime })
      const parsed = JSON.parse(serialized) as { time: string }

      // After round-trip, we can recreate the same LocalTime
      const restored = toLocalTime(parsed.time)
      expect(restored).toBe('10:45')
    })
  })
})
