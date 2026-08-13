# Resizable volume + movable, non-overlapping trays (visionOS)

Date: 2026-06-24
Surface: TaskPlannerVision (spatial port)

## Context

User feedback from device use:
1. **Tray slabs overlap and flicker at ~5 task types.** Root cause: `trayBounds` renders each
   slab at a fixed 0.26 m width while `laneCenterX` spacing shrinks with type count. At 5 types the
   lane step (0.247 m) is below the slab width, so adjacent slabs overlap — and every slab sits at the
   *identical* depth (`panelZ + 0.05`), so two coplanar translucent surfaces z-fight (the flicker).
2. **The volume can't be resized / can't be made big.** The WindowGroup declared a fixed
   `.defaultSize` with no resizability, and the whole layout reads a hardcoded `VolumeMetrics.standard`
   (1.4×1.0×1.4) — nothing ever read the volume's actual size, so even a resize would be ignored.
3. **Trays are static and unmovable.** Tray slabs are non-interactive `ModelEntity`s; the layout
   engine derives each tray's x purely from its type index, with no per-type position override.

## Decision

Make `VolumeMetrics` geometry-driven and anchor each type's column + tray to its **panel entity's
stored position**, so all three are fixable without a Prisma migration.

- **Flicker:** tray width derives from the live lane step (`min(0.26, laneStep × 0.9)`) so adjacent
  default lanes always keep a ≥10% gap, and each lane gets a sub-mm depth stagger
  (`Float(index) × 0.0008`) so coplanar slabs can never z-fight even if a user drags two trays to
  overlap. Both are metrics-aware: a bigger volume → wider trays, more gap.
- **Resizable + adaptive:** the RealityView reads its real size via `GeometryReader3D` +
  `\.physicalMetrics` and pushes it to `viewModel.setVolumeSize`, which updates the observable
  `metrics`. Trays (live projections) reflow immediately. Persisted *cards* follow on an actual size
  change via a position-match classifier: an entity sitting at its computed default slot under the OLD
  metrics is "auto-placed" and is moved to the new computed slot; an entity that was hand-moved
  (doesn't match) is left alone. Persist is debounced so a drag-resize doesn't spam the network.
- **Movable trays:** the **type panel** becomes the tray's drag handle (`isMovable` includes
  `.typePanel`). `SpatialLayoutEngine.TypeInput.storedAnchor` makes the engine place the column + tray
  at the panel's actual stored position, so a moved tray + its column persist across restart (the panel
  position is already a persisted `SpatialEntity` field — no migration). On a panel drag-commit the
  whole column translates with it. "Send everything back to tray" (Clear) resets panel positions to the
  default lanes.

## Why not the alternatives

- **Add a `manuallyPlaced` boolean to `SpatialEntity`** (so reflow could pin hand-moved cards across
  restart precisely): rejected for this pass — requires a Prisma migration + server/router/Swift-model
  changes. The position-match classifier achieves the same intent within a session and the
  `storedAnchor` echo preserves arrangement across restart, with zero schema cost. Revisit if the
  classifier proves too coarse.
- **Full ImmersiveSpace** (true room-scale walk-around): user chose the resizable bounded volume —
  lower risk, keeps the toolbar/ornaments/sheets/companion windows working. Immersive remains a
  possible future milestone.

## Reversibility

High. The engine changes are additive (`storedAnchor` is an optional with a default; tray width/stagger
are pure math covered by SpatialKit tests). Geometry-driven metrics fall back to `.standard` when the
size is unknown. Movable panels can be reverted by removing `.typePanel` from `isMovable`.
