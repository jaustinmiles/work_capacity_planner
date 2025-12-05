/**
 * Time Sink Types
 *
 * Time sinks represent activities that consume time but never "complete"
 * like tasks do. Examples: phone calls with friends, social media browsing,
 * errands without a goal, breaks.
 *
 * This module follows the same patterns as user-task-types.ts for consistency.
 *
 * Key concepts:
 * - TimeSink: A user-defined category for non-task time (e.g., "Phone calls")
 * - TimeSinkSession: An individual time entry logged against a time sink
 */

import { generateUniqueId } from './step-id-utils'
import { getCurrentTime } from './time-provider'
import { calculateMinutesBetweenDates } from './time-utils'

// ============================================================================
// Core Types
// ============================================================================

/**
 * Time sink definition.
 * Stored at the session level - each session has its own set of time sinks.
 */
export interface TimeSink {
  id: string // Unique identifier (e.g., "sink-abc123")
  sessionId: string // Session this sink belongs to
  name: string // Display name (e.g., "Phone calls", "Social media")
  emoji: string // Emoji icon (e.g., "📞", "📱")
  color: string // Hex color (e.g., "#9B59B6")
  typeId?: string // Optional link to UserTaskType for categorization
  sortOrder: number // For consistent ordering in UI
  createdAt: Date
  updatedAt: Date
}

/**
 * Database representation of TimeSink (dates as strings).
 */
export interface TimeSinkRecord {
  id: string
  sessionId: string
  name: string
  emoji: string
  color: string
  typeId: string | null
  sortOrder: number
  createdAt: string
  updatedAt: string
}

/**
 * Time sink session - an individual time entry for a time sink.
 */
export interface TimeSinkSession {
  id: string
  timeSinkId: string
  startTime: Date
  endTime?: Date // null = in progress
  actualMinutes?: number // null = in progress
  notes?: string
  createdAt: Date
}

/**
 * Database representation of TimeSinkSession (dates as strings).
 */
export interface TimeSinkSessionRecord {
  id: string
  timeSinkId: string
  startTime: string
  endTime: string | null
  actualMinutes: number | null
  notes: string | null
  createdAt: string
}

// ============================================================================
// Input Types
// ============================================================================

/**
 * Input for creating a new TimeSink.
 */
export interface CreateTimeSinkInput {
  sessionId: string
  name: string
  emoji: string
  color: string
  typeId?: string
  sortOrder?: number
}

/**
 * Input for updating an existing TimeSink.
 */
export interface UpdateTimeSinkInput {
  name?: string
  emoji?: string
  color?: string
  typeId?: string | null
  sortOrder?: number
}

/**
 * Input for creating a new TimeSinkSession.
 */
export interface CreateTimeSinkSessionInput {
  timeSinkId: string
  startTime: Date
  endTime?: Date
  actualMinutes?: number
  notes?: string
}

/**
 * Input for ending a TimeSinkSession.
 */
export interface EndTimeSinkSessionInput {
  actualMinutes: number
  notes?: string
}

// ============================================================================
// Result Types
// ============================================================================

/**
 * Accumulated time by time sink.
 */
export type AccumulatedTimeBySink = Record<string, number>

/**
 * Result type for accumulated time sink queries.
 */
export interface TimeSinkAccumulatedResult {
  bySink: AccumulatedTimeBySink // sinkId -> minutes
  total: number // total minutes across all sinks
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get the color for a time sink by ID.
 * Returns a default gray if sink not found.
 */
export function getSinkColor(sinks: TimeSink[], sinkId: string): string {
  const sink = sinks.find((s) => s.id === sinkId)
  return sink?.color ?? '#808080' // Default gray
}

/**
 * Get the emoji for a time sink by ID.
 * Returns a default icon if sink not found.
 */
export function getSinkEmoji(sinks: TimeSink[], sinkId: string): string {
  const sink = sinks.find((s) => s.id === sinkId)
  return sink?.emoji ?? '⏱️' // Default timer
}

/**
 * Get the display name for a time sink by ID.
 * Returns "Unknown" if sink not found.
 */
export function getSinkName(sinks: TimeSink[], sinkId: string): string {
  const sink = sinks.find((s) => s.id === sinkId)
  return sink?.name ?? 'Unknown'
}

/**
 * Get a time sink by its ID.
 */
export function getSinkById(sinks: TimeSink[], sinkId: string): TimeSink | undefined {
  return sinks.find((s) => s.id === sinkId)
}

/**
 * Get all time sinks sorted by sortOrder.
 */
export function getSortedSinks(sinks: TimeSink[]): TimeSink[] {
  return [...sinks].sort((a, b) => a.sortOrder - b.sortOrder)
}

/**
 * Check if a time sink session is active (in progress).
 */
export function isSessionActive(session: TimeSinkSession): boolean {
  return session.endTime === undefined || session.endTime === null
}

/**
 * Calculate duration of a completed session in minutes.
 */
export function calculateSessionDuration(session: TimeSinkSession): number {
  if (session.actualMinutes !== undefined) {
    return session.actualMinutes
  }

  if (!session.endTime) {
    // Session in progress - calculate from start to now
    const now = getCurrentTime()
    return calculateMinutesBetweenDates(session.startTime, now)
  }

  return calculateMinutesBetweenDates(session.startTime, session.endTime)
}

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Validate a TimeSink name.
 */
export function validateSinkName(name: string): { valid: boolean; error?: string } {
  const trimmed = name.trim()

  if (trimmed.length === 0) {
    return { valid: false, error: 'Name cannot be empty' }
  }

  if (trimmed.length > 100) {
    return { valid: false, error: 'Name must be 100 characters or less' }
  }

  return { valid: true }
}

/**
 * Validate a hex color string.
 */
export function validateSinkColor(color: string): { valid: boolean; error?: string } {
  const hexPattern = /^#[0-9A-Fa-f]{6}$/

  if (!hexPattern.test(color)) {
    return { valid: false, error: 'Color must be a valid hex color (e.g., #FF5500)' }
  }

  return { valid: true }
}

/**
 * Validate an emoji string (basic check - single emoji or short string).
 */
export function validateSinkEmoji(emoji: string): { valid: boolean; error?: string } {
  if (emoji.length === 0) {
    return { valid: false, error: 'Emoji cannot be empty' }
  }

  // Allow 1-4 characters to handle emoji with modifiers
  if (emoji.length > 4) {
    return { valid: false, error: 'Emoji must be a single emoji character' }
  }

  return { valid: true }
}

/**
 * Validate a complete CreateTimeSinkInput.
 */
export function validateCreateSinkInput(input: CreateTimeSinkInput): {
  valid: boolean
  errors: string[]
} {
  const errors: string[] = []

  const nameValidation = validateSinkName(input.name)
  if (!nameValidation.valid && nameValidation.error) {
    errors.push(nameValidation.error)
  }

  const colorValidation = validateSinkColor(input.color)
  if (!colorValidation.valid && colorValidation.error) {
    errors.push(colorValidation.error)
  }

  const emojiValidation = validateSinkEmoji(input.emoji)
  if (!emojiValidation.valid && emojiValidation.error) {
    errors.push(emojiValidation.error)
  }

  if (!input.sessionId) {
    errors.push('Session ID is required')
  }

  return { valid: errors.length === 0, errors }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a new TimeSink with generated ID and timestamps.
 */
export function createTimeSink(input: CreateTimeSinkInput): TimeSink {
  const now = getCurrentTime()

  return {
    id: generateUniqueId('sink'),
    sessionId: input.sessionId,
    name: input.name.trim(),
    emoji: input.emoji,
    color: input.color.toUpperCase(),
    typeId: input.typeId,
    sortOrder: input.sortOrder ?? 0,
    createdAt: now,
    updatedAt: now,
  }
}

/**
 * Create a new TimeSinkSession with generated ID and timestamp.
 */
export function createTimeSinkSession(input: CreateTimeSinkSessionInput): TimeSinkSession {
  const now = getCurrentTime()

  return {
    id: generateUniqueId('sinksess'),
    timeSinkId: input.timeSinkId,
    startTime: input.startTime,
    endTime: input.endTime,
    actualMinutes: input.actualMinutes,
    notes: input.notes,
    createdAt: now,
  }
}

/**
 * Start a new time sink session with the current time.
 */
export function startTimeSinkSession(timeSinkId: string, notes?: string): TimeSinkSession {
  const now = getCurrentTime()

  return {
    id: generateUniqueId('sinksess'),
    timeSinkId,
    startTime: now,
    notes,
    createdAt: now,
  }
}

// ============================================================================
// Conversion Functions
// ============================================================================

/**
 * Convert a database record to a TimeSink (string dates to Date objects).
 */
export function recordToTimeSink(record: TimeSinkRecord): TimeSink {
  return {
    ...record,
    typeId: record.typeId ?? undefined,
    createdAt: new Date(record.createdAt),
    updatedAt: new Date(record.updatedAt),
  }
}

/**
 * Convert a TimeSink to a database record (Date objects to ISO strings).
 */
export function timeSinkToRecord(sink: TimeSink): TimeSinkRecord {
  return {
    ...sink,
    typeId: sink.typeId ?? null,
    createdAt: sink.createdAt.toISOString(),
    updatedAt: sink.updatedAt.toISOString(),
  }
}

/**
 * Convert a database record to a TimeSinkSession (string dates to Date objects).
 */
export function recordToTimeSinkSession(record: TimeSinkSessionRecord): TimeSinkSession {
  return {
    ...record,
    startTime: new Date(record.startTime),
    endTime: record.endTime ? new Date(record.endTime) : undefined,
    actualMinutes: record.actualMinutes ?? undefined,
    notes: record.notes ?? undefined,
    createdAt: new Date(record.createdAt),
  }
}

/**
 * Convert a TimeSinkSession to a database record (Date objects to ISO strings).
 */
export function timeSinkSessionToRecord(session: TimeSinkSession): TimeSinkSessionRecord {
  return {
    id: session.id,
    timeSinkId: session.timeSinkId,
    startTime: session.startTime.toISOString(),
    endTime: session.endTime?.toISOString() ?? null,
    actualMinutes: session.actualMinutes ?? null,
    notes: session.notes ?? null,
    createdAt: session.createdAt.toISOString(),
  }
}

// ============================================================================
// Accumulated Time Utilities
// ============================================================================

/**
 * Create an empty accumulated time record.
 */
export function createEmptyAccumulatedSinkTime(): AccumulatedTimeBySink {
  return {}
}

/**
 * Add time to accumulated time for a specific sink.
 */
export function addAccumulatedSinkTime(
  accumulated: AccumulatedTimeBySink,
  sinkId: string,
  minutes: number,
): AccumulatedTimeBySink {
  return {
    ...accumulated,
    [sinkId]: (accumulated[sinkId] ?? 0) + minutes,
  }
}

/**
 * Get accumulated time for a specific sink (returns 0 if not found).
 */
export function getAccumulatedTimeForSink(accumulated: AccumulatedTimeBySink, sinkId: string): number {
  return accumulated[sinkId] ?? 0
}

/**
 * Merge two accumulated sink time records.
 */
export function mergeAccumulatedSinkTime(
  a: AccumulatedTimeBySink,
  b: AccumulatedTimeBySink,
): AccumulatedTimeBySink {
  const result = { ...a }

  for (const [sinkId, minutes] of Object.entries(b)) {
    result[sinkId] = (result[sinkId] ?? 0) + minutes
  }

  return result
}

/**
 * Calculate total time from accumulated sink time.
 */
export function calculateTotalSinkTime(accumulated: AccumulatedTimeBySink): number {
  return Object.values(accumulated).reduce((sum, minutes) => sum + minutes, 0)
}

// ============================================================================
// Default Time Sinks
// ============================================================================

/**
 * Suggested default time sinks that users can choose from.
 * These are not automatically created - just suggestions.
 */
export const SUGGESTED_TIME_SINKS: Array<{ name: string; emoji: string; color: string }> = [
  { name: 'Phone calls', emoji: '📞', color: '#9B59B6' },
  { name: 'Social media', emoji: '📱', color: '#3498DB' },
  { name: 'Coffee break', emoji: '☕', color: '#8B4513' },
  { name: 'Lunch', emoji: '🍽️', color: '#F39C12' },
  { name: 'Walking', emoji: '🚶', color: '#27AE60' },
  { name: 'Chatting', emoji: '💬', color: '#E74C3C' },
  { name: 'News/Reading', emoji: '📰', color: '#1ABC9C' },
  { name: 'Personal errands', emoji: '🏃', color: '#E67E22' },
]
