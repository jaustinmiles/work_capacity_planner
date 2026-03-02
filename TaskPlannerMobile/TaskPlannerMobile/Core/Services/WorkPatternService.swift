import Foundation

/// Service for querying work patterns (daily schedules).
///
/// Work patterns define the structure of a work day:
/// blocks of time allocated to task types, and meetings.
/// The iOS app reads these but does not modify them (editing is desktop-only).
final class WorkPatternService {
    private let client: TRPCClient

    init(client: TRPCClient) {
        self.client = client
    }

    /// Get the work pattern for a specific date
    func getByDate(_ date: String) async throws -> WorkPattern? {
        try await client.query("workPattern.getByDate", input: DateInput(date: date))
    }

    /// Get work patterns for a date range
    func getByDateRange(startDate: String, endDate: String) async throws -> [WorkPattern] {
        try await client.query("workPattern.getByDateRange", input: DateRangeInput(
            startDate: startDate,
            endDate: endDate
        ))
    }

    /// Get all work pattern templates
    func getTemplates() async throws -> [WorkPattern] {
        try await client.query("workPattern.getTemplates")
    }
}

// MARK: - Input Types

private struct DateInput: Codable {
    let date: String
}

private struct DateRangeInput: Codable {
    let startDate: String
    let endDate: String
}
