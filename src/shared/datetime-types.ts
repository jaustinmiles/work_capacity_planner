/**
 * Branded (Nominal) DateTime Types
 *
 * Type-safe local time and date types following the id-types.ts pattern.
 * These represent user-local times WITHOUT timezone information.
 *
 * Benefits:
 * - Prevents accidentally mixing UTC and local times
 * - Self-documenting function signatures
 * - Validation enforced at ingestion points
 * - Zero runtime overhead (brands erased during compilation)
 */

// =============================================================================
// Brand Helper Type
// =============================================================================

type Brand<K, T> = K & { readonly __brand: T }

// =============================================================================
// LocalTime Type
// =============================================================================

/**
 * Type-safe local time representation.
 * Format: "HH:MM" (24-hour, e.g., "09:30", "14:45", "23:59")
 *
 * This represents a time in the user's local timezone.
 * It has NO timezone information - it's purely "wall clock" time.
 */
export type LocalTime = Brand<string, 'LocalTime'>

/** Regex pattern for valid LocalTime format */
const LOCAL_TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/

/**
 * Factory function to create a LocalTime from various inputs.
 * Validates format and normalizes to "HH:MM".
 *
 * Accepts:
 * - "HH:MM" strings (e.g., "09:30")
 * - "H:MM" strings (e.g., "9:30" → "09:30")
 * - ISO datetime strings (extracts time portion as LOCAL time)
 * - Date objects (extracts local time)
 *
 * @throws Error if input cannot be parsed to valid time
 */
export function toLocalTime(input: string | Date): LocalTime {
  if (input instanceof Date) {
    if (isNaN(input.getTime())) {
      throw new Error('Invalid LocalTime: Date object is invalid')
    }
    const hours = input.getHours().toString().padStart(2, '0')
    const minutes = input.getMinutes().toString().padStart(2, '0')
    return `${hours}:${minutes}` as LocalTime
  }

  if (typeof input !== 'string' || !input) {
    throw new Error('Invalid LocalTime: must be a non-empty string or Date')
  }

  // Already in HH:MM format
  if (LOCAL_TIME_PATTERN.test(input)) {
    return input as LocalTime
  }

  // Handle H:MM format (single digit hour)
  const shortMatch = input.match(/^(\d):([0-5]\d)$/)
  if (shortMatch) {
    return `0${shortMatch[1]}:${shortMatch[2]}` as LocalTime
  }

  // Handle ISO datetime strings - extract time portion
  // IMPORTANT: We treat the time portion as LOCAL time (user's intent)
  const isoMatch = input.match(/T(\d{2}):(\d{2})/)
  if (isoMatch) {
    const normalized = `${isoMatch[1]}:${isoMatch[2]}`
    if (LOCAL_TIME_PATTERN.test(normalized)) {
      return normalized as LocalTime
    }
  }

  // Handle 12-hour format with AM/PM
  const parsed = parseTimeString(input)
  if (parsed) {
    return parsed
  }

  throw new Error(`Invalid LocalTime format: "${input}". Expected "HH:MM" (24-hour format)`)
}

/**
 * Type guard to check if a value is a valid LocalTime.
 */
export function isLocalTime(value: unknown): value is LocalTime {
  return typeof value === 'string' && LOCAL_TIME_PATTERN.test(value)
}

/**
 * Parse 12-hour time strings to LocalTime.
 * Handles: "9:30 AM", "9:30am", "12:00 PM", etc.
 */
function parseTimeString(input: string): LocalTime | null {
  const trimmed = input.trim()

  const ampmMatch = trimmed.match(/^(\d{1,2}):(\d{2})\s*(am|pm)$/i)
  if (ampmMatch && ampmMatch[1] && ampmMatch[2] && ampmMatch[3]) {
    let hours = parseInt(ampmMatch[1], 10)
    const minutes = parseInt(ampmMatch[2], 10)
    const isPM = ampmMatch[3].toLowerCase() === 'pm'

    if (hours < 1 || hours > 12 || minutes > 59) return null

    if (isPM && hours !== 12) hours += 12
    if (!isPM && hours === 12) hours = 0

    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}` as LocalTime
  }

  return null
}

// =============================================================================
// Internal Parsing Helpers
// =============================================================================

/**
 * Parse LocalTime into hours and minutes components.
 * Safe to use because LocalTime is validated on creation.
 */
function parseLocalTime(time: LocalTime): { hours: number; minutes: number } {
  const parts = time.split(':')
  return {
    hours: parseInt(parts[0] ?? '0', 10),
    minutes: parseInt(parts[1] ?? '0', 10),
  }
}

/**
 * Parse LocalDate into year, month, day components.
 * Safe to use because LocalDate is validated on creation.
 */
function parseLocalDate(date: LocalDate): { year: number; month: number; day: number } {
  const parts = date.split('-')
  return {
    year: parseInt(parts[0] ?? '0', 10),
    month: parseInt(parts[1] ?? '1', 10),
    day: parseInt(parts[2] ?? '1', 10),
  }
}

// =============================================================================
// LocalDate Type
// =============================================================================

/**
 * Type-safe local date representation.
 * Format: "YYYY-MM-DD" (e.g., "2025-11-23")
 *
 * This represents a calendar date with NO timezone information.
 */
export type LocalDate = Brand<string, 'LocalDate'>

/** Regex pattern for valid LocalDate format */
const LOCAL_DATE_PATTERN = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/

/**
 * Factory function to create a LocalDate from various inputs.
 *
 * Accepts:
 * - "YYYY-MM-DD" strings
 * - ISO datetime strings (extracts date portion)
 * - Date objects (extracts local date)
 *
 * @throws Error if input cannot be parsed to valid date
 */
export function toLocalDate(input: string | Date): LocalDate {
  if (input instanceof Date) {
    if (isNaN(input.getTime())) {
      throw new Error('Invalid LocalDate: Date object is invalid')
    }
    const year = input.getFullYear()
    const month = (input.getMonth() + 1).toString().padStart(2, '0')
    const day = input.getDate().toString().padStart(2, '0')
    return `${year}-${month}-${day}` as LocalDate
  }

  if (typeof input !== 'string' || !input) {
    throw new Error('Invalid LocalDate: must be a non-empty string or Date')
  }

  // Already in YYYY-MM-DD format
  if (LOCAL_DATE_PATTERN.test(input)) {
    return input as LocalDate
  }

  // Handle ISO datetime strings - extract date portion
  const isoMatch = input.match(/^(\d{4}-\d{2}-\d{2})(?:T|$)/)
  if (isoMatch && isoMatch[1] && LOCAL_DATE_PATTERN.test(isoMatch[1])) {
    return isoMatch[1] as LocalDate
  }

  throw new Error(`Invalid LocalDate format: "${input}". Expected "YYYY-MM-DD"`)
}

/**
 * Type guard to check if a value is a valid LocalDate.
 */
export function isLocalDate(value: unknown): value is LocalDate {
  return typeof value === 'string' && LOCAL_DATE_PATTERN.test(value)
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Get current local time as LocalTime.
 */
export function getCurrentLocalTime(now?: Date): LocalTime {
  return toLocalTime(now || new Date())
}

/**
 * Get current local date as LocalDate.
 */
export function getCurrentLocalDate(now?: Date): LocalDate {
  return toLocalDate(now || new Date())
}

/**
 * Create a Date object from LocalDate and LocalTime.
 * This is the ONLY place where we create timezone-aware Date objects
 * from our branded types.
 */
export function localDateTimeToDate(date: LocalDate, time: LocalTime): Date {
  const { year, month, day } = parseLocalDate(date)
  const { hours, minutes } = parseLocalTime(time)
  return new Date(year, month - 1, day, hours, minutes, 0, 0)
}

/**
 * Compare two LocalTime values.
 * Returns: -1 if a < b, 0 if equal, 1 if a > b
 */
export function compareLocalTime(a: LocalTime, b: LocalTime): -1 | 0 | 1 {
  if (a < b) return -1
  if (a > b) return 1
  return 0
}

/**
 * Check if a LocalTime is between start and end (inclusive).
 * Handles overnight ranges (e.g., 23:00 to 01:00).
 */
export function isTimeBetween(time: LocalTime, start: LocalTime, end: LocalTime): boolean {
  if (start <= end) {
    return time >= start && time <= end
  } else {
    // Overnight range
    return time >= start || time <= end
  }
}

/**
 * Calculate duration in minutes between two LocalTime values.
 * Assumes same day (doesn't handle overnight).
 */
export function getMinutesBetween(start: LocalTime, end: LocalTime): number {
  const startParts = parseLocalTime(start)
  const endParts = parseLocalTime(end)
  return (endParts.hours * 60 + endParts.minutes) - (startParts.hours * 60 + startParts.minutes)
}

/**
 * Add minutes to a LocalTime, returning a new LocalTime.
 * Wraps around midnight (e.g., 23:30 + 60 = 00:30).
 */
export function addMinutesToTime(time: LocalTime, minutes: number): LocalTime {
  const { hours, minutes: mins } = parseLocalTime(time)
  const totalMinutes = (hours * 60 + mins + minutes) % (24 * 60)
  const normalizedMinutes = totalMinutes < 0 ? totalMinutes + 24 * 60 : totalMinutes
  const newHours = Math.floor(normalizedMinutes / 60)
  const newMins = normalizedMinutes % 60
  return `${newHours.toString().padStart(2, '0')}:${newMins.toString().padStart(2, '0')}` as LocalTime
}

/**
 * Format LocalTime for display (e.g., "2:30 PM").
 */
export function formatTimeForDisplay(time: LocalTime, use24Hour = false): string {
  if (use24Hour) return time

  const { hours, minutes } = parseLocalTime(time)
  const isPM = hours >= 12
  const displayHours = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours
  return `${displayHours}:${minutes.toString().padStart(2, '0')} ${isPM ? 'PM' : 'AM'}`
}

/**
 * Format LocalDate for display using locale.
 */
export function formatDateForDisplay(date: LocalDate, locale?: string): string {
  const { year, month, day } = parseLocalDate(date)
  // Create at noon to avoid timezone edge cases
  const dateObj = new Date(year, month - 1, day, 12, 0, 0)
  return dateObj.toLocaleDateString(locale)
}

/**
 * Convert LocalTime to minutes since midnight.
 * Useful for calculations and comparisons.
 */
export function localTimeToMinutes(time: LocalTime): number {
  const { hours, minutes } = parseLocalTime(time)
  return hours * 60 + minutes
}

/**
 * Convert minutes since midnight to LocalTime.
 * @throws Error if minutes is out of range (0-1439)
 */
export function minutesToLocalTime(minutes: number): LocalTime {
  if (minutes < 0 || minutes >= 24 * 60) {
    throw new Error(`Invalid minutes value: ${minutes}. Must be 0-1439`)
  }
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}` as LocalTime
}
