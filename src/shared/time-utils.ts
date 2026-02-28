import { getCurrentTime } from './time-provider'

/**
 * Safely parse time string in "HH:MM" format
 * Returns [hours, minutes] with defaults if parsing fails
 */
export function parseTimeString(timeStr: string, defaultHour = 0, defaultMinute = 0): [number, number] {
  const parts = timeStr.split(':').map(Number)
  const rawHours = parts[0]
  const rawMinutes = parts[1]
  const hours = (rawHours !== undefined && !Number.isNaN(rawHours)) ? rawHours : defaultHour
  const minutes = (rawMinutes !== undefined && !Number.isNaN(rawMinutes)) ? rawMinutes : defaultMinute
  return [hours, minutes]
}

/**
 * Convert time string "HH:MM" to minutes since midnight
 */
export function timeStringToMinutes(timeStr: string): number {
  const [hours, minutes] = parseTimeString(timeStr)
  return hours * 60 + minutes
}

/**
 * Calculate duration in minutes between two time strings
 */
export function calculateDuration(startTime: string, endTime: string): number {
  return timeStringToMinutes(endTime) - timeStringToMinutes(startTime)
}

/**
 * Calculate duration in minutes between two Date objects
 * Rounds to nearest minute. Returns 0 if end is before start.
 */
export function calculateMinutesBetweenDates(start: Date, end: Date): number {
  const diffMs = end.getTime() - start.getTime()
  return Math.max(0, Math.round(diffMs / 60000))
}

/**
 * Format minutes to readable time string
 */
export function formatMinutes(minutes: number): string {
  if (minutes < 60) {
    return `${minutes}m`
  }
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`
}

/**
 * Format elapsed time with seconds for real-time display
 * Used for active sessions to show counting seconds
 */
export function formatElapsedWithSeconds(startTime: Date, currentTime: Date = getCurrentTime()): string {
  const elapsedMs = currentTime.getTime() - startTime.getTime()
  const totalSeconds = Math.floor(elapsedMs / 1000)

  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`
  } else if (minutes > 0) {
    return `${minutes}m ${seconds}s`
  }
  return `${seconds}s`
}

/**
 * Safely parse date string in "YYYY-MM-DD" format
 * Returns [year, month, day] with defaults if parsing fails
 */
export function parseDateString(dateStr: string): [number, number, number] {
  const parts = dateStr.split('-').map(Number)
  const rawYear = parts[0]
  const rawMonth = parts[1]
  const rawDay = parts[2]
  return [
    (rawYear !== undefined && !Number.isNaN(rawYear)) ? rawYear : new Date().getFullYear(),
    (rawMonth !== undefined && !Number.isNaN(rawMonth)) ? rawMonth : 1,
    (rawDay !== undefined && !Number.isNaN(rawDay)) ? rawDay : 1,
  ]
}

/**
 * Format Date to HH:mm string
 */
export function formatTimeHHMM(date: Date): string {
  const hours = date.getHours().toString().padStart(2, '0')
  const minutes = date.getMinutes().toString().padStart(2, '0')
  return `${hours}:${minutes}`
}

/**
 * Format hours and minutes into HH:mm string
 */
export function formatTimeFromParts(hours: number, minutes: number): string {
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`
}

/**
 * Calculate remaining time in minutes until a wait period expires
 * Returns negative if already expired
 */
export function calculateRemainingWaitTime(
  completedAt: Date,
  asyncWaitMinutes: number,
  currentTime: Date = new Date(),
): number {
  const waitEndTime = completedAt.getTime() + asyncWaitMinutes * 60000
  const remainingMs = waitEndTime - currentTime.getTime()
  // Return 0 if expired, never negative
  return Math.max(0, Math.ceil(remainingMs / 60000))
}

/**
 * Format countdown time with appropriate units
 * Examples: "2h 30m", "45m", "5m", "Ready"
 */
export function formatCountdown(remainingMinutes: number): string {
  if (remainingMinutes <= 0) return 'Ready'
  return formatMinutes(remainingMinutes) + ' remaining'
}

/**
 * Get human-readable wait status with countdown
 */
export function getWaitStatus(
  completedAt: Date,
  asyncWaitMinutes: number,
  currentTime: Date = new Date(),
): { expired: boolean; remainingMinutes: number; displayText: string } {
  const remainingMinutes = calculateRemainingWaitTime(completedAt, asyncWaitMinutes, currentTime)
  return {
    expired: remainingMinutes <= 0,
    remainingMinutes: Math.max(0, remainingMinutes),
    displayText: formatCountdown(remainingMinutes),
  }
}

/**
 * Format Date to YYYY-MM-DD string
 * This is the standard date format used throughout the application
 */
export function dateToYYYYMMDD(date: Date): string {
  const year = date.getFullYear()
  const month = (date.getMonth() + 1).toString().padStart(2, '0')
  const day = date.getDate().toString().padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Parse a time string (HH:MM) and apply it to a specific date
 * Returns a new Date object with the date from baseDate and time from timeStr
 */
export function parseTimeOnDate(baseDate: Date, timeStr: string): Date {
  const [hours, minutes] = parseTimeString(timeStr)
  const result = new Date(baseDate)
  result.setHours(hours, minutes, 0, 0)
  return result
}

/**
 * Add days to a date
 * Returns a new Date object
 */
export function addDays(date: Date, days: number): Date {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

/**
 * Check if two dates are the same day (ignoring time)
 */
export function isSameDay(date1: Date, date2: Date): boolean {
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  )
}

/**
 * Extract HH:MM time string from an ISO datetime string or Date object
 *
 * Timezone handling:
 * - Date objects: Extract local time directly
 * - Strings WITH timezone (Z or +/-offset): Parse to Date, then extract LOCAL time
 * - Strings WITHOUT timezone: Extract directly (already represents local time)
 *
 * @param input - ISO datetime string or Date object
 * @returns HH:MM string in local time (e.g., "09:30")
 */
export function extractTimeFromISO(input: string | Date): string {
  if (input instanceof Date) {
    return formatTimeHHMM(input)
  }

  // If string has timezone marker, parse to Date first to get LOCAL time
  // "2025-01-25T17:00:00Z" in Seattle (UTC-8) → 09:00 local
  if (input.endsWith('Z') || /[+-]\d{2}:\d{2}/.test(input)) {
    const date = new Date(input)
    if (!isNaN(date.getTime())) {
      return formatTimeHHMM(date)
    }
  }

  // No timezone = already local time, extract directly
  // "2025-01-25T09:00:00" → "09:00"
  const isoMatch = input.match(/T(\d{2}):(\d{2})/)
  if (isoMatch) {
    return `${isoMatch[1]}:${isoMatch[2]}`
  }

  // Fallback: try to parse as time string directly (e.g., "09:30")
  const timeMatch = input.match(/^(\d{2}):(\d{2})$/)
  if (timeMatch) {
    return input
  }

  // Last resort: parse as Date
  return formatTimeHHMM(new Date(input))
}

/**
 * Format a YYYY-MM-DD date string for display without timezone conversion
 *
 * IMPORTANT: Using new Date("2025-11-26") parses as UTC midnight, which can
 * display as the previous day in US timezones. This function avoids that issue.
 *
 * @param dateStr - Date string in YYYY-MM-DD format
 * @param locale - Locale for formatting (default: user's locale)
 * @returns Formatted date string (e.g., "11/26/2025")
 */
export function formatDateStringForDisplay(dateStr: string, locale?: string): string {
  // Check if it's a YYYY-MM-DD format
  const dateMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (dateMatch) {
    const year = dateMatch[1] ?? '2000'
    const month = dateMatch[2] ?? '01'
    const day = dateMatch[3] ?? '01'
    // Create date at noon local time to avoid timezone edge cases
    const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day), 12, 0, 0)
    return date.toLocaleDateString(locale)
  }

  // For ISO datetime strings, extract just the date portion
  const isoMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})T/)
  if (isoMatch) {
    const year = isoMatch[1] ?? '2000'
    const month = isoMatch[2] ?? '01'
    const day = isoMatch[3] ?? '01'
    const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day), 12, 0, 0)
    return date.toLocaleDateString(locale)
  }

  // Fallback for other formats
  return new Date(dateStr).toLocaleDateString(locale)
}

/**
 * Safely parse a date string to Date object
 * Returns undefined if parsing fails
 *
 * Timezone handling:
 * - Strings WITH timezone (Z or +/-offset): Parse with new Date() to respect UTC
 * - Strings WITHOUT timezone: Treat as local time by extracting components
 *
 * @param dateStr - Date string to parse (ISO format, YYYY-MM-DD, or other Date-parseable format)
 * @returns Date object or undefined if parsing fails
 */
export function safeParseDateString(dateStr: string | undefined): Date | undefined {
  if (!dateStr) return undefined
  try {
    // If string has timezone marker (Z or +/-offset), parse the FULL string
    // This respects UTC and lets JavaScript handle the conversion to local
    if (dateStr.endsWith('Z') || /[+-]\d{2}:\d{2}/.test(dateStr)) {
      const date = new Date(dateStr)
      return isNaN(date.getTime()) ? undefined : date
    }

    // No timezone = treat as local time
    // Extract components and create local Date
    const isoMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?/)
    if (isoMatch) {
      const [, year, month, day, hours, minutes, seconds] = isoMatch
      const date = new Date(
        parseInt(year || '0'),
        parseInt(month || '1') - 1,
        parseInt(day || '1'),
        parseInt(hours || '0'),
        parseInt(minutes || '0'),
        parseInt(seconds || '0'),
      )
      return isNaN(date.getTime()) ? undefined : date
    }

    // Fallback for other date formats
    const date = new Date(dateStr)
    return isNaN(date.getTime()) ? undefined : date
  } catch {
    return undefined
  }
}
