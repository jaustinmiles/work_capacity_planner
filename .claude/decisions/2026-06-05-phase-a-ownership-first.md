# Phase A sequencing: land the ownership-token fix on the existing drag before ManipulationComponent

- **Date:** 2026-06-05
- **Status:** Decided, in progress
- **Area:** visionOS spatial UI rebuild (`.claude/rules/spatial-ui-architecture.md`, Phase A)

## Context

The architecture spec's Phase A bundles two things: (1) introduce the transform-ownership
model to kill the drag snap-back + fix the × control, and (2) replace the hand-rolled
`DragGesture` with `ManipulationComponent` (visionOS 26), keeping the hand-rolled path behind a
feature flag. Both depend on the new ownership token, but they are separable changes with very
different risk profiles. The spec itself flags a cross-cutting risk: `ManipulationComponent` has
a reported intermittent visionOS-26 bug where translation can stall app-wide.

## Options

1. **Implement both in one Phase A commit** (as the spec literally lists). Most faithful to the
   doc; largest single change; couples the bug fix to a higher-risk API swap.
2. **Ownership token on the EXISTING hand-rolled drag first (Phase A), then ManipulationComponent
   as the next increment (Phase A.2).** Smaller, lower-risk first step that fixes both user-facing
   bugs and proves the ownership contract; the API swap lands separately, independently verifiable.
3. **Skip ManipulationComponent entirely**, keep hand-rolled drag forever. Lowest risk, but
   abandons the more ergonomic/idiomatic two-handed manipulation the spec wants.

## Decision

**Option 2.** Phase A = the minimal ownership-model change on the existing translation drag:
- `TransformOwnership` + `ownershipByID`/`owner(of:)`/`claim(_:_:)`/`commitDrag(...)` on the
  (not-yet-split) `@Observable` view model.
- Drag `onChanged` claims `.gesture` in the observable model (not view `@State` — the visibility
  race that defeated the old `draggingID` guard); reconcile writes a transform only when
  `owner == .data`; `onEnded` commits synchronously (stored = final, hand-moved, release to
  `.data`) before the async persist.
- × control fix: flatten the card collider depth (0.012 m, was `max(z, 0.03)`), push the × child
  to +0.025 m so it is the frontmost, non-enclosed hit target, give the card and × distinct
  `HoverEffectComponent(.highlight(.default, groupID:))` groups, and delete the inert SwiftUI
  `.hoverEffect`.

`ManipulationComponent` (with `releaseBehavior = .stay`) becomes the immediately-following
increment, swapping in over the SAME ownership contract — so the bug fix is isolated from, and
verifiable before, the higher-risk API swap.

## Tradeoffs

- (+) Each user-facing bug is fixed in the smallest possible diff and verifiable on its own.
- (+) The ownership contract is proven before betting drag on a newer API with a known stall bug.
- (+) The hand-rolled drag survives as the natural fallback the spec wanted anyway.
- (−) Two increments instead of one; the doc's Phase A is split into A then A.2.
- (−) Until A.2, drag lacks ManipulationComponent's two-handed/rotate/scale ergonomics.

## Reversibility

Fully reversible. The ownership token is shared by both drag paths, so A.2 swaps the input
mechanism without touching the reconcile gate or the × fix. If `ManipulationComponent` proves
unreliable in the Simulator, A.2 is simply not landed and the hand-rolled drag remains.
