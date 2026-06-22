import SwiftUI

/// The persistent running-task pill in the tab bar's bottom accessory (iOS 26) — THE "what am I doing
/// right now" surface. Reads the shared `WorkTrackingModel` so it stays in sync with the Now tab:
/// stopping here updates Now, and vice-versa. Adapts to the accessory placement (`.inline` collapsed /
/// `.expanded`). The accessory already provides the Liquid Glass background — content only here.
struct CurrentTaskPill: View {
    @Environment(AppState.self) private var appState
    @Environment(\.tabViewBottomAccessoryPlacement) private var placement

    private var tracking: WorkTrackingModel { appState.workTracking }

    var body: some View {
        Group {
            if let session = tracking.activeSession {
                running(session)
            } else {
                idle
            }
        }
        .task { await tracking.refresh() }
    }

    @ViewBuilder
    private func running(_ session: WorkSession) -> some View {
        let type = appState.taskType(for: session.Task?.type ?? "")
        let tint = type?.swiftUIColor ?? .accentColor
        HStack(spacing: DS.Space.sm) {
            Image(systemName: "record.circle")
                .foregroundStyle(tint)
                .symbolEffect(.pulse, options: .repeating)

            VStack(alignment: .leading, spacing: 0) {
                Text(session.Task?.name ?? "Working")
                    .font(.subheadline.weight(.semibold))
                    .lineLimit(1)
                if placement == .expanded {
                    Text("Tap Stop when you're done")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }

            Spacer(minLength: DS.Space.sm)

            Text(elapsed(session))
                .font(.subheadline.monospacedDigit())
                .contentTransition(.numericText())
                .foregroundStyle(.secondary)

            Button {
                Task { await tracking.stop() }
            } label: {
                Image(systemName: "stop.fill")
                    .font(.body)
            }
            .buttonStyle(.borderless)
            .tint(tint)
            .disabled(tracking.isStopping)
            .accessibilityLabel("Stop work session")
        }
        .padding(.horizontal, DS.Space.md)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var idle: some View {
        HStack(spacing: DS.Space.sm) {
            Image(systemName: "play.circle")
                .foregroundStyle(.secondary)
            Text("Nothing running")
                .font(.subheadline)
                .foregroundStyle(.secondary)
            Spacer()
        }
        .padding(.horizontal, DS.Space.md)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    /// Live elapsed time. Reading `tracking.timerTick` registers the per-second dependency so this
    /// re-renders every tick (no polling) — the same tick that drives the Now tab's timer card.
    private func elapsed(_ session: WorkSession) -> String {
        _ = tracking.timerTick
        let total = Int(session.elapsedSeconds)
        let h = total / 3600, m = (total % 3600) / 60, s = total % 60
        return h > 0
            ? String(format: "%d:%02d:%02d", h, m, s)
            : String(format: "%d:%02d", m, s)
    }
}
