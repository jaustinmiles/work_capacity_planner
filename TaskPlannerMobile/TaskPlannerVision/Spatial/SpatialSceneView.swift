import SwiftUI
import RealityKit
import simd
import os      // OSLog string interpolation (privacy:) for SpatialLog must be imported at use site

/// The volumetric workspace. Each rendered `SpatialEntity` is a SwiftUI glass card surfaced
/// as a RealityView attachment, positioned (in meters) at the entity's persisted transform —
/// which the layout engine computes. Baseplate hidden; bottom-ornament toolbar.
///
/// Phase 2: rendering only (panels + sprint task nodes). Drag/tap/create/edges arrive next.
struct SpatialSceneView: View {
    @Bindable var viewModel: SpatialSceneViewModel
    @State private var selectedEntityID: String?
    @State private var creatingNote = false
    @State private var selectedNoteID: String?
    /// The cross-link edge whose endeavor assignment is being changed (via its pencil control).
    @State private var reassigningLink: LinkEndpoints?
    /// Entity id of a freshly spawned node whose type wheel is showing (gaze + double-pinch create).
    @State private var typeWheelEntityID: String?
    /// True when the edit form opens for a FRESHLY CREATED task — focuses the name field so the
    /// placeholder can be replaced immediately. Reset when the form dismisses.
    @State private var focusNameOnEdit = false
    /// Newly spawned task awaiting its type-wheel pick; when the wheel dismisses, its edit form
    /// opens (name focused) so create flows straight into naming.
    @State private var editAfterWheelID: String?
    /// The in-flight type assignment from the wheel — awaited before opening the edit form, so
    /// the form never seeds from a stale type (saving would silently undo the wheel pick).
    @State private var typeAssignment: Task<Void, Never>?
    /// Whether the dismissable endeavors panel ornament is shown.
    @State private var showEndeavors = false
    /// Whether the dismissable Done tray ornament (completed tasks/workflows) is shown.
    @State private var showDone = false
    /// Bridges `ManipulationComponent` drag events to transform ownership + persistence.
    @State private var manipBridge = ManipulationBridge()
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.openWindow) private var openWindow

    /// Distinct hover groups so the card and its × control highlight independently on gaze
    /// (a shared/implicit group would couple them). `GroupID` is visionOS 26.
    private static let cardHoverGroup = HoverEffectComponent.GroupID()
    private static let controlHoverGroup = HoverEffectComponent.GroupID()
    private static let portHoverGroup = HoverEffectComponent.GroupID()

    var body: some View {
        RealityView { content, _ in
            // Subscribe once to the manipulation lifecycle (attachments aren't ready yet —
            // cards are added in update). Scene-wide ManipulationEvents need no entities yet.
            manipBridge.install(on: content, viewModel: viewModel)
            // Invisible backdrop so a gaze + double-pinch on empty space yields a spawn location.
            content.add(makeSpawnPlane())
        } update: { content, attachments in
            reconcile(content: content, attachments: attachments)
        } attachments: {
            ForEach(viewModel.renderedEntities, id: \.id) { entity in
                Attachment(id: entity.id) { card(for: entity) }
            }
        }
        // Drag a Done-tray row into the volume to reactivate it (precise 3D drop point isn't needed —
        // reactivation re-materializes it in its type tray via the layout engine).
        .dropDestination(for: String.self) { taskIds, _ in
            guard !taskIds.isEmpty else { return false }
            Task { await viewModel.reactivate(taskIds: taskIds) }
            return true
        }
        .sheet(item: selectedEntityBinding, onDismiss: { focusNameOnEdit = false }) { entity in
            SpatialNodeFormView(viewModel: viewModel, entity: entity, focusName: focusNameOnEdit)
        }
        .sheet(item: selectedNoteBinding) { entity in
            NoteEditView(
                initialText: entity.noteText ?? "",
                onSave: { text in Task { await viewModel.updateNote(id: entity.id, text: text) } },
                onDelete: { Task { await viewModel.remove(id: entity.id) } }
            )
        }
        .volumeBaseplateVisibility(.hidden)
        .gesture(spawnGesture)
        .ornament(visibility: showEndeavors ? .visible : .hidden, attachmentAnchor: .scene(.leading)) {
            EndeavorPanelView(viewModel: viewModel)
        }
        .ornament(visibility: showDone ? .visible : .hidden, attachmentAnchor: .scene(.top)) {
            DoneTrayView(viewModel: viewModel)
        }
        .sheet(item: typeWheelBinding, onDismiss: {
            // A freshly spawned task flows straight into its edit form (name focused) once the
            // type wheel closes — sheets can't overlap, so this waits for the dismissal, and
            // awaits the type assignment so the form seeds from the PICKED type, not a stale one.
            if let id = editAfterWheelID {
                editAfterWheelID = nil
                let assignment = typeAssignment
                Task {
                    await assignment?.value
                    focusNameOnEdit = true
                    selectedEntityID = id
                }
            }
        }) { entity in
            SpatialTypeWheel(
                types: viewModel.userTaskTypes,
                currentTypeId: viewModel.task(for: entity)?.type
            ) { typeId in
                typeAssignment = Task { await viewModel.assignType(entityId: entity.id, typeId: typeId) }
            }
        }
        .sheet(isPresented: $creatingNote) {
            CreatePromptView { text in
                Task { await createNote(text: text) }
            }
        }
        .sheet(item: $reassigningLink) { ends in
            AssignEndeavorView(
                endeavors: viewModel.endeavors,
                currentEndeavorId: viewModel.links.first {
                    $0.sourceEntityId == ends.from && $0.targetEntityId == ends.to
                }?.endeavorId
            ) { endeavorId in
                Task { await viewModel.reassignLink(sourceId: ends.from, targetId: ends.to, toEndeavorId: endeavorId) }
            }
        }
        .toolbar {
            ToolbarItemGroup(placement: .bottomOrnament) {
                Button("Task", systemImage: "plus.circle.fill") {
                    // Create immediately and open the edit form (name focused) — one surface for
                    // name/type/duration instead of a separate name prompt.
                    Task {
                        let p = nextSpawn()
                        if let id = await viewModel.createTask(
                            name: Self.defaultTaskName,
                            x: Double(p.x), y: Double(p.y), z: Double(p.z)
                        ) {
                            focusNameOnEdit = true
                            selectedEntityID = id
                        }
                    }
                }
                Button("Note", systemImage: "note.text.badge.plus") {
                    creatingNote = true
                }
                Divider()
                Button("Backlog", systemImage: "tray.full.fill") {
                    // Its own window so the user can grab and place it anywhere (it was a
                    // fixed ornament — the "panels immovable" feedback).
                    openWindow(id: SpatialWindowID.backlog)
                }
                Button("Done", systemImage: "checkmark.circle.fill") {
                    showDone.toggle()
                }
                Button("Endeavors", systemImage: "flag.2.crossed.fill") {
                    showEndeavors.toggle()
                }
                Button("Assistant", systemImage: "sparkles") {
                    openWindow(id: SpatialWindowID.chat)
                }
                Button("Clear", systemImage: "tray.and.arrow.down") {
                    Task { await viewModel.clearWorkspace() }
                }
                Button("Reload", systemImage: "arrow.clockwise") {
                    Task { await viewModel.load() }
                }
                if viewModel.isLoading { ProgressView().controlSize(.small) }
            }
        }
        .task { await viewModel.load() }
        .onChange(of: viewModel.tapRequest) { _, request in
            if let request { handleEntityTap(id: request.entityName) }
        }
        .onChange(of: viewModel.connectDropRequest) { _, request in
            if let request {
                Task { await viewModel.connectByDrag(sourceId: request.sourceId, targetId: request.targetId) }
            }
        }
        .onChange(of: reduceMotion, initial: true) { _, newValue in
            viewModel.reduceMotion = newValue
        }
    }

    // MARK: - Control entity naming (gesture disambiguation backbone)

    static let controlPrefix = "ctl::"

    /// Parse a control child entity name `ctl::<role>::<ownerId>`.
    private func controlRole(_ name: String) -> (role: String, ownerId: String)? {
        guard name.hasPrefix(Self.controlPrefix) else { return nil }
        let parts = name.dropFirst(Self.controlPrefix.count).components(separatedBy: "::")
        guard parts.count == 2 else { return nil }
        return (parts[0], parts[1])
    }

    /// The owner id of a control entity name `ctl::<role>::<ownerId>` if it matches `role`.
    /// Static entry point used by `ManipulationBridge` and `EdgeSystem`.
    static func controlOwnerId(_ name: String, role: String) -> String? {
        guard name.hasPrefix(controlPrefix) else { return nil }
        let parts = name.dropFirst(controlPrefix.count).components(separatedBy: "::")
        guard parts.count == 2, parts[0] == role else { return nil }
        return parts[1]
    }

    // MARK: - Tap routing

    /// Route a tap relayed from the `ManipulationBridge` (which detects taps as near-zero-travel
    /// manipulations — `GestureComponent` taps don't fire on a manipulable entity, so we reuse the
    /// manipulation lifecycle that always fires). The × control routes by name to dismiss;
    /// otherwise mode-dependent: merge/link pick two nodes, else tap a node to edit or a workflow
    /// volume to expand. The select-pop is fired by the bridge.
    private func handleEntityTap(id: String) {
        if let role = controlRole(id) {
            if role.role == "dismiss" {
                dismiss(ownerId: role.ownerId)
            } else if role.role == "edit" {
                // Open the edit form for the workflow itself (tap-on-volume toggles its steps).
                selectedEntityID = role.ownerId
            } else if role.role == "unedge" {
                let ends = role.ownerId.components(separatedBy: "|")
                if ends.count == 2 {
                    Task { await viewModel.removeConnection(from: ends[0], to: ends[1]) }
                }
            } else if role.role == "editlink" {
                let ends = role.ownerId.components(separatedBy: "|")
                if ends.count == 2 { reassigningLink = LinkEndpoints(from: ends[0], to: ends[1]) }
            }
            return
        }
        guard let entity = viewModel.entities.first(where: { $0.id == id }) else { return }
        if entity.kind == .workflowVolume {
            Task { await viewModel.toggleWorkflowVolume(entity) }
        } else if entity.kind == .note {
            selectedNoteID = id
        } else if entity.isNode {
            selectedEntityID = id
        }
    }

    /// Dismiss a node via its × control: tasks/steps return to their tray; notes & workflow
    /// volumes are removed from the scene.
    private func dismiss(ownerId: String) {
        guard let entity = viewModel.entities.first(where: { $0.id == ownerId }) else { return }
        switch entity.kind {
        case .taskNode:
            Task { await viewModel.returnToTray(id: ownerId) }
        case .workflowVolume:
            // Collapse + remove its step placements (no orphans), then return the volume to its tray.
            Task { await viewModel.dismissWorkflow(ownerId) }
        case .note:
            Task { await viewModel.remove(id: ownerId) }
        case .stepNode, .typePanel:
            break
        }
    }

    private var selectedEntityBinding: Binding<SpatialEntity?> {
        Binding(
            get: { viewModel.entities.first { $0.id == selectedEntityID } },
            set: { selectedEntityID = $0?.id }
        )
    }

    private var selectedNoteBinding: Binding<SpatialEntity?> {
        Binding(
            get: { viewModel.entities.first { $0.id == selectedNoteID } },
            set: { selectedNoteID = $0?.id }
        )
    }

    // MARK: - Scene reconcile

    private func reconcile(content: RealityViewContent, attachments: RealityViewAttachments) {
        let rendered = viewModel.renderedEntities
        let liveIDs = Set(rendered.map(\.id))

        // Remove attachments whose entity is gone (collect first; don't mutate while iterating).
        // Edge containers are excluded — they're keyed/managed by syncEdges + EdgeSystem.
        let stale = content.entities.filter {
            !liveIDs.contains($0.name)
                && !$0.name.hasPrefix(Self.edgePrefix)
                && !$0.name.hasPrefix(Self.trayPrefix)
                && $0.name != Self.spawnPlaneName
        }
        for entity in stale { content.remove(entity) }

        // Snap-back guard via the pure, unit-tested reducer: only data-owned ids may be
        // repositioned this pass (a gesture/animation owner is never writable).
        let writableIds = Set(SceneReducer.writableIds(
            current: rendered.map(\.id),
            ownership: Dictionary(uniqueKeysWithValues: rendered.map { ($0.id, viewModel.owner(of: $0.id)) })
        ))

        // Add each rendered entity's card; reposition only when the data model owns the transform.
        for entity in rendered {
            guard let card = attachments.entity(for: entity.id) else { continue }
            card.name = entity.id
            let isNew = card.parent == nil
            if isNew { content.add(card) }

            // Create "pop" — fires once the freshly-created entity's card is ready.
            if viewModel.recentlyCreatedIds.contains(entity.id) {
                pulse(card, .pop)
                viewModel.consumeCreatePulse(entity.id)
            }

            // Mirror transform ownership onto the entity so the runtime Systems (which can't read
            // the @Observable view model) know who owns the transform this frame.
            card.components.set(TransformAuthorityComponent(owner: viewModel.owner(of: entity.id)))

            // The data model writes only the TARGET; LayoutTweenSystem glides the presented
            // transform toward it (smooth, not a teleport). A gesture/animation owner is skipped —
            // the structural fix for the drag snap-back (decided by the pure SceneReducer).
            if writableIds.contains(entity.id) {
                let target = VolumeMetrics.standard.clamp(
                    SIMD3(Float(entity.positionX), Float(entity.positionY), Float(entity.positionZ))
                )
                card.components.set(LayoutTargetComponent(target: target))
                if isNew { card.position = target }   // place immediately on first appearance
            } else {
                SpatialLog.drag.debug("reconcile: skip target id=\(entity.id, privacy: .public) (owner != .data)")
            }

            // Measure the card's OWN quad (recursive: false) so child controls don't inflate it.
            let bounds = card.visualBounds(recursive: false, relativeTo: card)
            let e = bounds.extents
            let valid = e.x.isFinite && e.y.isFinite && e.z.isFinite && e.x > 0.001 && e.y > 0.001
                && bounds.center.x.isFinite && bounds.center.y.isFinite && bounds.center.z.isFinite

            // One-time interaction wiring (manipulation / collision / input / hover), set up once
            // the card's bounds are ready — NOT every pass — so we never clobber
            // ManipulationComponent's own setup or churn colliders each frame.
            configureInteractionIfNeeded(card, kind: entity.kind, bounds: bounds, valid: valid)

            // Hover-active × control (child of the card, so it moves with it).
            updateDismissControl(on: card, entity: entity, bounds: bounds, valid: valid)
            // Drag-to-connect ports: output (right, draggable) + input (left, anchor).
            updateConnectPort(on: card, entity: entity, bounds: bounds, valid: valid)
            updateInputPort(on: card, entity: entity, bounds: bounds, valid: valid)
            // Edit (pencil) control — workflow volumes only (their tap toggles steps).
            updateEditControl(on: card, entity: entity, bounds: bounds, valid: valid)
        }

        syncTrayBackings(content: content)
        syncEdges(content: content, rendered: rendered)
    }

    // MARK: - Interaction wiring

    /// Movable entity kinds get native object manipulation; type panels are static anchors.
    private func isMovable(_ kind: SpatialEntityKind) -> Bool {
        kind == .taskNode || kind == .stepNode || kind == .note || kind == .workflowVolume
    }

    /// Trigger a one-shot scale pulse on a card (`.pop` for create/select, `.bounce` for drop).
    /// `PulseSystem` animates and self-removes it. Suppressed under Reduce Motion.
    private func pulse(_ entity: Entity, _ style: PulseStyle) {
        guard !viewModel.reduceMotion else { return }
        entity.components.set(PulseComponent(
            style: style,
            duration: SpatialMotion.pulseDuration,
            amplitude: style == .pop ? SpatialMotion.popAmplitude : SpatialMotion.bounceAmplitude
        ))
    }

    /// Configure a card's collision/input/hover exactly once, when its bounds are first valid.
    /// Movable cards use `ManipulationComponent` (which owns the transform during a drag and
    /// adds Collision/InputTarget/HoverEffect itself); static cards get a plain hover target.
    /// A flat collider depth (0.012 m) keeps the card from enclosing its front-offset × control.
    private func configureInteractionIfNeeded(_ card: Entity, kind: SpatialEntityKind, bounds: BoundingBox, valid: Bool) {
        guard valid else { return }
        let size = SIMD3<Float>(bounds.extents.x, bounds.extents.y, SpatialTokens.cardColliderDepth)
        let shape = ShapeResource.generateBox(size: size).offsetBy(translation: bounds.center)

        if isMovable(kind) {
            guard card.components[ManipulationComponent.self] == nil else { return }
            ManipulationComponent.configureEntity(
                card,
                hoverEffect: .highlight(.default, groupID: Self.cardHoverGroup),
                allowedInputTypes: .indirect,
                collisionShapes: [shape]
            )
            if var manip = card.components[ManipulationComponent.self] {
                manip.releaseBehavior = .stay              // default .reset IS a snap-back
                manip.dynamics.scalingBehavior = .none      // cards translate only
                manip.dynamics.secondaryRotationBehavior = .none
                card.components.set(manip)
            }
        } else {
            guard card.components[InputTargetComponent.self] == nil else { return }
            card.components.set(CollisionComponent(shapes: [shape]))
            card.components.set(InputTargetComponent())
            card.components.set(HoverEffectComponent(.highlight(.default, groupID: Self.cardHoverGroup)))
        }
        // Taps are detected by the ManipulationBridge (near-zero-travel manipulation) and relayed
        // via viewModel.tapRequest → handleEntityTap. We do NOT add a GestureComponent tap: it does
        // not fire on an entity that also has a ManipulationComponent (verified at runtime).
    }

    // MARK: - Hover controls

    private func dismissEligible(_ kind: SpatialEntityKind) -> Bool {
        kind == .taskNode || kind == .note || kind == .workflowVolume
    }

    /// Connectable kinds get a drag-to-connect port. Notes and type panels don't connect.
    private func portEligible(_ kind: SpatialEntityKind) -> Bool {
        kind == .taskNode || kind == .stepNode || kind == .workflowVolume
    }

    /// Attach/update a small × badge at the card's top-left corner (deduped by name).
    private func updateDismissControl(on card: Entity, entity: SpatialEntity, bounds: BoundingBox, valid: Bool) {
        let name = "\(Self.controlPrefix)dismiss::\(entity.id)"
        guard dismissEligible(entity.kind), valid else {
            card.children.first { $0.name == name }?.removeFromParent()
            return
        }
        let badge = card.children.first { $0.name == name } ?? makeDismissControl(named: name, parent: card)
        let inset: Float = 0.02
        // Place the × ABOVE the top edge (exterior top band), toward the left — clear of the
        // mid-edge input/output ports on short cards (the ×/input-port overlap fix). Still IN FRONT
        // of the card's thin collider so its own collider is the frontmost, non-enclosed hit target.
        badge.position = SIMD3(
            bounds.center.x - bounds.extents.x / 2 + inset,
            bounds.center.y + bounds.extents.y / 2 + SpatialTokens.controlTopGap,
            bounds.center.z + bounds.extents.z / 2 + SpatialTokens.controlFrontGap
        )
    }

    private func makeDismissControl(named name: String, parent: Entity) -> Entity {
        let badge = Entity()
        badge.name = name
        badge.components.set(ViewAttachmentComponent(rootView: DismissBadge()))
        // The × gets its OWN ManipulationComponent so a tap on it fires manipulation events on the
        // BADGE (it sits in front of the card's flat collider, so it's the frontmost hit) rather
        // than on the parent card. The bridge's "ctl::" branch routes any release to dismiss.
        // (We use the manipulation-event path, not GestureComponent, because GestureComponent taps
        // don't fire on a manipulable entity — the same reason cards use the bridge.)
        ManipulationComponent.configureEntity(
            badge,
            hoverEffect: .highlight(.default, groupID: Self.controlHoverGroup),
            allowedInputTypes: .indirect,
            collisionShapes: [.generateBox(size: [0.05, 0.05, 0.02])]
        )
        if var manip = badge.components[ManipulationComponent.self] {
            manip.releaseBehavior = .stay
            manip.dynamics.scalingBehavior = .none
            manip.dynamics.secondaryRotationBehavior = .none
            badge.components.set(manip)
        }
        parent.addChild(badge)
        return badge
    }

    // MARK: - Connection port (drag-to-connect)

    /// Attach/update a connection PORT at the card's right-edge midpoint (deduped by name). Like the
    /// × control, it's a child with its OWN ManipulationComponent sitting in FRONT of the card's
    /// flat collider, so grabbing it fires the port's manipulation events (a connect-drag), not the
    /// card's. Built once when bounds are valid; repositioned each pass.
    private func updateConnectPort(on card: Entity, entity: SpatialEntity, bounds: BoundingBox, valid: Bool) {
        let name = "\(Self.controlPrefix)port::\(entity.id)"
        guard portEligible(entity.kind), valid else {
            card.children.first { $0.name == name }?.removeFromParent()
            return
        }
        let port = card.children.first { $0.name == name } ?? makeConnectPort(named: name, parent: card)
        port.position = SIMD3(
            bounds.center.x + bounds.extents.x / 2 - SpatialTokens.portInset,    // right edge
            bounds.center.y,                                                      // vertical middle
            bounds.center.z + bounds.extents.z / 2 + SpatialTokens.portFrontGap  // frontmost, non-enclosed
        )
    }

    private func makeConnectPort(named name: String, parent: Entity) -> Entity {
        let port = Entity()
        port.name = name
        port.components.set(ViewAttachmentComponent(rootView: ConnectPortHandle()))
        ManipulationComponent.configureEntity(
            port,
            hoverEffect: .highlight(.default, groupID: Self.portHoverGroup),
            allowedInputTypes: .indirect,
            collisionShapes: [.generateBox(size: SIMD3(repeating: SpatialTokens.portColliderHalf * 2))]
        )
        if var manip = port.components[ManipulationComponent.self] {
            manip.releaseBehavior = .stay              // never snap-back DURING the connect-drag
            manip.dynamics.scalingBehavior = .none
            manip.dynamics.secondaryRotationBehavior = .none
            port.components.set(manip)
        }
        parent.addChild(port)
        return port
    }

    /// Attach/update an INPUT port at the card's LEFT-edge midpoint — a non-interactive visual +
    /// edge anchor. Connections TERMINATE here (target end), so an edge reads output(right)→
    /// input(left). Unlike the output port it has NO ManipulationComponent (you don't drag from
    /// an input), so it can't start a connect-drag.
    private func updateInputPort(on card: Entity, entity: SpatialEntity, bounds: BoundingBox, valid: Bool) {
        let name = "\(Self.controlPrefix)inport::\(entity.id)"
        guard portEligible(entity.kind), valid else {
            card.children.first { $0.name == name }?.removeFromParent()
            return
        }
        let port = card.children.first { $0.name == name } ?? makeInputPort(named: name, parent: card)
        port.position = SIMD3(
            bounds.center.x - bounds.extents.x / 2 + SpatialTokens.portInset,    // left edge
            bounds.center.y,
            bounds.center.z + bounds.extents.z / 2 + SpatialTokens.portFrontGap  // co-planar with output
        )
    }

    private func makeInputPort(named name: String, parent: Entity) -> Entity {
        let port = Entity()
        port.name = name
        port.components.set(ViewAttachmentComponent(rootView: ConnectInputHandle()))
        parent.addChild(port)
        return port
    }

    /// A workflow's tap toggles its steps, so it needs a separate affordance to edit the workflow
    /// ITSELF. Only workflow volumes get the edit (pencil) control; task/step nodes edit via tap.
    private func editEligible(_ kind: SpatialEntityKind) -> Bool { kind == .workflowVolume }

    /// Attach/update an edit (pencil) control at the card's top-right corner (deduped by name).
    private func updateEditControl(on card: Entity, entity: SpatialEntity, bounds: BoundingBox, valid: Bool) {
        let name = "\(Self.controlPrefix)edit::\(entity.id)"
        guard editEligible(entity.kind), valid else {
            card.children.first { $0.name == name }?.removeFromParent()
            return
        }
        let badge = card.children.first { $0.name == name } ?? makeEditControl(named: name, parent: card)
        let inset: Float = 0.02
        // Above the top edge, toward the right (× sits above-left) — clear of the mid-edge ports.
        badge.position = SIMD3(
            bounds.center.x + bounds.extents.x / 2 - inset,
            bounds.center.y + bounds.extents.y / 2 + SpatialTokens.controlTopGap,
            bounds.center.z + bounds.extents.z / 2 + SpatialTokens.controlFrontGap
        )
    }

    private func makeEditControl(named name: String, parent: Entity) -> Entity {
        let badge = Entity()
        badge.name = name
        badge.components.set(ViewAttachmentComponent(rootView: EditControlBadge()))
        ManipulationComponent.configureEntity(
            badge,
            hoverEffect: .highlight(.default, groupID: Self.controlHoverGroup),
            allowedInputTypes: .indirect,
            collisionShapes: [.generateBox(size: [0.05, 0.05, 0.02])]
        )
        if var manip = badge.components[ManipulationComponent.self] {
            manip.releaseBehavior = .stay
            manip.dynamics.scalingBehavior = .none
            manip.dynamics.secondaryRotationBehavior = .none
            badge.components.set(manip)
        }
        parent.addChild(badge)
        return badge
    }

    // MARK: - Edges

    /// Reconcile the SET of edges (dependency edges between step nodes; cross-workflow links).
    /// Adds/removes edge containers by a stable key; `EdgeSystem` positions them each frame from
    /// the live endpoint positions (so they follow a dragged node and don't rebuild every pass).
    private func syncEdges(content: RealityViewContent, rendered: [SpatialEntity]) {
        // endeavorId is non-nil only for cross-workflow LINK edges (gives them a rename control).
        // `from`/`to` are the edge's IDENTITY (the link's entity pair — controls and remove/reassign
        // key off them); `anchorFrom`/`anchorTo` are where it DRAWS (the visible representatives,
        // which fall back to a collapsed workflow's volume when the step endpoint is hidden).
        typealias EdgeSpec = (
            from: String, to: String,
            anchorFrom: String, anchorTo: String,
            color: UIColor, endeavorId: String?
        )
        var desired: [String: EdgeSpec] = [:]

        var entityByStepId: [String: String] = [:]
        for entity in rendered where entity.kind == .stepNode {
            if let ref = entity.refId { entityByStepId[ref] = entity.id }
        }
        for entity in rendered where entity.kind == .stepNode {
            guard let step = viewModel.step(for: entity) else { continue }
            for depId in step.dependsOn {
                if let srcId = entityByStepId[depId] {
                    desired["\(srcId)|\(entity.id)"] =
                        (srcId, entity.id, srcId, entity.id, SpatialColor.dependencyEdge, nil)
                }
            }
        }

        let renderedIds = Set(rendered.map(\.id))
        var parentById: [String: String] = [:]
        for entity in viewModel.entities {
            if let parent = entity.parentId { parentById[entity.id] = parent }
        }
        var seenAnchorPairs = Set<String>()
        for link in viewModel.links {
            // Anchor each endpoint at the entity that currently shows it — the step node when
            // expanded, its workflow volume when collapsed. No visible anchor → no edge.
            guard
                let anchorFrom = SceneReducer.visibleLinkAnchor(
                    entityId: link.sourceEntityId, renderedIds: renderedIds, parentById: parentById),
                let anchorTo = SceneReducer.visibleLinkAnchor(
                    entityId: link.targetEntityId, renderedIds: renderedIds, parentById: parentById),
                anchorFrom != anchorTo,
                seenAnchorPairs.insert("\(anchorFrom)|\(anchorTo)").inserted  // collapse duplicate volume↔volume edges
            else { continue }
            // Color each cross-workflow edge by its endeavor (the panel swatches are the legend).
            let color = link.endeavorColor.map { UIColor(Color(hex: $0)) } ?? SpatialColor.crossLinkEdge
            desired["\(link.sourceEntityId)|\(link.targetEntityId)"] =
                (link.sourceEntityId, link.targetEntityId, anchorFrom, anchorTo, color, link.endeavorId)
        }
        // Transient rubber-band while dragging a port: source node center → its dragged port tip.
        if let src = viewModel.pendingConnectSourceId {
            let tip = "\(Self.controlPrefix)port::\(src)"
            desired["pending"] = (src, tip, src, tip, SpatialColor.pendingEdge, nil)
        }

        var existing: [String: Entity] = [:]
        for ent in content.entities where ent.name.hasPrefix(Self.edgePrefix) {
            existing[String(ent.name.dropFirst(Self.edgePrefix.count))] = ent
        }
        for (key, ent) in existing where desired[key] == nil { content.remove(ent) }
        for (key, edge) in desired {
            if let ent = existing[key] {
                // Keep the edge entity (stable key = the link's identity pair) but retarget its
                // anchors — collapse/expand moves an endpoint between step node and volume.
                ent.components.set(EdgeComponent(fromName: edge.anchorFrom, toName: edge.anchorTo))
            } else {
                content.add(makeEdge(
                    key: key, from: edge.from, to: edge.to,
                    anchorFrom: edge.anchorFrom, anchorTo: edge.anchorTo,
                    color: edge.color, endeavorId: edge.endeavorId
                ))
            }
        }
    }

    /// An edge container (at the origin) with a unit `line` box + two end `port` spheres, all
    /// positioned each frame by `EdgeSystem` from the endpoints' live positions. `from`/`to` are
    /// the edge's identity (baked into control names for remove/reassign); `anchorFrom`/`anchorTo`
    /// are the entities it draws between (a collapsed endpoint anchors at its workflow volume).
    private func makeEdge(key: String, from: String, to: String,
                          anchorFrom: String, anchorTo: String,
                          color: UIColor, endeavorId: String?) -> Entity {
        let edge = Entity()
        edge.name = "\(Self.edgePrefix)\(key)"
        edge.components.set(EdgeComponent(fromName: anchorFrom, toName: anchorTo))

        let line = ModelEntity(
            mesh: .generateBox(size: [0.004, 0.004, 1], cornerRadius: 0.002),
            materials: [translucentEdgeMaterial(color)]
        )
        line.name = "line"
        edge.addChild(line)

        for portName in ["portA", "portB"] {
            let port = ModelEntity(
                mesh: .generateSphere(radius: 0.011),
                materials: [translucentEdgeMaterial(color)]
            )
            port.name = portName
            edge.addChild(port)
        }

        // Removal × at the edge midpoint (positioned each frame by EdgeSystem). Skip on the
        // transient rubber-band. Own ManipulationComponent so its tap routes via the bridge; the
        // name encodes the edge endpoints for removeConnection.
        if key != "pending" {
            let remove = Entity()
            remove.name = "\(Self.controlPrefix)unedge::\(from)|\(to)"
            remove.components.set(ViewAttachmentComponent(rootView: EdgeRemoveBadge()))
            ManipulationComponent.configureEntity(
                remove,
                hoverEffect: .highlight(.default, groupID: Self.controlHoverGroup),
                allowedInputTypes: .indirect,
                collisionShapes: [.generateBox(size: [0.04, 0.04, 0.02])]
            )
            if var manip = remove.components[ManipulationComponent.self] {
                manip.releaseBehavior = .stay
                manip.dynamics.scalingBehavior = .none
                manip.dynamics.secondaryRotationBehavior = .none
                remove.components.set(manip)
            }
            edge.addChild(remove)
        }

        // Cross-workflow LINK edges carry a pencil control to rename the endeavor that captures them
        // (auto-named "A → B", user-editable). Positioned just above the midpoint by EdgeSystem.
        if let endeavorId, key != "pending" {
            let edit = Entity()
            edit.name = "\(Self.controlPrefix)editlink::\(from)|\(to)"
            edit.components.set(ViewAttachmentComponent(rootView: EdgeEditBadge()))
            ManipulationComponent.configureEntity(
                edit,
                hoverEffect: .highlight(.default, groupID: Self.controlHoverGroup),
                allowedInputTypes: .indirect,
                collisionShapes: [.generateBox(size: [0.04, 0.04, 0.02])]
            )
            if var manip = edit.components[ManipulationComponent.self] {
                manip.releaseBehavior = .stay
                manip.dynamics.scalingBehavior = .none
                manip.dynamics.secondaryRotationBehavior = .none
                edit.components.set(manip)
            }
            edge.addChild(edit)
        }
        return edge
    }

    /// A translucent unlit material for edges/ports (so connection lines read as soft glass, not
    /// solid bars). UnlitMaterial honors alpha only when blending is `.transparent`.
    private func translucentEdgeMaterial(_ color: UIColor) -> UnlitMaterial {
        var material = UnlitMaterial(color: color)
        material.blending = .transparent(opacity: 0.55)
        return material
    }

    static let edgePrefix = "edge::"
    static let trayPrefix = "tray::"

    // MARK: - Type tray backings

    /// Render a translucent, type-tinted backing slab behind each type column so nodes read as
    /// "sitting in" a tray. Set-reconciled by name (like edges); position/size come from the pure
    /// layout engine so the visual bounds match the column math.
    private func syncTrayBackings(content: RealityViewContent) {
        var desiredIds = Set<String>()
        for bounds in viewModel.trayBounds() {
            let name = "\(Self.trayPrefix)\(bounds.typeId)"
            desiredIds.insert(name)
            let tray = (content.entities.first { $0.name == name } as? ModelEntity) ?? makeTrayBacking(named: name)
            if tray.parent == nil { content.add(tray) }
            tray.position = bounds.center
            tray.scale = bounds.size   // a unit box scaled to the tray slab dimensions
            let tint = viewModel.type(id: bounds.typeId)?.swiftUIColor ?? .gray
            tray.model?.materials = [trayMaterial(UIColor(tint))]
        }
        for ent in content.entities where ent.name.hasPrefix(Self.trayPrefix) && !desiredIds.contains(ent.name) {
            content.remove(ent)
        }
    }

    private func makeTrayBacking(named name: String) -> ModelEntity {
        let tray = ModelEntity(mesh: .generateBox(size: 1, cornerRadius: 0.06), materials: [trayMaterial(.gray)])
        tray.name = name
        return tray
    }

    /// Soft tinted glass for a tray backing — UnlitMaterial honors alpha when blending is transparent.
    private func trayMaterial(_ color: UIColor) -> UnlitMaterial {
        var material = UnlitMaterial(color: color)
        material.blending = .transparent(opacity: .init(floatLiteral: SpatialTokens.trayShadeOpacity))
        return material
    }

    // MARK: - Cards

    @ViewBuilder
    private func card(for entity: SpatialEntity) -> some View {
        switch entity.kind {
        case .typePanel:
            if let type = viewModel.type(id: entity.refId) {
                TypePanelCardView(type: type, taskCount: sprintCount(typeId: type.id))
            }
        case .note:
            NoteCardView(text: entity.noteText ?? "")
        case .workflowVolume:
            let workflow = entity.refId.flatMap { viewModel.tasksById[$0] }
            WorkflowVolumeCardView(
                title: workflow?.name ?? "Workflow",
                stepCount: workflow?.steps?.count ?? 0,
                isExpanded: false
            )
        case .taskNode:
            if let task = viewModel.task(for: entity) {
                NodeCardView(
                    title: task.name,
                    type: viewModel.type(id: task.type),
                    durationMinutes: task.duration,
                    isStep: false,
                    state: .rest
                )
            }
        case .stepNode:
            if let step = viewModel.step(for: entity) {
                NodeCardView(
                    title: step.name,
                    type: viewModel.type(id: step.type),
                    durationMinutes: step.duration,
                    isStep: true,
                    status: step.status,
                    state: .rest
                )
            }
        }
    }

    private func sprintCount(typeId: String) -> Int {
        viewModel.tasksById.values.filter {
            $0.inActiveSprint && !$0.archived && !$0.hasSteps && $0.type == typeId
        }.count
    }

    // MARK: - Create

    /// Placeholder name for a just-created task — replaced immediately in the edit form,
    /// which opens with the name field focused.
    static let defaultTaskName = "New Task"

    private func createNote(text: String) async {
        let p = nextSpawn()
        await viewModel.createNote(text: text, x: Double(p.x), y: Double(p.y), z: Double(p.z))
    }

    /// Spawn point toward the viewer, spread by how many things already exist so successive
    /// creates don't stack on one another.
    private func nextSpawn() -> SIMD3<Float> {
        let n = viewModel.entities.count
        let col = Float(n % 4) * 0.16 - 0.24
        let row = -Float((n / 4) % 3) * 0.14
        return VolumeMetrics.standard.clamp([col, row, VolumeMetrics.standard.usableHalf.z * 0.4])
    }

    // MARK: - Gaze + double-pinch spawn

    static let spawnPlaneName = "spawnPlane"

    /// A large invisible collidable plane behind the cards. A double-pinch (indirect gaze+pinch) on
    /// empty space resolves to a point on it — the look-location to spawn a node. Cards sit in front,
    /// so they keep gaze priority; we only act when the hit entity IS this plane.
    private func makeSpawnPlane() -> Entity {
        let plane = Entity()
        plane.name = Self.spawnPlaneName
        let m = VolumeMetrics.standard
        let size = SIMD3<Float>(m.usableHalf.x * 2 + 0.2, m.usableHalf.y * 2 + 0.2, 0.01)
        plane.position = SIMD3(0, 0, m.backZ - 0.03)
        plane.components.set(CollisionComponent(shapes: [.generateBox(size: size)]))
        plane.components.set(InputTargetComponent())
        return plane
    }

    /// Double-pinch on empty space → spawn a task at the look-location, then pop the type wheel.
    private var spawnGesture: some Gesture {
        SpatialTapGesture(count: 2)
            .targetedToAnyEntity()
            .onEnded { value in
                guard value.entity.name == Self.spawnPlaneName else { return }
                let pt = value.convert(value.location3D, from: .local, to: .scene)
                let clamped = VolumeMetrics.standard.clamp(SIMD3<Float>(Float(pt.x), Float(pt.y), Float(pt.z)))
                Task {
                    if let id = await viewModel.createTask(
                        name: Self.defaultTaskName,
                        x: Double(clamped.x), y: Double(clamped.y), z: Double(clamped.z)
                    ) {
                        editAfterWheelID = id   // wheel → edit form (name focused) on dismiss
                        typeWheelEntityID = id
                    }
                }
            }
    }

    private var typeWheelBinding: Binding<SpatialEntity?> {
        Binding(
            get: { viewModel.entities.first { $0.id == typeWheelEntityID } },
            set: { typeWheelEntityID = $0?.id }
        )
    }
}

/// SwiftUI visual for the × dismiss control (rendered on a child entity via
/// ViewAttachmentComponent). Highlight is driven by the entity's `HoverEffectComponent`
/// (a SwiftUI `.hoverEffect` here did not produce a visible RealityKit change); the tap is
/// routed by the scene's `TapGesture` matching this entity's `ctl::dismiss::<id>` name.
private struct DismissBadge: View {
    var body: some View {
        Image(systemName: "xmark.circle.fill")
            .font(.system(size: 26))
            .symbolRenderingMode(.palette)
            .foregroundStyle(.white, .black.opacity(0.55))
    }
}

/// SwiftUI visual for a drag-to-connect port handle (rendered on a child entity via
/// ViewAttachmentComponent). Highlight is driven by the entity's HoverEffectComponent; the drag
/// is handled by the entity's ManipulationComponent via ManipulationBridge.
private struct ConnectPortHandle: View {
    var body: some View {
        Image(systemName: "circle.circle.fill")
            .font(.system(size: 22))
            .symbolRenderingMode(.palette)
            .foregroundStyle(.white, Color.green.opacity(0.85))
    }
}

/// SwiftUI visual for an INPUT port (the target end of a connection) — distinct from the filled
/// green output port (hollow + blue) and non-interactive.
private struct ConnectInputHandle: View {
    var body: some View {
        Image(systemName: "smallcircle.filled.circle")
            .font(.system(size: 20))
            .symbolRenderingMode(.palette)
            .foregroundStyle(Color.blue.opacity(0.9), .white.opacity(0.6))
    }
}

/// SwiftUI visual for the edit (pencil) control on a workflow volume's top-right — opens the edit
/// form for the workflow itself (a tap on the volume body toggles its steps instead).
private struct EditControlBadge: View {
    var body: some View {
        Image(systemName: "pencil.circle.fill")
            .font(.system(size: 24))
            .symbolRenderingMode(.palette)
            .foregroundStyle(.white, Color.accentColor.opacity(0.9))
    }
}

/// SwiftUI visual for the edge-removal control at an edge's midpoint (tap to delete the connection).
private struct EdgeRemoveBadge: View {
    var body: some View {
        Image(systemName: "minus.circle.fill")
            .font(.system(size: 18))
            .symbolRenderingMode(.palette)
            .foregroundStyle(.white, .red.opacity(0.85))
    }
}

/// SwiftUI visual for the rename (pencil) control on a cross-workflow LINK edge — opens a sheet to
/// rename the endeavor that captures the link (auto-named "A → B").
private struct EdgeEditBadge: View {
    var body: some View {
        Image(systemName: "pencil.circle.fill")
            .font(.system(size: 18))
            .symbolRenderingMode(.palette)
            .foregroundStyle(.white, Color.orange.opacity(0.9))
    }
}

/// A cross-workflow link's endpoints (source/target entity ids), for the "assign to endeavor" sheet.
private struct LinkEndpoints: Identifiable {
    let id: String
    let from: String
    let to: String
    init(from: String, to: String) { self.id = "\(from)|\(to)"; self.from = from; self.to = to }
}

/// Edit or delete a note.
private struct NoteEditView: View {
    let initialText: String
    let onSave: (String) -> Void
    let onDelete: () -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var text: String

    init(initialText: String, onSave: @escaping (String) -> Void, onDelete: @escaping () -> Void) {
        self.initialText = initialText
        self.onSave = onSave
        self.onDelete = onDelete
        _text = State(initialValue: initialText)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Note") {
                    TextField("Note", text: $text, axis: .vertical).lineLimit(3...8)
                }
                Section {
                    Button("Delete Note", systemImage: "trash", role: .destructive) {
                        onDelete(); dismiss()
                    }
                }
            }
            .navigationTitle("Note")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { onSave(text); dismiss() }
                }
            }
        }
        .frame(minWidth: 360, minHeight: 300)
    }
}

/// Text-entry prompt for creating a note. (Tasks skip this — they create immediately and open
/// the full edit form with the name field focused.)
private struct CreatePromptView: View {
    let onCreate: (String) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var text = ""

    var body: some View {
        NavigationStack {
            Form {
                TextField("Note", text: $text, axis: .vertical)
            }
            .navigationTitle("New Note")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Create") {
                        onCreate(text)
                        dismiss()
                    }
                    .disabled(text.isEmpty)
                }
            }
        }
        .frame(minWidth: 360, minHeight: 220)
    }
}

/// Pick which endeavor a cross-workflow link belongs to (pencil on a link edge). Selecting one moves
/// the dependency to that endeavor and recolors the edge. Rename / recolor lives in the Endeavors panel.
private struct AssignEndeavorView: View {
    let endeavors: [Endeavor]
    let currentEndeavorId: String?
    let onPick: (String) -> Void
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Group {
                if endeavors.isEmpty {
                    ContentUnavailableView(
                        "No Endeavors",
                        systemImage: "flag.2.crossed",
                        description: Text("Create an endeavor from the Endeavors panel first.")
                    )
                } else {
                    List(endeavors) { endeavor in
                        Button {
                            onPick(endeavor.id); dismiss()
                        } label: {
                            HStack(spacing: 10) {
                                Circle().fill(endeavor.swiftUIColor).frame(width: 14, height: 14)
                                Text(endeavor.name)
                                Spacer()
                                if endeavor.id == currentEndeavorId {
                                    Image(systemName: "checkmark").foregroundStyle(.tint)
                                }
                            }
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            .navigationTitle("Assign Link")
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } } }
        }
        .frame(minWidth: 380, minHeight: 360)
    }
}
