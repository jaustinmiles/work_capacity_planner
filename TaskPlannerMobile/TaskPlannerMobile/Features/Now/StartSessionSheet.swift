import SwiftUI

/// Searchable task picker sheet — tap any incomplete task to start a work session.
///
/// Groups tasks by type (using UserTaskType colors/emojis) and supports
/// search filtering by name. Workflow tasks show their current step.
struct StartSessionSheet: View {
    @Environment(AppState.self) private var appState
    @Environment(\.dismiss) private var dismiss

    let onStartTask: (TaskItem, TaskStep?) -> Void

    @State private var tasks: [TaskItem] = []
    @State private var searchText = ""
    @State private var isLoading = true
    @State private var errorMessage: String?

    private var filteredTasks: [TaskItem] {
        let incomplete = tasks.filter { !$0.completed && !$0.archived }
        if searchText.isEmpty {
            return incomplete
        }
        let query = searchText.lowercased()
        return incomplete.filter { $0.name.lowercased().contains(query) }
    }

    /// Group filtered tasks by their type id
    private var groupedTasks: [(type: UserTaskType?, tasks: [TaskItem])] {
        let dict = Dictionary(grouping: filteredTasks) { $0.type }
        return appState.userTaskTypes.compactMap { taskType in
            guard let items = dict[taskType.id], !items.isEmpty else { return nil }
            return (type: taskType, tasks: items.sorted { $0.priorityScore > $1.priorityScore })
        } + {
            // Tasks with types not in userTaskTypes
            let knownIds = Set(appState.userTaskTypes.map(\.id))
            let orphans = filteredTasks.filter { !knownIds.contains($0.type) }
            return orphans.isEmpty ? [] : [(type: nil, tasks: orphans)]
        }()
    }

    var body: some View {
        NavigationStack {
            Group {
                if isLoading {
                    ProgressView("Loading tasks...")
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if let error = errorMessage {
                    VStack(spacing: 12) {
                        Image(systemName: "exclamationmark.triangle")
                            .font(.title)
                            .foregroundStyle(.orange)
                        Text(error)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .multilineTextAlignment(.center)
                        Button("Retry") {
                            Task { await loadTasks() }
                        }
                        .buttonStyle(.bordered)
                    }
                    .padding()
                } else if filteredTasks.isEmpty {
                    VStack(spacing: 12) {
                        Image(systemName: searchText.isEmpty ? "checkmark.seal.fill" : "magnifyingglass")
                            .font(.title)
                            .foregroundStyle(.secondary)
                        Text(searchText.isEmpty ? "No incomplete tasks" : "No tasks matching \"\(searchText)\"")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    taskList
                }
            }
            .navigationTitle("Start Working")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
            .searchable(text: $searchText, prompt: "Search tasks...")
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
        .task {
            await loadTasks()
        }
    }

    // MARK: - Task List

    private var taskList: some View {
        List {
            ForEach(groupedTasks, id: \.type?.id) { group in
                Section {
                    ForEach(group.tasks) { task in
                        TaskRow(
                            task: task,
                            taskType: group.type,
                            onTap: { step in
                                onStartTask(task, step)
                                dismiss()
                            }
                        )
                    }
                } header: {
                    if let taskType = group.type {
                        HStack(spacing: 6) {
                            Text(taskType.emoji)
                            Text(taskType.name)
                                .textCase(.uppercase)
                        }
                    } else {
                        Text("Other")
                            .textCase(.uppercase)
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
    }

    // MARK: - Data Loading

    private func loadTasks() async {
        isLoading = true
        errorMessage = nil
        do {
            tasks = try await appState.taskService.getAll()
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }
}

// MARK: - Task Row

private struct TaskRow: View {
    let task: TaskItem
    let taskType: UserTaskType?
    let onTap: (TaskStep?) -> Void

    /// For workflows, find the current actionable step
    private var currentStep: TaskStep? {
        guard let steps = task.steps, task.hasSteps else { return nil }
        // Prefer the explicitly-set currentStepId
        if let currentId = task.currentStepId {
            return steps.first { $0.id == currentId }
        }
        // Fall back to first non-completed step
        return steps
            .sorted(by: { $0.stepIndex < $1.stepIndex })
            .first { $0.status != .completed && $0.status != .skipped }
    }

    var body: some View {
        Button {
            onTap(currentStep)
        } label: {
            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Text(task.name)
                        .font(.subheadline)
                        .fontWeight(.medium)
                        .foregroundStyle(.primary)
                        .lineLimit(2)

                    Spacer()

                    Text(DurationLabel.format(minutes: task.remainingDuration))
                        .font(.caption)
                        .monospacedDigit()
                        .foregroundStyle(.secondary)
                }

                HStack(spacing: 8) {
                    // Priority indicator
                    priorityDots

                    if task.hasSteps {
                        Label("Workflow", systemImage: "arrow.triangle.branch")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }

                    if let deadline = task.deadline {
                        Label(deadline.relativeDescription, systemImage: "calendar")
                            .font(.caption2)
                            .foregroundStyle(deadline < Date() ? .red : .secondary)
                    }

                    if task.inActiveSprint {
                        Label("Sprint", systemImage: "bolt.fill")
                            .font(.caption2)
                            .foregroundStyle(.orange)
                    }
                }

                // Current step for workflows
                if let step = currentStep {
                    HStack(spacing: 4) {
                        Image(systemName: "arrow.right.circle.fill")
                            .font(.caption2)
                            .foregroundStyle(taskType?.swiftUIColor ?? .blue)
                        Text(step.name)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                        Spacer()
                        Text(DurationLabel.format(minutes: step.duration))
                            .font(.caption2)
                            .monospacedDigit()
                            .foregroundStyle(.tertiary)
                    }
                    .padding(.top, 2)
                }
            }
            .padding(.vertical, 4)
        }
    }

    private var priorityDots: some View {
        HStack(spacing: 2) {
            let score = task.priorityScore
            let level = score >= 64 ? 3 : score >= 25 ? 2 : 1
            ForEach(0..<level, id: \.self) { _ in
                Circle()
                    .fill(level >= 3 ? .red : level >= 2 ? .orange : .gray)
                    .frame(width: 4, height: 4)
            }
        }
    }
}

// MARK: - Date Helpers

private extension Date {
    var relativeDescription: String {
        let calendar = Calendar.current
        let now = Date()

        if calendar.isDateInToday(self) { return "Today" }
        if calendar.isDateInTomorrow(self) { return "Tomorrow" }

        let days = calendar.dateComponents([.day], from: now, to: self).day ?? 0
        if days < 0 { return "\(abs(days))d overdue" }
        if days <= 7 { return "In \(days)d" }

        let formatter = DateFormatter()
        formatter.dateFormat = "MMM d"
        return formatter.string(from: self)
    }
}
