import Testing
import simd
@testable import SpatialKit

@Suite("StepGraphLayout")
struct StepGraphLayoutTests {
    typealias Node = SpatialLayoutEngine.StepNodeInput

    private func position(_ id: String, in placements: [SpatialLayoutEngine.Placement]) -> SIMD3<Float> {
        placements.first { $0.entityId == id }!.position
    }

    @Test func chainFlowsLeftToRight() {
        // Shuffled input order — the layered layout, not array order, decides x.
        let nodes = [
            Node(entityId: "c", stepId: "sc", dependsOn: ["sb"], order: 2),
            Node(entityId: "a", stepId: "sa", dependsOn: [], order: 0),
            Node(entityId: "b", stepId: "sb", dependsOn: ["sa"], order: 1),
        ]
        let p = SpatialLayoutEngine.stepGraph(nodes: nodes, volume: .zero)
        #expect(position("a", in: p).x < position("b", in: p).x)
        #expect(position("b", in: p).x < position("c", in: p).x)
    }

    @Test func levelsUseLongestPathNotDirectDependency() {
        // d depends on a directly AND through b — longest path puts d at level 2.
        let nodes = [
            Node(entityId: "a", stepId: "sa", dependsOn: [], order: 0),
            Node(entityId: "b", stepId: "sb", dependsOn: ["sa"], order: 1),
            Node(entityId: "d", stepId: "sd", dependsOn: ["sa", "sb"], order: 2),
        ]
        #expect(SpatialLayoutEngine.stepLevels(nodes) == ["a": 0, "b": 1, "d": 2])
    }

    @Test func diamondSiblingsShareColumnWithVerticalSpacing() {
        let nodes = [
            Node(entityId: "a", stepId: "sa", dependsOn: [], order: 0),
            Node(entityId: "b", stepId: "sb", dependsOn: ["sa"], order: 1),
            Node(entityId: "c", stepId: "sc", dependsOn: ["sa"], order: 2),
            Node(entityId: "d", stepId: "sd", dependsOn: ["sb", "sc"], order: 3),
        ]
        let p = SpatialLayoutEngine.stepGraph(nodes: nodes, volume: .zero)
        let b = position("b", in: p), c = position("c", in: p)
        #expect(abs(b.x - c.x) < 1e-5)
        #expect(abs(b.y - c.y) >= SpatialLayoutEngine.stepRowGap - 1e-5)
        #expect(position("a", in: p).x < b.x)
        #expect(b.x < position("d", in: p).x)
    }

    @Test func storedPositionsRestoreVerbatimWithoutAnchor() {
        let stored = SIMD3<Float>(0.3, -0.2, 0.1)
        let nodes = [Node(entityId: "a", stepId: "sa", dependsOn: [], order: 0, stored: stored)]
        let p = SpatialLayoutEngine.stepGraph(nodes: nodes, volume: SIMD3(0.5, 0, 0))
        #expect(position("a", in: p) == stored)
    }

    @Test func anchorTranslatesStoredShapeByVolumeDelta() {
        let nodes = [
            Node(entityId: "a", stepId: "sa", dependsOn: [], order: 0, stored: SIMD3(0.1, 0, 0)),
            Node(entityId: "b", stepId: "sb", dependsOn: ["sa"], order: 1, stored: SIMD3(0.3, 0.1, 0)),
        ]
        // The volume moved −0.2 in x since collapse; the whole shape follows it.
        let p = SpatialLayoutEngine.stepGraph(
            nodes: nodes,
            volume: SIMD3(0.2, 0, 0),
            collapseAnchor: SIMD3(0.4, 0, 0)
        )
        #expect(simd_distance(position("a", in: p), SIMD3(-0.1, 0, 0)) < 1e-5)
        #expect(simd_distance(position("b", in: p), SIMD3(0.1, 0.1, 0)) < 1e-5)
    }

    @Test func newlyJoinedStepGetsGridSlotWhileOthersKeepStored() {
        let storedA = SIMD3<Float>(-0.4, 0.2, 0.1)
        let nodes = [
            Node(entityId: "a", stepId: "sa", dependsOn: [], order: 0, stored: storedA),
            Node(entityId: "new", stepId: "snew", dependsOn: ["sa"], order: 1),
        ]
        let p = SpatialLayoutEngine.stepGraph(nodes: nodes, volume: .zero)
        #expect(position("a", in: p) == storedA)
        #expect(VolumeMetrics.standard.contains(position("new", in: p)))
    }

    @Test func dependencyCycleTerminatesAndPlacesEveryNode() {
        let nodes = [
            Node(entityId: "a", stepId: "sa", dependsOn: ["sb"], order: 0),
            Node(entityId: "b", stepId: "sb", dependsOn: ["sa"], order: 1),
        ]
        let p = SpatialLayoutEngine.stepGraph(nodes: nodes, volume: .zero)
        #expect(p.count == 2)
        #expect(p.allSatisfy { VolumeMetrics.standard.contains($0.position) })
    }

    @Test func outOfSetDependenciesAreIgnored() {
        let nodes = [Node(entityId: "a", stepId: "sa", dependsOn: ["missing"], order: 0)]
        #expect(SpatialLayoutEngine.stepLevels(nodes) == ["a": 0])
    }

    @Test func longChainPacksInsideBoundsWithMonotoneX() {
        let nodes = (0..<12).map { i in
            Node(entityId: "e\(i)", stepId: "s\(i)", dependsOn: i == 0 ? [] : ["s\(i - 1)"], order: i)
        }
        // Volume near a corner: the grid center shifts so the whole span still fits.
        let p = SpatialLayoutEngine.stepGraph(nodes: nodes, volume: SIMD3(0.5, 0.4, 0))
        #expect(p.allSatisfy { VolumeMetrics.standard.contains($0.position) })
        let xs = (0..<12).map { position("e\($0)", in: p).x }
        #expect(zip(xs, xs.dropFirst()).allSatisfy { $0 < $1 })
    }

    @Test func deterministicForSameInput() {
        let nodes = [
            Node(entityId: "a", stepId: "sa", dependsOn: [], order: 0),
            Node(entityId: "b", stepId: "sb", dependsOn: ["sa"], order: 1),
            Node(entityId: "c", stepId: "sc", dependsOn: ["sa"], order: 2),
        ]
        let first = SpatialLayoutEngine.stepGraph(nodes: nodes, volume: SIMD3(0.1, 0.1, 0.1))
        let second = SpatialLayoutEngine.stepGraph(nodes: nodes, volume: SIMD3(0.1, 0.1, 0.1))
        #expect(first == second)
    }
}
