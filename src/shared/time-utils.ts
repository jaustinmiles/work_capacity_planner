/**
 * Safely parse time string in "HH:MM" format
 * Returns [hours, minutes] with defaults if parsing fails
 */
export function parseTimeString(timeStr: string, defaultHour = 0, defaultMinute = 0): [number, number] {
  const parts = timeStr.split(':').map(Number)
  const hours = parts[0] ?? defaultHour
  const minutes = parts[1] ?? defaultMinute
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
 * Safely parse date string in "YYYY-MM-DD" format
 * Returns [year, month, day] with defaults if parsing fails
 */
export function parseDateString(dateStr: string): [number, number, number] {
  const parts = dateStr.split('-').map(Number)
  return [
    parts[0] ?? new Date().getFullYear(),
    parts[1] ?? 1,
    parts[2] ?? 1,
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
