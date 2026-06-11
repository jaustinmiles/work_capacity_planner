import Foundation

/// Service for the spatial scene (visionOS volumetric workspace).
///
/// Thin wrapper over the shared `TRPCClient` for the `spatialScene.*` procedures. The
/// workflow-morph engine lives on the server (shared with the Deep Work Board);
/// `connect`/`disconnect` here simply invoke it.
///
/// This lives in the visionOS target only and is constructed from `AppState.client`,
/// so the shared `AppState` (and the iOS target) carry no spatial dependency.
final class SpatialSceneService {
    private let client: TRPCClient

    init(client: TRPCClient) {
        self.client = client
    }

    /// The active session's scene + entities, or nil if none exists yet.
    func getScene() async throws -> SpatialSceneWithEntities? {
        try await client.query("spatialScene.getScene")
    }

    /// Idempotently create-or-fetch the session's scene.
    func ensureScene() async throws -> SpatialSceneWithEntities {
        try await client.mutate("spatialScene.ensureScene")
    }

    /// Create a placed entity (type panel, workflow volume, or note).
    func createEntity(_ input: CreateSpatialEntityInput) async throws -> SpatialEntity {
        try await client.mutate("spatialScene.createEntity", input: input)
    }

    /// Create a standalone task and place it as a taskNode (double-pinch create).
    func createTaskEntity(_ input: CreateTaskEntityInput) async throws -> CreateTaskEntityResult {
        try await client.mutate("spatialScene.createTaskEntity", input: input)
    }

    /// Persist a single entity's 3D transform (drag-end).
    @discardableResult
    func updateEntityTransform(_ input: UpdateEntityTransformInput) async throws -> SpatialEntity {
        try await client.mutate("spatialScene.updateEntityTransform", input: input)
    }

    /// Persist many transforms at once (e.g. moving a workflow volume with its children).
    func batchUpdateEntityTransforms(_ input: BatchUpdateEntityTransformsInput) async throws {
        let _: CountResponse = try await client.mutate("spatialScene.batchUpdateEntityTransforms", input: input)
    }

    @discardableResult
    func updateNoteText(_ input: UpdateNoteTextInput) async throws -> SpatialEntity {
        try await client.mutate("spatialScene.updateNoteText", input: input)
    }

    @discardableResult
    func setRendered(_ input: SetRenderedInput) async throws -> SpatialEntity {
        try await client.mutate("spatialScene.setRendered", input: input)
    }

    func removeEntity(_ id: String) async throws {
        try await client.mutateVoid("spatialScene.removeEntity", input: IDInput(id: id))
    }

    /// Connect two node entities — "merge into a workflow" (morph). Returns refreshed entities.
    func connect(_ input: SpatialConnectInput) async throws -> SpatialConnectResult {
        try await client.mutate("spatialScene.connect", input: input)
    }

    /// Remove a connection — may revert isolated steps to standalone tasks.
    func disconnect(_ input: SpatialConnectInput) async throws -> SpatialConnectResult {
        try await client.mutate("spatialScene.disconnect", input: input)
    }

    /// Link two workflows WITHOUT combining them (creates an EndeavorDependency).
    func linkWorkflows(_ input: SpatialConnectInput) async throws {
        try await client.mutateVoid("spatialScene.linkWorkflows", input: input)
    }

    /// Remove a cross-workflow link (deletes the matching EndeavorDependency). Inverse of `linkWorkflows`.
    func unlinkWorkflows(_ input: SpatialConnectInput) async throws {
        try await client.mutateVoid("spatialScene.unlinkWorkflows", input: input)
    }

    /// Cross-workflow links resolved to entity pairs, for drawing dashed edges.
    func getLinks(sceneId: String) async throws -> [SpatialLink] {
        try await client.query("spatialScene.getLinks", input: SceneIdInput(sceneId: sceneId))
    }

    /// Collapse a workflow into a single movable volume (hides its step nodes as children).
    func collapseWorkflow(sceneId: String, workflowTaskId: String) async throws -> SpatialSceneWithEntities {
        try await client.mutate(
            "spatialScene.collapseWorkflow",
            input: CollapseWorkflowInput(sceneId: sceneId, workflowTaskId: workflowTaskId)
        )
    }

    /// Reassign a cross-workflow link to a different endeavor.
    func reassignLink(sceneId: String, sourceEntityId: String, targetEntityId: String, endeavorId: String) async throws {
        try await client.mutateVoid("spatialScene.reassignLink", input: ReassignLinkInput(
            sceneId: sceneId, sourceEntityId: sourceEntityId, targetEntityId: targetEntityId, endeavorId: endeavorId))
    }
}

/// Response shape for procedures that return `{ count }`.
struct CountResponse: Decodable {
    let count: Int
}
