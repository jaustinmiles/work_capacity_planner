import SwiftUI

/// Displays a task type with its emoji and color
struct TypeBadge: View {
    let taskType: UserTaskType?
    var showName: Bool = false

    var body: some View {
        if let taskType {
            HStack(spacing: 4) {
                Text(taskType.emoji)
                    .font(.caption)
                if showName {
                    Text(taskType.name)
                        .font(.caption2)
                        .foregroundStyle(taskType.swiftUIColor)
                }
            }
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(taskType.swiftUIColor.opacity(0.1))
            .clipShape(Capsule())
        }
    }
}

/// Displays importance/urgency as a compact badge
struct PriorityBadge: View {
    let importance: Int
    let urgency: Int

    var body: some View {
        let score = importance * urgency
        HStack(spacing: 2) {
            Image(systemName: "flag.fill")
                .font(.system(size: 8))
            Text("\(score)")
                .font(.caption2)
                .fontWeight(.semibold)
        }
        .foregroundStyle(priorityColor)
        .padding(.horizontal, 6)
        .padding(.vertical, 2)
        .background(priorityColor.opacity(0.1))
        .clipShape(Capsule())
    }

    private var priorityColor: Color {
        let score = importance * urgency
        if score >= 64 { return .red }       // High priority (8x8+)
        if score >= 36 { return .orange }    // Medium-high (6x6+)
        if score >= 16 { return .yellow }    // Medium (4x4+)
        return .green                         // Low priority
    }
}
