import { describe, it, expect } from 'vitest'
import { toLocalTime, toLocalDate, getCurrentLocalDate, getCurrentLocalTime } from '../datetime-types'
import type { LocalTime, LocalDate } from '../datetime-types'

// =============================================================================
// toLocalTime
// =============================================================================

describe('toLocalTime', () => {
  it('accepts valid HH:MM format', () => {
    expect(toLocalTime('09:30')).toBe('09:30')
    expect(toLocalTime('14:00')).toBe('14:00')
    expect(toLocalTime('00:00')).toBe('00:00')
    expect(toLocalTime('23:59')).toBe('23:59')
  })

  it('throws for invalid format — missing leading zero', () => {
    expect(() => toLocalTime('9:30')).toThrow('Invalid LocalTime format')
  })

  it('throws for HH:MM:SS format', () => {
    expect(() => toLocalTime('09:30:00')).toThrow('Invalid LocalTime format')
  })

  it('throws for empty string', () => {
    expect(() => toLocalTime('')).toThrow('Invalid LocalTime format')
  })

  it('throws for non-time string', () => {
    expect(() => toLocalTime('hello')).toThrow('Invalid LocalTime format')
  })

  it('throws for format with spaces', () => {
    expect(() => toLocalTime(' 09:30')).toThrow('Invalid LocalTime format')
  })
})

// =============================================================================
// toLocalDate
// =============================================================================

describe('toLocalDate', () => {
  it('accepts valid YYYY-MM-DD format', () => {
    expect(toLocalDate('2024-01-15')).toBe('2024-01-15')
    expect(toLocalDate('2024-12-31')).toBe('2024-12-31')
    expect(toLocalDate('1999-01-01')).toBe('1999-01-01')
  })

  it('throws for MM-DD-YYYY format', () => {
    expect(() => toLocalDate('01-15-2024')).toThrow('Invalid LocalDate format')
  })

  it('throws for DD/MM/YYYY format', () => {
    expect(() => toLocalDate('15/01/2024')).toThrow('Invalid LocalDate format')
  })

  it('throws for empty string', () => {
    expect(() => toLocalDate('')).toThrow('Invalid LocalDate format')
  })

  it('throws for non-date string', () => {
    expect(() => toLocalDate('not-a-date')).toThrow('Invalid LocalDate format')
  })

  it('throws for ISO datetime format', () => {
    expect(() => toLocalDate('2024-01-15T10:30:00Z')).toThrow('Invalid LocalDate format')
  })
})

// =============================================================================
// getCurrentLocalDate
// =============================================================================

describe('getCurrentLocalDate', () => {
  it('returns a string matching YYYY-MM-DD format', () => {
    const result = getCurrentLocalDate()
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('returns a branded LocalDate type', () => {
    const result: LocalDate = getCurrentLocalDate()
    expect(typeof result).toBe('string')
  })
})

// =============================================================================
// getCurrentLocalTime
// =============================================================================

describe('getCurrentLocalTime', () => {
  it('returns a string matching HH:MM format', () => {
    const result = getCurrentLocalTime()
    expect(result).toMatch(/^\d{2}:\d{2}$/)
  })

  it('returns a branded LocalTime type', () => {
    const result: LocalTime = getCurrentLocalTime()
    expect(typeof result).toBe('string')
  })
})
