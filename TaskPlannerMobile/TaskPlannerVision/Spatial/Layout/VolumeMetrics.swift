import simd

/// Single authority for the volume's coordinate space and usable bounds.
///
/// RealityView scene space is meters, y-up, with the origin at the volume's center
/// (verified in the Phase 0 spike: an attachment at `[0,0,0]` renders centered, so no
/// offset correction is needed). Every position the layout engine emits and every clamp
/// goes through this type — no scattered magic numbers elsewhere.
nonisolated struct VolumeMetrics: Sendable {
    /// Declared volume size in meters. Must match the volume WindowGroup's defaultSize.
    var size: SIMD3<Float>
    /// Inset from the walls so a card (and its depth/scale) stays fully inside the bounds.
    var inset: Float

    init(size: SIMD3<Float> = [1.4, 1.0, 1.4], inset: Float = 0.12) {
        self.size = size
        self.inset = inset
    }

    /// Half-extent of the usable region on each axis (origin-centered).
    var usableHalf: SIMD3<Float> {
        SIMD3(
            max(size.x / 2 - inset, 0.05),
            max(size.y / 2 - inset, 0.05),
            max(size.z / 2 - inset, 0.05)
        )
    }

    /// The top-of-volume y where type-panel headers sit.
    var headerY: Float { usableHalf.y }

    /// The back-of-volume z plane where clusters anchor (slightly forward of the wall).
    var backZ: Float { -usableHalf.z * 0.6 }

    /// Keep a point inside the usable bounds.
    func clamp(_ p: SIMD3<Float>) -> SIMD3<Float> {
        let h = usableHalf
        return SIMD3(
            min(max(p.x, -h.x), h.x),
            min(max(p.y, -h.y), h.y),
            min(max(p.z, -h.z), h.z)
        )
    }

    func contains(_ p: SIMD3<Float>) -> Bool {
        let h = usableHalf
        return abs(p.x) <= h.x + 1e-4 && abs(p.y) <= h.y + 1e-4 && abs(p.z) <= h.z + 1e-4
    }

    /// A spawn point slightly toward the viewer, never the origin (avoids the stacking bug).
    func defaultSpawn() -> SIMD3<Float> { clamp([0, 0, usableHalf.z * 0.4]) }

    static let standard = VolumeMetrics()
}
