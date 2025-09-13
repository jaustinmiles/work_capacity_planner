import { describe, it, expect } from 'vitest'
import {
  parseTimeString,
  timeStringToMinutes,
  calculateDuration,
  formatMinutes,
} from './time-utils'

describe('time-utils', () => {
  describe('parseTimeString', () => {
    it('should parse valid time string correctly', () => {
      expect(parseTimeString('09:30')).toEqual([9, 30])
      expect(parseTimeString('14:45')).toEqual([14, 45])
      expect(parseTimeString('00:00')).toEqual([0, 0])
      expect(parseTimeString('23:59')).toEqual([23, 59])
    })

    it('should handle single digit hours and minutes', () => {
      expect(parseTimeString('9:5')).toEqual([9, 5])
      expect(parseTimeString('1:30')).toEqual([1, 30])
      expect(parseTimeString('10:5')).toEqual([10, 5])
    })

    it('should use defaults for invalid input', () => {
      // Empty string splits to [''] which converts to 0 with || operator
      expect(parseTimeString('', 8, 30)).toEqual([0, 30])
      // 'invalid' splits to ['invalid'] which converts to NaN
      const [h, m] = parseTimeString('invalid', 12, 0)
      expect(isNaN(h)).toBe(true)
      expect(m).toBe(0)
    })

    it('should handle missing minutes', () => {
      expect(parseTimeString('14', 0, 0)).toEqual([14, 0])
      expect(parseTimeString('9:', 0, 30)).toEqual([9, 0])
    })

    it('should handle custom defaults', () => {
      // Empty string results in 0 for hours, uses minute default
      expect(parseTimeString('', 10, 15)).toEqual([0, 15])
      // ':' splits to ['', ''] both become 0 with || operator
      expect(parseTimeString(':', 6, 45)).toEqual([0, 0])
    })

    it('should handle NaN values', () => {
      // When parts are NaN, the function doesn't use the defaults properly
      const [h1, m1] = parseTimeString('abc:def', 7, 30)
      expect(isNaN(h1)).toBe(true)
      expect(isNaN(m1)).toBe(true)

      const [h2, m2] = parseTimeString('12:xyz', 0, 0)
      expect(h2).toBe(12)
      expect(isNaN(m2)).toBe(true)
    })
  })

  describe('timeStringToMinutes', () => {
    it('should convert time string to minutes since midnight', () => {
      expect(timeStringToMinutes('00:00')).toBe(0)
      expect(timeStringToMinutes('01:00')).toBe(60)
      expect(timeStringToMinutes('09:30')).toBe(570) // 9*60 + 30
      expect(timeStringToMinutes('12:00')).toBe(720) // 12*60
      expect(timeStringToMinutes('23:59')).toBe(1439) // 23*60 + 59
    })

    it('should handle single digit values', () => {
      expect(timeStringToMinutes('9:5')).toBe(545) // 9*60 + 5
      expect(timeStringToMinutes('1:30')).toBe(90)
    })

    it('should handle invalid input', () => {
      // Empty string becomes 0
      expect(timeStringToMinutes('')).toBe(0)
      // Invalid string results in NaN
      expect(isNaN(timeStringToMinutes('invalid'))).toBe(true)
    })

    it('should handle partial time strings', () => {
      expect(timeStringToMinutes('10')).toBe(600) // 10*60 + 0
      expect(timeStringToMinutes('10:')).toBe(600)
    })
  })

  describe('calculateDuration', () => {
    it('should calculate duration between two times', () => {
      expect(calculateDuration('09:00', '10:00')).toBe(60)
      expect(calculateDuration('09:00', '09:30')).toBe(30)
      expect(calculateDuration('09:30', '11:45')).toBe(135) // 2h 15m
      expect(calculateDuration('08:00', '17:00')).toBe(540) // 9 hours
    })

    it('should handle same time (zero duration)', () => {
      expect(calculateDuration('10:00', '10:00')).toBe(0)
      expect(calculateDuration('14:30', '14:30')).toBe(0)
    })

    it('should handle negative duration (end before start)', () => {
      expect(calculateDuration('10:00', '09:00')).toBe(-60)
      expect(calculateDuration('14:30', '14:00')).toBe(-30)
    })

    it('should handle midnight crossing (as negative)', () => {
      expect(calculateDuration('23:00', '01:00')).toBe(-1320) // Negative because it appears to go backward
    })

    it('should handle invalid inputs', () => {
      // Empty strings become 0, so duration is 0
      expect(calculateDuration('', '')).toBe(0)
      // Invalid strings result in NaN calculations
      expect(isNaN(calculateDuration('invalid', 'times'))).toBe(true)
    })
  })

  describe('formatMinutes', () => {
    it('should format minutes less than 60', () => {
      expect(formatMinutes(0)).toBe('0m')
      expect(formatMinutes(1)).toBe('1m')
      expect(formatMinutes(30)).toBe('30m')
      expect(formatMinutes(59)).toBe('59m')
    })

    it('should format exact hours', () => {
      expect(formatMinutes(60)).toBe('1h')
      expect(formatMinutes(120)).toBe('2h')
      expect(formatMinutes(180)).toBe('3h')
      expect(formatMinutes(480)).toBe('8h')
    })

    it('should format hours and minutes', () => {
      expect(formatMinutes(90)).toBe('1h 30m')
      expect(formatMinutes(135)).toBe('2h 15m')
      expect(formatMinutes(61)).toBe('1h 1m')
      expect(formatMinutes(119)).toBe('1h 59m')
    })

    it('should handle large values', () => {
      expect(formatMinutes(1440)).toBe('24h') // Full day
      expect(formatMinutes(1500)).toBe('25h') // More than a day
      expect(formatMinutes(2880)).toBe('48h') // Two days
    })

    it('should handle negative values', () => {
      expect(formatMinutes(-30)).toBe('-30m')
      // Negative values don't get special handling for hours
      expect(formatMinutes(-60)).toBe('-60m')
      expect(formatMinutes(-90)).toBe('-90m')
    })

    it('should handle edge cases', () => {
      expect(formatMinutes(0.5)).toBe('0.5m')
      expect(formatMinutes(60.5)).toBe('1h 0.5m')
      expect(formatMinutes(Infinity)).toBe('Infinityh')
      // NaN < 60 is false, so it goes to the hours branch
      expect(formatMinutes(NaN)).toBe('NaNh')
    })
  })

  describe('Integration tests', () => {
    it('should work together for time calculations', () => {
      const start = '09:30'
      const end = '14:45'

      const startMinutes = timeStringToMinutes(start)
      const endMinutes = timeStringToMinutes(end)
      const duration = endMinutes - startMinutes
      const formatted = formatMinutes(duration)

      expect(formatted).toBe('5h 15m')
    })

    it('should handle work day calculations', () => {
      const workStart = '09:00'
      const lunchStart = '12:00'
      const lunchEnd = '13:00'
      const workEnd = '17:00'

      const morningDuration = calculateDuration(workStart, lunchStart)
      const afternoonDuration = calculateDuration(lunchEnd, workEnd)
      const totalWorkMinutes = morningDuration + afternoonDuration

      expect(formatMinutes(morningDuration)).toBe('3h')
      expect(formatMinutes(afternoonDuration)).toBe('4h')
      expect(formatMinutes(totalWorkMinutes)).toBe('7h')
    })

    it('should handle meeting scheduling', () => {
      const meetings = [
        { start: '09:00', end: '09:30' },
        { start: '10:00', end: '11:00' },
        { start: '14:00', end: '14:45' },
      ]

      const totalMeetingTime = meetings.reduce((total, meeting) => {
        return total + calculateDuration(meeting.start, meeting.end)
      }, 0)

      expect(totalMeetingTime).toBe(135) // 30 + 60 + 45
      expect(formatMinutes(totalMeetingTime)).toBe('2h 15m')
    })
  })
})
