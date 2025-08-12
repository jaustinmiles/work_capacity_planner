/**
 * Format duration from minutes to human-readable string
 * @param minutes - Duration in minutes
 * @returns Formatted string like "2h 30m" or "45m"
 */
export function formatDuration(minutes: number): string {
  if (minutes === 0) return '0m'
  
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  
  if (hours > 0) {
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`
  }
  return `${mins}m`
}

/**
 * Format date to local date string
 * @param date - Date object or string
 * @returns Formatted date string
 */
export function formatDate(date: Date | string): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date
  return dateObj.toLocaleDateString()
}

/**
 * Format time to local time string
 * @param date - Date object or string
 * @returns Formatted time string (e.g., "2:30 PM")
 */
export function formatTime(date: Date | string): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date
  return dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

/**
 * Format date and time together
 * @param date - Date object or string
 * @returns Formatted date and time string
 */
export function formatDateTime(date: Date | string): string {
  return `${formatDate(date)} ${formatTime(date)}`
}

/**
 * Get relative time string (e.g., "2 hours ago", "in 3 days")
 * @param date - Date object or string
 * @returns Relative time string
 */
export function getRelativeTime(date: Date | string): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date
  const now = new Date()
  const diffMs = dateObj.getTime() - now.getTime()
  const diffMins = Math.abs(diffMs) / 60000
  
  const isFuture = diffMs > 0
  const prefix = isFuture ? 'in ' : ''
  const suffix = isFuture ? '' : ' ago'
  
  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${prefix}${Math.floor(diffMins)} minute${Math.floor(diffMins) === 1 ? '' : 's'}${suffix}`
  if (diffMins < 1440) {
    const hours = Math.floor(diffMins / 60)
    return `${prefix}${hours} hour${hours === 1 ? '' : 's'}${suffix}`
  }
  
  const days = Math.floor(diffMins / 1440)
  return `${prefix}${days} day${days === 1 ? '' : 's'}${suffix}`
}

/**
 * Add minutes to a date
 * @param date - Base date
 * @param minutes - Minutes to add
 * @returns New date object
 */
export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60000)
}

/**
 * Calculate minutes between two dates
 * @param start - Start date
 * @param end - End date
 * @returns Minutes between dates
 */
export function minutesBetween(start: Date | string, end: Date | string): number {
  const startDate = typeof start === 'string' ? new Date(start) : start
  const endDate = typeof end === 'string' ? new Date(end) : end
  return Math.floor((endDate.getTime() - startDate.getTime()) / 60000)
}