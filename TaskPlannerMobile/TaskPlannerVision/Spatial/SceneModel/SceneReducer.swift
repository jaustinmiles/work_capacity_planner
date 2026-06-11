import Foundation

/// The pure, `nonisolated`, RealityKit-free decision logic behind the reconcile pass and
/// drag-to-connect — extracted so it is unit-testable on macOS via the SpatialKit package
/// (Foundation-only, like the layout engine). The View/reconcile and the view model call into it;
/// they own the side effects (mutating entities, calling tRPC), this owns the decisions.
nonisolated enum SceneReducer {

    /// What a reconcile pass should do, derived purely from entity identity + ownership.
    struct SceneDiff: Equatable {
        /// Ids present now but not in the previous pass (entrance candidates).
        var added: [String]
        /// Ids present last pass but gone now (exit / removal).
        var removed: [String]
        /// Ids whose transform the reconcile MAY write — i.e. the data model owns them. This is
        /// the load-bearing snap-back guard: a gesture- or animation-owned id is NEVER writable,
        /// so the reconcile can't fight a live drag/animation.
        var writable: [String]
    }

    /// Pure reconcile decision. `current` is this pass's rendered id list (order preserved for
    /// `added`/`writable`); `previous` is last pass's id set; `ownership` maps id → owner.
    static func diff(previous: Set<String>,
                     current: [String],
                     ownership: [String: TransformOwnership]) -> SceneDiff {
        let currentSet = Set(current)
        return SceneDiff(
            added: current.filter { !previous.contains($0) },
            removed: previous.subtracting(currentSet).sorted(),
            writable: writableIds(current: current, ownership: ownership)
        )
    }

    /// Ids whose transform the reconcile may write (data-owned) — the snap-back guard in isolation,
    /// usable per-pass without tracking the previous set. An absent owner defaults to `.data`.
    static func writableIds(current: [String], ownership: [String: TransformOwnership]) -> [String] {
        current.filter { (ownership[$0] ?? .data) == .data }
    }
}

/// Whether dropping one node's port onto another forms a workflow (merge) or a dependency (link).
enum ConnectionIntent: Equatable { case merge, link, invalid }

/// Pure merge-vs-link decision matrix for drag-to-connect. Routes CROSS-workflow ordering to LINK
/// (an EndeavorDependency) per the "do not conflate the two connection semantics" doctrine — never
/// `connect`. Inputs are gathered by the view model (which can look up entity kinds + step parents);
/// keeping the matrix pure makes the highest-risk decision unit-testable.
nonisolated enum ConnectionRules {
    static func intent(source: SpatialEntityKind,
                       target: SpatialEntityKind,
                       sameStepParent: Bool,
                       sourceIsWorkflow: Bool,
                       targetIsWorkflow: Bool) -> ConnectionIntent {
        switch (source, target) {
        case (.taskNode, .taskNode):
            return .merge                                   // CreateWorkflow
        case (.taskNode, .stepNode), (.stepNode, .taskNode):
            return .merge                                   // JoinWorkflow
        case (.stepNode, .stepNode):
            return sameStepParent ? .merge : .link          // intra-workflow dependsOn, else cross-link
        default:
            // A workflowVolume on at least one side: two real workflows stay separate (link);
            // task↔workflow joins (merge), resolved directionally in connectByDrag.
            return (sourceIsWorkflow && targetIsWorkflow) ? .link : .merge
        }
    }
}
