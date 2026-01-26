/**
 * Display formatting utilities for amendment cards
 *
 * These functions extract business logic from TSX components into testable utilities.
 * All functions handle both string and Date inputs gracefully.
 */

import { safeParseDateString } from '@shared/time-utils'

/**
 * Format a date for display in amendment cards
 * Returns format like "Mon, Jan 24"
 *
 * @param date - Date object, ISO string, or undefined
 * @returns Formatted date string or null if invalid/missing
 */
export function formatTimeLogDate(date: string | Date | undefined): string | null {
  if (!date) return null

  const dateObj = typeof date === 'string' ? safeParseDateString(date) : date
  if (!dateObj || isNaN(dateObj.getTime())) return null

  return dateObj.toLocaleDateString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

/**
 * Format a time for display in amendment cards
 * Returns format like "09:30" or "2:30 PM" depending on locale
 *
 * @param time - Date object, ISO string, or undefined
 * @returns Formatted time string or null if invalid/missing
 */
export function formatTimeLogTime(time: string | Date | undefined): string | null {
  if (!time) return null

  const dateObj = typeof time === 'string' ? safeParseDateString(time) : time
  if (!dateObj || isNaN(dateObj.getTime())) return null

  return dateObj.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * Check if a TimeLog amendment has any displayable details
 *
 * @param details - The amendment details object
 * @returns true if there are details to display
 */
export function hasTimeLogDetails(details: {
  date?: string | Date
  startTime?: string | Date
  endTime?: string | Date
  description?: string
}): boolean {
  return !!(
    formatTimeLogDate(details.date) ||
    formatTimeLogTime(details.startTime) ||
    formatTimeLogTime(details.endTime) ||
    details.description
  )
}

/**
 * Truncate description text for display
 *
 * @param description - Full description text
 * @param maxLength - Maximum length before truncation (default: 30)
 * @returns Truncated description with ellipsis if needed
 */
export function truncateDescription(description: string | undefined, maxLength = 30): string | null {
  if (!description) return null
  return description.length > maxLength
    ? `${description.slice(0, maxLength)}...`
    : description
}
