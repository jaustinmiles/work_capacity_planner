/**
 * Block Timeline — interval-based capacity model for the unified scheduler.
 *
 * Materializes DailyWorkPattern blocks into concrete dated intervals and
 * tracks the FREE sub-intervals of each block. Scheduling an item consumes a
 * slice of a free interval, so an item outside its block's window is
 * unrepresentable by construction — the class of bug where phantom capacity
 * spanned overnight gaps (see decisions/2026-07-31-scheduler-engine-review.md)
 * cannot recur.
 *
 * Pure module: no Date.now(), no I/O. All "now" values are passed in.
 */

import { DailyWorkPattern } from '../work-blocks-types'
import {
  BlockTypeConfig,
  getTypeRatioInBlock,
  isComboBlock,
  isSystemBlock,
} from '../user-task-types'
import { parseTimeString } from '../time-utils'
import { UNTYPED_TASK_MARKER } from '../scheduler-converters'

const MS_PER_MINUTE = 60_000

export interface FreeInterval {
  start: Date
  end: Date
}

/**
 * A work block materialized onto a concrete date, tracking remaining free time.
 */
export interface TimelineBlock {
  blockId: string
  /** Pattern date this block belongs to ("YYYY-MM-DD") */
  date: string
  start: Date
  end: Date
  typeConfig: BlockTypeConfig
  /** Sorted, non-overlapping free intervals remaining in this block */
  free: FreeInterval[]
  /** Combo blocks only: remaining minutes budget per task type id */
  typeBudget: Map<string, number> | null
}

/**
 * A candidate placement for an item inside a block.
 */
export interface SlotFit {
  block: TimelineBlock
  /** Earliest feasible start inside the block at/after the requested start */
  start: Date
  /**
   * Contiguous minutes available from `start` (bounded by the free interval,
   * the block end, and — for combo blocks — the per-type budget).
   */
  availableMinutes: number
  /** True when the full requested duration fits at `start` */
  fitsEntirely: boolean
}

/** Parse an "HH:MM" string onto a concrete date (local time). */
export function parseTimeOnDate(dateStr: string, timeStr: string): Date {
  const [hour, minute] = parseTimeString(timeStr)
  const result = new Date(`${dateStr}T00:00:00`)
  result.setHours(hour, minute, 0, 0)
  return result
}

function minutesBetween(start: Date, end: Date): number {
  return Math.floor((end.getTime() - start.getTime()) / MS_PER_MINUTE)
}

/**
 * Remove a busy interval from a sorted free-interval list.
 */
export function subtractInterval(
  free: FreeInterval[],
  busyStart: Date,
  busyEnd: Date,
): FreeInterval[] {
  const result: FreeInterval[] = []
  for (const interval of free) {
    if (busyEnd <= interval.start || busyStart >= interval.end) {
      // No overlap
      result.push(interval)
      continue
    }
    if (busyStart > interval.start) {
      result.push({ start: interval.start, end: busyStart })
    }
    if (busyEnd < interval.end) {
      result.push({ start: busyEnd, end: interval.end })
    }
  }
  return result
}

/**
 * Build the timeline: every non-system block of every pattern becomes a dated
 * block whose free time starts at max(block start, now) and has all of the
 * day's meetings subtracted.
 */
export function buildBlockTimeline(
  patterns: DailyWorkPattern[],
  now: Date,
): TimelineBlock[] {
  const blocks: TimelineBlock[] = []

  for (const pattern of patterns) {
    // Materialize meeting intervals once per pattern day
    const meetingIntervals = (pattern.meetings || []).map((meeting) => {
      const start = parseTimeOnDate(pattern.date, meeting.startTime)
      let end = parseTimeOnDate(pattern.date, meeting.endTime)
      if (end <= start) {
        // Meeting crosses midnight
        end = new Date(end.getTime() + 24 * 60 * MS_PER_MINUTE)
      }
      return { start, end }
    })

    for (const block of pattern.blocks) {
      if (isSystemBlock(block.typeConfig)) {
        continue // Blocked/sleep time never accepts work
      }

      const start = parseTimeOnDate(pattern.date, block.startTime)
      let end = parseTimeOnDate(pattern.date, block.endTime)
      if (end <= start) {
        // Block crosses midnight
        end = new Date(end.getTime() + 24 * 60 * MS_PER_MINUTE)
      }

      // Free time begins no earlier than "now" — uniformly, for every day.
      const freeStart = now > start ? now : start
      let free: FreeInterval[] =
        freeStart < end ? [{ start: freeStart, end }] : []

      for (const meeting of meetingIntervals) {
        free = subtractInterval(free, meeting.start, meeting.end)
      }

      const totalMinutes = minutesBetween(start, end)
      const typeBudget = isComboBlock(block.typeConfig)
        ? new Map(
            block.typeConfig.allocations.map((allocation) => [
              allocation.typeId,
              Math.floor(allocation.ratio * totalMinutes),
            ]),
          )
        : null

      blocks.push({
        blockId: block.id,
        date: pattern.date,
        start,
        end,
        typeConfig: block.typeConfig,
        free,
        typeBudget,
      })
    }
  }

  blocks.sort((a, b) => a.start.getTime() - b.start.getTime())
  return blocks
}

/**
 * Type-compatibility classes, ordered by preference. Mirrors the intent of the
 * old BLOCK_SCORING_WEIGHTS: exact single-type match beats combo (a high-ratio
 * combo beats a low-ratio one), which beats any-type blocks. Untyped tasks are
 * rejected everywhere (strict type enforcement).
 */
export function typeMatchScore(
  taskTypeId: string | undefined,
  config: BlockTypeConfig,
): number {
  if (!taskTypeId || taskTypeId === UNTYPED_TASK_MARKER) {
    return 0
  }
  const ratio = getTypeRatioInBlock(taskTypeId, config)
  if (ratio === 0) {
    return 0
  }
  if (isComboBlock(config)) {
    return ratio >= 0.5 ? 65 : 50
  }
  if (config.kind === 'any') {
    return 30
  }
  return 100 // exact single-type match
}

/**
 * Find the earliest feasible placement for `durationMinutes` of `taskTypeId`
 * work inside a single block, no earlier than `earliestStart`.
 *
 * Returns null when the block is type-incompatible or has no usable slice
 * (a slice is usable when it fits the whole duration, or is at least
 * `minimumSplitMinutes` for partial placement).
 */
export function findFitInBlock(
  block: TimelineBlock,
  taskTypeId: string | undefined,
  durationMinutes: number,
  earliestStart: Date,
  minimumSplitMinutes: number,
): SlotFit | null {
  if (typeMatchScore(taskTypeId, block.typeConfig) === 0) {
    return null
  }

  let budgetCap = Infinity
  if (block.typeBudget && taskTypeId) {
    budgetCap = block.typeBudget.get(taskTypeId) ?? 0
  }
  if (budgetCap <= 0) {
    return null
  }

  const minUsable = Math.min(durationMinutes, minimumSplitMinutes)

  for (const interval of block.free) {
    const candidateStart =
      earliestStart > interval.start ? earliestStart : interval.start
    if (candidateStart >= interval.end) {
      continue
    }
    const contiguous = Math.min(
      minutesBetween(candidateStart, interval.end),
      budgetCap,
    )
    if (contiguous < minUsable) {
      continue
    }
    return {
      block,
      start: candidateStart,
      availableMinutes: contiguous,
      fitsEntirely: contiguous >= durationMinutes,
    }
  }

  return null
}

/**
 * Find the best placement across all blocks. Preference order:
 * 1. Earlier DATE (front-loading: today's capacity is used before tomorrow's,
 *    matching the old day-by-day allocation order)
 * 2. Higher type-match class (exact > high-ratio combo > combo > any)
 * 3. Placements that fit the item entirely (no needless same-day splits)
 * 4. Earlier start time
 */
export function findBestFit(
  blocks: TimelineBlock[],
  taskTypeId: string | undefined,
  durationMinutes: number,
  earliestStart: Date,
  minimumSplitMinutes: number,
): SlotFit | null {
  let best: SlotFit | null = null
  let bestScore = -1

  for (const block of blocks) {
    const fit = findFitInBlock(
      block,
      taskTypeId,
      durationMinutes,
      earliestStart,
      minimumSplitMinutes,
    )
    if (!fit) {
      continue
    }
    const score = typeMatchScore(taskTypeId, block.typeConfig)
    const better =
      !best ||
      fit.block.date < best.block.date ||
      (fit.block.date === best.block.date &&
        (score > bestScore ||
          (score === bestScore &&
            ((fit.fitsEntirely && !best.fitsEntirely) ||
              (fit.fitsEntirely === best.fitsEntirely &&
                fit.start.getTime() < best.start.getTime())))))
    if (better) {
      best = fit
      bestScore = score
    }
  }

  return best
}

/**
 * Consume `durationMinutes` starting at `start` from the block's free time
 * (and, for combo blocks, from the task type's budget).
 *
 * Throws if the slice is not actually free — the allocator must only commit
 * placements produced by findFitInBlock/findBestFit. This is the invariant
 * that makes block-boundary violations impossible.
 */
export function allocateSlice(
  block: TimelineBlock,
  taskTypeId: string | undefined,
  start: Date,
  durationMinutes: number,
): void {
  const end = new Date(start.getTime() + durationMinutes * MS_PER_MINUTE)

  const containing = block.free.find(
    (interval) => start >= interval.start && end <= interval.end,
  )
  if (!containing) {
    throw new Error(
      `allocateSlice: [${start.toISOString()}, ${end.toISOString()}] is not free in block ${block.blockId} (${block.date})`,
    )
  }

  block.free = subtractInterval(block.free, start, end)

  if (block.typeBudget && taskTypeId) {
    const remaining = block.typeBudget.get(taskTypeId) ?? 0
    block.typeBudget.set(taskTypeId, remaining - durationMinutes)
  }
}
