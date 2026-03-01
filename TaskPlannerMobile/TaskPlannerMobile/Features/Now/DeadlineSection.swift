import SwiftUI

/// Shows upcoming deadlines in the next 7 days
struct DeadlineSection: View {
    let tasks: [TaskItem]
    let taskTypes: [UserTaskType]

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Upcoming Deadlines")
                .font(.subheadline)
                .fontWeight(.semibold)

            ForEach(tasks.prefix(5)) { task in
                HStack(spacing: 10) {
                    // Deadline urgency indicator
                    Circle()
                        .fill(deadlineColor(for: task.deadline))
                        .frame(width: 8, height: 8)

                    VStack(alignment: .leading, spacing: 2) {
                        Text(task.name)
                            .font(.subheadline)
                            .lineLimit(1)
                        if let deadline = task.deadline {
                            Text(formatDeadline(deadline))
                                .font(.caption2)
                                .foregroundStyle(deadlineColor(for: task.deadline))
                        }
                    }

                    Spacer()

                    if let deadlineType = task.deadlineType {
                        Text(deadlineType == .hard ? "Hard" : "Soft")
                            .font(.caption2)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(deadlineType == .hard ? .red.opacity(0.1) : .orange.opacity(0.1))
                            .foregroundStyle(deadlineType == .hard ? .red : .orange)
                            .clipShape(Capsule())
                    }

                    if let tt = taskTypes.first(where: { $0.id == task.type }) {
                        Text(tt.emoji)
                    }
                }
            }
        }
        .padding()
        .background(.ultraThinMaterial)
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    private func deadlineColor(for deadline: Date?) -> Color {
        guard let deadline else { return .gray }
        let hours = deadline.timeIntervalSinceNow / 3600
        if hours < 0 { return .red }       // Overdue
        if hours < 24 { return .red }      // Due within 24h
        if hours < 72 { return .orange }   // Due within 3 days
        return .yellow                      // Due within 7 days
    }

    private func formatDeadline(_ date: Date) -> String {
        let hours = date.timeIntervalSinceNow / 3600
        if hours < 0 {
            return "Overdue by \(DurationLabel.format(minutes: Int(-hours * 60)))"
        }
        if hours < 24 {
            return "Due in \(Int(hours))h"
        }
        let days = Int(hours / 24)
        return "Due in \(days) day\(days == 1 ? "" : "s")"
    }
}
