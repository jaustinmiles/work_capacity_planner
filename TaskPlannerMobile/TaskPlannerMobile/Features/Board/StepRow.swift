import SwiftUI

/// A single step within a workflow cluster card
struct StepRow: View {
    let step: TaskStep
    let taskType: UserTaskType?
    let onTap: () -> Void

    var body: some View {
        Button {
            onTap()
        } label: {
            HStack(spacing: 10) {
                // Status icon
                Image(systemName: statusIcon)
                    .font(.system(size: 14))
                    .foregroundStyle(statusColor)
                    .frame(width: 20)

                // Step info
                VStack(alignment: .leading, spacing: 2) {
                    Text(step.name)
                        .font(.subheadline)
                        .foregroundStyle(step.status == .completed ? .secondary : .primary)
                        .strikethrough(step.status == .completed)
                        .lineLimit(1)

                    HStack(spacing: 8) {
                        DurationLabel(minutes: step.duration)

                        if step.asyncWaitTime > 0 {
                            Label(DurationLabel.format(minutes: step.asyncWaitTime), systemImage: "clock.arrow.circlepath")
                                .font(.caption2)
                                .foregroundStyle(.orange)
                        }

                        if let taskType {
                            Text(taskType.emoji)
                                .font(.caption2)
                        }
                    }
                }

                Spacer()

                // Status badge
                StatusBadge(stepStatus: step.status, compact: true)
            }
            .padding(.vertical, 8)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private var statusIcon: String {
        switch step.status {
        case .completed: "checkmark.circle.fill"
        case .inProgress: "play.circle.fill"
        case .waiting: "clock.fill"
        case .skipped: "forward.fill"
        case .pending: "circle"
        }
    }

    private var statusColor: Color {
        switch step.status {
        case .completed: .green
        case .inProgress: .blue
        case .waiting: .orange
        case .skipped: .gray
        case .pending: .gray.opacity(0.5)
        }
    }
}

// MARK: - Step Action Sheet

/// Action sheet shown when tapping a step — start timer or complete
struct StepActionSheet: View {
    let taskId: String
    let step: TaskStep
    let taskType: UserTaskType?
    let onStartTimer: () -> Void
    let onComplete: () -> Void

    var body: some View {
        VStack(spacing: 20) {
            // Header
            VStack(spacing: 8) {
                Text(step.name)
                    .font(.title3)
                    .fontWeight(.bold)

                HStack(spacing: 12) {
                    StatusBadge(stepStatus: step.status)
                    DurationLabel(minutes: step.duration, style: .subheadline)
                    if let taskType {
                        TypeBadge(taskType: taskType, showName: true)
                    }
                }
            }

            // Notes
            if let notes = step.notes, !notes.isEmpty {
                Text(notes)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding()
                    .background(.gray.opacity(0.1))
                    .clipShape(RoundedRectangle(cornerRadius: 8))
            }

            // Actions
            VStack(spacing: 12) {
                if step.status != .completed {
                    Button {
                        onStartTimer()
                    } label: {
                        Label("Start Timer", systemImage: "play.fill")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .controlSize(.large)

                    Button {
                        onComplete()
                    } label: {
                        Label("Mark Complete", systemImage: "checkmark")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.bordered)
                    .tint(.green)
                    .controlSize(.large)
                } else {
                    Label("Step Completed", systemImage: "checkmark.circle.fill")
                        .foregroundStyle(.green)
                        .font(.headline)
                }
            }

            Spacer()
        }
        .padding()
    }
}
