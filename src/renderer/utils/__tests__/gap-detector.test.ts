import { describe, it, expect } from 'vitest'
import { detectTimeGaps, TimeGap } from '../gap-detector'
import { DailyWorkPattern } from '@shared/work-blocks-types'
import { BlockConfigKind, WorkBlockType } from '@shared/enums'
import { WorkSessionData } from '../../services/chat-context-provider'

// Helper to create a date at a specific time on a given day
function makeDate(dateStr: string, hours: number, minutes: number): Date {
  const [year, month, day] = dateStr.split('-').map(Number)
  return new Date(year!, (month ?? 1) - 1, day ?? 1, hours, minutes)
}

// Helper to create a work session
function session(
  dateStr: string,
  startH: number, startM: number,
  endH: number, endM: number,
  taskId = 'task-1',
): WorkSessionData {
  return {
    id: `session-${startH}${startM}`,
    taskId,
    startTime: makeDate(dateStr, startH, startM),
    endTime: makeDate(dateStr, endH, endM),
    plannedMinutes: (endH - startH) * 60 + (endM - startM),
  }
}

// Helper to create a daily work pattern
function pattern(
  dateStr: string,
  blocks: Array<{ start: string; end: string; system?: boolean }>,
  meetings: Array<{ name: string; start: string; end: string }> = [],
): DailyWorkPattern {
  return {
    date: dateStr,
    blocks: blocks.map((b, i) => ({
      id: `block-${i}`,
      startTime: b.start,
      endTime: b.end,
      typeConfig: b.system
        ? { kind: BlockConfigKind.System, systemType: WorkBlockType.Sleep }
        : { kind: BlockConfigKind.Single, typeId: 'type-focused' },
    })),
    accumulated: {},
    meetings: meetings.map((m, i) => ({
      id: `meeting-${i}`,
      name: m.name,
      startTime: m.start,
      endTime: m.end,
      type: 'meeting' as any,
    })),
  }
}

describe('detectTimeGaps', () => {
  const DATE = '2026-04-01'

  it('returns empty when no patterns provided', () => {
    const gaps = detectTimeGaps([], [])
    expect(gaps).toEqual([])
  })

  it('returns the entire block as a gap when no sessions exist', () => {
    const gaps = detectTimeGaps(
      [],
      [pattern(DATE, [{ start: '09:00', end: '12:00' }])],
    )
    expect(gaps).toHaveLength(1)
    expect(gaps[0]!.durationMinutes).toBe(180)
    expect(gaps[0]!.date).toBe(DATE)
  })

  it('returns no gaps when sessions fully cover the block', () => {
    const gaps = detectTimeGaps(
      [session(DATE, 9, 0, 12, 0)],
      [pattern(DATE, [{ start: '09:00', end: '12:00' }])],
    )
    expect(gaps).toHaveLength(0)
  })

  it('detects a gap at the start of a block', () => {
    const gaps = detectTimeGaps(
      [session(DATE, 10, 0, 12, 0)],
      [pattern(DATE, [{ start: '09:00', end: '12:00' }])],
    )
    expect(gaps).toHaveLength(1)
    expect(gaps[0]!.durationMinutes).toBe(60) // 9:00–10:00
  })

  it('detects a gap at the end of a block', () => {
    const gaps = detectTimeGaps(
      [session(DATE, 9, 0, 10, 30)],
      [pattern(DATE, [{ start: '09:00', end: '12:00' }])],
    )
    expect(gaps).toHaveLength(1)
    expect(gaps[0]!.durationMinutes).toBe(90) // 10:30–12:00
  })

  it('detects a gap between two sessions', () => {
    const gaps = detectTimeGaps(
      [
        session(DATE, 9, 0, 10, 0),
        session(DATE, 11, 0, 12, 0),
      ],
      [pattern(DATE, [{ start: '09:00', end: '12:00' }])],
    )
    expect(gaps).toHaveLength(1)
    expect(gaps[0]!.durationMinutes).toBe(60) // 10:00–11:00
  })

  it('ignores system blocks (sleep/blocked)', () => {
    const gaps = detectTimeGaps(
      [],
      [pattern(DATE, [
        { start: '00:00', end: '07:00', system: true },
        { start: '09:00', end: '12:00' },
      ])],
    )
    // Only the non-system block should produce a gap
    expect(gaps).toHaveLength(1)
    expect(gaps[0]!.durationMinutes).toBe(180) // 9:00–12:00
  })

  it('subtracts meetings from available time', () => {
    const gaps = detectTimeGaps(
      [session(DATE, 9, 0, 10, 0)],
      [pattern(DATE,
        [{ start: '09:00', end: '12:00' }],
        [{ name: 'Standup', start: '10:00', end: '10:30' }],
      )],
    )
    // Gap should be 10:30–12:00 (90 min), not 10:00–12:00
    expect(gaps).toHaveLength(1)
    expect(gaps[0]!.durationMinutes).toBe(90)
  })

  it('ignores tiny gaps (< 5 min)', () => {
    const gaps = detectTimeGaps(
      [
        session(DATE, 9, 0, 9, 57),
        session(DATE, 10, 0, 12, 0),
      ],
      [pattern(DATE, [{ start: '09:00', end: '12:00' }])],
    )
    // 3-minute gap between 9:57 and 10:00 should be ignored
    expect(gaps).toHaveLength(0)
  })

  it('handles overlapping sessions correctly', () => {
    const gaps = detectTimeGaps(
      [
        session(DATE, 9, 0, 10, 30),
        session(DATE, 10, 0, 11, 0), // overlaps with previous
      ],
      [pattern(DATE, [{ start: '09:00', end: '12:00' }])],
    )
    // Merged occupied: 9:00–11:00, gap: 11:00–12:00
    expect(gaps).toHaveLength(1)
    expect(gaps[0]!.durationMinutes).toBe(60)
  })

  it('handles multiple blocks on the same day', () => {
    const gaps = detectTimeGaps(
      [session(DATE, 9, 0, 10, 0)],
      [pattern(DATE, [
        { start: '09:00', end: '12:00' },
        { start: '13:00', end: '17:00' },
      ])],
    )
    // Gap in block 1: 10:00–12:00 (120 min)
    // Gap in block 2: 13:00–17:00 (240 min)
    expect(gaps).toHaveLength(2)
    expect(gaps[0]!.durationMinutes).toBe(120)
    expect(gaps[1]!.durationMinutes).toBe(240)
  })

  it('handles multiple days', () => {
    const day1 = '2026-04-01'
    const day2 = '2026-04-02'

    const gaps = detectTimeGaps(
      [session(day1, 9, 0, 11, 0)],
      [
        pattern(day1, [{ start: '09:00', end: '12:00' }]),
        pattern(day2, [{ start: '09:00', end: '12:00' }]),
      ],
    )
    // Day 1: 11:00–12:00 (60 min)
    // Day 2: 09:00–12:00 (180 min) — no sessions at all
    expect(gaps).toHaveLength(2)
    expect(gaps[0]!.date).toBe(day1)
    expect(gaps[0]!.durationMinutes).toBe(60)
    expect(gaps[1]!.date).toBe(day2)
    expect(gaps[1]!.durationMinutes).toBe(180)
  })

  it('skips active sessions (no endTime)', () => {
    const activeSession: WorkSessionData = {
      id: 'active-1',
      taskId: 'task-1',
      startTime: makeDate(DATE, 9, 0),
      plannedMinutes: 60,
      // no endTime — active session
    }
    const gaps = detectTimeGaps(
      [activeSession],
      [pattern(DATE, [{ start: '09:00', end: '12:00' }])],
    )
    // Active session is ignored, whole block is a gap
    expect(gaps).toHaveLength(1)
    expect(gaps[0]!.durationMinutes).toBe(180)
  })

  it('returns gaps sorted chronologically across days', () => {
    const day1 = '2026-04-01'
    const day2 = '2026-04-02'

    const gaps = detectTimeGaps(
      [],
      [
        pattern(day2, [{ start: '14:00', end: '17:00' }]),
        pattern(day1, [{ start: '09:00', end: '12:00' }]),
      ],
    )
    expect(gaps).toHaveLength(2)
    expect(gaps[0]!.date).toBe(day1)
    expect(gaps[1]!.date).toBe(day2)
  })
})
