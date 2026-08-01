# Scheduling Engine — interval-based core (redesigned 2026-07-31)

> The allocation core of `UnifiedScheduler` was rebuilt after the block-boundary bug
> (schedules ran overnight, ignoring work blocks — root cause + full findings:
> `.claude/decisions/2026-07-31-scheduler-engine-review.md`). ONE engine, same public
> API; the internals are now three pure modules under `src/shared/scheduler/`.

## The one thing to internalize: capacity is INTERVALS, not minutes

`src/shared/scheduler/block-timeline.ts` materializes every `DailyWorkPattern` block
onto its concrete date and tracks the FREE sub-intervals of each block (meetings
subtracted, free time clamped to `now` uniformly — no day-0 special case). Placing an
item = consuming a slice of a free interval (`allocateSlice` throws if the slice isn't
actually free). **An item outside its block's window is unrepresentable by
construction.** Never reintroduce fungible-minutes accounting or a separate "find next
available time" walk — that's exactly what produced the phantom overnight capacity.

## Architecture

```
scheduleForDisplay (unified-scheduler.ts — the ONLY app entry point; 3 call sites:
                    useSchedulerStore.computeSchedule, task.getNextScheduled, task.getFullSchedule)
  1. convertToUnifiedItems + validateConvertedItems     (scheduler-converters.ts, unchanged)
  2. priorities                                          (scheduler-priority.ts, unchanged)
  3. applyEndeavorDependencies                           (scheduler/endeavor-dependencies.ts)
  4. validateDependencies → result.conflicts/warnings    (reporting only)
  5. buildBlockTimeline + buildMeetingItems              (scheduler/block-timeline.ts)
  6. allocateItems                                       (scheduler/wavefront-allocator.ts)
  7. generateDebugInfo (reasons come FROM the allocator) + calculateMetrics
```

- **`wavefront-allocator.ts`** — dependency wavefront: an item becomes ready when every
  dep has a projected *effective end* (work end + asyncWaitTime); ready items place
  highest-priority-first via `findBestFit`. Cycles → unscheduled `Circular dependency`;
  unknown dep ids are ignored but reported (`healedDependencies`); items whose dep can
  never finish get `Blocked by dependencies: <names>`.
- **Block choice order** (`findBestFit`): earlier DATE → type-match class (exact >
  high-ratio combo > combo > any; untyped rejected) → full fit > partial → earlier
  start. I.e. front-load across days, prefer contiguity within a day. Combo blocks
  carry per-type minute budgets.
- **Async waits**: wait display items share the parent's id (`⏳ Wait:` post-work,
  `⏳ Waiting:` for waiting-status items) — the renderer's next-item logic depends on
  the id pun; do not change it. Dependents of a WAITING item are projected after the
  timer expiry (deliberate improvement — they used to be dumped in unscheduled).
- **Splitting**: `${id}-part-N` / `(Part n/total)`; dependents gate on the FINAL part;
  an unplaced remainder is reported as the remainder part only (no double-count).
  Splitting disabled → truncate + warning (legacy behavior, surfaced).
- **Endeavor dependencies are a first-class input**: `ScheduleContext.endeavorDependencies`
  (hard blocks only; blocked step, or every step of a blocked workflow, gains an edge on
  the blocking step; unresolvable blockers → conservatively unscheduled, never silently
  healed). Hydration: desktop = `endeavor.getAllDependencies` → `useEndeavorStore.allDependencies`
  → storeConnector → `useSchedulerStore.setInputs`; server = `loadEndeavorDependencyEdges`
  (`src/server/endeavor-dependency-edges.ts`) in both task.ts scheduling procedures.

## Debugging with real data (do this before writing tests)

`npx tsx scripts/dev/scheduler-replay.ts [--session <id|name>] [--at <ISO>] [--seed-demo]`
replays the exact desktop scheduling path against the real DB and **exits 1 if any item
lands outside its block window**. `--seed-demo` maintains the isolated "Claude Scheduler
Lab" session. Replay first, reproduce, then encode the repro as a Vitest case.

## Testing

- Pure core: `src/shared/scheduler/__tests__/` (timeline, allocator, endeavor injection).
- Engine-level: `src/shared/__tests__/unified-scheduler-*.test.ts` run through
  `scheduleForDisplay`/`allocateToWorkBlocks` (the persistence/split/findAvailableSlots
  method-level tests were rewritten when those methods were deleted).
- Replay gates: nvidia-consistent and lab sessions must show `✅ All items respect their
  block windows`.

## Gotchas / invariants

- `getLocalDateString`/`dateToYYYYMMDD` for date keys, NEVER `toISOString().split('T')[0]`
  (UTC flips to tomorrow in the evening Pacific — this bug was in useWorkPatternStore).
- `calculateBlockUtilization` (debug UI) still groups items by UTC date internally —
  known cosmetic debt.
- `calculateOptimalSchedule` / `modelParallelExecution` / `calculateMinimumCompletionTime`
  on the class are test-only analysis utilities (candidates for deletion/extraction).
- `WorkBlock.totalCapacity` in the DB is ignored by the engine (recomputed from
  start/end); treat the column as display metadata at best.
