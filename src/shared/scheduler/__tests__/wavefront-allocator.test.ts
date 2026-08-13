import { describe, it, expect } from 'vitest'
import { allocateItems } from '../wavefront-allocator'
import { buildBlockTimeline, TimelineBlock } from '../block-timeline'
import { DailyWorkPattern } from '../../work-blocks-types'
import { BlockConfigKind, UnifiedScheduleItemType } from '../../enums'
import { UnifiedScheduleItem } from '../../unified-scheduler'
import { UNTYPED_TASK_MARKER } from '../../scheduler-converters'

const FOCUS = 'type-focus'

function at(date: string, time: string): Date {
  const result = new Date(`${date}T00:00:00`)
  const [hours = 0, minutes = 0] = time.split(':').map(Number)
  result.setHours(hours, minutes, 0, 0)
  return result
}

function pattern(
  date: string,
  blocks: Array<{ id: string; start: string; end: string; typeConfig?: object }>,
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
    meetings: [],
  }
}

function item(overrides: Partial<UnifiedScheduleItem> & { id: string }): UnifiedScheduleItem {
  return {
    name: overrides.id,
    type: UnifiedScheduleItemType.Task,
    duration: 30,
    priority: 50,
    taskTypeId: FOCUS,
    ...overrides,
  }
}

const CONFIG = { allowTaskSplitting: true, minimumSplitMinutes: 30 }

/** Assert every scheduled work item sits fully inside its assigned block */
function expectAllInsideBlocks(
  scheduled: UnifiedScheduleItem[],
  timeline: TimelineBlock[],
): void {
  const windows = new Map(timeline.map((b) => [b.blockId, b]))
  for (const it of scheduled) {
    if (it.isWaitTime || it.type === UnifiedScheduleItemType.Meeting) continue
    const block = it.blockId ? windows.get(it.blockId) : undefined
    expect(block, `item ${it.name} has a known block`).toBeDefined()
    expect(it.startTime!.getTime()).toBeGreaterThanOrEqual(block!.start.getTime())
    expect(it.endTime!.getTime()).toBeLessThanOrEqual(block!.end.getTime())
  }
}

describe('allocateItems — block boundaries (the overnight-overflow regression)', () => {
  it('overflow moves to the NEXT block, never past the current block end', () => {
    // The minimal repro of the nvidia bug: 18:00-19:00 today (now=18:10),
    // 09:00-10:00 tomorrow, 30+30+60 minutes of tasks.
    const now = at('2026-07-31', '18:10')
    const timeline = buildBlockTimeline(
      [
        pattern('2026-07-31', [{ id: 'fri', start: '18:00', end: '19:00' }]),
        pattern('2026-08-01', [{ id: 'sat', start: '09:00', end: '10:00' }]),
      ],
      now,
    )
    const result = allocateItems(
      [
        item({ id: 'a', priority: 90, duration: 30 }),
        item({ id: 'b', priority: 60, duration: 30 }),
        item({ id: 'c', priority: 30, duration: 60 }),
      ],
      new Set(),
      timeline,
      now,
      CONFIG,
    )

    const byId = new Map(result.scheduled.map((s) => [s.id, s]))
    // A fits today from "now"
    expect(byId.get('a')?.startTime).toEqual(at('2026-07-31', '18:10'))
    expect(byId.get('a')?.blockId).toBe('fri')
    // B does not fit today's remaining 20 min → tomorrow 09:00, NOT tonight
    expect(byId.get('b')?.startTime).toEqual(at('2026-08-01', '09:00'))
    expect(byId.get('b')?.blockId).toBe('sat')
    // C (60 min) no longer fits tomorrow's remaining 30 → split part + remainder unscheduled
    expectAllInsideBlocks(result.scheduled, timeline)
  })

  it('schedules nothing when no block has capacity', () => {
    const now = at('2026-07-31', '21:00')
    const timeline = buildBlockTimeline(
      [pattern('2026-07-31', [{ id: 'fri', start: '18:00', end: '19:00' }])],
      now,
    )
    const result = allocateItems([item({ id: 'a' })], new Set(), timeline, now, CONFIG)
    expect(result.scheduled).toHaveLength(0)
    expect(result.unscheduled[0]?.reason).toBe('Could not find suitable time slot')
  })
})

describe('allocateItems — priorities and dependencies', () => {
  const now = at('2026-07-31', '08:00')
  const makeTimeline = (): TimelineBlock[] =>
    buildBlockTimeline(
      [
        pattern('2026-07-31', [{ id: 'fri', start: '09:00', end: '12:00' }]),
        pattern('2026-08-01', [{ id: 'sat', start: '09:00', end: '12:00' }]),
      ],
      now,
    )

  it('places higher-priority items earlier', () => {
    const result = allocateItems(
      [item({ id: 'low', priority: 10 }), item({ id: 'high', priority: 99 })],
      new Set(),
      makeTimeline(),
      now,
      CONFIG,
    )
    const high = result.scheduled.find((s) => s.id === 'high')
    const low = result.scheduled.find((s) => s.id === 'low')
    expect(high?.startTime).toEqual(at('2026-07-31', '09:00'))
    expect(low?.startTime).toEqual(at('2026-07-31', '09:30'))
  })

  it('a dependent never starts before its dependency ends, despite higher priority', () => {
    const result = allocateItems(
      [
        item({ id: 'dep', priority: 10, duration: 60 }),
        item({ id: 'child', priority: 99, dependencies: ['dep'] }),
      ],
      new Set(),
      makeTimeline(),
      now,
      CONFIG,
    )
    const dep = result.scheduled.find((s) => s.id === 'dep')
    const child = result.scheduled.find((s) => s.id === 'child')
    expect(child!.startTime!.getTime()).toBeGreaterThanOrEqual(dep!.endTime!.getTime())
  })

  it('completed dependencies are satisfied immediately', () => {
    const result = allocateItems(
      [item({ id: 'child', dependencies: ['done-before'] })],
      new Set(['done-before']),
      makeTimeline(),
      now,
      CONFIG,
    )
    expect(result.scheduled.find((s) => s.id === 'child')).toBeDefined()
    expect(result.unscheduled).toHaveLength(0)
  })

  it('unknown dependency ids are healed but reported', () => {
    const result = allocateItems(
      [item({ id: 'child', dependencies: ['ghost'] })],
      new Set(),
      makeTimeline(),
      now,
      CONFIG,
    )
    expect(result.scheduled.find((s) => s.id === 'child')).toBeDefined()
    expect(result.healedDependencies).toEqual([
      { itemId: 'child', itemName: 'child', missingDependencyId: 'ghost' },
    ])
  })

  it('dependents of an unschedulable item are reported blocked, with names', () => {
    const result = allocateItems(
      [
        item({ id: 'giant', name: 'Giant Task', priority: 99, duration: 10_000 }),
        item({ id: 'child', dependencies: ['giant'] }),
      ],
      new Set(),
      makeTimeline(),
      now,
      CONFIG,
    )
    const childEntry = result.unscheduled.find((u) => u.item.id === 'child')
    expect(childEntry?.reason).toBe('Blocked by dependencies: Giant Task')
  })

  it('cycle members are unscheduled with a circular-dependency reason', () => {
    const result = allocateItems(
      [
        item({ id: 'a', dependencies: ['b'] }),
        item({ id: 'b', dependencies: ['a'] }),
      ],
      new Set(),
      makeTimeline(),
      now,
      CONFIG,
    )
    expect(result.scheduled).toHaveLength(0)
    expect(result.unscheduled.map((u) => u.reason)).toEqual([
      'Circular dependency',
      'Circular dependency',
    ])
  })

  it('untyped items are never placed (strict type enforcement)', () => {
    const result = allocateItems(
      [item({ id: 'untyped', taskTypeId: UNTYPED_TASK_MARKER })],
      new Set(),
      makeTimeline(),
      now,
      CONFIG,
    )
    expect(result.scheduled).toHaveLength(0)
    expect(result.unscheduled).toHaveLength(1)
  })
})

describe('allocateItems — async waits', () => {
  const now = at('2026-07-31', '08:00')
  const makeTimeline = (): TimelineBlock[] =>
    buildBlockTimeline(
      [
        pattern('2026-07-31', [{ id: 'fri', start: '09:00', end: '12:00' }]),
        pattern('2026-08-01', [{ id: 'sat', start: '09:00', end: '12:00' }]),
      ],
      now,
    )

  it('emits a same-id wait block after work and gates dependents on the wait end', () => {
    const result = allocateItems(
      [
        item({ id: 'kickoff', priority: 90, duration: 30, asyncWaitTime: 60 }),
        item({ id: 'followup', priority: 80, dependencies: ['kickoff'] }),
      ],
      new Set(),
      makeTimeline(),
      now,
      CONFIG,
    )
    const waits = result.scheduled.filter((s) => s.isWaitTime)
    expect(waits).toHaveLength(1)
    expect(waits[0]?.id).toBe('kickoff') // same-id contract for the renderer
    expect(waits[0]?.name).toBe('⏳ Wait: kickoff')
    expect(waits[0]?.startTime).toEqual(at('2026-07-31', '09:30'))
    expect(waits[0]?.endTime).toEqual(at('2026-07-31', '10:30'))

    const followup = result.scheduled.find((s) => s.id === 'followup')
    expect(followup?.startTime).toEqual(at('2026-07-31', '10:30'))
    // Other work can run during the wait window (parallel throughput)
  })

  it('projects dependents of a WAITING item after the timer expiry', () => {
    const completedAt = at('2026-07-31', '07:00')
    const result = allocateItems(
      [
        item({
          id: 'suite-run',
          name: 'suite run',
          isWaitingOnAsync: true,
          asyncWaitTime: 180, // timer expires 10:00
          completedAt,
        }),
        item({ id: 'analyze', dependencies: ['suite-run'] }),
      ],
      new Set(),
      makeTimeline(),
      now,
      CONFIG,
    )
    const wait = result.scheduled.find((s) => s.isWaitTime)
    expect(wait?.name).toBe('⏳ Waiting: suite run')
    expect(wait?.isWaitingOnAsync).toBe(true)
    expect(wait?.endTime).toEqual(at('2026-07-31', '10:00'))

    const analyze = result.scheduled.find((s) => s.id === 'analyze')
    expect(analyze?.startTime).toEqual(at('2026-07-31', '10:00'))
  })

  it('blocks dependents of a waiting item that has no timer', () => {
    const result = allocateItems(
      [
        item({ id: 'ext', name: 'External', isWaitingOnAsync: true }),
        item({ id: 'child', dependencies: ['ext'] }),
      ],
      new Set(),
      makeTimeline(),
      now,
      CONFIG,
    )
    expect(result.scheduled).toHaveLength(0)
    expect(result.unscheduled.find((u) => u.item.id === 'child')?.reason).toContain(
      'Blocked by dependencies',
    )
  })
})

describe('allocateItems — splitting and truncation', () => {
  const now = at('2026-07-31', '08:00')

  it('splits across days with honest part accounting', () => {
    const timeline = buildBlockTimeline(
      [
        pattern('2026-07-31', [{ id: 'fri', start: '09:00', end: '10:00' }]),
        pattern('2026-08-01', [{ id: 'sat', start: '09:00', end: '10:00' }]),
      ],
      now,
    )
    const result = allocateItems(
      [item({ id: 'big', name: 'Big Task', duration: 90 })],
      new Set(),
      timeline,
      now,
      CONFIG,
    )
    const parts = result.scheduled.filter((s) => s.isSplit)
    expect(parts.map((p) => p.id)).toEqual(['big-part-1', 'big-part-2'])
    expect(parts.map((p) => p.name)).toEqual([
      'Big Task (Part 1/2)',
      'Big Task (Part 2/2)',
    ])
    expect(parts.map((p) => p.duration)).toEqual([60, 30])
    expect(parts.map((p) => p.splitTotal)).toEqual([2, 2])
    expect(parts.map((p) => p.originalTaskId)).toEqual(['big', 'big'])
    expect(parts[0]?.remainingDuration).toBe(30)
    expect(parts[1]?.remainingDuration).toBe(0)
    expect(parts[1]?.blockId).toBe('sat')
    expect(result.unscheduled).toHaveLength(0)
  })

  it('reports ONLY the unplaced remainder — never the whole original task', () => {
    const timeline = buildBlockTimeline(
      [pattern('2026-07-31', [{ id: 'fri', start: '09:00', end: '10:00' }])],
      now,
    )
    const result = allocateItems(
      [item({ id: 'big', name: 'Big Task', duration: 150 })],
      new Set(),
      timeline,
      now,
      CONFIG,
    )
    expect(result.scheduled.map((s) => s.id)).toEqual(['big-part-1'])
    expect(result.scheduled[0]?.duration).toBe(60)
    expect(result.unscheduled).toHaveLength(1)
    expect(result.unscheduled[0]?.item.id).toBe('big-part-2')
    expect(result.unscheduled[0]?.item.duration).toBe(90) // remainder only
  })

  it('a dependent waits for the FINAL part of a split dependency', () => {
    const timeline = buildBlockTimeline(
      [
        pattern('2026-07-31', [{ id: 'fri', start: '09:00', end: '10:00' }]),
        pattern('2026-08-01', [{ id: 'sat', start: '09:00', end: '12:00' }]),
      ],
      now,
    )
    const result = allocateItems(
      [
        item({ id: 'big', priority: 90, duration: 90 }),
        item({ id: 'child', priority: 80, dependencies: ['big'] }),
      ],
      new Set(),
      timeline,
      now,
      CONFIG,
    )
    const lastPart = result.scheduled.find((s) => s.id === 'big-part-2')
    const child = result.scheduled.find((s) => s.id === 'child')
    expect(child!.startTime!.getTime()).toBeGreaterThanOrEqual(
      lastPart!.endTime!.getTime(),
    )
  })

  it('blocks dependents when the dependency is only partially scheduled', () => {
    const timeline = buildBlockTimeline(
      [pattern('2026-07-31', [{ id: 'fri', start: '09:00', end: '10:00' }])],
      now,
    )
    const result = allocateItems(
      [
        item({ id: 'big', name: 'Big Task', priority: 90, duration: 150 }),
        item({ id: 'child', priority: 80, duration: 10, dependencies: ['big'] }),
      ],
      new Set(),
      timeline,
      now,
      CONFIG,
    )
    const childEntry = result.unscheduled.find((u) => u.item.id === 'child')
    expect(childEntry?.reason).toContain('Blocked by dependencies')
  })

  it('truncates with a warning when splitting is disabled', () => {
    const timeline = buildBlockTimeline(
      [pattern('2026-07-31', [{ id: 'fri', start: '09:00', end: '10:00' }])],
      now,
    )
    const result = allocateItems(
      [item({ id: 'big', name: 'Big Task', duration: 90 })],
      new Set(),
      timeline,
      now,
      { allowTaskSplitting: false, minimumSplitMinutes: 30 },
    )
    expect(result.scheduled).toHaveLength(1)
    expect(result.scheduled[0]?.duration).toBe(60)
    expect(result.scheduled[0]?.isSplit).toBeFalsy()
    expect(result.warnings[0]).toContain('truncated from 90 to 60')
  })
})
