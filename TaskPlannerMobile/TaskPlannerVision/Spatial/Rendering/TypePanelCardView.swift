import SwiftUI

/// Header card for a task type — the anchor its task nodes cluster beneath. Renders through the
/// shared `SpatialCard` glass surface, tinted by the type's color.
struct TypePanelCardView: View {
    let type: UserTaskType
    let taskCount: Int

    var body: some View {
        SpatialCard(kind: .typePanel, tint: type.swiftUIColor) {
            HStack(spacing: 10) {
                Text(type.emoji).font(.title)
                VStack(alignment: .leading, spacing: 1) {
                    Text(type.name).font(.title3.bold())
                    Text("\(taskCount) in sprint")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer(minLength: 0)
            }
        }
    }
}
