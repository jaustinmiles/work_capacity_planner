import RealityKit

/// Per-entity mirror of the view model's `TransformOwnership` for this entity, so runtime
/// Systems (which cannot read the @Observable view model) know who owns the transform this
/// frame and never write one they don't own. The view model is the source of truth; the
/// reconcile pass keeps this component in sync.
struct TransformAuthorityComponent: Component {
    var owner: TransformOwnership = .data
}
