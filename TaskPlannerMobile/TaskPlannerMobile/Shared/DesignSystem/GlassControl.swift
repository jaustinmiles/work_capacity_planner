import SwiftUI

/// Liquid Glass styling for the CUSTOM floating controls we build ourselves — the running-task pill,
/// the quick-capture FAB. Glass belongs to the navigation/control layer ONLY; never wrap content-layer
/// surfaces (log timeline, task lists, cards) in it.
///
/// Deployment target is iOS 26, so `.glassEffect` is used directly with no availability gate. Group
/// adjacent custom-glass controls in a single `GlassEffectContainer` (glass can't sample glass).
extension View {

    /// Capsule-shaped interactive Liquid Glass, optionally tinted with meaning (task type / primary action).
    func brandGlass(tint: Color? = nil) -> some View {
        brandGlass(tint: tint, in: Capsule())
    }

    /// Interactive Liquid Glass in an explicit shape.
    func brandGlass<S: Shape>(tint: Color?, in shape: S) -> some View {
        let glass: Glass = tint.map { Glass.regular.tint($0).interactive() } ?? Glass.regular.interactive()
        return glassEffect(glass, in: shape)
    }
}
