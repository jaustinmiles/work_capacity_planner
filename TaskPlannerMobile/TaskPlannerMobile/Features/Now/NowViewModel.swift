import Foundation
import SwiftUI

/// ViewModel for the Now tab — orchestrates all "what should I be doing right now?" data.
///
/// Loads: active work session, next scheduled item, today's accumulated time,
/// today's work pattern, and upcoming deadlines.
@Observable
final class NowViewModel {
    // MARK: - State
    var activeSession: WorkSession?
    var nextScheduledItem: NextScheduledItem?
    var accumulatedTime: AccumulatedTimeByDate?
    var todayPattern: WorkPattern?
    var deadlineTasks: [TaskItem] = []
    var sprintTasks: [TaskItem] = []
    var todaySessions: [WorkSession] = []

    var isLoading = false
    var isStarting = false
    var isPausing = false
    var isCompleting = false
    var errorMessage: String?
    var skipIndex = 0

    // Timer tick — incremented every second to force UI refresh
    var timerTick = 0

    private var timerTask: Task<Void, Never>?

    // MARK: - Services (injected)
    private var appState: AppState?

    func configure(with appState: AppState) {
        self.appState = appState
    }

    // MARK: - Data Loading

    func loadAll() async {
        guard let appState else { return }
        isLoading = true
        errorMessage = nil
        var errors: [String] = []

        // Each endpoint is isolated — one failure doesn't block others.
        // Sequential awaits for simplicity; each is fast over local network.

        do {
            activeSession = try await appState.workSessionService.getActive()
            if activeSession != nil { startTimer() }
        } catch {
            print("[Now] workSession.getActive FAILED: \(error)")
            errors.append("Active session: \(error.localizedDescription)")
        }

        do {
            accumulatedTime = try await appState.workSessionService.getAccumulatedByDate(appState.todayDateString)
        } catch {
            print("[Now] workSession.getAccumulatedByDate FAILED: \(error)")
            errors.append("Accumulated time: \(error.localizedDescription)")
        }

        do {
            todaySessions = try await appState.workSessionService.getByDate(appState.todayDateString)
        } catch {
            print("[Now] workSession.getByDate FAILED: \(error)")
            errors.append("Today sessions: \(error.localizedDescription)")
        }

        do {
            todayPattern = try await appState.workPatternService.getByDate(appState.todayDateString)
        } catch {
            print("[Now] workPattern.getByDate FAILED: \(error)")
            errors.append("Work pattern: \(error.localizedDescription)")
        }

        do {
            let allTasks = try await appState.taskService.getAll()
            deadlineTasks = allTasks
                .filter { $0.deadline != nil && !$0.completed }
                .sorted { ($0.deadline ?? .distantFuture) < ($1.deadline ?? .distantFuture) }
            sprintTasks = allTasks
                .filter { $0.inActiveSprint && !$0.completed }
        } catch {
            print("[Now] task.getAll FAILED: \(error)")
            errors.append("Tasks: \(error.localizedDescription)")
        }

        // Load next scheduled item if no active session
        if activeSession == nil {
            do {
                nextScheduledItem = try await appState.taskService.getNextScheduled(skipIndex: skipIndex)
            } catch {
                print("[Now] task.getNextScheduled FAILED: \(error)")
                errors.append("Next scheduled: \(error.localizedDescription)")
            }
        }

        if !errors.isEmpty {
            errorMessage = errors.joined(separator: "\n")
        }

        isLoading = false
    }

    // MARK: - Timer

    func startTimer() {
        stopTimer()
        timerTask = Task { @MainActor [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(1))
                self?.timerTick += 1
            }
        }
    }

    func stopTimer() {
        timerTask?.cancel()
        timerTask = nil
    }

    // MARK: - Actions

    /// Start working on the next scheduled task
    func startNextTask() async {
        guard let appState, let next = nextScheduledItem else { return }
        isStarting = true
        errorMessage = nil

        do {
            let session = try await appState.workSessionService.create(CreateWorkSessionInput(
                taskId: next.workflowId ?? next.id,
                stepId: next.type == .step ? next.id : nil,
                startTime: Date(),
                plannedMinutes: next.estimatedDuration
            ))
            activeSession = session
            nextScheduledItem = nil
            startTimer()

            // Haptic feedback
            let generator = UIImpactFeedbackGenerator(style: .medium)
            generator.impactOccurred()
        } catch {
            errorMessage = error.localizedDescription
        }

        isStarting = false
    }

    /// Start a work session for a manually-selected task (and optional step)
    func startTask(_ task: TaskItem, step: TaskStep?) async {
        guard let appState else { return }
        isStarting = true
        errorMessage = nil

        do {
            let session = try await appState.workSessionService.create(CreateWorkSessionInput(
                taskId: task.id,
                stepId: step?.id,
                startTime: Date(),
                plannedMinutes: step?.duration ?? task.remainingDuration
            ))
            activeSession = session
            nextScheduledItem = nil
            startTimer()

            UIImpactFeedbackGenerator(style: .medium).impactOccurred()
        } catch {
            errorMessage = error.localizedDescription
        }

        isStarting = false
    }

    /// Pause the active work session
    func pauseActiveSession() async {
        guard let appState, let session = activeSession else { return }
        isPausing = true
        errorMessage = nil

        do {
            let minutes = session.elapsedMinutes
            _ = try await appState.workSessionService.end(id: session.id, actualMinutes: minutes)
            activeSession = nil
            stopTimer()

            // Reload next scheduled item
            nextScheduledItem = try await appState.taskService.getNextScheduled(skipIndex: skipIndex)

            // Refresh accumulated time and sessions
            accumulatedTime = try await appState.workSessionService.getAccumulatedByDate(appState.todayDateString)
            todaySessions = try await appState.workSessionService.getByDate(appState.todayDateString)

            let generator = UIImpactFeedbackGenerator(style: .light)
            generator.impactOccurred()
        } catch {
            errorMessage = error.localizedDescription
        }

        isPausing = false
    }

    /// Complete the active task/step and end the session
    func completeActiveTask() async {
        guard let appState, let session = activeSession else { return }
        isCompleting = true
        errorMessage = nil

        do {
            let minutes = session.elapsedMinutes

            // End the work session
            _ = try await appState.workSessionService.end(id: session.id, actualMinutes: minutes)

            // Mark the task/step as completed
            if let stepId = session.stepId {
                _ = try await appState.taskService.completeStep(
                    taskId: session.taskId,
                    stepId: stepId,
                    actualMinutes: minutes
                )
            } else {
                _ = try await appState.taskService.complete(id: session.taskId, actualDuration: minutes)
            }

            activeSession = nil
            stopTimer()

            // Reload next scheduled item, accumulated time, and sessions
            nextScheduledItem = try await appState.taskService.getNextScheduled(skipIndex: 0)
            skipIndex = 0
            accumulatedTime = try await appState.workSessionService.getAccumulatedByDate(appState.todayDateString)
            todaySessions = try await appState.workSessionService.getByDate(appState.todayDateString)

            let generator = UINotificationFeedbackGenerator()
            generator.notificationOccurred(.success)
        } catch {
            errorMessage = error.localizedDescription
        }

        isCompleting = false
    }

    /// Skip to the next scheduled task
    func skipToNext() async {
        guard let appState else { return }
        skipIndex += 1

        do {
            nextScheduledItem = try await appState.taskService.getNextScheduled(skipIndex: skipIndex)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    // MARK: - Computed Properties

    /// Current work block based on today's pattern
    var currentBlock: WorkBlock? {
        guard let blocks = todayPattern?.blocks else { return nil }
        let now = Self.currentTimeString()
        return blocks.first { $0.startTime <= now && $0.endTime > now }
    }

    /// Next work block
    var nextBlock: WorkBlock? {
        guard let blocks = todayPattern?.blocks else { return nil }
        let now = Self.currentTimeString()
        return blocks.first { $0.startTime > now }
    }

    /// Total planned capacity for today
    var totalPlannedMinutes: Int {
        guard let blocks = todayPattern?.blocks else { return 0 }
        return blocks.compactMap(\.totalCapacity).reduce(0, +)
    }

    /// Total logged minutes today
    var totalLoggedMinutes: Int {
        accumulatedTime?.totalMinutes ?? 0
    }

    /// Today's progress as a fraction
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
