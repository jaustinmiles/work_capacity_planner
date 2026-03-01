import SwiftUI

/// The Board tab — displays Deep Work Board workflows as collapsible cards.
struct BoardView: View {
    @Environment(AppState.self) private var appState
    @State private var viewModel = BoardViewModel()
    @State private var selectedStep: (taskId: String, step: TaskStep)?

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                // Board picker (if multiple boards)
                if viewModel.boards.count > 1 {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            ForEach(viewModel.boards) { board in
                                Button {
                                    Task { await viewModel.selectBoard(board.id) }
                                } label: {
                                    Text(board.name)
                                        .font(.subheadline)
                                        .padding(.horizontal, 12)
                                        .padding(.vertical, 6)
                                        .background(
                                            board.id == viewModel.selectedBoardId
                                                ? .blue : .gray.opacity(0.15)
                                        )
                                        .foregroundStyle(
                                            board.id == viewModel.selectedBoardId
                                                ? .white : .primary
                                        )
                                        .clipShape(Capsule())
                                }
                            }
                        }
                        .padding(.horizontal)
                        .padding(.vertical, 8)
                    }
                    .background(.ultraThinMaterial)
                }

                // Content
                if viewModel.isLoading {
                    Spacer()
                    ProgressView()
                    Spacer()
                } else if viewModel.clusters.isEmpty && viewModel.orphanTasks.isEmpty {
                    Spacer()
                    ContentUnavailableView(
                        "No Board Items",
                        systemImage: "square.grid.3x3.topleft.filled",
                        description: Text("Add tasks and workflows to the Deep Work Board from the desktop app.")
                    )
                    Spacer()
                } else {
                    ScrollView {
                        LazyVStack(spacing: 12) {
                            // Workflow clusters
                            ForEach(viewModel.clusters) { cluster in
                                WorkflowClusterCard(
                                    cluster: cluster,
                                    taskTypes: appState.userTaskTypes,
                                    onStepTap: { step in
                                        selectedStep = (cluster.workflowTask.id, step)
                                    }
                                )
                            }

                            // Orphan tasks
                            if !viewModel.orphanTasks.isEmpty {
                                VStack(alignment: .leading, spacing: 8) {
                                    Text("Individual Tasks")
                                        .font(.subheadline)
                                        .fontWeight(.semibold)
                                        .foregroundStyle(.secondary)

                                    ForEach(viewModel.orphanTasks) { task in
                                        HStack {
                                            if let tt = appState.taskType(for: task.type) {
                                                Text(tt.emoji)
                                            }
                                            Text(task.name)
                                                .font(.subheadline)
                                            Spacer()
                                            StatusBadge(taskStatus: task.overallStatus, compact: true)
                                            DurationLabel(minutes: task.duration)
                                        }
                                        .padding(.vertical, 4)
                                    }
                                }
                                .padding()
                                .background(.ultraThinMaterial)
                                .clipShape(RoundedRectangle(cornerRadius: 12))
                            }
                        }
                        .padding()
                    }
                }

                if let error = viewModel.errorMessage {
                    Text(error)
                        .font(.caption)
                        .foregroundStyle(.red)
                        .padding()
                }
            }
            .navigationTitle("Board")
            .navigationBarTitleDisplayMode(.inline)
            .refreshable {
                await viewModel.loadBoards()
            }
            .task {
                viewModel.configure(with: appState)
                await viewModel.loadBoards()
            }
            .sheet(item: Binding(
                get: {
                    if let s = selectedStep {
                        return StepSheetItem(taskId: s.taskId, step: s.step)
                    }
                    return nil
                },
                set: { _ in selectedStep = nil }
            )) { item in
                StepActionSheet(
                    taskId: item.taskId,
                    step: item.step,
                    taskType: appState.taskType(for: item.step.type),
                    onStartTimer: {
                        Task {
                            await viewModel.startWorkOnStep(
                                taskId: item.taskId,
                                stepId: item.step.id,
                                duration: item.step.duration
                            )
                        }
                        selectedStep = nil
                    },
                    onComplete: {
                        Task {
                            await viewModel.completeStep(
                                taskId: item.taskId,
                                stepId: item.step.id
                            )
                        }
                        selectedStep = nil
                    }
                )
                .presentationDetents([.medium])
            }
        }
    }
}

// MARK: - Helper for sheet binding

private struct StepSheetItem: Identifiable {
    let taskId: String
    let step: TaskStep
    var id: String { step.id }
}
