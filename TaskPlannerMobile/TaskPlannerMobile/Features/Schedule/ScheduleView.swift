import SwiftUI

/// The Schedule tab — shows today's work blocks, meetings, and logged sessions.
struct ScheduleView: View {
    @Environment(AppState.self) private var appState
    @State private var viewModel = ScheduleViewModel()

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                // Date navigation bar
                HStack {
                    Button {
                        Task { await viewModel.goToPreviousDay() }
                    } label: {
                        Image(systemName: "chevron.left")
                    }

                    Spacer()

                    VStack(spacing: 2) {
                        Text(viewModel.displayDate)
                            .font(.headline)
                        if !viewModel.isToday {
                            Button("Go to Today") {
                                Task { await viewModel.goToToday() }
                            }
                            .font(.caption)
                        }
                    }

                    Spacer()

                    Button {
                        Task { await viewModel.goToNextDay() }
                    } label: {
                        Image(systemName: "chevron.right")
                    }
                }
                .padding()
                .background(.ultraThinMaterial)

                // Content
                if viewModel.isLoading {
                    Spacer()
                    ProgressView()
                    Spacer()
                } else if viewModel.pattern == nil {
                    Spacer()
                    ContentUnavailableView(
                        "No Schedule",
                        systemImage: "calendar.badge.exclamationmark",
                        description: Text("No work pattern set for this date. Configure your schedule from the desktop app.")
                    )
                    Spacer()
                } else {
                    ScrollView {
                        VStack(spacing: 12) {
                            // Accumulated time summary
                            if let acc = viewModel.accumulatedTime, acc.totalMinutes > 0 {
                                AccumulatedTimeChart(
                                    accumulated: acc,
                                    taskTypes: appState.userTaskTypes
                                )
                            }

                            // Work blocks timeline
                            ForEach(viewModel.sortedBlocks) { block in
                                TimelineBlockRow(
                                    block: block,
                                    sessions: viewModel.sessions(for: block),
                                    taskTypes: appState.userTaskTypes,
                                    isCurrentBlock: isCurrentBlock(block)
                                )
                            }

                            // Meetings
                            if !viewModel.sortedMeetings.isEmpty {
                                VStack(alignment: .leading, spacing: 8) {
                                    Text("Meetings")
                                        .font(.subheadline)
                                        .fontWeight(.semibold)
                                        .foregroundStyle(.secondary)

                                    ForEach(viewModel.sortedMeetings) { meeting in
                                        HStack {
                                            Image(systemName: "person.2.fill")
                                                .foregroundStyle(.purple)
                                                .font(.caption)
                                            Text(meeting.name)
                                                .font(.subheadline)
                                            Spacer()
                                            Text("\(meeting.startTime) - \(meeting.endTime)")
                                                .font(.caption)
                                                .foregroundStyle(.secondary)
                                        }
                                        .padding(.vertical, 4)
                                    }
                                }
                                .padding()
                                .background(.purple.opacity(0.05))
                                .clipShape(RoundedRectangle(cornerRadius: 12))
                            }
                        }
                        .padding()
                    }
                }

                // Error display
                if let error = viewModel.errorMessage {
                    Text(error)
                        .font(.caption)
                        .foregroundStyle(.red)
                        .padding()
                }
            }
            .navigationTitle("Schedule")
            .navigationBarTitleDisplayMode(.inline)
            .refreshable {
                await viewModel.loadData()
            }
            .task {
                viewModel.configure(with: appState)
                await viewModel.loadData()
            }
        }
    }

    private func isCurrentBlock(_ block: WorkBlock) -> Bool {
        guard viewModel.isToday else { return false }
        let formatter = DateFormatter()
        formatter.dateFormat = "HH:mm"
        let now = formatter.string(from: Date())
        return block.startTime <= now && block.endTime > now
    }
}
