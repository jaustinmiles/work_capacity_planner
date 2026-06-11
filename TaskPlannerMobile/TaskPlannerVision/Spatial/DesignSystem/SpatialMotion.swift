import Foundation
import simd

/// Motion tokens + the pure damping math for the animation layer. Kept separate from
/// `SpatialTokens` (visual) so the timing language is centralized and the math is unit-testable.
enum SpatialMotion {
    /// Exponential follow rate (per second) for the layout glide. Higher = snappier.
    static let layoutFollowRate: Float = 12

    /// Distance (m) below which the glide snaps to the target (avoids asymptotic crawl).
    static let settleEpsilon: Float = 0.0005

    /// Frame-rate-independent damped step toward a target, no overshoot. `factor` is the
    /// already-computed smoothing fraction for this frame (`1 - exp(-rate * dt)`), in [0, 1].
    /// Pure function → unit-testable for convergence.
    static func dampedStep(current: SIMD3<Float>, target: SIMD3<Float>, factor: Float) -> SIMD3<Float> {
        if simd_distance(current, target) < settleEpsilon { return target }
        return current + (target - current) * max(0, min(1, factor))
    }

    /// The per-frame smoothing fraction for a given delta-time and rate.
    static func smoothingFactor(deltaTime: Float, rate: Float = layoutFollowRate) -> Float {
        1 - exp(-rate * max(0, deltaTime))
    }

    // MARK: - Pulse (one-shot scale feedback)

    static let pulseDuration: TimeInterval = 0.42
    static let popAmplitude: Float = 0.12      // create / select
    static let bounceAmplitude: Float = 0.07   // drop settle

    /// A 0 → peak → 0 scale-offset curve over normalized time `t ∈ [0, 1]`. Pure → testable.
    static func pulseCurve(_ t: Float, style: PulseStyle) -> Float {
        let tt = max(0, min(1, t))
        switch style {
        case .pop:    return sin(tt * .pi)                  // single smooth hump
        case .bounce: return sin(tt * .pi * 3) * (1 - tt)   // decaying oscillation (settle)
        }
    }
}

/// How a one-shot `PulseComponent` animates.
enum PulseStyle {
    case pop      // create / select — a single grow-and-settle
    case bounce   // drop — a quick decaying wobble
}
