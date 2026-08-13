/**
 * Wavefront Allocator — dependency-ordered placement onto the block timeline.
 *
 * Replaces the old day-by-day retry loop in UnifiedScheduler.allocateToWorkBlocks.
 * Items become "ready" when every dependency has a projected effective end
 * (work end + async wait). Ready items are placed highest-priority-first into
 * the earliest compatible free slot via block-timeline, which makes scheduling
 * outside a block's window impossible by construction.
 *
 * Key semantics preserved from the old allocator (see
 * decisions/2026-07-31-scheduler-engine-review.md):
 * - Wait display items share the parent item's id (`⏳ Wait:` / `⏳ Waiting:`);
 *   the renderer's next-item logic depends on this.
 * - Split parts are `${id}-part-N` named `(Part n/total)`.
 * - Splitting disabled → the item is truncated to what fits (with a warning).
 * - Unknown dependency ids are "healed" (ignored) but reported.
 *
 * Deliberate behavior changes:
 * - Dependents of a WAITING item are projected after the wait timer expires
 *   instead of being dumped into "unscheduled" (the wait end is known).
 * - Dependents of a split task wait for the FINAL part (the old code gated on
 *   whichever part happened to match first).
 *
 * Pure module: no Date.now(), no I/O.
 */

import type { UnifiedScheduleItem } from '../unified-scheduler'
import { UnifiedScheduleItemType } from '../enums'
import { detectDependencyCycles } from '../graph-utils'
import {
  TimelineBlock,
  findBestFit,
  allocateSlice,
} from './block-timeline'

const MS_PER_MINUTE = 60_000

export interface AllocatorConfig {
  allowTaskSplitting: boolean
  minimumSplitMinutes: number
}

export interface UnscheduledEntry {
  item: UnifiedScheduleItem
  reason: string
}

export interface HealedDependency {
  itemId: string
  itemName: string
  missingDependencyId: string
}

export interface AllocationResult {
  scheduled: UnifiedScheduleItem[]
  unscheduled: UnscheduledEntry[]
  /** Dependencies that referenced unknown ids and were ignored */
  healedDependencies: HealedDependency[]
  /** Human-readable allocation warnings (e.g. truncation) */
  warnings: string[]
}

interface PlacedPart {
  start: Date
  end: Date
  minutes: number
  blockId: string
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * MS_PER_MINUTE)
}

function laterOf(a: Date, b: Date): Date {
  return a > b ? a : b
}

/**
 * Allocate active items onto the timeline.
 *
 * @param items Active (non-completed) items with priorities already computed
 * @param completedItemIds Items completed before this run (satisfy deps)
 * @param timeline Mutable block timeline (free intervals are consumed)
 * @param now Scheduling anchor — nothing is placed before this instant
 * @param preBlocked Items unschedulable before allocation starts (e.g. hard
 *   endeavor blocks whose blocker isn't loaded), with their reasons
 */
export function allocateItems(
  items: UnifiedScheduleItem[],
  completedItemIds: Set<string>,
  timeline: TimelineBlock[],
  now: Date,
  config: AllocatorConfig,
  preBlocked: Map<string, string> = new Map(),
): AllocationResult {
  const scheduled: UnifiedScheduleItem[] = []
  const unscheduled: UnscheduledEntry[] = []
  const healedDependencies: HealedDependency[] = []
  const warnings: string[] = []

  /** Projected instant after which dependents of an item may start */
  const effectiveEnd = new Map<string, Date>()
  /** Items that can never produce an effective end, with the reason */
  const failed = new Map<string, string>()

  const byId = new Map(items.map((item) => [item.id, item]))

  // Resolve each item's dependencies once: unknown ids are ignored ("healed")
  // but reported so data problems stay visible.
  const validDeps = new Map<string, string[]>()
  for (const item of items) {
    const deps: string[] = []
    for (const depId of item.dependencies || []) {
      if (byId.has(depId) || completedItemIds.has(depId)) {
        deps.push(depId)
      } else {
        healedDependencies.push({
          itemId: item.id,
          itemName: item.name,
          missingDependencyId: depId,
        })
      }
    }
    validDeps.set(item.id, deps)
  }

  // --- Waiting items: the work is external; project the timer expiry -------
  for (const item of items) {
    if (!item.isWaitingOnAsync) continue

    const waitStart = item.completedAt ? new Date(item.completedAt) : now
    if (item.asyncWaitTime && item.asyncWaitTime > 0) {
      const waitEnd = addMinutes(waitStart, item.asyncWaitTime)
      const containingBlock = timeline.find(
        (block) => waitStart >= block.start && waitStart < block.end,
      )
      scheduled.push({
        id: item.id,
        name: `⏳ Waiting: ${item.name}`,
        type: UnifiedScheduleItemType.AsyncWait,
        duration: item.asyncWaitTime,
        priority: 0,
        startTime: waitStart,
        endTime: waitEnd,
        isWaitTime: true,
        isWaitingOnAsync: true,
        ...(containingBlock && { blockId: containingBlock.blockId }),
        ...(item.workflowId && { workflowId: item.workflowId }),
        ...(item.workflowName && { workflowName: item.workflowName }),
        ...(item.originalItem && { originalItem: item.originalItem }),
      })
      effectiveEnd.set(item.id, waitEnd)
    } else {
      failed.set(item.id, `"${item.name}" is waiting on external work with no timer`)
    }
  }

  // --- Pre-blocked items (e.g. unresolved endeavor hard blocks) ------------
  for (const [itemId, reason] of preBlocked) {
    const item = byId.get(itemId)
    if (item && !item.isWaitingOnAsync) {
      failed.set(itemId, reason)
      unscheduled.push({ item, reason })
    }
  }

  // --- Cycle detection: cycle members can never become ready ---------------
  const pending = items.filter(
    (item) => !item.isWaitingOnAsync && !preBlocked.has(item.id),
  )
  const pendingIds = new Set(pending.map((item) => item.id))
  const graph = new Map<string, string[]>()
  for (const item of pending) {
    graph.set(
      item.id,
      (validDeps.get(item.id) || []).filter((depId) => pendingIds.has(depId)),
    )
  }
  const cycleCheck = detectDependencyCycles(graph)
  const cycleIds = new Set(cycleCheck.hasCycle ? cycleCheck.cycles.flat() : [])
  for (const id of cycleIds) {
    failed.set(id, 'Circular dependency')
    const member = byId.get(id)
    if (member) {
      unscheduled.push({ item: member, reason: 'Circular dependency' })
    }
  }

  // --- Wavefront: place ready items highest-priority-first -----------------
  const remaining = pending.filter((item) => !cycleIds.has(item.id))

  const isReady = (item: UnifiedScheduleItem): boolean =>
    (validDeps.get(item.id) || []).every(
      (depId) => completedItemIds.has(depId) || effectiveEnd.has(depId),
    )

  const dependencyFloor = (item: UnifiedScheduleItem): Date => {
    let floor = now
    for (const depId of validDeps.get(item.id) || []) {
      const end = effectiveEnd.get(depId)
      if (end) {
        floor = laterOf(floor, end)
      }
    }
    return floor
  }

  /** Register completion of an item's work and emit its post-work wait */
  const finish = (item: UnifiedScheduleItem, workEnd: Date, blockId: string): void => {
    if (item.asyncWaitTime && item.asyncWaitTime > 0) {
      const waitEnd = addMinutes(workEnd, item.asyncWaitTime)
      scheduled.push({
        id: item.id, // Same id as the parent — dependents chain after the wait
        name: `⏳ Wait: ${item.name}`,
        type: UnifiedScheduleItemType.AsyncWait,
        duration: item.asyncWaitTime,
        priority: 0,
        startTime: workEnd,
        endTime: waitEnd,
        isWaitTime: true,
        blockId,
        ...(item.workflowId && { workflowId: item.workflowId }),
        ...(item.workflowName && { workflowName: item.workflowName }),
      })
      effectiveEnd.set(item.id, waitEnd)
    } else {
      effectiveEnd.set(item.id, workEnd)
    }
  }

  const markFailed = (item: UnifiedScheduleItem, reason: string): void => {
    failed.set(item.id, reason)
    unscheduled.push({ item, reason })
  }

  const place = (item: UnifiedScheduleItem): void => {
    const earliestStart = dependencyFloor(item)
    const fit = findBestFit(
      timeline,
      item.taskTypeId,
      item.duration,
      earliestStart,
      config.minimumSplitMinutes,
    )

    if (!fit) {
      markFailed(item, 'Could not find suitable time slot')
      return
    }

    if (fit.fitsEntirely) {
      allocateSlice(fit.block, item.taskTypeId, fit.start, item.duration)
      const endTime = addMinutes(fit.start, item.duration)
      scheduled.push({
        ...item,
        startTime: fit.start,
        endTime,
        blockId: fit.block.blockId,
      })
      finish(item, endTime, fit.block.blockId)
      return
    }

    if (!config.allowTaskSplitting) {
      // Legacy behavior: truncate to what fits, but say so.
      allocateSlice(fit.block, item.taskTypeId, fit.start, fit.availableMinutes)
      const endTime = addMinutes(fit.start, fit.availableMinutes)
      scheduled.push({
        ...item,
        duration: fit.availableMinutes,
        startTime: fit.start,
        endTime,
        blockId: fit.block.blockId,
      })
      warnings.push(
        `"${item.name}" truncated from ${item.duration} to ${fit.availableMinutes} minutes (task splitting disabled)`,
      )
      finish(item, endTime, fit.block.blockId)
      return
    }

    // --- Split across free slots/days ---------------------------------------
    const parts: PlacedPart[] = []
    let remainingMinutes = item.duration
    let nextFit = fit

    while (remainingMinutes > 0) {
      const take = Math.min(remainingMinutes, nextFit.availableMinutes)
      allocateSlice(nextFit.block, item.taskTypeId, nextFit.start, take)
      const partEnd = addMinutes(nextFit.start, take)
      parts.push({
        start: nextFit.start,
        end: partEnd,
        minutes: take,
        blockId: nextFit.block.blockId,
      })
      remainingMinutes -= take

      if (remainingMinutes <= 0) break
      const followUp = findBestFit(
        timeline,
        item.taskTypeId,
        remainingMinutes,
        partEnd,
        config.minimumSplitMinutes,
      )
      if (!followUp) break
      nextFit = followUp
    }

    const totalParts = parts.length + (remainingMinutes > 0 ? 1 : 0)

    const firstPart = parts[0]
    if (!firstPart) {
      // findBestFit guaranteed at least one usable slice; defensive only
      markFailed(item, 'Could not find suitable time slot')
      return
    }

    if (parts.length === 1 && remainingMinutes <= 0) {
      // Single slice ended up sufficing — no split bookkeeping needed
      const part = firstPart
      scheduled.push({
        ...item,
        startTime: part.start,
        endTime: part.end,
        blockId: part.blockId,
      })
      finish(item, part.end, part.blockId)
      return
    }

    let consumed = 0
    parts.forEach((part, index) => {
      consumed += part.minutes
      scheduled.push({
        ...item,
        id: `${item.id}-part-${index + 1}`,
        name: `${item.name} (Part ${index + 1}/${totalParts})`,
        duration: part.minutes,
        isSplit: true,
        splitPart: index + 1,
        splitTotal: totalParts,
        originalTaskId: item.originalTaskId || item.id,
        remainingDuration: item.duration - consumed,
        startTime: part.start,
        endTime: part.end,
        blockId: part.blockId,
      })
    })

    if (remainingMinutes > 0) {
      // Report ONLY the unplaced remainder — never the whole original —
      // so a task is not simultaneously "scheduled" and "unscheduled".
      unscheduled.push({
        item: {
          ...item,
          id: `${item.id}-part-${totalParts}`,
          name: `${item.name} (Part ${totalParts}/${totalParts})`,
          duration: remainingMinutes,
          isSplit: true,
          splitPart: totalParts,
          splitTotal: totalParts,
          originalTaskId: item.originalTaskId || item.id,
          remainingDuration: 0,
        },
        reason: 'Could not find suitable time slot',
      })
      // The work is not fully placed, so dependents cannot be projected.
      failed.set(item.id, `"${item.name}" is only partially scheduled`)
      return
    }

    const lastPart = parts[parts.length - 1]
    if (lastPart) {
      finish(item, lastPart.end, lastPart.blockId)
    }
  }

  const queue = [...remaining]
  while (queue.length > 0) {
    let best: UnifiedScheduleItem | null = null
    let bestIndex = -1
    for (let i = 0; i < queue.length; i++) {
      const candidate = queue[i]
      if (!candidate || !isReady(candidate)) continue
      // Skip items whose deps failed — they can never start
      const hasFailedDep = (validDeps.get(candidate.id) || []).some((depId) =>
        failed.has(depId),
      )
      if (hasFailedDep) continue
      if (!best || (candidate.priority || 0) > (best.priority || 0)) {
        best = candidate
        bestIndex = i
      }
    }

    if (!best || bestIndex === -1) break

    queue.splice(bestIndex, 1)
    place(best)
  }

  // --- Whatever is left is blocked by a dependency --------------------------
  for (const item of queue) {
    const blockers = (validDeps.get(item.id) || [])
      .filter((depId) => !completedItemIds.has(depId) && !effectiveEnd.has(depId))
      .map((depId) => byId.get(depId)?.name || depId)
    const reason = failed.has(item.id)
      ? failed.get(item.id)!
      : `Blocked by dependencies: ${blockers.join(', ')}`
    unscheduled.push({ item, reason })
  }

  return { scheduled, unscheduled, healedDependencies, warnings }
}
