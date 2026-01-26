/**
 * Type-safe date and time string types
 *
 * These are "branded" string types that help ensure correct formatting
 * without runtime overhead. They're structurally strings but nominally
 * distinct for type checking.
 */

/**
 * Local time in "HH:MM" 24-hour format (e.g., "09:30", "14:00")
 */
export type LocalTime = string & { readonly __brand: 'LocalTime' }

/**
 * Local date in "YYYY-MM-DD" format (e.g., "2024-01-15")
 */
export type LocalDate = string & { readonly __brand: 'LocalDate' }

/**
 * Helper to create a LocalTime from a string (validates format)
 */
export function toLocalTime(time: string): LocalTime {
  if (!/^\d{2}:\d{2}$/.test(time)) {
    throw new Error(`Invalid LocalTime format: "${time}". Expected "HH:MM"`)
  }
  return time as LocalTime
}

/**
 * Helper to create a LocalDate from a string (validates format)
 */
export function toLocalDate(date: string): LocalDate {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(`Invalid LocalDate format: "${date}". Expected "YYYY-MM-DD"`)
  }
  return date as LocalDate
}

/**
 * Get current date as LocalDate
 */
export function getCurrentLocalDate(): LocalDate {
  return new Date().toISOString().split('T')[0] as LocalDate
}

/**
 * Get current time as LocalTime
 */
export function getCurrentLocalTime(): LocalTime {
  const now = new Date()
  const hours = now.getHours().toString().padStart(2, '0')
  const minutes = now.getMinutes().toString().padStart(2, '0')
  return `${hours}:${minutes}` as LocalTime
}
