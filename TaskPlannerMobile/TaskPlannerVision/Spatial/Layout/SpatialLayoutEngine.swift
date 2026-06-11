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

    // MARK: - Workflow step graph (pop-out layout)

    /// One step node of a popped-out workflow, as the engine sees it.
    struct StepNodeInput: Sendable, Equatable {
        let entityId: String
        /// Canonical `TaskStep.id` — `dependsOn` references these, not entity ids.
        let stepId: String
        let dependsOn: [String]
        /// `stepIndex` — the deterministic tie-break within a topological level.
        let order: Int
        /// Persisted position from a previous expand (nil = never placed / origin sentinel).
        let stored: SIMD3<Float>?

        init(entityId: String, stepId: String, dependsOn: [String], order: Int, stored: SIMD3<Float>? = nil) {
            self.entityId = entityId
            self.stepId = stepId
            self.dependsOn = dependsOn
            self.order = order
            self.stored = stored
        }
    }

    /// Preferred spacing between topological columns — clears a node card (≈0.154 m wide).
    static let stepColumnGap: Float = 0.28
    /// Preferred spacing between sibling rows within a column.
    static let stepRowGap: Float = 0.16
    /// Steps sit slightly in front of their workflow volume so they keep gaze priority over edges.
    static let stepFrontOffset: Float = 0.08
    /// The grid center sits a bit below the volume card so the card stays readable above the graph.
    static let stepDropY: Float = 0.10

    /// Place a workflow's popped-out steps.
    ///
    /// Nodes with a `stored` position keep it (the user's arrangement survives collapse → expand);
    /// if `collapseAnchor` (the volume's position when it was collapsed) is known, the whole stored
    /// shape is translated by however far the volume has moved since. Nodes WITHOUT a stored
    /// position — first materialize, or a step newly merged into the workflow — get a slot in a
    /// topologically layered grid: dependencies left, dependents right (matching output→input edge
    /// flow), siblings of a level stacked vertically. Spacing packs to fit the volume.
    static func stepGraph(
        nodes: [StepNodeInput],
        volume: SIMD3<Float>,
        collapseAnchor: SIMD3<Float>? = nil,
        metrics: VolumeMetrics = .standard
    ) -> [Placement] {
        guard !nodes.isEmpty else { return [] }
        let m = metrics
        let h = m.usableHalf
        let delta = collapseAnchor.map { volume - $0 } ?? SIMD3<Float>(0, 0, 0)

        // Layered grid slots for every node (used only by nodes without a stored position).
        let levels = stepLevels(nodes)
        var columns: [[StepNodeInput]] = Array(repeating: [], count: (levels.values.max() ?? 0) + 1)
        for node in nodes.sorted(by: { ($0.order, $0.entityId) < ($1.order, $1.entityId) }) {
            columns[levels[node.entityId] ?? 0].append(node)
        }

        let levelCount = columns.count
        let maxRows = columns.map(\.count).max() ?? 1
        // Pack spacing down when the graph is wider/taller than the volume.
        let colStep = levelCount > 1 ? min(stepColumnGap, (2 * h.x) / Float(levelCount - 1)) : 0
        let rowStep = maxRows > 1 ? min(stepRowGap, (2 * h.y) / Float(maxRows - 1)) : 0
        // Center the grid on the volume, shifted so the full span stays inside the bounds.
        let halfSpanX = colStep * Float(levelCount - 1) / 2
        let centerX = min(max(volume.x, -h.x + halfSpanX), h.x - halfSpanX)
        let z = volume.z + stepFrontOffset

        var gridSlot: [String: SIMD3<Float>] = [:]
        for (level, column) in columns.enumerated() {
            let halfSpanY = rowStep * Float(column.count - 1) / 2
            let centerY = min(max(volume.y - stepDropY, -h.y + halfSpanY), h.y - halfSpanY)
            for (row, node) in column.enumerated() {
                gridSlot[node.entityId] = SIMD3(
                    centerX - halfSpanX + Float(level) * colStep,
                    centerY + halfSpanY - Float(row) * rowStep,
                    z
                )
            }
        }

        return nodes.map { node in
            if let stored = node.stored {
                return Placement(entityId: node.entityId, position: m.clamp(stored + delta))
            }
            return Placement(entityId: node.entityId, position: m.clamp(gridSlot[node.entityId] ?? volume))
        }
    }

    /// Longest-path topological level per entity: 0 for steps with no in-set dependency, else
    /// 1 + the deepest dependency's level. Dependencies outside the node set are ignored. If a
    /// cycle prevents progress (defensive — the server shouldn't produce one), the unresolved
    /// remainder is appended as one extra level per node in `(order, entityId)` order, so the
    /// function always terminates and assigns every node deterministically.
    static func stepLevels(_ nodes: [StepNodeInput]) -> [String: Int] {
        let inSet = Set(nodes.map(\.stepId))
        var levelByStep: [String: Int] = [:]
        var levels: [String: Int] = [:]
        var remaining = nodes.sorted { ($0.order, $0.entityId) < ($1.order, $1.entityId) }

        while !remaining.isEmpty {
            var unresolved: [StepNodeInput] = []
            for node in remaining {
                let deps = node.dependsOn.filter { inSet.contains($0) && $0 != node.stepId }
                let depLevels = deps.compactMap { levelByStep[$0] }
                if depLevels.count == deps.count {
                    let level = (depLevels.max().map { $0 + 1 }) ?? 0
                    levelByStep[node.stepId] = level
                    levels[node.entityId] = level
                } else {
                    unresolved.append(node)
                }
            }
            if unresolved.count == remaining.count {
                // Cycle: break it by appending the remainder as successive levels.
                var next = (levelByStep.values.max() ?? -1) + 1
                for node in unresolved {
                    levelByStep[node.stepId] = next
                    levels[node.entityId] = next
                    next += 1
                }
                return levels
            }
            remaining = unresolved
        }
        return levels
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
