import Foundation

/// Service for work session time tracking operations.
///
/// Work sessions track actual time spent on tasks and workflow steps.
/// The timer is server-authoritative: `startTime` is set on create,
/// and elapsed time is computed as `now - startTime` on the client.
final class WorkSessionService {
    private let client: TRPCClient

    init(client: TRPCClient) {
        self.client = client
    }

    // MARK: - Queries

    /// Get the currently active work session (endTime is null)
    func getActive() async throws -> WorkSession? {
        try await client.query("workSession.getActive")
    }

    /// Get work sessions for a specific date
    func getByDate(_ date: String) async throws -> [WorkSession] {
        try await client.query("workSession.getByDate", input: DateInput(date: date))
    }

    /// Get work sessions for a specific task
    func getByTask(_ taskId: String) async throws -> [WorkSession] {
        try await client.query("workSession.getByTask", input: IDInput(id: taskId))
    }

    /// Get accumulated time by task type for a date
    func getAccumulatedByDate(_ date: String) async throws -> AccumulatedTimeByDate {
        try await client.query("workSession.getAccumulatedByDate", input: DateInput(date: date))
    }

    /// Get total logged time for a task
    func getTotalTimeForTask(_ taskId: String) async throws -> TotalTimeResponse {
        try await client.query("workSession.getTotalTimeForTask", input: TaskIDInput(taskId: taskId))
    }

    // MARK: - Mutations

    /// Start a new work session (begin tracking time)
    func create(_ input: CreateWorkSessionInput) async throws -> WorkSession {
        try await client.mutate("workSession.create", input: input)
    }

    /// End a work session (stop tracking time)
    func end(id: String, actualMinutes: Int) async throws -> WorkSession {
        try await client.mutate("workSession.end", input: EndWorkSessionInput(
            id: id,
            actualMinutes: actualMinutes
        ))
    }

    /// Update a work session
    func update(_ input: UpdateWorkSessionInput) async throws -> WorkSession {
        try await client.mutate("workSession.update", input: input)
    }

    /// Delete a work session
    func delete(id: String) async throws {
        try await client.mutateVoid("workSession.delete", input: IDInput(id: id))
    }

    /// Recalculate a task's actual duration from all its work sessions
    func recalculateTaskDuration(taskId: String) async throws -> TotalTimeResponse {
        try await client.mutate("workSession.recalculateTaskDuration", input: TaskIDInput(taskId: taskId))
    }
}

// MARK: - Input/Output Types

private struct DateInput: Codable {
    let date: String  // "YYYY-MM-DD"
}

private struct TaskIDInput: Codable {
    let taskId: String
}

struct UpdateWorkSessionInput: Codable {
    let id: String
    var startTime: Date?
    var endTime: Date?
    var plannedMinutes: Int?
    var actualMinutes: Int?
    var notes: String?
    var taskId: String?
    var stepId: String?
    var blockId: String?
}

struct TotalTimeResponse: Codable {
    let totalMinutes: Int
}
