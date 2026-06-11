import Testing
import simd
@testable import SpatialKit

@Suite("VolumeMetrics")
struct VolumeMetricsTests {
    @Test func clampKeepsPointInUsableBounds() {
        let m = VolumeMetrics.standard
        let clamped = m.clamp(SIMD3(100, -100, 100))
        #expect(m.contains(clamped))
    }

    @Test func clampLeavesInteriorPointUnchanged() {
        let m = VolumeMetrics.standard
        let p = SIMD3<Float>(0.1, 0.1, 0.1)
        #expect(m.clamp(p) == p)
    }

    @Test func usableHalfIsPositiveAndInsetFromSize() {
        let m = VolumeMetrics.standard
        let h = m.usableHalf
        #expect(h.x > 0 && h.y > 0 && h.z > 0)
        #expect(h.x < m.size.x / 2)   // inset shrinks the usable region
    }

    @Test func defaultSpawnIsInsideBoundsAndNotOrigin() {
        let p = VolumeMetrics.standard.defaultSpawn()
        #expect(VolumeMetrics.standard.contains(p))
        #expect(p.z > 0)   // toward the viewer, never the origin (the stacking-bug guard)
    }
}

@Suite("SpatialMotion")
struct SpatialMotionTests {
    @Test func dampedStepMovesTowardTargetWithoutOvershoot() {
        let cur = SIMD3<Float>(0, 0, 0), tgt = SIMD3<Float>(1, 0, 0)
        let next = SpatialMotion.dampedStep(current: cur, target: tgt, factor: 0.5)
        #expect(next.x > cur.x)
        #expect(next.x < tgt.x)
    }

    @Test func dampedStepFactorOneReachesTargetNoOvershoot() {
        let cur = SIMD3<Float>(0, 0, 0), tgt = SIMD3<Float>(1, 0, 0)
        let next = SpatialMotion.dampedStep(current: cur, target: tgt, factor: 1.0)
        #expect(abs(next.x - tgt.x) < 1e-5)
    }

    @Test func dampedStepClampsFactorAboveOne() {
        let cur = SIMD3<Float>(0, 0, 0), tgt = SIMD3<Float>(1, 0, 0)
        let next = SpatialMotion.dampedStep(current: cur, target: tgt, factor: 5.0)
        #expect(next.x <= tgt.x + 1e-5)   // clamped to 1.0 internally, no overshoot
    }

    @Test func dampedStepSnapsWithinEpsilon() {
        let tgt = SIMD3<Float>(1, 0, 0)
        let cur = tgt - SIMD3<Float>(0.0001, 0, 0)   // < settleEpsilon (0.0005)
        #expect(SpatialMotion.dampedStep(current: cur, target: tgt, factor: 0.5) == tgt)
    }

    @Test func smoothingFactorStaysInUnitRange() {
        for dt: Float in [0, 0.008, 0.016, 0.1, 1.0] {
            let f = SpatialMotion.smoothingFactor(deltaTime: dt)
            #expect(f >= 0 && f <= 1)
        }
    }

    @Test func smoothingFactorIsZeroAtZeroDeltaTime() {
        #expect(SpatialMotion.smoothingFactor(deltaTime: 0) == 0)
    }

    @Test func pulseCurveIsZeroAtBothEnds() {
        for style in [PulseStyle.pop, .bounce] {
            #expect(abs(SpatialMotion.pulseCurve(0, style: style)) < 1e-5)
            #expect(abs(SpatialMotion.pulseCurve(1, style: style)) < 1e-5)
        }
    }

    @Test func popCurvePeaksPositiveMidway() {
        #expect(SpatialMotion.pulseCurve(0.5, style: .pop) > 0.9)   // sin(pi/2) == 1
    }
}

@Suite("SpatialLayoutEngine")
struct SpatialLayoutEngineTests {
    private func input(manual: [String: SIMD3<Float>] = [:]) -> SpatialLayoutEngine.Input {
        SpatialLayoutEngine.Input(
            types: [.init(typeId: "t1", panelEntityId: "p1", order: 0),
                    .init(typeId: "t2", panelEntityId: "p2", order: 1)],
            tasks: [.init(entityId: "a", typeId: "t1", order: 0),
                    .init(entityId: "b", typeId: "t1", order: 1)],
            manual: manual
        )
    }

    @Test func placesPanelsAndTheirTaskColumns() {
        let placements = SpatialLayoutEngine.layout(input())
        let pos = Dictionary(uniqueKeysWithValues: placements.map { ($0.entityId, $0.position) })

        #expect(pos["p1"] != nil && pos["p2"] != nil)        // both panels placed
        #expect(pos["a"] != nil && pos["b"] != nil)          // both tasks placed
        #expect(abs(pos["a"]!.x - pos["p1"]!.x) < 1e-4)      // task column aligns under its panel
        #expect(pos["b"]!.y < pos["a"]!.y)                   // stacked: second task is lower
        #expect(pos["p1"]!.x != pos["p2"]!.x)                // panels spread across a row
        for (_, p) in pos { #expect(VolumeMetrics.standard.contains(p)) }  // all clamped in-bounds
    }

    @Test func manualOverrideIsHonoredAndClamped() {
        let manual = SIMD3<Float>(0.2, 0.1, 0.0)
        let placements = SpatialLayoutEngine.layout(input(manual: ["a": manual]))
        let a = placements.first { $0.entityId == "a" }!.position
        #expect(a == VolumeMetrics.standard.clamp(manual))
    }

    @Test func emptyInputProducesNoPlacements() {
        let placements = SpatialLayoutEngine.layout(.init(types: [], tasks: []))
        #expect(placements.isEmpty)
    }

    @Test func trayBoundsOnePerTypeAlignedToColumns() {
        let trays = SpatialLayoutEngine.trayBounds(input())
        #expect(trays.count == 2)                                   // one backing per type
        let byType = Dictionary(uniqueKeysWithValues: trays.map { ($0.typeId, $0) })
        // A tray sits under its panel column (same x as the panel/task column).
        let placements = SpatialLayoutEngine.layout(input())
        let pos = Dictionary(uniqueKeysWithValues: placements.map { ($0.entityId, $0.position) })
        #expect(abs(byType["t1"]!.center.x - pos["p1"]!.x) < 1e-4)
        #expect(abs(byType["t2"]!.center.x - pos["p2"]!.x) < 1e-4)
        // Slabs have positive extent and sit slightly in front of the back plane.
        for tray in trays {
            #expect(tray.size.x > 0 && tray.size.y > 0 && tray.size.z > 0)
            #expect(tray.center.z > VolumeMetrics.standard.backZ)
        }
    }

    @Test func trayBoundsEmptyWhenNoTypes() {
        #expect(SpatialLayoutEngine.trayBounds(.init(types: [], tasks: [])).isEmpty)
    }
}
