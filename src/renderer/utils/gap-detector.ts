/**
 * Gap Detector
 *
 * Detects unlogged time gaps within work blocks for a given date range.
 * Used by the AI chat to help users fill in missing time entries.
 */

import { DailyWorkPattern, WorkBlock, Meeting } from '@shared/work-blocks-types'
import { isSystemBlock } from '@shared/user-task-types'
import { timeStringToMinutes } from '@shared/time-utils'
import { WorkSessionData } from '../services/chat-context-provider'

export interface TimeGap {
  date: string              // YYYY-MM-DD
  startTime: Date
  endTime: Date
  durationMinutes: number
  blockName?: string        // description of the work block this gap falls within
}

/** Minimum gap duration in minutes to report (ignore tiny gaps) */
const MIN_GAP_MINUTES = 5

interface TimeInterval {
  startMinutes: number  // minutes since midnight
  endMinutes: number
}

/**
 * Detect time gaps within work blocks that have no logged sessions or meetings.
 *
 * For each day in the range, finds non-system work blocks and subtracts
 * any overlapping sessions and meetings. Remaining intervals > 5 min are gaps.
 */
export function detectTimeGaps(
  sessions: WorkSessionData[],
  patterns: DailyWorkPattern[],
): TimeGap[] {
  const gaps: TimeGap[] = []
  const patternsByDate = new Map(patterns.map(p => [p.date, p]))

  for (const [date, pattern] of patternsByDate) {
    const daySessions = sessions.filter(s => dateFromSession(s) === date)
    const dayGaps = detectGapsForDay(date, pattern, daySessions)
    gaps.push(...dayGaps)
  }

  return gaps.sort((a, b) => a.startTime.getTime() - b.startTime.getTime())
}

/**
 * Detect gaps for a single day.
 */
function detectGapsForDay(
  date: string,
  pattern: DailyWorkPattern,
  sessions: WorkSessionData[],
): TimeGap[] {
  const gaps: TimeGap[] = []

  // Get non-system work blocks (skip sleep/blocked)
  const workBlocks = pattern.blocks.filter(b => !isSystemBlock(b.typeConfig))

  // Build occupied intervals from sessions and meetings
  const occupied = buildOccupiedIntervals(sessions, pattern.meetings, date)

  for (const block of workBlocks) {
    const blockInterval = blockToInterval(block)
    const blockGaps = subtractIntervals(blockInterval, occupied)

    for (const gap of blockGaps) {
      if (gap.endMinutes - gap.startMinutes >= MIN_GAP_MINUTES) {
        gaps.push({
          date,
          startTime: minutesToDate(date, gap.startMinutes),
          endTime: minutesToDate(date, gap.endMinutes),
          durationMinutes: gap.endMinutes - gap.startMinutes,
          blockName: formatBlockDescription(block),
        })
      }
    }
  }

  return gaps
}

/**
 * Build a sorted list of occupied time intervals from sessions and meetings.
 */
function buildOccupiedIntervals(
  sessions: WorkSessionData[],
  meetings: Meeting[],
  date: string,
): TimeInterval[] {
  const intervals: TimeInterval[] = []

  // Add session intervals
  for (const session of sessions) {
    if (!session.endTime) continue // skip active sessions
    const start = dateToMinutesSinceMidnight(session.startTime, date)
    const end = dateToMinutesSinceMidnight(session.endTime, date)
    if (start < end) {
      intervals.push({ startMinutes: start, endMinutes: end })
    }
  }

  // Add meeting intervals
  for (const meeting of meetings) {
    const start = timeStringToMinutes(meeting.startTime)
    const end = timeStringToMinutes(meeting.endTime)
    if (start < end) {
      intervals.push({ startMinutes: start, endMinutes: end })
    }
  }

  // Sort by start time and merge overlapping
  return mergeIntervals(intervals)
}

/**
 * Merge overlapping intervals into non-overlapping sorted intervals.
 */
function mergeIntervals(intervals: TimeInterval[]): TimeInterval[] {
  if (intervals.length === 0) return []

  const sorted = [...intervals].sort((a, b) => a.startMinutes - b.startMinutes)
  const first = sorted[0]!
  const merged: TimeInterval[] = [first]

  for (let i = 1; i < sorted.length; i++) {
    const last = merged[merged.length - 1]!
    const current = sorted[i]!

    if (current.startMinutes <= last.endMinutes) {
      // Overlapping — extend the last interval
      last.endMinutes = Math.max(last.endMinutes, current.endMinutes)
    } else {
      merged.push(current)
    }
  }

  return merged
}

/**
 * Subtract occupied intervals from a block interval.
 * Returns the remaining (unoccupied) intervals within the block.
 */
function subtractIntervals(
  block: TimeInterval,
  occupied: TimeInterval[],
): TimeInterval[] {
  let remaining: TimeInterval[] = [{ ...block }]

  for (const occ of occupied) {
    const next: TimeInterval[] = []
    for (const r of remaining) {
      // No overlap
      if (occ.endMinutes <= r.startMinutes || occ.startMinutes >= r.endMinutes) {
        next.push(r)
        continue
      }
      // Left portion survives
      if (occ.startMinutes > r.startMinutes) {
        next.push({ startMinutes: r.startMinutes, endMinutes: occ.startMinutes })
      }
      // Right portion survives
      if (occ.endMinutes < r.endMinutes) {
        next.push({ startMinutes: occ.endMinutes, endMinutes: r.endMinutes })
      }
    }
    remaining = next
  }

  return remaining
}

// ============================================================================
// Helpers
// ============================================================================

function blockToInterval(block: WorkBlock): TimeInterval {
  return {
    startMinutes: timeStringToMinutes(block.startTime),
    endMinutes: timeStringToMinutes(block.endTime),
  }
}

function dateFromSession(session: WorkSessionData): string {
  const d = session.startTime
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function dateToMinutesSinceMidnight(date: Date, _dateStr: string): number {
  return date.getHours() * 60 + date.getMinutes()
}

function minutesToDate(dateStr: string, minutes: number): Date {
  const parts = dateStr.split('-').map(Number)
  const year = parts[0] ?? 2000
  const month = (parts[1] ?? 1) - 1
  const day = parts[2] ?? 1
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  return new Date(year, month, day, hours, mins)
}

function formatBlockDescription(block: WorkBlock): string {
  return `${block.startTime}–${block.endTime}`
}
