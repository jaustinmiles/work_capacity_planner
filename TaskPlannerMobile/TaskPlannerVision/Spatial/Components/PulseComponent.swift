import RealityKit
import Foundation

/// One-shot scale "pulse" feedback — a pop on create/select, a bounce-settle on drop. `PulseSystem`
/// animates the entity's scale over `duration` then removes this component and resets scale. Scale
/// is an independent slice of the transform, so a pulse never conflicts with LayoutTweenSystem
/// (position) or a ManipulationComponent drag (scaling disabled).
struct PulseComponent: Component {
    var style: PulseStyle
    var duration: TimeInterval
    var amplitude: Float
    var elapsed: TimeInterval = 0
}
