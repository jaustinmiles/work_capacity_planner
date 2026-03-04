import SwiftUI

/// Shows the currently active work session with a live timer.
///
/// The timer is computed from the server's `startTime`, not a local counter.
/// This ensures accuracy even after app backgrounding or relaunch.
struct ActiveTimerCard: View {
    let session: WorkSession
    let taskType: UserTaskType?
    let timerTick: Int  // Forces refresh every second
    let isPausing: Bool
    let isCompleting: Bool
    let onPause: () -> Void
    let onComplete: () -> Void

    var body: some View {
        VStack(spacing: 16) {
            // Header
            HStack {
                Image(systemName: "timer")
                    .foregroundStyle(.blue)
                Text("Working")
                    .font(.subheadline)
                    .fontWeight(.semibold)
                    .foregroundStyle(.blue)
                Spacer()
                if let taskType {
                    TypeBadge(taskType: taskType)
                }
            }

            // Task name
            VStack(spacing: 4) {
                Text(taskName)
                    .font(.title3)
                    .fontWeight(.bold)
                    .multilineTextAlignment(.center)

                if let stepName = session.stepId != nil ? (session.Task?.name ?? "") : nil,
                   !stepName.isEmpty {
                    Text(stepName)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }

            // Timer display
            let elapsed = session.elapsedSeconds
            let planned = Double(session.plannedMinutes) * 60
            let isOvertime = planned > 0 && elapsed > planned

            Text(formatTimer(seconds: elapsed))
                .font(.system(size: 48, weight: .light, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(isOvertime ? .red : .primary)
                // Read timerTick to force refresh
                .id(timerTick)

            // Progress info
            if session.plannedMinutes > 0 {
                HStack {
                    if isOvertime {
                        let overtime = Int((elapsed - planned) / 60)
                        Text("\(overtime)m overtime")
                            .font(.caption)
                            .foregroundStyle(.red)
                    } else {
                        let remaining = Int((planned - elapsed) / 60)
                        Text("\(remaining)m remaining")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }

                    Spacer()

                    Text("\(DurationLabel.format(minutes: session.plannedMinutes)) planned")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                // Progress bar
                GeometryReader { geo in
                    ZStack(alignment: .leading) {
                        RoundedRectangle(cornerRadius: 4)
                            .fill(.gray.opacity(0.2))
                        RoundedRectangle(cornerRadius: 4)
                            .fill(isOvertime ? .red : .blue)
                            .frame(width: geo.size.width * min(1.0, elapsed / max(planned, 1)))
                    }
                }
                .frame(height: 6)
            }

            // Action buttons
            HStack(spacing: 12) {
                Button {
                    onPause()
                } label: {
                    Label(isPausing ? "Pausing..." : "Pause", systemImage: "pause.fill")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                .tint(.orange)
                .disabled(isPausing || isCompleting)

                Button {
                    onComplete()
                } label: {
                    Label(isCompleting ? "Completing..." : "Complete", systemImage: "checkmark")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .tint(.green)
                .disabled(isPausing || isCompleting)
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

    private var taskName: String {
        session.Task?.name ?? "Working..."
    }

    private func formatTimer(seconds: TimeInterval) -> String {
        let totalSeconds = Int(seconds)
        let hours = totalSeconds / 3600
        let minutes = (totalSeconds % 3600) / 60
        let secs = totalSeconds % 60

        if hours > 0 {
            return String(format: "%d:%02d:%02d", hours, minutes, secs)
        }
        return String(format: "%d:%02d", minutes, secs)
    }
}
