import Foundation

/// Spatial scene models (visionOS port).
///
/// A `SpatialEntity` is a pure placement/visibility projection — exactly like
/// `DeepWorkNode`. Canonical task/step/type data lives in `TaskItem` / `TaskStep` /
/// `UserTaskType`; an entity only stores where it sits in the volume and what it shows.
/// Edges are derived (from `TaskStep.dependsOn` and endeavor dependencies), never stored.

/// What a placed entity represents. Raw values match the server `SpatialEntityKind` enum.
enum SpatialEntityKind: String, Codable, CaseIterable {
    case taskNode
    case stepNode
    case typePanel
    case workflowVolume
    case note
}

/// A session's persistent volumetric workspace.
struct SpatialScene: Codable, Identifiable {
    let id: String
    var sessionId: String
    var name: String
    var createdAt: Date
    var updatedAt: Date
}

/// A placed, movable entity in a scene. Orientation is a quaternion (RealityKit-native).
struct SpatialEntity: Codable, Identifiable {
    let id: String
    var sceneId: String
    var kind: SpatialEntityKind
    /// taskNode→Task.id, stepNode→TaskStep.id, typePanel→UserTaskType.id,
    /// workflowVolume→workflow Task.id, note→nil.
    var refId: String?
    var noteText: String?
    /// Child step nodes inside a workflowVolume reference the volume entity id.
    var parentId: String?
    var positionX: Double
    var positionY: Double
    var positionZ: Double
    var rotationX: Double
    var rotationY: Double
    var rotationZ: Double
    var rotationW: Double
    var scale: Double
    var isRendered: Bool
    var createdAt: Date
    var updatedAt: Date

    /// True for entities that project a Task/TaskStep and can be connected/disconnected.
    var isNode: Bool { kind == .taskNode || kind == .stepNode }
}

/// A scene loaded with all of its entities (the `spatialScene.getScene` / `ensureScene` shape).
struct SpatialSceneWithEntities: Codable {
    let scene: SpatialScene
    let entities: [SpatialEntity]
}

/// Result of `createTaskEntity`. The server also returns the hydrated node; we only need
/// the placed entity here (the view model re-reads task content separately).
struct CreateTaskEntityResult: Codable {
    let entity: SpatialEntity
}

/// Result of `connect` / `disconnect`. The morph may have swapped entity identities
/// (taskNode → stepNode); the refreshed entity set is returned.
struct SpatialConnectResult: Codable {
    let entities: [SpatialEntity]
}

/// A cross-workflow link (EndeavorDependency) resolved to the two entities it connects,
/// for drawing a dashed dependency edge. "Link without combining" — workflows stay separate.
struct SpatialLink: Codable {
    let sourceEntityId: String
    let targetEntityId: String
    let isHardBlock: Bool
    /// The endeavor that captures this cross-workflow link cluster (auto-named, user-editable).
    let endeavorId: String
    let endeavorName: String
    /// The endeavor's color (hex) — tints the edge + the panel legend; nil when unset.
    let endeavorColor: String?
}

// MARK: - Inputs

struct CreateSpatialEntityInput: Codable {
    let sceneId: String
    let kind: SpatialEntityKind
    var refId: String?
    var noteText: String?
    var parentId: String?
    let positionX: Double
    let positionY: Double
    var positionZ: Double?
    var rotationX: Double?
    var rotationY: Double?
    var rotationZ: Double?
    var rotationW: Double?
    var scale: Double?
}

struct CreateTaskEntityInput: Codable {
    let sceneId: String
    let name: String
    let positionX: Double
    let positionY: Double
    var positionZ: Double?
    var type: String?
    var duration: Int?
    var importance: Int?
    var urgency: Int?
}

struct UpdateEntityTransformInput: Codable {
    let id: String
    let positionX: Double
    let positionY: Double
    let positionZ: Double
    var rotationX: Double?
    var rotationY: Double?
    var rotationZ: Double?
    var rotationW: Double?
    var scale: Double?
    var isRendered: Bool?
}

struct BatchUpdateEntityTransformsInput: Codable {
    let updates: [UpdateEntityTransformInput]
}

struct UpdateNoteTextInput: Codable {
    let id: String
    let noteText: String
}

struct SetRenderedInput: Codable {
    let id: String
    let isRendered: Bool
}

struct SpatialConnectInput: Codable {
    let sceneId: String
    let sourceEntityId: String
    let targetEntityId: String
}

struct SceneIdInput: Codable {
    let sceneId: String
}

struct CollapseWorkflowInput: Codable {
    let sceneId: String
    let workflowTaskId: String
}

/// Reassign a cross-workflow link to a different endeavor (calls `spatialScene.reassignLink`).
struct ReassignLinkInput: Codable {
    let sceneId: String
    let sourceEntityId: String
    let targetEntityId: String
    let endeavorId: String
}
