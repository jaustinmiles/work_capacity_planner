import Foundation

/// ViewModel for the Today tab — today's logged work sessions + accumulated time, with editing.
///
/// All editing goes through `workSession.update` / `.delete` (the server is authoritative); after a
/// change we recalc the affected task's duration so plan-vs-actual stays consistent, then reload.
@Observable
final class TodayViewModel {
    var sessions: [WorkSession] = []
    var accumulated: AccumulatedTimeByDate?
    var isLoading = false
    var errorMessage: String?

    private var appState: AppState?

    func configure(with appState: AppState) { self.appState = appState }

    func load() async {
        guard let appState else { return }
        isLoading = true
        errorMessage = nil
        do {
            async let sessionsResult = appState.workSessionService.getByDate(appState.todayDateString)
            async let accumulatedResult = appState.workSessionService.getAccumulatedByDate(appState.todayDateString)
            sessions = try await sessionsResult
            accumulated = try await accumulatedResult
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    var totalLoggedMinutes: Int { accumulated?.totalMinutes ?? 0 }

    /// Completed sessions (have an end time), earliest first — the editable log.
    var completedSessions: [WorkSession] {
        sessions.filter { $0.endTime != nil }.sorted { $0.startTime < $1.startTime }
    }

    /// Edit a logged session's start/end; `actualMinutes` is re-derived from the span.
    func updateSession(_ session: WorkSession, start: Date, end: Date) async {
        guard let appState else { return }
        let minutes = max(0, Int(end.timeIntervalSince(start) / 60))
        do {
            _ = try await appState.workSessionService.update(UpdateWorkSessionInput(
                id: session.id, startTime: start, endTime: end, actualMinutes: minutes))
            _ = try? await appState.workSessionService.recalculateTaskDuration(taskId: session.taskId)
            await load()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    /// Delete a logged session, then recalc the task's duration.
    func deleteSession(_ session: WorkSession) async {
        guard let appState else { return }
        do {
            try await appState.workSessionService.delete(id: session.id)
            _ = try? await appState.workSessionService.recalculateTaskDuration(taskId: session.taskId)
            await load()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
