import Foundation
import SwiftUI
import simd

/// A tap relayed from the `ManipulationBridge` displacement-gate to the view. The counter makes
/// repeated taps on the same entity distinct so SwiftUI `.onChange` always fires.
struct SpatialTapRequest: Equatable {
    let entityName: String
    let n: Int
}

/// A connect-drop relayed from the bridge when a port is released over a target node. Counter
/// makes repeats distinct so SwiftUI `.onChange` always fires (same pattern as SpatialTapRequest).
struct SpatialConnectDropRequest: Equatable {
    let sourceId: String
    let targetId: String
    let n: Int
}

/// Drives the spatial scene: loads the persisted scene + entities, indexes the task/step
/// content each node entity projects, and exposes the actions the RealityView invokes
/// (create, move/persist, edit, connect/merge, note).
///
/// Mirrors `BoardViewModel`: `@Observable`, `configure(with:)`, services via `SpatialRoot`
/// (the visionOS composition root), keeping the shared iOS target free of spatial deps.
@Observable
final class SpatialSceneViewModel {
    private(set) var scene: SpatialScene?
    private(set) var entities: [SpatialEntity] = []
    private(set) var links: [SpatialLink] = []
    private(set) var tasksById: [String: TaskItem] = [:]
    private(set) var stepsById: [String: TaskStep] = [:]
    /// Entities the user has hand-moved; the layout engine leaves these where they are.
    private(set) var manuallyMovedIds: Set<String> = []

    /// Where each workflow volume sat when the user collapsed it (volume entity id → position),
    /// so a later expand can translate the stored step arrangement by however far the volume
    /// moved in between. In-memory only: with no anchor (fresh launch) the stored positions are
    /// restored verbatim, which is equally correct whenever the volume hasn't moved.
    private var collapseAnchors: [String: SIMD3<Float>] = [:]

    /// Who owns each entity's *presented* transform right now (see `TransformOwnership`).
    /// Authoritative and `@Observable` — read synchronously by the reconcile pass so it never
    /// fights a live gesture/animation. Absent ⇒ `.data` (the resting state).
    private(set) var ownershipByID: [String: TransformOwnership] = [:]

    /// Current owner of an entity's transform (`.data` when unset).
    func owner(of id: String) -> TransformOwnership { ownershipByID[id] ?? .data }

    /// Claim transform ownership for an entity (e.g. a gesture taking over on drag start).
    func claim(_ id: String, _ owner: TransformOwnership) { ownershipByID[id] = owner }

    /// Entities created this session that haven't yet shown their create "pop"; the reconcile
    /// pass fires the pulse once the entity's card is ready, then clears it here.
    private(set) var recentlyCreatedIds: Set<String> = []
    func consumeCreatePulse(_ id: String) { recentlyCreatedIds.remove(id) }

    /// A tap detected by the `ManipulationBridge` (a near-zero-displacement manipulation). The
    /// view observes this and routes it with its own interaction `@State`. We detect taps via
    /// manipulation events because `GestureComponent` taps do NOT fire on an entity that also has
    /// a `ManipulationComponent` (verified at runtime), whereas the manipulation lifecycle always
    /// fires — it's literally what produced the "tap only jiggles" symptom.
    private(set) var tapRequest: SpatialTapRequest?
    private var tapCounter = 0
    func requestTap(_ entityName: String) {
        tapCounter += 1
        tapRequest = SpatialTapRequest(entityName: entityName, n: tapCounter)
    }

    /// The source node id while a port drag is in flight (drives the transient rubber-band edge);
    /// nil ⇒ no active connect-drag.
    private(set) var pendingConnectSourceId: String?
    func beginConnectDrag(sourceId: String) { pendingConnectSourceId = sourceId }
    func endConnectDrag() { pendingConnectSourceId = nil }

    /// A connect-drop relayed from the bridge (port released over a target node), observed by the view.
    private(set) var connectDropRequest: SpatialConnectDropRequest?
    private var connectDropCounter = 0
    func requestConnectDrop(sourceId: String, targetId: String) {
        connectDropCounter += 1
        connectDropRequest = SpatialConnectDropRequest(sourceId: sourceId, targetId: targetId, n: connectDropCounter)
    }

    /// True if the id is a rendered connectable node/volume (drop-target eligible).
    func isConnectableNode(_ id: String) -> Bool {
        guard let e = entities.first(where: { $0.id == id }) else { return false }
        return (e.kind == .taskNode || e.kind == .stepNode || e.kind == .workflowVolume) && e.isRendered
    }

    var isLoading = false
    var errorMessage: String?

    /// Reflects the system Reduce Motion setting (pushed from the view's `@Environment`). When on,
    /// the playful pop/bounce pulses are suppressed for motion-sensitive users; the gentle layout
    /// glide stays (it isn't a vestibular offender). Read at the pulse-creation sites.
    var reduceMotion = false

    /// Which task property drives node size. View-only; never overwrites persisted `scale`.
    enum ScaleProperty: String, CaseIterable, Identifiable {
        case none, duration, importance, urgency
        var id: String { rawValue }
        var label: String {
            switch self {
            case .none: return "Uniform"
            case .duration: return "Duration"
            case .importance: return "Importance"
            case .urgency: return "Urgency"
            }
        }
    }
    var scaleProperty: ScaleProperty = .none

    private var root: SpatialRoot?
    private var service: SpatialSceneService?

    func configure(with root: SpatialRoot) {
        self.root = root
        self.service = root.spatialService
    }

    var userTaskTypes: [UserTaskType] { root?.userTaskTypes ?? [] }
    var endeavors: [Endeavor] { root?.endeavors ?? [] }

    // MARK: - Loading

    func load() async {
        guard let service, let root else { return }
        isLoading = true
        errorMessage = nil
        do {
            let result = try await service.ensureScene()
            scene = result.scene
            entities = result.entities

            let tasks = try await root.taskService.getAll()
            indexTasks(tasks)

            await root.refreshTaskTypes()   // ensure the volume has THIS session's types (trays/wheel/picker)
            await root.refreshEndeavors()   // endeavors for the panel legend + edge colors
            await relayout()
            await loadLinks()
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    /// Load cross-workflow links (dashed edges) for the scene.
    func loadLinks() async {
        guard let service, let scene else { return }
        links = (try? await service.getLinks(sceneId: scene.id)) ?? []
    }

    // MARK: - Endeavors

    /// Create a new endeavor (from the Endeavors panel).
    func createEndeavor(name: String, color: String?) async {
        await root?.createEndeavor(name: name, color: color)
    }

    /// Rename / recolor an endeavor, then reload links so its edges recolor.
    func updateEndeavor(id: String, name: String?, color: String?) async {
        await root?.updateEndeavor(id: id, name: name, color: color)
        await loadLinks()
    }

    /// Reassign a cross-workflow link to a chosen endeavor (from the edge's picker); recolor + refresh.
    func reassignLink(sourceId: String, targetId: String, toEndeavorId: String) async {
        guard let service, let scene else { return }
        do {
            try await service.reassignLink(
                sceneId: scene.id, sourceEntityId: sourceId, targetEntityId: targetId, endeavorId: toEndeavorId)
            await loadLinks()
            await root?.refreshEndeavors()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    /// "Endeavor view": pop every member task/workflow of `endeavor` into the scene by adding them to
    /// the active sprint (the scene materializes sprint items in their type trays / as volumes), then
    /// reload links so its colored edges appear connecting them.
    func showEndeavor(_ endeavor: Endeavor) async {
        guard let root else { return }
        let memberTaskIds = (endeavor.items ?? []).map { $0.taskId }
        guard !memberTaskIds.isEmpty else { return }
        for taskId in memberTaskIds {
            _ = try? await root.taskService.setSprintMembership(id: taskId, inSprint: true)
        }
        await refreshTasks()
        await relayout()
        await loadLinks()
    }

    private func indexTasks(_ tasks: [TaskItem]) {
        var byTask: [String: TaskItem] = [:]
        var bySteps: [String: TaskStep] = [:]
        for task in tasks where !task.archived {
            byTask[task.id] = task
            for step in task.steps ?? [] {
                bySteps[step.id] = step
            }
        }
        tasksById = byTask
        stepsById = bySteps
    }

    // MARK: - Layout (engine-driven)

    /// Entities worth rendering: panels/notes always; node entities only when their referenced
    /// task/step is loaded (drops stale/dangling nodes from old data) AND the underlying task is
    /// still in-scene. A task/workflow that becomes `.done` (or `.hidden`) drops out of the live
    /// scene here — even if completed elsewhere (desktop/AI) — and surfaces in the Done tray instead.
    /// Step nodes are the exception: they keep rendering (with their own status treatment) so a
    /// workflow's per-step progress stays visible; they hide only once the whole workflow is done.
    var renderedEntities: [SpatialEntity] {
        entities.filter { e in
            guard e.isRendered else { return false }
            switch e.kind {
            case .typePanel, .note: return true
            case .workflowVolume: return e.refId.flatMap { tasksById[$0] }.map(isInScene) ?? false
            case .taskNode: return task(for: e).map(isInScene) ?? false
            case .stepNode:
                guard let step = step(for: e) else { return false }
                guard let parent = tasksById[step.taskId] else { return true }
                return isInScene(parent)
            }
        }
    }

    /// Whether a task currently materializes as a live node/volume (vs. living in the backlog/Done
    /// tray or being archived). Single gate, shared by the render filter.
    private func isInScene(_ task: TaskItem) -> Bool {
        switch bucket(for: task) {
        case .sprintTask, .sprintWorkflow: return true
        case .backlog, .done, .hidden: return false
        }
    }

    /// Active-sprint standalone tasks — the materialization scope (per product decision).
    /// Completed tasks fall out here (they classify as `.done`) so they leave the live scene.
    private var sprintStandaloneTasks: [TaskItem] {
        tasksById.values
            .filter { bucket(for: $0) == .sprintTask }
            .sorted { $0.name < $1.name }
    }

    /// Active-sprint workflows (tasks with steps), shown as collapsed volume cards.
    /// A fully-completed workflow classifies as `.done` and leaves the scene for the Done tray.
    private var sprintWorkflows: [TaskItem] {
        tasksById.values
            .filter { bucket(for: $0) == .sprintWorkflow }
            .sorted { $0.name < $1.name }
    }

    /// The single source of truth for which surface a task belongs to (pure, unit-tested).
    private func bucket(for task: TaskItem) -> SpatialTaskBucket {
        SpatialTaskClassifier.bucket(
            completed: task.completed,
            archived: task.archived,
            inActiveSprint: task.inActiveSprint,
            hasSteps: task.hasSteps
        )
    }

    /// Ensure entities exist for panels + sprint tasks, run the layout engine, and persist
    /// the computed positions (skipping hand-moved nodes). Idempotent.
    func relayout() async {
        guard let service, scene != nil else { return }
        await ensurePanels()
        await ensureSprintTaskNodes()
        await ensureWorkflowVolumes()

        let placements = SpatialLayoutEngine.layout(buildLayoutInput())

        var batch: [UpdateEntityTransformInput] = []
        for p in placements {
            guard let idx = entities.firstIndex(where: { $0.id == p.entityId }) else { continue }
            let cur = entities[idx]
            // Only place freshly-created entities (still at the (0,0,0) creation placeholder).
            // Entities with a stored position — including ones the user dragged in a previous
            // session — are left exactly where they are, so layout persists across restarts.
            let isPlaceholder = abs(cur.positionX) < 1e-4 && abs(cur.positionY) < 1e-4 && abs(cur.positionZ) < 1e-4
            guard isPlaceholder else { continue }
            entities[idx].positionX = Double(p.position.x)
            entities[idx].positionY = Double(p.position.y)
            entities[idx].positionZ = Double(p.position.z)
            batch.append(UpdateEntityTransformInput(
                id: p.entityId,
                positionX: Double(p.position.x),
                positionY: Double(p.position.y),
                positionZ: Double(p.position.z)
            ))
        }
        if !batch.isEmpty {
            do {
                try await service.batchUpdateEntityTransforms(BatchUpdateEntityTransformsInput(updates: batch))
            } catch {
                errorMessage = error.localizedDescription
            }
        }
    }

    private func ensurePanels() async {
        guard let service, let scene else { return }
        let existing = Set(entities.filter { $0.kind == .typePanel }.compactMap { $0.refId })
        for type in userTaskTypes where !existing.contains(type.id) {
            do {
                let created = try await service.createEntity(CreateSpatialEntityInput(
                    sceneId: scene.id, kind: .typePanel, refId: type.id,
                    positionX: 0, positionY: 0, positionZ: 0
                ))
                entities.append(created)
            } catch {
                errorMessage = error.localizedDescription
            }
        }
    }

    private func ensureSprintTaskNodes() async {
        guard let service, let scene else { return }
        let placed = Set(entities.filter { $0.kind == .taskNode }.compactMap { $0.refId })
        for task in sprintStandaloneTasks where !placed.contains(task.id) {
            do {
                let created = try await service.createEntity(CreateSpatialEntityInput(
                    sceneId: scene.id, kind: .taskNode, refId: task.id,
                    positionX: 0, positionY: 0, positionZ: 0
                ))
                entities.append(created)
            } catch {
                errorMessage = error.localizedDescription
            }
        }
    }

    private func ensureWorkflowVolumes() async {
        guard let service, let scene else { return }
        let placed = Set(entities.filter { $0.kind == .workflowVolume }.compactMap { $0.refId })
        for workflow in sprintWorkflows where !placed.contains(workflow.id) {
            do {
                let created = try await service.createEntity(CreateSpatialEntityInput(
                    sceneId: scene.id, kind: .workflowVolume, refId: workflow.id,
                    positionX: 0, positionY: 0, positionZ: 0
                ))
                entities.append(created)
            } catch {
                errorMessage = error.localizedDescription
            }
        }
    }

    /// Tray backing bounds (one per type column) for the translucent shading, from the pure engine.
    func trayBounds() -> [SpatialLayoutEngine.TrayBounds] {
        SpatialLayoutEngine.trayBounds(buildLayoutInput())
    }

    private func buildLayoutInput() -> SpatialLayoutEngine.Input {
        var panelEntityByType: [String: String] = [:]
        for e in entities where e.kind == .typePanel {
            if let refId = e.refId { panelEntityByType[refId] = e.id }
        }
        let types: [SpatialLayoutEngine.TypeInput] = userTaskTypes.enumerated().compactMap { index, type in
            guard let panelId = panelEntityByType[type.id] else { return nil }
            return SpatialLayoutEngine.TypeInput(typeId: type.id, panelEntityId: panelId, order: index)
        }

        var taskInputs: [SpatialLayoutEngine.TaskInput] = []
        var orderByType: [String: Int] = [:]
        for task in sprintStandaloneTasks {
            guard let entity = entities.first(where: { $0.kind == .taskNode && $0.refId == task.id }) else { continue }
            let order = orderByType[task.type, default: 0]
            orderByType[task.type] = order + 1
            taskInputs.append(SpatialLayoutEngine.TaskInput(entityId: entity.id, typeId: task.type, order: order))
        }
        // Workflow volumes share their type's column, listed after standalone tasks.
        for workflow in sprintWorkflows {
            guard let entity = entities.first(where: { $0.kind == .workflowVolume && $0.refId == workflow.id }) else { continue }
            let order = orderByType[workflow.type, default: 0]
            orderByType[workflow.type] = order + 1
            taskInputs.append(SpatialLayoutEngine.TaskInput(entityId: entity.id, typeId: workflow.type, order: order))
        }

        var manual: [String: SIMD3<Float>] = [:]
        for id in manuallyMovedIds {
            if let e = entities.first(where: { $0.id == id }) {
                manual[id] = SIMD3(Float(e.positionX), Float(e.positionY), Float(e.positionZ))
            }
        }

        return SpatialLayoutEngine.Input(types: types, tasks: taskInputs, manual: manual, metrics: .standard)
    }

    // MARK: - Content lookup

    func task(for entity: SpatialEntity) -> TaskItem? {
        guard entity.kind == .taskNode, let refId = entity.refId else { return nil }
        return tasksById[refId]
    }

    /// The TaskItem an EDITABLE node represents — a standalone task (taskNode) OR a workflow
    /// (workflowVolume). Lets the edit form work for workflows, not just standalone tasks.
    func editableTask(for entity: SpatialEntity) -> TaskItem? {
        guard entity.kind == .taskNode || entity.kind == .workflowVolume,
              let refId = entity.refId else { return nil }
        return tasksById[refId]
    }

    func step(for entity: SpatialEntity) -> TaskStep? {
        guard entity.kind == .stepNode, let refId = entity.refId else { return nil }
        return stepsById[refId]
    }

    func type(id: String?) -> UserTaskType? {
        guard let id else { return nil }
        return userTaskTypes.first { $0.id == id }
    }

    /// The task type a node entity belongs to (for color/emoji).
    func type(for entity: SpatialEntity) -> UserTaskType? {
        if let task = task(for: entity) { return type(id: task.type) }
        if let step = step(for: entity) { return type(id: step.type) }
        if entity.kind == .typePanel { return type(id: entity.refId) }
        return nil
    }

    /// Display title for any entity.
    func title(for entity: SpatialEntity) -> String {
        switch entity.kind {
        case .taskNode: return task(for: entity)?.name ?? "Task"
        case .stepNode: return step(for: entity)?.name ?? "Step"
        case .typePanel: return type(id: entity.refId)?.name ?? "Type"
        case .workflowVolume: return tasksById[entity.refId ?? ""]?.name ?? "Workflow"
        case .note: return entity.noteText ?? ""
        }
    }

    /// Tasks belonging to a type panel (for listing inside the panel).
    func tasks(ofType typeId: String) -> [TaskItem] {
        tasksById.values
            .filter { $0.type == typeId && !$0.hasSteps }
            .sorted { $0.name < $1.name }
    }

    /// View-only size multiplier from the selected scaling property (1.0 = neutral).
    /// Applies to task nodes; step nodes stay neutral for now.
    func sizeMultiplier(for entity: SpatialEntity) -> Double {
        guard scaleProperty != .none, let task = task(for: entity) else { return 1.0 }
        switch scaleProperty {
        case .none: return 1.0
        case .duration: return normalized(Double(task.duration), min: 5, max: 240)
        case .importance: return normalized(Double(task.importance), min: 1, max: 10)
        case .urgency: return normalized(Double(task.urgency), min: 1, max: 10)
        }
    }

    private func normalized(_ value: Double, min lo: Double, max hi: Double) -> Double {
        guard hi > lo else { return 1.0 }
        let t = Swift.max(0, Swift.min(1, (value - lo) / (hi - lo)))
        return 0.6 + t * 0.8 // map to [0.6, 1.4]
    }

    // MARK: - Actions

    /// Create a standalone task placed at a 3D point (double-pinch create).
    /// Create a standalone task entity at a 3D point. Returns the new entity id (used by the
    /// gaze + double-pinch spawn to anchor the type wheel), or nil on error.
    @discardableResult
    func createTask(name: String, x: Double, y: Double, z: Double) async -> String? {
        guard let service, let scene else { return nil }
        do {
            let result = try await service.createTaskEntity(CreateTaskEntityInput(
                sceneId: scene.id,
                name: name,
                positionX: x,
                positionY: y,
                positionZ: z
            ))
            entities.append(result.entity)
            manuallyMovedIds.insert(result.entity.id) // stays where created
            recentlyCreatedIds.insert(result.entity.id) // create "pop" on first render
            await refreshTasks()
            return result.entity.id
        } catch {
            errorMessage = error.localizedDescription
            return nil
        }
    }

    /// Assign a task type to a node's underlying Task (from the type wheel), then re-flow so it
    /// lands in the new type's column (a hand-placed/spawned node keeps its position).
    func assignType(entityId: String, typeId: String) async {
        guard let root,
              let entity = entities.first(where: { $0.id == entityId }),
              let taskId = entity.refId else { return }
        do {
            _ = try await root.taskService.update(UpdateTaskInput(id: taskId, type: typeId))
            await refreshTasks()
            await relayout()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    /// Completed tasks/workflows — listed in the Done tray for review. Most-recently-finished first;
    /// drag one into the scene to reactivate it (`reactivate`).
    var doneItems: [TaskItem] {
        tasksById.values
            .filter { bucket(for: $0) == .done }
            .sorted { ($0.completedAt ?? .distantPast) > ($1.completedAt ?? .distantPast) }
    }

    /// Reactivate completed task(s)/workflow(s): put them back in progress and into the active
    /// sprint so they re-materialize in the scene. Triggered by dragging Done-tray row(s) into the
    /// volume, or the review sheet's reactivate action.
    ///
    /// A standalone task just clears its completion (`reopen`). A WORKFLOW instead reopens its last
    /// step (`reopenStep`): the server's step roll-up then re-derives the workflow to in-progress /
    /// not-completed, so we never leave a workflow flagged "in progress" while every step still
    /// reads "done" (that inconsistency is the reason we don't simply flip the parent flag). A
    /// single refresh + relayout runs after the whole batch (no per-item relayout race).
    func reactivate(taskIds: [String]) async {
        guard let root, !taskIds.isEmpty else { return }
        for id in taskIds {
            guard let task = tasksById[id] else { continue }
            do {
                if task.hasSteps,
                   let lastStep = (task.steps ?? []).max(by: { $0.stepIndex < $1.stepIndex }) {
                    try await root.taskService.reopenStep(taskId: id, stepId: lastStep.id)
                    if !task.inActiveSprint {
                        _ = try await root.taskService.setSprintMembership(id: id, inSprint: true)
                    }
                } else {
                    _ = try await root.taskService.reopen(id: id)
                }
            } catch {
                errorMessage = error.localizedDescription
            }
        }
        await refreshTasks()
        await relayout()
    }

    // Backlog listing, add-to-sprint, and task-type creation moved to BacklogWindowView (its own
    // movable window) — it talks to SpatialRoot directly and syncs via sceneReloadToken.

    /// Create a free-floating note at a 3D point.
    func createNote(text: String, x: Double, y: Double, z: Double) async {
        guard let service, let scene else { return }
        do {
            let created = try await service.createEntity(CreateSpatialEntityInput(
                sceneId: scene.id,
                kind: .note,
                noteText: text,
                positionX: x,
                positionY: y,
                positionZ: z
            ))
            entities.append(created)
            manuallyMovedIds.insert(created.id) // stays where created
            recentlyCreatedIds.insert(created.id) // create "pop" on first render
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    /// Optimistically move an entity locally, then persist its transform on drag-end.
    func updateLocalPosition(id: String, x: Double, y: Double, z: Double) {
        guard let idx = entities.firstIndex(where: { $0.id == id }) else { return }
        entities[idx].positionX = x
        entities[idx].positionY = y
        entities[idx].positionZ = z
    }

    /// Cards are locked upright (identity orientation) — see `ManipulationBridge`. Keep the STORED
    /// quaternion identity too, so a persisted/legacy non-identity rotation never lingers in the DB
    /// (and so dismiss-to-tray restores the tray plane).
    private func resetOrientation(id: String) {
        guard let idx = entities.firstIndex(where: { $0.id == id }) else { return }
        entities[idx].rotationX = 0
        entities[idx].rotationY = 0
        entities[idx].rotationZ = 0
        entities[idx].rotationW = 1
    }

    /// Synchronously commit a finished drag: record the final position, mark the entity
    /// hand-moved (so the layout engine leaves it alone), and release ownership back to `.data`
    /// — all in one observable mutation. Doing this synchronously (before the async persist)
    /// guarantees no reconcile pass ever sees `.data` with a stale stored position, which is
    /// what made the card snap back. Call `persistTransform(id:)` afterwards for the network write.
    func commitDrag(id: String, x: Double, y: Double, z: Double) {
        updateLocalPosition(id: id, x: x, y: y, z: z)
        resetOrientation(id: id)   // cards are upright-locked; persist identity orientation
        manuallyMovedIds.insert(id)
        ownershipByID[id] = .data
    }

    func persistTransform(id: String) async {
        guard let service, let entity = entities.first(where: { $0.id == id }) else { return }
        do {
            try await service.updateEntityTransform(UpdateEntityTransformInput(
                id: entity.id,
                positionX: entity.positionX,
                positionY: entity.positionY,
                positionZ: entity.positionZ,
                rotationX: entity.rotationX,
                rotationY: entity.rotationY,
                rotationZ: entity.rotationZ,
                rotationW: entity.rotationW,
                scale: entity.scale
            ))
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    /// Connect two node entities into a workflow (the merge gesture). The resulting
    /// workflow is collapsed into a single movable volume.
    func connect(sourceId: String, targetId: String) async {
        guard let service, let scene else { return }
        do {
            let result = try await service.connect(SpatialConnectInput(
                sceneId: scene.id,
                sourceEntityId: sourceId,
                targetEntityId: targetId
            ))
            entities = result.entities
            await refreshTasks()
            await collapseLooseWorkflows()
            await ensureWorkflowsInSprint()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    /// Guarantee every rendered workflow is in the active sprint (a connect-formed workflow should
    /// always appear in its tray + schedule, even if both source tasks happened to be out of sprint).
    private func ensureWorkflowsInSprint() async {
        guard let root else { return }
        var changed = false
        for entity in entities where entity.kind == .workflowVolume {
            if let taskId = entity.refId, let task = tasksById[taskId], !task.inActiveSprint {
                _ = try? await root.taskService.setSprintMembership(id: taskId, inSprint: true)
                changed = true
            }
        }
        if changed { await refreshTasks() }
    }

    /// Link two workflows WITHOUT combining them (creates a dependency).
    func link(sourceId: String, targetId: String) async {
        guard let service, let scene else { return }
        do {
            try await service.linkWorkflows(SpatialConnectInput(
                sceneId: scene.id,
                sourceEntityId: sourceId,
                targetEntityId: targetId
            ))
            await loadLinks()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    // MARK: - Drag-to-connect

    /// Decide merge vs link from the two entities' KIND (+ step parents). Mirrors the backend
    /// morph strategy but routes CROSS-workflow ordering to LINK per the "do not conflate"
    /// doctrine (cross-workflow = an EndeavorDependency, never a morph-engine dependency). Pure /
    /// testable. The grabbed port is the SOURCE.
    func connectionIntent(from sourceId: String, to targetId: String) -> ConnectionIntent {
        guard sourceId != targetId,
              let s = entities.first(where: { $0.id == sourceId }),
              let t = entities.first(where: { $0.id == targetId }) else { return .invalid }
        let sp = step(for: s)?.taskId, tp = step(for: t)?.taskId
        return ConnectionRules.intent(
            source: s.kind,
            target: t.kind,
            sameStepParent: sp != nil && sp == tp,
            sourceIsWorkflow: isWorkflowEndpoint(s),
            targetIsWorkflow: isWorkflowEndpoint(t)
        )
    }

    private func isWorkflowEndpoint(_ e: SpatialEntity) -> Bool {
        if e.kind == .workflowVolume { return true }
        if e.kind == .stepNode, let s = step(for: e), let parent = tasksById[s.taskId] {
            return parent.hasSteps
        }
        return false
    }

    private enum EndpointRole { case source, target }

    /// Drag-driven connect/link. Resolves any workflowVolume endpoint to a concrete step entity
    /// (the backend rejects volume kinds), then dispatches to the EXISTING connect/link (which call
    /// the shared morph engine / EndeavorDependency — no new connect path, per the "one engine" rule).
    func connectByDrag(sourceId: String, targetId: String) async {
        switch connectionIntent(from: sourceId, to: targetId) {
        case .invalid:
            errorMessage = "Can't connect these."
        case .merge:
            if let src = await resolveForConnect(sourceId, role: .source),
               let tgt = await resolveForConnect(targetId, role: .target) {
                await connect(sourceId: src, targetId: tgt)
            }
        case .link:
            if let src = await resolveForConnect(sourceId, role: .source),
               let tgt = await resolveForConnect(targetId, role: .target) {
                await link(sourceId: src, targetId: tgt)
            }
        }
    }

    /// A workflowVolume can't be passed to the backend connect/link; resolve it to a step entity
    /// (last step = blocking source, first = blocked target). Other kinds pass through.
    private func resolveForConnect(_ id: String, role: EndpointRole) async -> String? {
        guard let e = entities.first(where: { $0.id == id }) else { return nil }
        guard e.kind == .workflowVolume else { return id }
        if childEntities(of: id).isEmpty { await materializeSteps(for: e) }
        let steps = childEntities(of: id).sorted {
            (step(for: $0)?.stepIndex ?? 0) < (step(for: $1)?.stepIndex ?? 0)
        }
        return role == .source ? steps.last?.id : steps.first?.id
    }

    /// Remove an existing edge between two entities (from the × on the edge). A cross-workflow LINK
    /// is unlinked (EndeavorDependency deleted); otherwise it's an intra-workflow DEPENDENCY,
    /// reversed via the shared morph engine (disconnect — which maintains entity identity).
    func removeConnection(from sourceId: String, to targetId: String) async {
        if links.contains(where: { $0.sourceEntityId == sourceId && $0.targetEntityId == targetId }) {
            await unlink(sourceId: sourceId, targetId: targetId)
        } else {
            await disconnect(sourceId: sourceId, targetId: targetId)
        }
    }

    private func disconnect(sourceId: String, targetId: String) async {
        guard let service, let scene else { return }
        do {
            let result = try await service.disconnect(SpatialConnectInput(
                sceneId: scene.id, sourceEntityId: sourceId, targetEntityId: targetId))
            entities = result.entities
            await refreshTasks()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func unlink(sourceId: String, targetId: String) async {
        guard let service, let scene else { return }
        do {
            try await service.unlinkWorkflows(SpatialConnectInput(
                sceneId: scene.id, sourceEntityId: sourceId, targetEntityId: targetId))
            await loadLinks()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    /// After a merge, give every LOOSE step node (`parentId == nil`) a home. The backend swaps a joined
    /// node to a stepNode but does NOT set parentId, so the new step is loose; the idempotent
    /// `collapseWorkflow` reparents ALL members (via `TaskStep.taskId`) to the volume — so the new step
    /// becomes a proper child and is included in collapse/expand and removed on dismiss (no orphaned
    /// floating step, no task/step duplicate). `collapseWorkflow` hides every member, so if the user had
    /// the workflow popped OUT we re-expand it afterward to preserve their arrangement.
    private func collapseLooseWorkflows() async {
        guard let service, let scene else { return }
        var workflowIds = Set<String>()
        for entity in entities where entity.kind == .stepNode && entity.parentId == nil {
            if let step = step(for: entity) {
                workflowIds.insert(step.taskId)
            }
        }
        for workflowId in workflowIds {
            let wasExpanded = isWorkflowExpanded(workflowId)
            do {
                let result = try await service.collapseWorkflow(sceneId: scene.id, workflowTaskId: workflowId)
                entities = result.entities
                if wasExpanded,
                   let volume = entities.first(where: { $0.kind == .workflowVolume && $0.refId == workflowId }) {
                    await toggleWorkflowVolume(volume)   // pop it back out (collapse hid every member)
                }
            } catch {
                errorMessage = error.localizedDescription
            }
        }
    }

    /// True if the workflow currently has a popped-out (rendered) volume — i.e. the user expanded it.
    private func isWorkflowExpanded(_ workflowId: String) -> Bool {
        guard let volume = entities.first(where: { $0.kind == .workflowVolume && $0.refId == workflowId })
        else { return false }
        return childEntities(of: volume.id).contains { $0.isRendered }
    }

    /// Step-node children of a collapsed workflow volume.
    func childEntities(of volumeId: String) -> [SpatialEntity] {
        entities.filter { $0.parentId == volumeId }
    }

    /// Tap a workflow volume to pop out its step graph (materializing step nodes on first
    /// expand) or collapse it back. Expand prefers each step's PERSISTED position — the user's
    /// arrangement survives collapse → expand, translated by however far the volume moved in
    /// between — and gives never-placed steps a slot in the topologically layered grid
    /// (dependencies left, dependents right). Collapse only hides; it never rewrites positions.
    func toggleWorkflowVolume(_ volume: SpatialEntity) async {
        guard let service else { return }
        let children = childEntities(of: volume.id)
        if children.isEmpty {
            await materializeSteps(for: volume)
            return
        }
        let isExpanded = children.contains { $0.isRendered }
        do {
            if isExpanded {
                collapseAnchors[volume.id] = entityPosition(volume)
                for child in children {
                    let updated = try await service.setRendered(SetRenderedInput(id: child.id, isRendered: false))
                    replaceEntity(updated)
                }
            } else {
                let placements = SpatialLayoutEngine.stepGraph(
                    nodes: children.map(stepGraphInput(for:)),
                    volume: entityPosition(volume),
                    collapseAnchor: collapseAnchors[volume.id]
                )
                collapseAnchors[volume.id] = nil
                let positionById = Dictionary(uniqueKeysWithValues: placements.map { ($0.entityId, $0.position) })
                for child in children {
                    guard let p = positionById[child.id] else { continue }
                    let updated = try await service.updateEntityTransform(UpdateEntityTransformInput(
                        id: child.id,
                        positionX: Double(p.x), positionY: Double(p.y), positionZ: Double(p.z),
                        isRendered: true
                    ))
                    replaceEntity(updated)
                }
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    /// Create step-node entities for a workflow volume's steps, laid out as a topological
    /// graph (dependencies left, dependents right — matching output→input edge flow), shown.
    private func materializeSteps(for volume: SpatialEntity) async {
        guard let service, let scene, let refId = volume.refId,
              let workflow = tasksById[refId] else { return }
        let steps = (workflow.steps ?? []).sorted { $0.stepIndex < $1.stepIndex }
        guard !steps.isEmpty else { return }
        let placements = SpatialLayoutEngine.stepGraph(
            nodes: steps.map { SpatialLayoutEngine.StepNodeInput(
                entityId: $0.id, stepId: $0.id, dependsOn: $0.dependsOn, order: $0.stepIndex
            ) },
            volume: entityPosition(volume)
        )
        let positionByStepId = Dictionary(uniqueKeysWithValues: placements.map { ($0.entityId, $0.position) })
        for step in steps {
            guard let p = positionByStepId[step.id] else { continue }
            do {
                let created = try await service.createEntity(CreateSpatialEntityInput(
                    sceneId: scene.id, kind: .stepNode, refId: step.id, parentId: volume.id,
                    positionX: Double(p.x), positionY: Double(p.y), positionZ: Double(p.z)
                ))
                entities.append(created)
            } catch {
                errorMessage = error.localizedDescription
            }
        }
    }

    private func entityPosition(_ entity: SpatialEntity) -> SIMD3<Float> {
        SIMD3(Float(entity.positionX), Float(entity.positionY), Float(entity.positionZ))
    }

    /// Engine projection of a placed step node. The origin is the "never placed" sentinel
    /// (same convention as relayout), so such a node gets a fresh grid slot instead of
    /// "restoring" to a stack at the volume center.
    private func stepGraphInput(for child: SpatialEntity) -> SpatialLayoutEngine.StepNodeInput {
        let step = step(for: child)
        let p = entityPosition(child)
        let isSentinel = abs(p.x) < 1e-4 && abs(p.y) < 1e-4 && abs(p.z) < 1e-4
        return SpatialLayoutEngine.StepNodeInput(
            entityId: child.id,
            stepId: child.refId ?? child.id,
            dependsOn: step?.dependsOn ?? [],
            order: step?.stepIndex ?? 0,
            stored: isSentinel ? nil : p
        )
    }

    private func replaceEntity(_ updated: SpatialEntity) {
        if let idx = entities.firstIndex(where: { $0.id == updated.id }) {
            entities[idx] = updated
        } else {
            entities.append(updated)
        }
    }

    func remove(id: String) async {
        guard let service else { return }
        do {
            try await service.removeEntity(id)
            entities.removeAll { $0.id == id }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    /// Delete a node from the edit form. A task archives its Task (recoverable, vanishes from the
    /// board); a step is removed from its workflow; a workflow archives the workflow + clears its
    /// step placements. The SpatialEntity placement is removed too so nothing orphans.
    func deleteNode(_ entity: SpatialEntity) async {
        switch entity.kind {
        case .taskNode: await deleteTask(entity)
        case .stepNode: await deleteStep(entity)
        case .workflowVolume: await deleteWorkflow(entity)
        case .note, .typePanel: break
        }
    }

    private func deleteTask(_ entity: SpatialEntity) async {
        guard let root, let taskId = entity.refId else { return }
        do {
            _ = try await root.taskService.archive(id: taskId)
            await remove(id: entity.id)
            await refreshTasks()
        } catch { errorMessage = error.localizedDescription }
    }

    private func deleteStep(_ entity: SpatialEntity) async {
        guard let root, let step = step(for: entity) else { return }
        do {
            try await root.taskService.deleteStep(taskId: step.taskId, stepId: step.id)
            await remove(id: entity.id)
            await refreshTasks()
        } catch { errorMessage = error.localizedDescription }
    }

    private func deleteWorkflow(_ entity: SpatialEntity) async {
        guard let root, let taskId = entity.refId else { return }
        do {
            for child in childEntities(of: entity.id) { await remove(id: child.id) }
            _ = try await root.taskService.archive(id: taskId)
            await remove(id: entity.id)
            await refreshTasks()
        } catch { errorMessage = error.localizedDescription }
    }

    /// Send a tray-backed node (task/workflow) back to its type column: ensure it's in the sprint
    /// (so the layout engine gives it a column slot — created/legacy items may not be, which is why
    /// dismiss looked like the card vanished), clear its hand-placed position, and re-flow.
    func returnToTray(id: String) async {
        if let entity = entities.first(where: { $0.id == id }),
           let taskId = entity.refId, let task = tasksById[taskId], !task.inActiveSprint {
            _ = try? await root?.taskService.setSprintMembership(id: taskId, inSprint: true)
            await refreshTasks()
        }
        updateLocalPosition(id: id, x: 0, y: 0, z: 0)
        resetOrientation(id: id)   // dismiss-to-tray restores upright orientation (the tray plane)
        manuallyMovedIds.remove(id)
        await relayout()
    }

    /// Dismiss a workflow volume: remove its step-node PLACEMENTS (so expanded steps don't orphan,
    /// persist, or reappear on reload — the TaskSteps themselves are untouched), then return the
    /// volume to its tray column.
    func dismissWorkflow(_ volumeId: String) async {
        for child in childEntities(of: volumeId) {
            await remove(id: child.id)
        }
        await returnToTray(id: volumeId)
    }

    /// Reset the workspace: send every task/workflow back to its tray and collapse all workflows,
    /// WITHOUT deleting any task/step data. Removes step-node placements (they re-materialize on
    /// expand), ensures everything is in the sprint, clears hand-placements, and re-flows.
    func clearWorkspace() async {
        guard let service else { return }
        for entity in entities where entity.kind == .stepNode {
            try? await service.removeEntity(entity.id)
        }
        entities.removeAll { $0.kind == .stepNode }
        if let root {
            for entity in entities where entity.kind == .taskNode || entity.kind == .workflowVolume {
                if let taskId = entity.refId, let task = tasksById[taskId], !task.inActiveSprint {
                    _ = try? await root.taskService.setSprintMembership(id: taskId, inSprint: true)
                }
            }
            await refreshTasks()
        }
        manuallyMovedIds.removeAll()
        for idx in entities.indices where entities[idx].kind == .taskNode || entities[idx].kind == .workflowVolume {
            entities[idx].positionX = 0
            entities[idx].positionY = 0
            entities[idx].positionZ = 0
        }
        await relayout()
    }

    /// Update a note's text.
    func updateNote(id: String, text: String) async {
        guard let service else { return }
        do {
            let updated = try await service.updateNoteText(UpdateNoteTextInput(id: id, noteText: text))
            replaceEntity(updated)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    /// Save edits to the task/step a node entity represents (mirrors the desktop detail panel).
    func saveTaskEdits(for entity: SpatialEntity, _ edits: TaskEdits) async {
        guard let root else { return }
        do {
            if let task = editableTask(for: entity) {
                // taskNode OR workflowVolume. For a workflow, `steps` is omitted so its steps (and
                // derived duration) are untouched; the form hides duration editing for workflows.
                _ = try await root.taskService.update(UpdateTaskInput(
                    id: task.id,
                    name: edits.name,
                    duration: edits.duration,
                    importance: edits.importance,
                    urgency: edits.urgency,
                    type: edits.type,
                    asyncWaitTime: edits.asyncWaitTime,
                    cognitiveComplexity: edits.cognitiveComplexity,
                    notes: edits.notes,
                    deadline: edits.deadline,
                    deadlineType: edits.deadlineType
                ))
            } else if let step = step(for: entity), let parent = tasksById[step.taskId] {
                // Reconstruct the parent workflow's full step list with this step updated.
                let updatedSteps: [CreateStepInput] = (parent.steps ?? [])
                    .sorted { $0.stepIndex < $1.stepIndex }
                    .map { existing in
                        let isTarget = existing.id == step.id
                        return CreateStepInput(
                            name: isTarget ? edits.name : existing.name,
                            duration: isTarget ? edits.duration : existing.duration,
                            type: isTarget ? edits.type : existing.type,
                            dependsOn: existing.dependsOn,
                            asyncWaitTime: isTarget ? edits.asyncWaitTime : existing.asyncWaitTime,
                            cognitiveComplexity: isTarget ? edits.cognitiveComplexity : existing.cognitiveComplexity,
                            isAsyncTrigger: existing.isAsyncTrigger,
                            expectedResponseTime: existing.expectedResponseTime
                        )
                    }
                _ = try await root.taskService.update(UpdateTaskInput(id: parent.id, steps: updatedSteps))
            }
            await refreshTasks()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func refreshTasks() async {
        guard let root else { return }
        do {
            let tasks = try await root.taskService.getAll()
            indexTasks(tasks)
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

/// Editable fields for a node, mirroring the desktop deep-work detail panel.
struct TaskEdits {
    var name: String
    var duration: Int
    var importance: Int
    var urgency: Int
    var type: String
    var asyncWaitTime: Int
    var cognitiveComplexity: Int?
    var notes: String?
    var deadline: Date?
    var deadlineType: DeadlineType?
}
