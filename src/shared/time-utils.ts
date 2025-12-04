/**
 * Safely parse time string in "HH:MM" format
 * Returns [hours, minutes] with defaults if parsing fails
 */
export function parseTimeString(timeStr: string, defaultHour = 0, defaultMinute = 0): [number, number] {
  const parts = timeStr.split(':').map(Number)
  const hours = (parts.length > 0 && !Number.isNaN(parts[0])) ? parts[0] : defaultHour
  const minutes = (parts.length > 1 && !Number.isNaN(parts[1])) ? parts[1] : defaultMinute
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
export function formatElapsedWithSeconds(startTime: Date, currentTime: Date = new Date()): string {
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
  return [
    (parts.length > 0 && !Number.isNaN(parts[0])) ? parts[0] : new Date().getFullYear(),
    (parts.length > 1 && !Number.isNaN(parts[1])) ? parts[1] : 1,
    (parts.length > 2 && !Number.isNaN(parts[2])) ? parts[2] : 1,
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
 * IMPORTANT: For ISO strings, extracts the time portion directly without timezone conversion.
 * This is intentional because the AI provides times that represent the user's intended local time
 * encoded in the ISO format (e.g., "2025-11-26T19:30:00Z" means "7:30 PM" in user's local time).
 *
 * @param input - ISO datetime string (e.g., "2025-11-26T19:30:00Z") or Date object
 * @returns HH:MM string (e.g., "19:30")
 */
export function extractTimeFromISO(input: string | Date): string {
  if (input instanceof Date) {
    return formatTimeHHMM(input)
  }

  // Match ISO datetime format: extract HH:MM from the time portion
  // Handles: "2025-11-26T19:30:00Z", "2025-11-26T19:30:00.000Z", "2025-11-26T19:30:00+00:00"
  const isoMatch = input.match(/T(\d{2}):(\d{2})/)
  if (isoMatch) {
    return `${isoMatch[1]}:${isoMatch[2]}`
  }

  // Fallback: try to parse as time string directly (e.g., "19:30")
  const timeMatch = input.match(/^(\d{2}):(\d{2})$/)
  if (timeMatch) {
    return input
  }

  // Last resort: parse as Date (will apply timezone conversion)
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
    const [, year, month, day] = dateMatch
    // Create date at noon local time to avoid timezone edge cases
    const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day), 12, 0, 0)
    return date.toLocaleDateString(locale)
  }

  // For ISO datetime strings, extract just the date portion
  const isoMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})T/)
  if (isoMatch) {
    const [, year, month, day] = isoMatch
    const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day), 12, 0, 0)
    return date.toLocaleDateString(locale)
  }

  // Fallback for other formats
  return new Date(dateStr).toLocaleDateString(locale)
}
