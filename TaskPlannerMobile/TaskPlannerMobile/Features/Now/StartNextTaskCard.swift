import SwiftUI

/// Shows the next scheduled task and a prominent "Start" button.
///
/// Mirrors the desktop's StartNextTaskWidget but optimized for mobile —
/// the entire card is a tappable action.
struct StartNextTaskCard: View {
    let nextItem: NextScheduledItem?
    let taskType: UserTaskType?
    let isStarting: Bool
    let onStart: () -> Void
    let onSkip: () -> Void

    var body: some View {
        VStack(spacing: 16) {
            // Header
            HStack {
                Image(systemName: "forward.fill")
                    .foregroundStyle(.blue)
                Text("Start Next Task")
                    .font(.subheadline)
                    .fontWeight(.semibold)
                    .foregroundStyle(.blue)
                Spacer()
                Button {
                    onSkip()
                } label: {
                    Image(systemName: "forward.end.fill")
                        .font(.caption)
                }
                .buttonStyle(.bordered)
                .controlSize(.small)
                .disabled(nextItem == nil || isStarting)
            }

            if let item = nextItem {
                // Task info
                VStack(spacing: 8) {
                    Text(item.title)
                        .font(.title3)
                        .fontWeight(.bold)
                        .multilineTextAlignment(.center)

                    if let workflowName = item.workflowName {
                        Text(workflowName)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }

                    // Metadata row
                    HStack(spacing: 12) {
                        // Duration
                        Label {
                            if item.loggedMinutes > 0 {
                                let remaining = max(0, item.estimatedDuration - item.loggedMinutes)
                                Text(DurationLabel.format(minutes: remaining) + " left")
                            } else {
                                Text(DurationLabel.format(minutes: item.estimatedDuration))
                            }
                        } icon: {
                            Image(systemName: "clock")
                        }
                        .font(.caption)
                        .foregroundStyle(.secondary)

                        // Type indicator
                        Label {
                            Text(item.type == .step ? "Workflow Step" : "Task")
                        } icon: {
                            Image(systemName: item.type == .step ? "arrow.triangle.branch" : "checkmark.square")
                        }
                        .font(.caption)
                        .foregroundStyle(.secondary)

                        if let taskType {
                            TypeBadge(taskType: taskType)
                        }
                    }

                    // Logged time indicator
                    if item.loggedMinutes > 0 {
                        HStack(spacing: 4) {
                            Image(systemName: "clock.badge.checkmark")
                                .font(.caption2)
                            Text("\(DurationLabel.format(minutes: item.loggedMinutes)) already logged")
                                .font(.caption2)
                        }
                        .foregroundStyle(.green)
                    }
                }

                // Start button
                Button {
                    onStart()
                } label: {
                    if isStarting {
                        ProgressView()
                            .frame(maxWidth: .infinity)
                    } else {
                        Label("Start Working", systemImage: "play.fill")
                            .frame(maxWidth: .infinity)
                    }
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
                .disabled(isStarting)
            } else {
                // No tasks available
                VStack(spacing: 8) {
                    Image(systemName: "checkmark.seal.fill")
                        .font(.largeTitle)
                        .foregroundStyle(.green)
                    Text("All caught up!")
                        .font(.headline)
                    Text("No tasks scheduled right now")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                .padding(.vertical, 8)
            }
        }
        .padding()
        .background(.blue.opacity(0.05))
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .overlay(
            RoundedRectangle(cornerRadius: 16)
                .stroke(.blue.opacity(0.2), lineWidth: 1)
        )
    }
}
