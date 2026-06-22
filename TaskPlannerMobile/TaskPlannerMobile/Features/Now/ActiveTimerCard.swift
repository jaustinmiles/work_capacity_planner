import SwiftUI

/// The currently-active work session with a live, numeric-roll timer.
///
/// The elapsed time is computed from the server's `startTime` (accurate across backgrounding /
/// relaunch); `timerTick` changes each second to re-render. Type-tinted via the design system.
struct ActiveTimerCard: View {
    let session: WorkSession
    let taskType: UserTaskType?
    let timerTick: Int   // changes each second → re-renders this card
    let isPausing: Bool
    let isCompleting: Bool
    let onPause: () -> Void
    let onComplete: () -> Void

    private var accent: Color { taskType?.swiftUIColor ?? .accentColor }

    var body: some View {
        let elapsed = session.elapsedSeconds
        let planned = Double(session.plannedMinutes) * 60
        let isOvertime = planned > 0 && elapsed > planned

        VStack(spacing: DS.Space.lg) {
            header

            Text(session.Task?.name ?? "Working…")
                .font(.title3.weight(.bold))
                .multilineTextAlignment(.center)

            // Odometer timer — digits roll as the second changes (no .id() teardown).
            Text(formatTimer(seconds: elapsed))
                .font(.system(size: 52, weight: .light, design: .rounded))
                .monospacedDigit()
                .contentTransition(.numericText())
                .foregroundStyle(isOvertime ? .red : .primary)
                .animation(.snappy, value: Int(elapsed))
                .accessibilityLabel("Elapsed \(Int(elapsed) / 60) minutes")

            if session.plannedMinutes > 0 {
                progress(elapsed: elapsed, planned: planned, isOvertime: isOvertime)
            }

            actions
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
            Label {
                Text("Working")
            } icon: {
                Image(systemName: "record.circle")
                    .symbolEffect(.pulse, options: .repeating)
            }
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(accent)

            Spacer()

            if let taskType { TypeBadge(taskType: taskType) }
        }
    }

    @ViewBuilder
    private func progress(elapsed: TimeInterval, planned: Double, isOvertime: Bool) -> some View {
        HStack {
            if isOvertime {
                Text("\(Int((elapsed - planned) / 60))m overtime").foregroundStyle(.red)
            } else {
                Text("\(Int((planned - elapsed) / 60))m remaining").foregroundStyle(.secondary)
            }
            Spacer()
            Text("\(DurationLabel.format(minutes: session.plannedMinutes)) planned")
                .foregroundStyle(.secondary)
        }
        .font(.caption)

        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule().fill(.gray.opacity(0.2))
                Capsule()
                    .fill(isOvertime ? Color.red : accent)
                    .frame(width: geo.size.width * min(1.0, elapsed / max(planned, 1)))
            }
        }
        .frame(height: 6)
        .animation(.smooth, value: Int(elapsed))
    }

    private var actions: some View {
        HStack(spacing: DS.Space.md) {
            Button(action: onPause) {
                Label(isPausing ? "Pausing…" : "Pause", systemImage: "pause.fill")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.bordered)
            .tint(.orange)
            .disabled(isPausing || isCompleting)

            Button(action: onComplete) {
                Label(isCompleting ? "Completing…" : "Complete", systemImage: "checkmark")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .tint(.green)
            .disabled(isPausing || isCompleting)
        }
    }

    private func formatTimer(seconds: TimeInterval) -> String {
        let total = Int(seconds)
        let h = total / 3600, m = (total % 3600) / 60, s = total % 60
        return h > 0 ? String(format: "%d:%02d:%02d", h, m, s) : String(format: "%d:%02d", m, s)
    }
}
