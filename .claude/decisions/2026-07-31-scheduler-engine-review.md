# Scheduling Engine Review — findings & redesign kickoff

Date: 2026-07-31
Branch: `feature/scheduler-review-redesign`

> **UPDATE (2026-07-31, same branch):** the recommended direction was approved and
> BUILT — interval-based free-slot core + dependency wavefront + endeavor hard blocks
> + async-wait projection, same public API. Architecture doc:
> `.claude/rules/scheduler-engine.md`. Findings 1-6 below are fixed; 7 partially
> (inspector fixed; `totalCapacity` column still dead), 8 addressed by the redesign.
Trigger: blocks in the "nvidia consistent" session (Fri 16:45–20:20, Sat 09:52–12:09) were
ignored — the schedule ran continuously from 16:53 Friday through 12:08 Saturday, overnight.

## Reproduction (replicated exactly, byte-for-byte timestamps)

`scripts/dev/scheduler-replay.ts` (new) replays `UnifiedScheduler.scheduleForDisplay` against
REAL session data with the desktop store's exact context/config, and flags any scheduled item
whose start/end falls outside its assigned block's window:

```
npx tsx scripts/dev/scheduler-replay.ts --session "nvidia consistent" --at "2026-07-31T16:53:35"
# → 13 BLOCK-BOUNDARY VIOLATIONS (every item after 20:08 Friday, all carrying the SATURDAY blockId)

npx tsx scripts/dev/scheduler-replay.ts --seed-demo --at "<today>T18:10:00"
# → minimal repro: 3 tasks, 2 one-hour blocks, 2 violations (lab session "Claude Scheduler Lab")
```

Exit code 1 on violations → usable as a live regression gate during the redesign.

## Root cause of the headline bug (confirmed by replay)

**`findNextAvailableTime` (unified-scheduler.ts:1788) walks backwards in time.**

When scheduling day N+1's block (no `currentTime` constraint — that's only passed for
`dayIndex === 0`, :698), the gap-search starts `candidateTime` at the block start (e.g. Sat
09:52), then iterates ALL previously scheduled items sorted by start. For each item not
starting after `candidateTime` it does:

```ts
candidateTime = new Date(item.endTime!.getTime())   // :1817 — unconditional, NO Math.max
```

Friday's items all start before Sat 09:52, so the candidate is dragged BACKWARD to Friday
16:53, then walked forward to the end of Friday's last item (20:08). Result: the Saturday
block's "next available time" is **Friday 20:08 PM**.

Then `canFitInBlock` (:1420) computes
`remainingTimeInBlock = block.endTime − potentialStartTime` (:1483) = Sat 12:09 − Fri 20:08 ≈
**961 minutes of phantom capacity spanning the night**, and the boundary check at :1478
passes (Fri 20:08 < Sat 12:09). Every remaining item is then packed sequentially into that
phantom window with `blockId` = Saturday's block. This explains all 13 overnight items and
why the first ~7 items (day 0, where the `currentTime` branch at :1868 DOES have `Math.max`)
looked correct.

Three compounding defects in the same path:
1. The no-currentTime branch (:1812-1820) lacks the `Math.max` clamp its sibling branch has
   (:1868) — two hand-rolled copies of the same loop, one wrong.
2. `canFitInBlock` passes ALL scheduled items (every day, every block, :1474) into a
   parameter literally named `scheduledInBlock` — nothing scopes the gap-walk to the block.
3. `candidateTime` is never clamped to `[block.startTime, block.endTime]`, and the computed
   `endTime = start + duration` (:1677) is never re-validated against the block end.

## Other confirmed defects (in priority order)

1. **Dependency start-override bypasses block boundaries** (`scheduleItemInBlock`, :1669-1675):
   after fit-selection, `startTime` is pushed to `getLatestDependencyEndTime` with no re-check
   that the item still fits its block. A dependency ending late (or an async wait block) pushes
   the dependent past the block end silently. (Code-verified; latent — the nvidia repro didn't
   need it to fire.)
2. **Items scheduled outside their block are invisible to capacity accounting**:
   `calculateOverlapDuration` (:1507) clamps to the block window, so overflowed items consume
   ZERO capacity — the engine cannot even see the damage it causes, and keeps packing.
3. **Cross-workflow endeavor dependencies never reach the engine** — the known
   `endeavor-links-scheduler` issue (decisions/2026-06-11-hardening-findings/, confirmed).
   `ScheduleContext` has no endeavor input; no call site queries `EndeavorDependency`. The
   schema contract `isHardBlock: true = blocks scheduler` is only honored by
   `next-unblocked-step.ts` (endeavor graph button), not by scheduling or the deep-work board.
4. **Split reporting double-counts**: `result.unscheduled` is derived from ORIGINAL item ids,
   but split parts get new ids (`${id}-part-${n}`), so "Yield WC Design (120 min)" is reported
   fully unscheduled while its "Part 1/2" (90 min) is simultaneously scheduled. The split
   lookahead (:749-800) also counts future-day capacity without regard to what will actually be
   scheduled there (overcommit), and disabled-splitting silently TRUNCATES the task (:823-838).
5. **`resolveDependencies` auto-heals by silently deleting unknown deps** (:2020-2070) — masks
   data bugs and will fight any future endeavor-dependency injection.
6. **Renderer timezone bug**: `useWorkPatternStore.loadWorkPatterns` computes `todayKey` with
   `toISOString().split('T')[0]` (UTC — wrong after 4/5 PM Pacific), while the rest of the
   system uses `getLocalDateString`. Current-block/accumulated-time displays flip to
   "tomorrow" every evening.
7. **Dead/misleading persistence**: `WorkBlock.totalCapacity` is stored as 0 and ignored (the
   engine recomputes from start/end); `scheduleForPersistence` fabricates "mock enhanced
   features that tests expect" (:1109). `scripts/dev/db-inspector.ts` still read the pre-
   `typeConfig` schema and crashed on inspection (fixed in this branch).
8. **Design smells for the redesign**: capacity is modeled as fungible minutes rather than
   time intervals (the root enabler of the phantom-window bug); wait blocks share their
   parent's id (`getLatestDependencyEndTime` relies on this pun); `currentTime` handling
   differs for day 0 vs later days; `maxDays = 30` hardcoded; per-call `new UnifiedScheduler()`
   with `scheduledItemsReference` mutable instance state; three entry points (desktop store,
   `task.getNextScheduled`, `task.getFullSchedule`) each hand-build context slightly
   differently.

## Priority-breakdown legend (user-facing confusion)

The debug table letters (`SchedulingDebugInfo.tsx`): **E** = Eisenhower (importance ×
urgency), **D** = deadline boost, **A** = async boost, **C** = cognitive match, **S** =
context-switch penalty, **W** = workflow-depth (critical-path) bonus — W is NOT "wait time".

## Redesign directions (awaiting product guidance — per operating agreement)

- **Interval-based free-slot model**: represent each block as a set of free time intervals
  on a concrete date; scheduling an item consumes an interval. Boundary violations become
  impossible by construction (same philosophy as the Vision port's transform-ownership fix:
  make the bug unrepresentable, don't patch the symptom).
- **Single scheduling pass with an explicit dependency-ready queue** (topological wavefront)
  instead of the O(n²) retry loop + auto-heal.
- **First-class inputs**: endeavor dependencies (hard blocks), async waits as real timeline
  reservations independent of work capacity, meetings as interval subtractions.
- Keep: type/combo/any block matching semantics, priority model (Eisenhower + boosts),
  splitting concept (with honest accounting), `scheduleForDisplay` as the single public
  entry used by all three call sites.
- Test strategy: keep the pure Vitest suite, but gate on `scheduler-replay.ts` runs against
  real sessions (fast, seconds) — the lab session (`--seed-demo`) provides a stable minimal
  fixture.
