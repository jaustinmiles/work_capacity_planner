/**
 * Timer Types
 *
 * First-class countdown timer model. Timers are session-scoped and can be:
 * - Auto-created when a task/step completes with asyncWaitTime > 0
 * - Manually created for arbitrary countdowns (laundry, deliveries, etc.)
 *
 * Key design: expiresAt is an absolute timestamp. The client derives
 * remaining time as (expiresAt - now), so timers survive restarts with
 * zero drift.
 */

import { TimerStatus } from './enums'

// ============================================================================
// Core Interface
// ============================================================================

/**
 * A countdown timer persisted in the database.
 */
export interface Timer {
  id: string
  sessionId: string
  name: string
  status: TimerStatus
  originalDurationMinutes: number
  extendedByMinutes: number
  startedAt: Date
  expiresAt: Date
  pausedAt: Date | null
  pausedRemainingMs: number | null
  expiredAt: Date | null
  dismissedAt: Date | null
  linkedTaskId: string | null
  linkedStepId: string | null
  createdAt: Date
  updatedAt: Date
}

/**
 * UI-consumable timer state. Derived from Timer + current time.
 */
export interface TimerDisplayState {
  id: string
  name: string
  status: TimerStatus
  remainingSeconds: number
  totalSeconds: number
  originalDurationMinutes: number
  extendedByMinutes: number
  expiresAt: Date
  startedAt: Date
  linkedTaskId: string | null
  linkedStepId: string | null
  /** Percentage complete (0-100) */
  progress: number
}

// ============================================================================
// Input Types
// ============================================================================

export interface CreateTimerInput {
  name: string
  durationMinutes: number
  linkedTaskId?: string
  linkedStepId?: string
}

export interface ExtendTimerInput {
  timerId: string
  addMinutes: number
}

// ============================================================================
// Pure Utility Functions
// ============================================================================

/**
 * Compute remaining seconds from an absolute expiration time.
 * Returns 0 if expired.
 */
export function computeTimerRemainingSeconds(expiresAt: Date, now: Date): number {
  const remainingMs = expiresAt.getTime() - now.getTime()
  return Math.max(0, Math.ceil(remainingMs / 1000))
}

/**
 * Check if a timer has expired.
 */
export function isTimerExpired(expiresAt: Date, now: Date): boolean {
  return now.getTime() >= expiresAt.getTime()
}

/**
 * Compute the absolute expiration time from a start time and duration.
 */
export function createTimerExpiresAt(startedAt: Date, durationMinutes: number): Date {
  return new Date(startedAt.getTime() + durationMinutes * 60 * 1000)
}

/**
 * Compute total seconds for a timer (original + extensions).
 */
export function computeTimerTotalSeconds(originalDurationMinutes: number, extendedByMinutes: number): number {
  return (originalDurationMinutes + extendedByMinutes) * 60
}

/**
 * Compute progress percentage (0-100) for a timer.
 */
export function computeTimerProgress(startedAt: Date, expiresAt: Date, now: Date): number {
  const totalMs = expiresAt.getTime() - startedAt.getTime()
  if (totalMs <= 0) return 100
  const elapsedMs = now.getTime() - startedAt.getTime()
  return Math.min(100, Math.max(0, (elapsedMs / totalMs) * 100))
}

/**
 * Format timer display as HH:MM:SS or MM:SS or SS depending on magnitude.
 */
export function formatTimerDisplay(remainingSeconds: number): string {
  if (remainingSeconds <= 0) return '0:00'

  const hours = Math.floor(remainingSeconds / 3600)
  const minutes = Math.floor((remainingSeconds % 3600) / 60)
  const seconds = remainingSeconds % 60

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
  }
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

/**
 * Format timer duration as a human-readable string.
 * e.g., "25 min", "2 hours", "1 day 3 hours"
 */
export function formatTimerDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`
  if (minutes < 1440) {
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    return mins > 0 ? `${hours}h ${mins}m` : `${hours} hour${hours > 1 ? 's' : ''}`
  }
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)
  return hours > 0 ? `${days}d ${hours}h` : `${days} day${days > 1 ? 's' : ''}`
}

/**
 * Convert a raw database record to a typed Timer.
 */
export function fromDatabaseTimer(raw: Record<string, unknown>): Timer {
  return {
    id: raw.id as string,
    sessionId: raw.sessionId as string,
    name: raw.name as string,
    status: raw.status as TimerStatus,
    originalDurationMinutes: raw.originalDurationMinutes as number,
    extendedByMinutes: raw.extendedByMinutes as number,
    startedAt: new Date(raw.startedAt as string | Date),
    expiresAt: new Date(raw.expiresAt as string | Date),
    pausedAt: raw.pausedAt ? new Date(raw.pausedAt as string | Date) : null,
    pausedRemainingMs: raw.pausedRemainingMs as number | null,
    expiredAt: raw.expiredAt ? new Date(raw.expiredAt as string | Date) : null,
    dismissedAt: raw.dismissedAt ? new Date(raw.dismissedAt as string | Date) : null,
    linkedTaskId: raw.linkedTaskId as string | null,
    linkedStepId: raw.linkedStepId as string | null,
    createdAt: new Date(raw.createdAt as string | Date),
    updatedAt: new Date(raw.updatedAt as string | Date),
  }
}

/**
 * Build a TimerDisplayState from a Timer and current time.
 */
export function toTimerDisplayState(timer: Timer, now: Date): TimerDisplayState {
  const remainingSeconds = timer.status === TimerStatus.Paused
    ? Math.ceil((timer.pausedRemainingMs ?? 0) / 1000)
    : computeTimerRemainingSeconds(timer.expiresAt, now)

  const totalSeconds = computeTimerTotalSeconds(timer.originalDurationMinutes, timer.extendedByMinutes)
  const progress = timer.status === TimerStatus.Paused
    ? computeTimerProgress(timer.startedAt, timer.expiresAt, timer.pausedAt ?? now)
    : computeTimerProgress(timer.startedAt, timer.expiresAt, now)

  return {
    id: timer.id,
    name: timer.name,
    status: timer.status,
    remainingSeconds,
    totalSeconds,
    originalDurationMinutes: timer.originalDurationMinutes,
    extendedByMinutes: timer.extendedByMinutes,
    expiresAt: timer.expiresAt,
    startedAt: timer.startedAt,
    linkedTaskId: timer.linkedTaskId,
    linkedStepId: timer.linkedStepId,
    progress,
  }
}
