import { describe, it, expect } from 'vitest'
import {
  buildBlockTimeline,
  subtractInterval,
  findFitInBlock,
  findBestFit,
  allocateSlice,
  typeMatchScore,
  TimelineBlock,
} from '../block-timeline'
import { DailyWorkPattern } from '../../work-blocks-types'
import { BlockConfigKind, WorkBlockType, MeetingType } from '../../enums'
import { UNTYPED_TASK_MARKER } from '../../scheduler-converters'

const FOCUS = 'type-focus'
const ADMIN = 'type-admin'

function pattern(
  date: string,
  blocks: Array<{ id: string; start: string; end: string; typeConfig?: object }>,
  meetings: Array<{ id: string; start: string; end: string }> = [],
): DailyWorkPattern {
  return {
    date,
    blocks: blocks.map((b) => ({
      id: b.id,
      startTime: b.start,
      endTime: b.end,
      typeConfig: (b.typeConfig ?? { kind: BlockConfigKind.Any }) as DailyWorkPattern['blocks'][number]['typeConfig'],
    })),
    accumulated: {},
    meetings: meetings.map((m) => ({
      id: m.id,
      name: m.id,
      startTime: m.start,
      endTime: m.end,
      type: MeetingType.Meeting,
      recurring: 'none' as const,
    })),
  }
}

function at(date: string, time: string): Date {
  const result = new Date(`${date}T00:00:00`)
  const [hours = 0, minutes = 0] = time.split(':').map(Number)
  result.setHours(hours, minutes, 0, 0)
  return result
}

describe('subtractInterval', () => {
  const iv = (s: Date, e: Date): { start: Date; end: Date } => ({ start: s, end: e })
  const d = (h: number): Date => at('2026-07-31', `${h}:00`)

  it('removes a middle slice, leaving two intervals', () => {
    const result = subtractInterval([iv(d(9), d(17))], d(12), d(13))
    expect(result).toEqual([iv(d(9), d(12)), iv(d(13), d(17))])
  })

  it('trims overlapping edges and ignores non-overlaps', () => {
    expect(subtractInterval([iv(d(9), d(12))], d(8), d(10))).toEqual([iv(d(10), d(12))])
    expect(subtractInterval([iv(d(9), d(12))], d(11), d(14))).toEqual([iv(d(9), d(11))])
    expect(subtractInterval([iv(d(9), d(12))], d(13), d(14))).toEqual([iv(d(9), d(12))])
  })

  it('removes an interval entirely covered by the busy range', () => {
    expect(subtractInterval([iv(d(9), d(12))], d(8), d(13))).toEqual([])
  })
})

describe('buildBlockTimeline', () => {
  it('materializes blocks on their pattern dates, sorted', () => {
    const timeline = buildBlockTimeline(
      [
        pattern('2026-08-01', [{ id: 'sat', start: '09:52', end: '12:09' }]),
        pattern('2026-07-31', [{ id: 'fri', start: '16:45', end: '20:20' }]),
      ],
      at('2026-07-31', '10:00'),
    )
    expect(timeline.map((b) => b.blockId)).toEqual(['fri', 'sat'])
    expect(timeline[0]?.start).toEqual(at('2026-07-31', '16:45'))
    expect(timeline[1]?.end).toEqual(at('2026-08-01', '12:09'))
  })

  it('clamps free time to "now" on any day, not just the first', () => {
    const now = at('2026-07-31', '17:00')
    const timeline = buildBlockTimeline(
      [
        pattern('2026-07-31', [{ id: 'fri', start: '16:45', end: '20:20' }]),
        pattern('2026-08-01', [{ id: 'sat', start: '09:52', end: '12:09' }]),
      ],
      now,
    )
    expect(timeline[0]?.free).toEqual([{ start: now, end: at('2026-07-31', '20:20') }])
    // Future block untouched
    expect(timeline[1]?.free).toEqual([
      { start: at('2026-08-01', '09:52'), end: at('2026-08-01', '12:09') },
    ])
  })

  it('drops blocks that are entirely in the past', () => {
    const timeline = buildBlockTimeline(
      [pattern('2026-07-31', [{ id: 'past', start: '08:00', end: '09:00' }])],
      at('2026-07-31', '10:00'),
    )
    expect(timeline[0]?.free).toEqual([])
  })

  it('excludes system blocks entirely', () => {
    const timeline = buildBlockTimeline(
      [
        pattern('2026-07-31', [
          {
            id: 'sleep',
            start: '00:00',
            end: '08:00',
            typeConfig: { kind: BlockConfigKind.System, systemType: WorkBlockType.Sleep },
          },
          { id: 'work', start: '09:00', end: '12:00' },
        ]),
      ],
      at('2026-07-31', '00:00'),
    )
    expect(timeline.map((b) => b.blockId)).toEqual(['work'])
  })

  it('subtracts meetings from overlapping blocks', () => {
    const timeline = buildBlockTimeline(
      [
        pattern(
          '2026-07-31',
          [{ id: 'work', start: '09:00', end: '12:00' }],
          [{ id: 'standup', start: '10:00', end: '10:30' }],
        ),
      ],
      at('2026-07-31', '08:00'),
    )
    expect(timeline[0]?.free).toEqual([
      { start: at('2026-07-31', '09:00'), end: at('2026-07-31', '10:00') },
      { start: at('2026-07-31', '10:30'), end: at('2026-07-31', '12:00') },
    ])
  })

  it('handles midnight-crossing blocks', () => {
    const timeline = buildBlockTimeline(
      [pattern('2026-07-31', [{ id: 'night', start: '22:00', end: '02:00' }])],
      at('2026-07-31', '20:00'),
    )
    expect(timeline[0]?.end).toEqual(at('2026-08-01', '02:00'))
  })

  it('initializes combo type budgets proportionally', () => {
    const timeline = buildBlockTimeline(
      [
        pattern('2026-07-31', [
          {
            id: 'combo',
            start: '09:00',
            end: '11:00',
            typeConfig: {
              kind: BlockConfigKind.Combo,
              allocations: [
                { typeId: FOCUS, ratio: 0.75 },
                { typeId: ADMIN, ratio: 0.25 },
              ],
            },
          },
        ]),
      ],
      at('2026-07-31', '08:00'),
    )
    expect(timeline[0]?.typeBudget?.get(FOCUS)).toBe(90)
    expect(timeline[0]?.typeBudget?.get(ADMIN)).toBe(30)
  })
})

describe('typeMatchScore', () => {
  it('ranks exact > high-ratio combo > combo > any > incompatible', () => {
    const single = { kind: BlockConfigKind.Single, typeId: FOCUS } as const
    const comboHigh = {
      kind: BlockConfigKind.Combo,
      allocations: [{ typeId: FOCUS, ratio: 0.7 }],
    } as const
    const comboLow = {
      kind: BlockConfigKind.Combo,
      allocations: [{ typeId: FOCUS, ratio: 0.3 }],
    } as const
    const any = { kind: BlockConfigKind.Any } as const

    const scores = [single, comboHigh, comboLow, any].map((c) => typeMatchScore(FOCUS, c))
    expect(scores[0]).toBeGreaterThan(scores[1] ?? 0)
    expect(scores[1]).toBeGreaterThan(scores[2] ?? 0)
    expect(scores[2]).toBeGreaterThan(scores[3] ?? 0)
    expect(typeMatchScore(ADMIN, single)).toBe(0)
    expect(typeMatchScore(UNTYPED_TASK_MARKER, any)).toBe(0)
    expect(typeMatchScore(undefined, any)).toBe(0)
  })
})

describe('findFitInBlock / findBestFit', () => {
  function makeTimeline(now = at('2026-07-31', '08:00')): TimelineBlock[] {
    return buildBlockTimeline(
      [
        pattern('2026-07-31', [{ id: 'fri', start: '09:00', end: '10:00' }]),
        pattern('2026-08-01', [{ id: 'sat', start: '09:00', end: '10:00' }]),
      ],
      now,
    )
  }

  it('never places a start before the block start — even when earliestStart is in the past', () => {
    const timeline = makeTimeline()
    const sat = timeline[1]!
    // The nvidia bug: asking the Saturday block for a fit "as early as Friday evening"
    // must yield Saturday 09:00, never a Friday-evening start.
    const fit = findFitInBlock(sat, FOCUS, 30, at('2026-07-31', '20:08'), 30)
    expect(fit?.start).toEqual(at('2026-08-01', '09:00'))
    expect(fit?.availableMinutes).toBe(60)
  })

  it('returns null when earliestStart is past the block end', () => {
    const timeline = makeTimeline()
    const fri = timeline[0]!
    expect(findFitInBlock(fri, FOCUS, 30, at('2026-07-31', '10:00'), 30)).toBeNull()
  })

  it('rejects partial slices smaller than minimumSplitMinutes', () => {
    const timeline = makeTimeline()
    const fri = timeline[0]!
    // 60-min block, 90-min task: partial of 60 ≥ minSplit 30 → offered
    const partial = findFitInBlock(fri, FOCUS, 90, at('2026-07-31', '08:00'), 30)
    expect(partial?.fitsEntirely).toBe(false)
    expect(partial?.availableMinutes).toBe(60)
    // Free slice (20 min from 09:40) below minSplit → rejected
    allocateSlice(fri, FOCUS, at('2026-07-31', '09:00'), 40)
    expect(findFitInBlock(fri, FOCUS, 90, at('2026-07-31', '08:00'), 30)).toBeNull()
  })

  it('allows small tasks to fit slices below minimumSplitMinutes', () => {
    const timeline = makeTimeline()
    const fri = timeline[0]!
    allocateSlice(fri, FOCUS, at('2026-07-31', '09:00'), 50)
    // 10 minutes free; a 5-minute task still fits
    const fit = findFitInBlock(fri, FOCUS, 5, at('2026-07-31', '08:00'), 30)
    expect(fit?.fitsEntirely).toBe(true)
  })

  it('prefers an exact-type block over an earlier any-type block', () => {
    const timeline = buildBlockTimeline(
      [
        pattern('2026-07-31', [
          { id: 'any-early', start: '09:00', end: '10:00' },
          {
            id: 'focus-late',
            start: '14:00',
            end: '15:00',
            typeConfig: { kind: BlockConfigKind.Single, typeId: FOCUS },
          },
        ]),
      ],
      at('2026-07-31', '08:00'),
    )
    const fit = findBestFit(timeline, FOCUS, 30, at('2026-07-31', '08:00'), 30)
    expect(fit?.block.blockId).toBe('focus-late')
  })

  it('prefers a full fit over a partial fit within the same type class', () => {
    const timeline = buildBlockTimeline(
      [
        pattern('2026-07-31', [
          { id: 'small-early', start: '09:00', end: '09:40' },
          { id: 'big-late', start: '14:00', end: '16:00' },
        ]),
      ],
      at('2026-07-31', '08:00'),
    )
    const fit = findBestFit(timeline, FOCUS, 60, at('2026-07-31', '08:00'), 30)
    expect(fit?.block.blockId).toBe('big-late')
    expect(fit?.fitsEntirely).toBe(true)
  })

  it('front-loads: earlier block wins when everything else is equal', () => {
    const timeline = makeTimeline()
    const fit = findBestFit(timeline, FOCUS, 30, at('2026-07-31', '08:00'), 30)
    expect(fit?.block.blockId).toBe('fri')
  })

  it("front-loads across days: today's any-block beats tomorrow's exact-type block", () => {
    const timeline = buildBlockTimeline(
      [
        pattern('2026-07-31', [{ id: 'any-today', start: '09:00', end: '10:00' }]),
        pattern('2026-08-01', [
          {
            id: 'focus-tomorrow',
            start: '09:00',
            end: '10:00',
            typeConfig: { kind: BlockConfigKind.Single, typeId: FOCUS },
          },
        ]),
      ],
      at('2026-07-31', '08:00'),
    )
    const fit = findBestFit(timeline, FOCUS, 30, at('2026-07-31', '08:00'), 30)
    expect(fit?.block.blockId).toBe('any-today')
  })

  it('prefers using today partially over deferring wholly to tomorrow', () => {
    const timeline = buildBlockTimeline(
      [
        pattern('2026-07-31', [{ id: 'small-today', start: '09:00', end: '10:00' }]),
        pattern('2026-08-01', [{ id: 'big-tomorrow', start: '09:00', end: '12:00' }]),
      ],
      at('2026-07-31', '08:00'),
    )
    const fit = findBestFit(timeline, FOCUS, 90, at('2026-07-31', '08:00'), 30)
    expect(fit?.block.blockId).toBe('small-today')
    expect(fit?.fitsEntirely).toBe(false)
  })

  it('honors combo type budgets', () => {
    const timeline = buildBlockTimeline(
      [
        pattern('2026-07-31', [
          {
            id: 'combo',
            start: '09:00',
            end: '11:00',
            typeConfig: {
              kind: BlockConfigKind.Combo,
              allocations: [
                { typeId: FOCUS, ratio: 0.5 },
                { typeId: ADMIN, ratio: 0.5 },
              ],
            },
          },
        ]),
      ],
      at('2026-07-31', '08:00'),
    )
    const combo = timeline[0]!
    // 60-minute focus budget: a 90-minute focus task can only partially fit
    const fit = findFitInBlock(combo, FOCUS, 90, at('2026-07-31', '08:00'), 30)
    expect(fit?.fitsEntirely).toBe(false)
    expect(fit?.availableMinutes).toBe(60)

    allocateSlice(combo, FOCUS, at('2026-07-31', '09:00'), 60)
    // Focus budget exhausted, admin budget untouched
    expect(findFitInBlock(combo, FOCUS, 30, at('2026-07-31', '08:00'), 30)).toBeNull()
    expect(findFitInBlock(combo, ADMIN, 30, at('2026-07-31', '08:00'), 30)).not.toBeNull()
  })
})

describe('allocateSlice', () => {
  it('consumes free time so overlapping allocations are impossible', () => {
    const timeline = buildBlockTimeline(
      [pattern('2026-07-31', [{ id: 'work', start: '09:00', end: '12:00' }])],
      at('2026-07-31', '08:00'),
    )
    const block = timeline[0]!
    allocateSlice(block, FOCUS, at('2026-07-31', '09:00'), 60)
    expect(block.free).toEqual([
      { start: at('2026-07-31', '10:00'), end: at('2026-07-31', '12:00') },
    ])
    expect(() =>
      allocateSlice(block, FOCUS, at('2026-07-31', '09:30'), 30),
    ).toThrow(/not free/)
  })

  it('rejects slices extending past the block end', () => {
    const timeline = buildBlockTimeline(
      [pattern('2026-07-31', [{ id: 'work', start: '09:00', end: '10:00' }])],
      at('2026-07-31', '08:00'),
    )
    expect(() =>
      allocateSlice(timeline[0]!, FOCUS, at('2026-07-31', '09:30'), 60),
    ).toThrow(/not free/)
  })
})
