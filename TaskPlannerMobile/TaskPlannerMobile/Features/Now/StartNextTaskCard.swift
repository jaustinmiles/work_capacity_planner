import SwiftUI

/// The next scheduled task + a prominent Start action — the primary "what should I do now?" surface.
struct StartNextTaskCard: View {
    let nextItem: NextScheduledItem?
    let taskType: UserTaskType?
    let isStarting: Bool
    let onStart: () -> Void
    let onSkip: () -> Void

    private var accent: Color { taskType?.swiftUIColor ?? .accentColor }

    var body: some View {
        VStack(spacing: DS.Space.lg) {
            header
            if let item = nextItem {
                taskInfo(item)
                startButton
            } else {
                allCaughtUp
            }
        }
        .padding(DS.Space.lg)
        .background(accent.opacity(0.08), in: RoundedRectangle(cornerRadius: DS.Radius.card))
        .overlay(
            RoundedRectangle(cornerRadius: DS.Radius.card)
                .stroke(accent.opacity(0.22), lineWidth: 1)
        )
    }

    private var header: some View {
        HStack {
            Label("Up next", systemImage: "forward.fill")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(accent)
            Spacer()
            Button(action: onSkip) {
                Image(systemName: "forward.end.fill").font(.caption)
            }
            .buttonStyle(.bordered)
            .controlSize(.small)
            .tint(accent)
            .disabled(nextItem == nil || isStarting)
            .accessibilityLabel("Skip to the task after this")
        }
    }

    @ViewBuilder
    private func taskInfo(_ item: NextScheduledItem) -> some View {
        VStack(spacing: DS.Space.sm) {
            Text(item.title)
                .font(.title3.weight(.bold))
                .multilineTextAlignment(.center)

            if let workflowName = item.workflowName {
                Text(workflowName).font(.caption).foregroundStyle(.secondary)
            }

            HStack(spacing: DS.Space.md) {
                Label(durationText(item), systemImage: "clock")
                Label(item.type == .step ? "Workflow step" : "Task",
                      systemImage: item.type == .step ? "arrow.triangle.branch" : "checkmark.square")
                if let taskType { TypeBadge(taskType: taskType) }
            }
            .font(.caption)
            .foregroundStyle(.secondary)

            if item.loggedMinutes > 0 {
                Label("\(DurationLabel.format(minutes: item.loggedMinutes)) already logged",
                      systemImage: "clock.badge.checkmark")
                    .font(.caption2)
                    .foregroundStyle(.green)
            }
        }
    }

    private var startButton: some View {
        Button(action: onStart) {
            Group {
                if isStarting {
                    ProgressView()
                } else {
                    Label("Start working", systemImage: "play.fill")
                }
            }
            .frame(maxWidth: .infinity)
        }
        .buttonStyle(.borderedProminent)
        .controlSize(.large)
        .tint(accent)
        .disabled(isStarting)
    }

    private var allCaughtUp: some View {
        VStack(spacing: DS.Space.sm) {
            Image(systemName: "checkmark.seal.fill")
                .font(.largeTitle)
                .foregroundStyle(.green)
                .symbolEffect(.bounce, value: nextItem == nil)
            Text("All caught up!").font(.headline)
            Text("No tasks scheduled right now").font(.caption).foregroundStyle(.secondary)
        }
        .padding(.vertical, DS.Space.sm)
        .frame(maxWidth: .infinity)
    }

    private func durationText(_ item: NextScheduledItem) -> String {
        if item.loggedMinutes > 0 {
            let remaining = max(0, item.estimatedDuration - item.loggedMinutes)
            return DurationLabel.format(minutes: remaining) + " left"
        }
        return DurationLabel.format(minutes: item.estimatedDuration)
    }
}
