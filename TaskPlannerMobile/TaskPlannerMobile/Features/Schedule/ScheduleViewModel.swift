import Foundation
import SwiftUI

/// ViewModel for the Schedule tab — loads and displays daily work patterns and logged sessions.
@Observable
final class ScheduleViewModel {
    var selectedDate: String
    var pattern: WorkPattern?
    var workSessions: [WorkSession] = []
    var accumulatedTime: AccumulatedTimeByDate?

    var isLoading = false
    var errorMessage: String?

    private var appState: AppState?

    init() {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        self.selectedDate = formatter.string(from: Date())
    }

    func configure(with appState: AppState) {
        self.appState = appState
    }

    // MARK: - Data Loading

    func loadData() async {
        guard let appState else { return }
        isLoading = true
        errorMessage = nil

        do {
            async let patternResult = appState.workPatternService.getByDate(selectedDate)
            async let sessionsResult = appState.workSessionService.getByDate(selectedDate)
            async let accumulatedResult = appState.workSessionService.getAccumulatedByDate(selectedDate)

            pattern = try await patternResult
            workSessions = try await sessionsResult
            accumulatedTime = try await accumulatedResult
        } catch {
            errorMessage = error.localizedDescription
        }

        isLoading = false
    }

    // MARK: - Navigation

    func goToPreviousDay() async {
        if let date = dateFromString(selectedDate),
           let previous = Calendar.current.date(byAdding: .day, value: -1, to: date) {
            selectedDate = dateToString(previous)
            await loadData()
        }
    }

    func goToNextDay() async {
        if let date = dateFromString(selectedDate),
           let next = Calendar.current.date(byAdding: .day, value: 1, to: date) {
            selectedDate = dateToString(next)
            await loadData()
        }
    }

    func goToToday() async {
        selectedDate = dateToString(Date())
        await loadData()
    }

    // MARK: - Computed Properties

    var isToday: Bool {
        selectedDate == dateToString(Date())
    }

    var displayDate: String {
        guard let date = dateFromString(selectedDate) else { return selectedDate }
        if isToday { return "Today" }

        let formatter = DateFormatter()
        formatter.dateFormat = "EEEE, MMM d"
        return formatter.string(from: date)
    }

    /// All blocks sorted by start time
    var sortedBlocks: [WorkBlock] {
        (pattern?.blocks ?? []).sorted { $0.startTime < $1.startTime }
    }

    /// All meetings sorted by start time
    var sortedMeetings: [WorkMeeting] {
        (pattern?.meetings ?? []).sorted { $0.startTime < $1.startTime }
    }

    /// Sessions that fall within a specific block's time range
    func sessions(for block: WorkBlock) -> [WorkSession] {
        workSessions.filter { session in
            let sessionTime = timeString(from: session.startTime)
            return sessionTime >= block.startTime && sessionTime < block.endTime
        }
    }

    // MARK: - Helpers

    private func dateFromString(_ str: String) -> Date? {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.date(from: str)
    }

    private func dateToString(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: date)
    }

    private func timeString(from date: Date) -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "HH:mm"
        return formatter.string(from: date)
    }
}
