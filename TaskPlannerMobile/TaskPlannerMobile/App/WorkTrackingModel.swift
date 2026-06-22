import SwiftUI
import UIKit

/// App-level "what am I working on right now" — the SINGLE source of truth for the active work
/// session and its live timer. Read by BOTH the Now tab and the tab-bar running-task pill, so
/// starting / stopping / completing in one place updates everywhere. Owned by `AppState`, exposed
/// through the environment via AppState.
@Observable
final class WorkTrackingModel {
    private(set) var activeSession: WorkSession?
    /// Increments once per second while a session runs — drives elapsed-time UI without polling.
    private(set) var timerTick = 0
    var isStarting = false
    var isStopping = false
    var isCompleting = false
    var errorMessage: String?

    private let workSessionService: WorkSessionService
    private let taskService: TaskService
    private var timerTask: Task<Void, Never>?

    init(workSessionService: WorkSessionService, taskService: TaskService) {
        self.workSessionService = workSessionService
        self.taskService = taskService
    }

    var isRunning: Bool { activeSession != nil }

    /// Pull the current active session from the server (app foreground / tab appear / external change).
    func refresh() async {
        do {
            activeSession = try await workSessionService.getActive()
            if activeSession != nil { startTimer() } else { stopTimer() }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    /// Begin tracking a task (and optional step). Returns true on success.
    @discardableResult
    func start(taskId: String, stepId: String?, plannedMinutes: Int) async -> Bool {
        isStarting = true; errorMessage = nil
        defer { isStarting = false }
        do {
            activeSession = try await workSessionService.create(CreateWorkSessionInput(
                taskId: taskId, stepId: stepId, startTime: Date(), plannedMinutes: plannedMinutes))
            startTimer()
            UIImpactFeedbackGenerator(style: .medium).impactOccurred()
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    /// Stop the active session, logging elapsed minutes. Returns true on success.
    @discardableResult
    func stop() async -> Bool {
        guard let session = activeSession else { return false }
        isStopping = true; errorMessage = nil
        defer { isStopping = false }
        do {
            _ = try await workSessionService.end(id: session.id, actualMinutes: session.elapsedMinutes)
            activeSession = nil; stopTimer()
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    /// Complete the active task/step (workflow steps roll up server-side) and end the session.
    @discardableResult
    func complete() async -> Bool {
        guard let session = activeSession else { return false }
        isCompleting = true; errorMessage = nil
        defer { isCompleting = false }
        do {
            let minutes = session.elapsedMinutes
            _ = try await workSessionService.end(id: session.id, actualMinutes: minutes)
            if let stepId = session.stepId {
                _ = try await taskService.completeStep(taskId: session.taskId, stepId: stepId, actualMinutes: minutes)
            } else {
                _ = try await taskService.complete(id: session.taskId, actualDuration: minutes)
            }
            activeSession = nil; stopTimer()
            UINotificationFeedbackGenerator().notificationOccurred(.success)
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    // MARK: - Timer

    private func startTimer() {
        stopTimer()
        timerTask = Task { @MainActor [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(1))
                self?.timerTick += 1
            }
        }
    }

    private func stopTimer() {
        timerTask?.cancel()
        timerTask = nil
    }
}
