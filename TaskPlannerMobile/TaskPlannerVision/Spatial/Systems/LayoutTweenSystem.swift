import RealityKit
import simd

/// Glides each `.data`-owned entity's presented transform toward its `LayoutTargetComponent`
/// target with frame-rate-independent damping — so create / relayout / return-to-tray animate
/// smoothly instead of teleporting. Entities owned by a gesture or animation are skipped, so this
/// never fights a live drag (the ownership model in action).
struct LayoutTweenSystem: System {
    private static let query = EntityQuery(where: .has(LayoutTargetComponent.self))

    init(scene: Scene) {}

    func update(context: SceneUpdateContext) {
        let factor = SpatialMotion.smoothingFactor(deltaTime: Float(context.deltaTime))
        for entity in context.entities(matching: Self.query, updatingSystemWhen: .rendering) {
            let owner = entity.components[TransformAuthorityComponent.self]?.owner ?? .data
            guard owner == .data,
                  let target = entity.components[LayoutTargetComponent.self]?.target else { continue }
            // Parent-relative (volume-local) space — the SAME frame the layout engine authors the
            // target in and reconcile sets card.position in. Using world space (relativeTo: nil)
            // here glided cards to a local-meters value reinterpreted as a world point, yanking
            // every auto-placed card off the (room-placed) volume — the "no trays" regression.
            let current = entity.position
            let next = SpatialMotion.dampedStep(current: current, target: target, factor: factor)
            if next != current { entity.position = next }
        }
    }
}
