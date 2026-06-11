import Foundation

/// Who owns a spatial entity's *presented* transform at a given instant.
///
/// The load-bearing concept of the spatial UI architecture
/// (`.claude/rules/spatial-ui-architecture.md`). Exactly one authority owns an entity's
/// live transform at any moment, and the authoritative value lives in `@Observable` model
/// state (`SpatialSceneViewModel.ownershipByID`) — never in SwiftUI view `@State`, which is
/// not reliably visible to the RealityView `update:` (reconcile) pass mid-gesture. That
/// visibility race is exactly why the old `draggingID` guard failed; encoding ownership in
/// observed model state fixes it.
///
/// The reconcile pass may write an entity's transform ONLY when the owner is `.data`; while a
/// gesture or animation owns it, the reconcile pass leaves the live transform alone.
enum TransformOwnership: Equatable {
    /// The data model / layout engine owns the transform (the resting state). The reconcile
    /// pass is free to position the entity at its stored/target position.
    case data
    /// A live gesture (drag) owns the transform. The reconcile pass must not touch it.
    case gesture
    /// An animation owns the transform (an in-flight `Entity.animate`/move). The reconcile
    /// pass must not touch it until the animation releases ownership back to `.data`.
    case animating
}
