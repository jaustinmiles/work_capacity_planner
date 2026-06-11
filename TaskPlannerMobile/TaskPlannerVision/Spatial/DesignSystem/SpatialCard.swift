import SwiftUI

/// The one reusable spatial card primitive. Every card kind (task/step node, type panel, note,
/// workflow volume) renders its content through this, so the scene stays visually cohesive and a
/// new kind only has to supply content + a row of tokens.
///
/// Surface: a tokenized glass plate (`glassBackgroundEffect`) with a subtle type/accent tint wash
/// and a per-`InteractionState` border. Under Reduce Transparency it falls back to an opaque
/// material so text stays legible over arbitrary passthrough.
struct SpatialCard<Content: View>: View {
    let kind: SpatialEntityKind
    var tint: Color = .secondary
    var state: InteractionState = .rest
    var alignment: Alignment = .leading
    @ViewBuilder var content: Content

    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: SpatialTokens.cornerRadius(kind), style: .continuous)
        let padded = content
            .frame(width: SpatialTokens.width(kind), alignment: alignment)
            .padding(.horizontal, SpatialTokens.paddingH(kind))
            .padding(.vertical, SpatialTokens.paddingV(kind))
            .background { shape.fill(tint.opacity(SpatialTokens.tintWash(kind))) }

        Group {
            if reduceTransparency {
                padded.background { shape.fill(.regularMaterial) }   // opaque, high-legibility fallback
            } else {
                padded.glassBackgroundEffect(in: shape)              // elegant system glass
            }
        }
        .overlay {
            shape.strokeBorder(
                tint.opacity(SpatialTokens.borderTintOpacity(state)),
                lineWidth: SpatialTokens.borderWidth(state)
            )
        }
    }
}
