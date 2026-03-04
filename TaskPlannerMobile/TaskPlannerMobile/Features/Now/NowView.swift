import SwiftUI

/// The "Now" tab — the primary screen showing what you should be doing right now.
///
/// Shows: active timer OR next task, today's progress, current work block, and deadlines.
struct NowView: View {
    @Environment(AppState.self) private var appState
    @State private var viewModel = NowViewModel()
    @State private var showSettings = false
    @State private var showQuickTask = false
    @State private var showStartSession = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    // Active Timer or Start Next Task
                    if let session = viewModel.activeSession {
                        ActiveTimerCard(
                            session: session,
                            taskType: appState.taskType(for: session.Task?.type ?? ""),
                            timerTick: viewModel.timerTick,
                            isPausing: viewModel.isPausing,
                            isCompleting: viewModel.isCompleting,
                            onPause: { Task { await viewModel.pauseActiveSession() } },
                            onComplete: { Task { await viewModel.completeActiveTask() } }
                        )
                    } else {
                        StartNextTaskCard(
                            nextItem: viewModel.nextScheduledItem,
                            taskType: viewModel.nextScheduledItem.flatMap { _ in
                                appState.taskType(for: "")
                            },
                            isStarting: viewModel.isStarting,
                            onStart: { Task { await viewModel.startNextTask() } },
                            onSkip: { Task { await viewModel.skipToNext() } }
                        )

                        // Manual task picker
                        Button {
                            showStartSession = true
                        } label: {
                            Label("Choose a Different Task", systemImage: "list.bullet")
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.bordered)
                        .controlSize(.regular)
                    }

                    // Today's Progress
                    TodayProgressCard(
                        accumulatedTime: viewModel.accumulatedTime,
                        totalPlannedMinutes: viewModel.totalPlannedMinutes,
                        currentBlock: viewModel.currentBlock,
                        nextBlock: viewModel.nextBlock,
                        taskTypes: appState.userTaskTypes
                    )

                    // Radar Chart — time logged by type
                    if let accumulated = viewModel.accumulatedTime {
                        let radarData = RadarChartView.prepareData(
                            accumulated: accumulated,
                            taskTypes: appState.userTaskTypes
                        )
                        if !radarData.isEmpty {
                            VStack(alignment: .leading, spacing: 8) {
                                Text("Time by Type")
                                    .font(.subheadline)
                                    .fontWeight(.semibold)
                                RadarChartView(data: radarData)
                                    .frame(maxWidth: .infinity)
                            }
                            .padding()
                            .background(.ultraThinMaterial)
                            .clipShape(RoundedRectangle(cornerRadius: 12))
                        }
                    }

                    // Session Timeline — visual history of today's work
                    SessionTimelineView(
                        sessions: viewModel.todaySessions,
                        taskTypes: appState.userTaskTypes
                    )

                    // Upcoming Deadlines
                    if !viewModel.deadlineTasks.isEmpty {
                        DeadlineSection(
                            tasks: viewModel.deadlineTasks,
                            taskTypes: appState.userTaskTypes
                        )
                    }

                    // Error display
                    if let error = viewModel.errorMessage {
                        HStack {
                            Image(systemName: "exclamationmark.triangle.fill")
                                .foregroundStyle(.orange)
                            Text(error)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        .padding()
                        .background(.orange.opacity(0.1))
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                    }
                }
                .padding()
            }
            .navigationTitle("Now")
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button {
                        showQuickTask = true
                    } label: {
                        Image(systemName: "plus")
                    }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        showSettings = true
                    } label: {
                        Image(systemName: "gearshape")
                    }
                }
            }
            .sheet(isPresented: $showQuickTask) {
                QuickTaskSheet()
                    .environment(appState)
            }
            .onChange(of: showQuickTask) { _, isShowing in
                if !isShowing {
                    Task { await viewModel.loadAll() }
                }
            }
            .sheet(isPresented: $showStartSession) {
                StartSessionSheet { task, step in
                    Task { await viewModel.startTask(task, step: step) }
                }
                .environment(appState)
            }
            .sheet(isPresented: $showSettings) {
                SettingsView()
            }
            .refreshable {
                await viewModel.loadAll()
            }
            .task {
                viewModel.configure(with: appState)
                await viewModel.loadAll()
            }
            .onDisappear {
                viewModel.stopTimer()
            }
        }
    }
}
