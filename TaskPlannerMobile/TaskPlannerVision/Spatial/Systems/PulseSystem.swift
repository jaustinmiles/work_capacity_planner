import RealityKit
import simd

/// Drives one-shot `PulseComponent` scale feedback. Each frame it advances the pulse's elapsed
/// time, sets the entity's scale from `SpatialMotion.pulseCurve`, and removes the component
/// (resetting scale) when the pulse completes. Touches only scale, never position — so it
/// composes with the layout glide and drag without an ownership check.
struct PulseSystem: System {
    private static let query = EntityQuery(where: .has(PulseComponent.self))

    init(scene: Scene) {}

    func update(context: SceneUpdateContext) {
        for entity in context.entities(matching: Self.query, updatingSystemWhen: .rendering) {
            guard var pulse = entity.components[PulseComponent.self] else { continue }
            pulse.elapsed += context.deltaTime
            if pulse.elapsed >= pulse.duration {
                entity.components.remove(PulseComponent.self)
                entity.transform.scale = .init(repeating: 1)
            } else {
                let t = Float(pulse.elapsed / pulse.duration)
                let s = 1 + pulse.amplitude * SpatialMotion.pulseCurve(t, style: pulse.style)
                entity.transform.scale = .init(repeating: s)
                entity.components.set(pulse)
            }
        }
    }
}
