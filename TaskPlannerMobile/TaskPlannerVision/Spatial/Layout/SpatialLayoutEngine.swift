import Foundation
import simd

/// Pure, deterministic layout engine for the spatial scene.
///
/// `nonisolated` + imports only Foundation/simd so it has no MainActor or I/O dependency
/// and is unit-testable in isolation. It takes plain projections of the domain (no
/// `TaskItem`/network) and returns `[Placement]` (entityId → meters in scene space).
///
/// Phase 2 implements the **type-cluster** layout: one panel per task type spread in a row
/// near the top of the volume, with that type's standalone sprint tasks stacked in a column
/// beneath it. Manual (hand-moved) entities are emitted verbatim and excluded from auto-flow.
/// Workflow step-graph layout is added in a later phase.
nonisolated enum SpatialLayoutEngine {

    struct TypeInput: Sendable, Equatable {
        let typeId: String
        let panelEntityId: String
        let order: Int
    }

    struct TaskInput: Sendable, Equatable {
        let entityId: String
        let typeId: String
        let order: Int
    }

    struct Input: Sendable {
        var types: [TypeInput]
        var tasks: [TaskInput]
        /// entityId → fixed position; these override computed positions and are removed
        /// from auto-flow (hand-moved nodes stick).
        var manual: [String: SIMD3<Float>]
        var metrics: VolumeMetrics

        init(types: [TypeInput], tasks: [TaskInput], manual: [String: SIMD3<Float>] = [:], metrics: VolumeMetrics = .standard) {
            self.types = types
            self.tasks = tasks
            self.manual = manual
            self.metrics = metrics
        }
    }

    struct Placement: Sendable, Equatable {
        let entityId: String
        let position: SIMD3<Float>
    }

    /// A translucent backing slab behind a type's column (the visual "tray"). Center + size in meters.
    struct TrayBounds: Sendable, Equatable {
        let typeId: String
        let center: SIMD3<Float>
        let size: SIMD3<Float>
    }

    /// One tray backing per type, spanning that type's column region (below its panel) at the column
    /// depth. Pure (no entities) so the visual bounds match the column layout math exactly.
    static func trayBounds(_ input: Input) -> [TrayBounds] {
        let m = input.metrics
        let sortedTypes = input.types.sorted { $0.order < $1.order }
        let n = sortedTypes.count

        let panelY = m.headerY
        let panelZ = m.backZ
        let columnBottom = -m.usableHalf.y + 0.06
        let top = panelY - 0.10          // just below the panel header
        let bottom = columnBottom - 0.03 // just below the lowest card slot
        let centerY = (top + bottom) / 2
        let height = max(top - bottom, Float(0.1))

        return sortedTypes.enumerated().map { i, type in
            let x = laneCenterX(index: i, count: n, halfX: m.usableHalf.x)
            return TrayBounds(
                typeId: type.typeId,
                center: SIMD3(x, centerY, panelZ + 0.05),   // just behind the column cards (panelZ + 0.06)
                size: SIMD3(0.26, height, 0.006)
            )
        }
    }

    static func layout(_ input: Input) -> [Placement] {
        let m = input.metrics
        var placements: [Placement] = []

        let sortedTypes = input.types.sorted { $0.order < $1.order }
        let n = sortedTypes.count

        // Panels in a row across the upper-back of the volume.
        let panelY = m.headerY
        let panelZ = m.backZ
        var laneX: [String: Float] = [:]   // typeId → column x

        for (i, type) in sortedTypes.enumerated() {
            let x = laneCenterX(index: i, count: n, halfX: m.usableHalf.x)
            laneX[type.typeId] = x
            placements.append(place(type.panelEntityId, [x, panelY, panelZ], input, m))
        }

        // Tasks grouped by type, stacked in a column under their panel.
        let tasksByType = Dictionary(grouping: input.tasks, by: { $0.typeId })
        let columnTop = panelY - 0.16
        let columnBottom = -m.usableHalf.y + 0.06
        let available = max(columnTop - columnBottom, Float(0.1))

        for type in sortedTypes {
            let columnTasks = (tasksByType[type.typeId] ?? []).sorted { $0.order < $1.order }
            guard !columnTasks.isEmpty else { continue }
            let x = laneX[type.typeId] ?? 0
            // Dynamic spacing so a long column packs to fit instead of clamping into a pile.
            let rowStep = min(Float(0.12), available / Float(columnTasks.count))
            for (row, task) in columnTasks.enumerated() {
                let y = columnTop - Float(row) * rowStep
                placements.append(place(task.entityId, [x, y, panelZ + 0.06], input, m))
            }
        }

        return placements
    }

    /// Even column center for `index` of `count` across the usable width.
    static func laneCenterX(index: Int, count: Int, halfX: Float) -> Float {
        guard count > 1 else { return 0 }
        let span = halfX * 1.7            // total horizontal span used by the row
        let step = span / Float(count - 1)
        return -span / 2 + Float(index) * step
    }

    /// Emit a placement, honoring a manual override and clamping into the volume.
    private static func place(_ entityId: String, _ computed: SIMD3<Float>, _ input: Input, _ m: VolumeMetrics) -> Placement {
        if let manual = input.manual[entityId] {
            return Placement(entityId: entityId, position: m.clamp(manual))
        }
        return Placement(entityId: entityId, position: m.clamp(computed))
    }
}
