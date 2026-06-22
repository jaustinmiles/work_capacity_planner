import SwiftUI

/// The "Today" tab — what you've logged so far today (a mobile form of the desktop clock/log view),
/// with inline editing of logged segments.
struct TodayView: View {
    @Environment(AppState.self) private var appState
    @State private var viewModel = TodayViewModel()
    @State private var editingSession: WorkSession?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: DS.Space.lg) {
                    summary

                    SessionTimelineView(sessions: viewModel.sessions, taskTypes: appState.userTaskTypes)

                    logSection

                    if let error = viewModel.errorMessage {
                        Label(error, systemImage: "exclamationmark.triangle.fill")
                            .font(.caption)
                            .foregroundStyle(.orange)
                    }
                }
                .padding(DS.Space.lg)
            }
            .navigationTitle("Today")
            .scrollEdgeEffectStyle(.soft, for: .top)
            .refreshable { await viewModel.load() }
            .task {
                viewModel.configure(with: appState)
                await viewModel.load()
            }
            .sheet(item: $editingSession) { session in
                EditSessionSheet(
                    session: session,
                    taskTypes: appState.userTaskTypes,
                    onSave: { start, end in
                        Task { await viewModel.updateSession(session, start: start, end: end); editingSession = nil }
                    },
                    onDelete: {
                        Task { await viewModel.deleteSession(session); editingSession = nil }
                    }
                )
            }
        }
    }

    // MARK: - Summary

    private var summary: some View {
        HStack(alignment: .firstTextBaseline) {
            VStack(alignment: .leading, spacing: DS.Space.xs) {
                Text("Logged today")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                Text(DurationLabel.format(minutes: viewModel.totalLoggedMinutes))
                    .font(.largeTitle.weight(.bold))
                    .monospacedDigit()
                    .contentTransition(.numericText())
                    .animation(.snappy, value: viewModel.totalLoggedMinutes)
            }
            Spacer()
            typeBreakdown
        }
    }

    @ViewBuilder
    private var typeBreakdown: some View {
        if let byType = viewModel.accumulated?.byType, !byType.isEmpty {
            VStack(alignment: .trailing, spacing: DS.Space.xs) {
                ForEach(byType.sorted { $0.value > $1.value }.prefix(3), id: \.key) { typeId, minutes in
                    HStack(spacing: DS.Space.xs) {
                        if let type = appState.taskType(for: typeId) {
                            Text(type.emoji).font(.caption2)
                        }
                        Text(DurationLabel.format(minutes: minutes))
                            .font(.caption.monospacedDigit())
                            .foregroundStyle(.secondary)
                    }
                }
            }
        }
    }

    // MARK: - Editable log

    @ViewBuilder
    private var logSection: some View {
        let logged = viewModel.completedSessions
        VStack(alignment: .leading, spacing: DS.Space.sm) {
            Text("Sessions")
                .font(.headline)

            if logged.isEmpty {
                ContentUnavailableView {
                    Label("Nothing logged yet", systemImage: "clock")
                } description: {
                    Text("Start a task from the Now tab to begin tracking.")
                }
                .frame(maxWidth: .infinity)
            } else {
                ForEach(logged) { session in
                    Button { editingSession = session } label: { sessionRow(session) }
                        .buttonStyle(.plain)
                }
            }
        }
    }

    private func sessionRow(_ session: WorkSession) -> some View {
        let type = appState.taskType(for: session.Task?.type ?? "")
        return HStack(spacing: DS.Space.md) {
            RoundedRectangle(cornerRadius: 2)
                .fill(type?.swiftUIColor ?? .gray)
                .frame(width: 4, height: 38)

            VStack(alignment: .leading, spacing: 2) {
                Text(session.Task?.name ?? "Untitled")
                    .font(.subheadline.weight(.medium))
                    .lineLimit(1)
                Text(timeRange(session))
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Spacer()

            Text(DurationLabel.format(minutes: session.actualMinutes ?? session.elapsedMinutes))
                .font(.subheadline.monospacedDigit())
                .foregroundStyle(.secondary)
            Image(systemName: "chevron.right")
                .font(.caption2)
                .foregroundStyle(.tertiary)
        }
        .padding(DS.Space.md)
        .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: DS.Radius.control))
    }

    private func timeRange(_ session: WorkSession) -> String {
        let f = Date.FormatStyle.dateTime.hour().minute()
        let start = session.startTime.formatted(f)
        guard let end = session.endTime else { return "\(start) – now" }
        return "\(start) – \(end.formatted(f))"
    }
}
