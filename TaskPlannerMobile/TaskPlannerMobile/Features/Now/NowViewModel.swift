import Foundation
import SwiftUI

/// ViewModel for the Now tab — orchestrates all "what should I be doing right now?" data.
///
/// The active work session + live timer + start/stop/complete are NOT owned here anymore: they live in
/// the shared `WorkTrackingModel` (so the tab-bar running-task pill and this tab stay in sync). This VM
/// forwards those, and owns the Now-screen-specific data: next scheduled item, today's accumulated time,
/// today's work pattern, today's sessions, and upcoming deadlines.
@Observable
final class NowViewModel {
    // MARK: - Now-specific state
    var nextScheduledItem: NextScheduledItem?
    var accumulatedTime: AccumulatedTimeByDate?
    var todayPattern: WorkPattern?
    var deadlineTasks: [TaskItem] = []
    var sprintTasks: [TaskItem] = []
    var todaySessions: [WorkSession] = []

    var isLoading = false
    var errorMessage: String?
    var skipIndex = 0

    // MARK: - Injected
    private var appState: AppState?
    private var tracking: WorkTrackingModel?

    func configure(with appState: AppState) {
        self.appState = appState
        self.tracking = appState.workTracking
    }

    // MARK: - Forwarded running-task state (single source of truth = WorkTrackingModel)
    var activeSession: WorkSession? { tracking?.activeSession }
    var timerTick: Int { tracking?.timerTick ?? 0 }
    var isStarting: Bool { tracking?.isStarting ?? false }
    var isPausing: Bool { tracking?.isStopping ?? false }
    var isCompleting: Bool { tracking?.isCompleting ?? false }

    // MARK: - Data Loading

    func loadAll() async {
        guard let appState, let tracking else { return }
        isLoading = true
        errorMessage = nil
        var errors: [String] = []

        // Sync the active session first (drives the timer + whether we need a next-scheduled item).
        await tracking.refresh()

        do {
            accumulatedTime = try await appState.workSessionService.getAccumulatedByDate(appState.todayDateString)
        } catch {
            errors.append("Accumulated time: \(error.localizedDescription)")
        }

        do {
            todaySessions = try await appState.workSessionService.getByDate(appState.todayDateString)
        } catch {
            errors.append("Today sessions: \(error.localizedDescription)")
        }

        do {
            todayPattern = try await appState.workPatternService.getByDate(appState.todayDateString)
        } catch {
            errors.append("Work pattern: \(error.localizedDescription)")
        }

        do {
            let allTasks = try await appState.taskService.getAll()
            deadlineTasks = allTasks
                .filter { $0.deadline != nil && !$0.completed }
                .sorted { ($0.deadline ?? .distantFuture) < ($1.deadline ?? .distantFuture) }
            sprintTasks = allTasks.filter { $0.inActiveSprint && !$0.completed }
        } catch {
            errors.append("Tasks: \(error.localizedDescription)")
        }

        // Only need a "next" suggestion when nothing is running.
        if tracking.activeSession == nil {
            await loadNextScheduled()
        }

        if let trackingError = tracking.errorMessage { errors.append(trackingError) }
        if !errors.isEmpty { errorMessage = errors.joined(separator: "\n") }

        isLoading = false
    }

    private func loadNextScheduled() async {
        guard let appState else { return }
        do {
            nextScheduledItem = try await appState.taskService.getNextScheduled(skipIndex: skipIndex)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    // MARK: - Actions (delegate the session lifecycle to WorkTrackingModel, then refresh Now data)

    /// Start working on the next scheduled task.
    func startNextTask() async {
        guard let tracking, let next = nextScheduledItem else { return }
        // Re-validate the CACHED suggestion against current task data before starting — it can go
        // stale (the task may have been completed/parked on desktop while the phone was pocketed).
        // If it's no longer startable, reload instead of logging time onto a done task.
        guard NextTaskValidation.isItemStartable(next, tasks: sprintTasks) else {
            await loadAll()
            return
        }
        let started = await tracking.start(
            taskId: next.workflowId ?? next.id,
            stepId: next.type == .step ? next.id : nil,
            plannedMinutes: next.estimatedDuration
        )
        if started { nextScheduledItem = nil }
        else { errorMessage = tracking.errorMessage }
    }

    /// Start a work session for a manually-selected task (and optional step).
    func startTask(_ task: TaskItem, step: TaskStep?) async {
        guard let tracking else { return }
        let started = await tracking.start(
            taskId: task.id,
            stepId: step?.id,
            plannedMinutes: step?.duration ?? task.remainingDuration
        )
        if started { nextScheduledItem = nil }
        else { errorMessage = tracking.errorMessage }
    }

    /// Stop/pause the active work session.
    func pauseActiveSession() async {
        guard let tracking else { return }
        let stopped = await tracking.stop()
        if stopped { await refreshAfterStop() }
        else { errorMessage = tracking.errorMessage }
    }

    /// Complete the active task/step and end the session.
    func completeActiveTask() async {
        guard let tracking else { return }
        let completed = await tracking.complete()
        if completed {
            skipIndex = 0
            await refreshAfterStop()
        } else {
            errorMessage = tracking.errorMessage
        }
    }

    /// After a session ends, reload the next suggestion + today's logged time.
    private func refreshAfterStop() async {
        guard let appState else { return }
        await loadNextScheduled()
        accumulatedTime = try? await appState.workSessionService.getAccumulatedByDate(appState.todayDateString)
        todaySessions = (try? await appState.workSessionService.getByDate(appState.todayDateString)) ?? todaySessions
    }

    /// Skip to the next scheduled task.
    func skipToNext() async {
        skipIndex += 1
        await loadNextScheduled()
    }

    // MARK: - Computed (work-pattern derived)

    var currentBlock: WorkBlock? {
        guard let blocks = todayPattern?.blocks else { return nil }
        let now = Self.currentTimeString()
        return blocks.first { $0.startTime <= now && $0.endTime > now }
    }

    var nextBlock: WorkBlock? {
        guard let blocks = todayPattern?.blocks else { return nil }
        let now = Self.currentTimeString()
        return blocks.first { $0.startTime > now }
    }

    var totalPlannedMinutes: Int {
        guard let blocks = todayPattern?.blocks else { return 0 }
        return blocks.compactMap(\.totalCapacity).reduce(0, +)
    }

    var totalLoggedMinutes: Int { accumulatedTime?.totalMinutes ?? 0 }

    var todayProgress: Double {
        guard totalPlannedMinutes > 0 else { return 0 }
        return min(1.0, Double(totalLoggedMinutes) / Double(totalPlannedMinutes))
    }

    private static func currentTimeString() -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "HH:mm"
        return formatter.string(from: Date())
    }
}
