import SwiftUI

/// Dismissable tray ornament listing COMPLETED tasks/workflows for retrospective review — the
/// counterpart to the Backlog tray. Mirrors the desktop/web sprint view's "completed" section.
/// Tap a row to review it (read-only); DRAG a row into the volume to reactivate it (the scene's
/// `.dropDestination` calls `reactivate`, putting it back in progress).
struct DoneTrayView: View {
    let viewModel: SpatialSceneViewModel
    @State private var reviewing: TaskItem?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Done")
                .font(.headline)

            if viewModel.doneItems.isEmpty {
                Text("Nothing completed yet. Finished tasks and workflows collect here.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            } else {
                ScrollView {
                    VStack(alignment: .leading, spacing: 6) {
                        ForEach(viewModel.doneItems) { task in
                            Button {
                                reviewing = task
                            } label: {
                                HStack(spacing: 8) {
                                    Image(systemName: "checkmark.circle.fill")
                                        .foregroundStyle(.green)
                                    Text(viewModel.type(id: task.type)?.emoji ?? "📌")
                                    Text(task.name).lineLimit(1).strikethrough(color: .secondary)
                                    Spacer()
                                    if task.hasSteps {
                                        Image(systemName: "square.stack.3d.up.fill")
                                            .foregroundStyle(.secondary)
                                    }
                                }
                                .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                            .hoverEffect()
                            // Drag a finished item back into the scene to reactivate it.
                            .draggable(task.id)
                        }
                    }
                }
                .frame(maxHeight: 260)

                Text("Tap to review · drag into the scene to reactivate.")
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(20)
        .frame(width: 300)
        .glassBackgroundEffect()
        .sheet(item: $reviewing) { task in
            DoneItemReviewView(task: task, type: viewModel.type(id: task.type)) {
                Task { await viewModel.reactivate(taskIds: [task.id]) }
                reviewing = nil
            }
        }
    }
}

/// Read-only retrospective detail for a completed task/workflow: identity, when it finished, and —
/// for workflows — its per-step status roll-up (which is what the spatial step nodes now show too).
struct DoneItemReviewView: View {
    let task: TaskItem
    let type: UserTaskType?
    /// Reactivate this item (the in-sheet counterpart to dragging the row into the volume).
    let onReactivate: () -> Void
    @Environment(\.dismiss) private var dismiss

    private var steps: [TaskStep] {
        (task.steps ?? []).sorted { $0.stepIndex < $1.stepIndex }
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    LabeledContent("Type", value: "\(type?.emoji ?? "📌") \(type?.name ?? "—")")
                    LabeledContent("Duration", value: "\(task.duration)m")
                    if let finished = task.completedAt {
                        LabeledContent("Completed", value: finished.formatted(date: .abbreviated, time: .shortened))
                    }
                }

                if !steps.isEmpty {
                    Section("Steps (\(completedCount)/\(steps.count) done)") {
                        ForEach(steps) { step in
                            HStack(spacing: 8) {
                                Image(systemName: symbol(for: step.status))
                                    .foregroundStyle(SpatialColor.stepStatus(step.status) ?? .secondary)
                                Text(step.name)
                                    .strikethrough(step.status == .completed || step.status == .skipped,
                                                   color: .secondary)
                                Spacer()
                                Text("\(step.duration)m").foregroundStyle(.secondary).font(.caption)
                            }
                        }
                    }
                }
            }
            .navigationTitle(task.name)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Close") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Put Back in Progress", systemImage: "arrow.uturn.backward", action: onReactivate)
                }
            }
        }
        .frame(minWidth: 380, minHeight: 360)
    }

    private var completedCount: Int { steps.filter { $0.status == .completed }.count }

    private func symbol(for status: StepStatus) -> String {
        switch status {
        case .completed: return "checkmark.circle.fill"
        case .inProgress: return "play.circle.fill"
        case .waiting: return "hourglass.circle.fill"
        case .skipped: return "minus.circle.fill"
        case .pending: return "circle"
        }
    }
}
