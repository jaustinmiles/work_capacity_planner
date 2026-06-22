import SwiftUI

/// Endeavor detail — progress, the endeavor's tasks, and the headline action: start its next
/// scheduled task. "Next" is computed SERVER-side (`getNextScheduled(endeavorId:)`, reusing the
/// scheduler) and started through the shared `WorkTrackingModel`, so it appears in the tab-bar pill.
struct EndeavorDetailView: View {
    @Environment(AppState.self) private var appState
    let endeavor: Endeavor

    @State private var starting = false
    @State private var startError: String?
    @State private var startedTitle: String?

    private var items: [EndeavorItemWithTask] {
        (endeavor.items ?? []).sorted { $0.sortOrder < $1.sortOrder }
    }
    private var completed: Int { items.filter { $0.task.completed }.count }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: DS.Space.lg) {
                if let desc = endeavor.description, !desc.isEmpty {
                    Text(desc).font(.subheadline).foregroundStyle(.secondary)
                }

                progressCard
                startNextButton

                if let started = startedTitle {
                    Label("Started “\(started)” — see the running-task pill below.",
                          systemImage: "checkmark.circle.fill")
                        .font(.caption)
                        .foregroundStyle(.green)
                }
                if let err = startError {
                    Label(err, systemImage: "exclamationmark.triangle.fill")
                        .font(.caption)
                        .foregroundStyle(.orange)
                }

                tasksSection
            }
            .padding(DS.Space.lg)
        }
        .navigationTitle(endeavor.name)
        .navigationBarTitleDisplayMode(.large)
    }

    private var progressCard: some View {
        let total = items.count
        let frac = total == 0 ? 0 : Double(completed) / Double(total)
        return VStack(alignment: .leading, spacing: DS.Space.sm) {
            HStack {
                Text("Progress").font(.headline)
                Spacer()
                Text("\(completed) of \(total) done")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            ProgressView(value: frac).tint(endeavor.swiftUIColor)
        }
        .padding(DS.Space.lg)
        .background(endeavor.swiftUIColor.opacity(0.08), in: RoundedRectangle(cornerRadius: DS.Radius.card))
    }

    private var startNextButton: some View {
        Button {
            Task { await startNext() }
        } label: {
            Label(starting ? "Finding next…" : "Work on next task", systemImage: "play.fill")
                .frame(maxWidth: .infinity)
        }
        .buttonStyle(.borderedProminent)
        .controlSize(.large)
        .tint(endeavor.swiftUIColor)
        .disabled(starting)
    }

    private var tasksSection: some View {
        VStack(alignment: .leading, spacing: DS.Space.sm) {
            Text("Tasks").font(.headline)
            if items.isEmpty {
                Text("No tasks linked to this endeavor yet.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            } else {
                ForEach(items) { item in taskRow(item.task) }
            }
        }
    }

    private func taskRow(_ task: TaskItem) -> some View {
        let type = appState.taskType(for: task.type)
        return HStack(spacing: DS.Space.md) {
            if let type { Text(type.emoji) }
            Text(task.name)
                .font(.subheadline.weight(.medium))
                .lineLimit(1)
                .strikethrough(task.completed)
                .foregroundStyle(task.completed ? .secondary : .primary)
            Spacer()
            StatusChip(style: .task(task.overallStatus, completed: task.completed))
        }
        .padding(DS.Space.md)
        .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: DS.Radius.control))
    }

    private func startNext() async {
        starting = true
        startError = nil
        startedTitle = nil
        defer { starting = false }
        do {
            guard let next = try await appState.taskService.getNextScheduled(endeavorId: endeavor.id) else {
                startError = "Nothing schedulable in this endeavor right now."
                return
            }
            let ok = await appState.workTracking.start(
                taskId: next.workflowId ?? next.id,
                stepId: next.type == .step ? next.id : nil,
                plannedMinutes: next.estimatedDuration
            )
            if ok { startedTitle = next.title } else { startError = appState.workTracking.errorMessage }
        } catch {
            startError = error.localizedDescription
        }
    }
}
