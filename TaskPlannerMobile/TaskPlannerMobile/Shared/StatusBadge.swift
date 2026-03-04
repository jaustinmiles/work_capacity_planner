import SwiftUI

/// A small colored pill showing task or step status
struct StatusBadge: View {
    let status: String
    var compact: Bool = false

    var body: some View {
        Text(compact ? statusIcon : statusLabel)
            .font(.caption2)
            .fontWeight(.medium)
            .padding(.horizontal, compact ? 6 : 8)
            .padding(.vertical, 2)
            .background(statusColor.opacity(0.15))
            .foregroundStyle(statusColor)
            .clipShape(Capsule())
    }

    private var statusLabel: String {
        switch status {
        case "not_started": "Not Started"
        case "in_progress": "In Progress"
        case "waiting": "Waiting"
        case "completed": "Done"
        case "pending": "Pending"
        case "skipped": "Skipped"
        default: status.capitalized
        }
    }

    private var statusIcon: String {
        switch status {
        case "not_started": "○"
        case "in_progress", "pending": "◐"
        case "waiting": "◷"
        case "completed": "●"
        case "skipped": "⊘"
        default: "○"
        }
    }

    private var statusColor: Color {
        switch status {
        case "not_started": .secondary
        case "in_progress": .blue
        case "waiting": .orange
        case "completed": .green
        case "pending": .secondary
        case "skipped": .gray
        default: .secondary
        }
    }
}

// MARK: - Convenience initializers

extension StatusBadge {
    init(taskStatus: TaskStatus, compact: Bool = false) {
        self.init(status: taskStatus.rawValue, compact: compact)
    }

    init(stepStatus: StepStatus, compact: Bool = false) {
        self.init(status: stepStatus.rawValue, compact: compact)
    }
}
