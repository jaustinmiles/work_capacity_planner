import SwiftUI

/// A collapsed workflow shown as a single card; tap expands its step graph. Renders through the
/// shared `SpatialCard` glass surface (center-aligned content), tinted with the selection accent.
struct WorkflowVolumeCardView: View {
    let title: String
    let stepCount: Int
    let isExpanded: Bool

    var body: some View {
        SpatialCard(kind: .workflowVolume, tint: SpatialColor.selection, alignment: .center) {
            VStack(spacing: 6) {
                Image(systemName: "square.stack.3d.up.fill").font(.title2)
                Text(title).font(.headline).lineLimit(2)
                Text("\(stepCount) steps · \(isExpanded ? "tap to collapse" : "tap to expand")")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        }
    }
}
