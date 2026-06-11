import RealityKit

/// Registers all custom spatial Components and Systems with RealityKit. Call once at app launch
/// (before the volumetric scene is built). Registration is idempotent in practice; keeping it in
/// one place means adding a new System/Component is a one-line change here.
enum SpatialSystems {
    static func registerAll() {
        TransformAuthorityComponent.registerComponent()
        LayoutTargetComponent.registerComponent()
        PulseComponent.registerComponent()
        EdgeComponent.registerComponent()
        LayoutTweenSystem.registerSystem()
        PulseSystem.registerSystem()
        EdgeSystem.registerSystem()
    }
}
