import Testing
@testable import SpatialKit

@Suite("SceneReducer.diff")
struct SceneReducerDiffTests {
    @Test func computesAddedAndRemoved() {
        let d = SceneReducer.diff(previous: ["a", "b"], current: ["b", "c"], ownership: [:])
        #expect(d.added == ["c"])
        #expect(d.removed == ["a"])
    }

    @Test func writableDefaultsToDataWhenOwnerAbsent() {
        let d = SceneReducer.diff(previous: [], current: ["a", "b"], ownership: [:])
        #expect(Set(d.writable) == ["a", "b"])
    }

    /// THE snap-back regression: a gesture- or animation-owned id is NEVER writable, so the
    /// reconcile pass can't fight a live drag/animation. This is the invariant the whole
    /// architecture rests on.
    @Test func snapBackInvariant_gestureAndAnimatingAreNeverWritable() {
        let ownership: [String: TransformOwnership] = [
            "dragging": .gesture, "animating": .animating, "resting": .data,
        ]
        let d = SceneReducer.diff(previous: [], current: ["dragging", "animating", "resting"], ownership: ownership)
        #expect(!d.writable.contains("dragging"))
        #expect(!d.writable.contains("animating"))
        #expect(d.writable.contains("resting"))
    }

    @Test func writableIdsStandaloneMatchesGate() {
        let ownership: [String: TransformOwnership] = ["x": .gesture, "y": .data, "z": .animating]
        #expect(SceneReducer.writableIds(current: ["x", "y", "z"], ownership: ownership) == ["y"])
    }
}

@Suite("ConnectionRules.intent (merge vs link matrix)")
struct ConnectionRulesTests {
    @Test func taskToTaskMerges() {
        #expect(ConnectionRules.intent(source: .taskNode, target: .taskNode,
                                       sameStepParent: false, sourceIsWorkflow: false, targetIsWorkflow: false) == .merge)
    }

    @Test func taskAndStepMergeBothDirections() {
        #expect(ConnectionRules.intent(source: .taskNode, target: .stepNode,
                                       sameStepParent: false, sourceIsWorkflow: false, targetIsWorkflow: true) == .merge)
        #expect(ConnectionRules.intent(source: .stepNode, target: .taskNode,
                                       sameStepParent: false, sourceIsWorkflow: true, targetIsWorkflow: false) == .merge)
    }

    @Test func stepToStepSameParentMerges_differentParentLinks() {
        #expect(ConnectionRules.intent(source: .stepNode, target: .stepNode,
                                       sameStepParent: true, sourceIsWorkflow: true, targetIsWorkflow: true) == .merge)
        #expect(ConnectionRules.intent(source: .stepNode, target: .stepNode,
                                       sameStepParent: false, sourceIsWorkflow: true, targetIsWorkflow: true) == .link)
    }

    @Test func twoWorkflowsLink_neverMerge() {
        #expect(ConnectionRules.intent(source: .workflowVolume, target: .workflowVolume,
                                       sameStepParent: false, sourceIsWorkflow: true, targetIsWorkflow: true) == .link)
    }

    @Test func taskToWorkflowJoins() {
        // Only one side is a workflow → join (merge), resolved directionally in connectByDrag.
        #expect(ConnectionRules.intent(source: .taskNode, target: .workflowVolume,
                                       sameStepParent: false, sourceIsWorkflow: false, targetIsWorkflow: true) == .merge)
    }
}
