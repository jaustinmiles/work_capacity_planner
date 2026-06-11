import RealityKit
import simd

/// The position an entity *should* occupy (its layout/committed target), distinct from the
/// presented transform it's currently drawn at. `LayoutTweenSystem` glides presented → target.
/// The data model writes the target; only a System writes the presented transform.
struct LayoutTargetComponent: Component {
    var target: SIMD3<Float>
}
