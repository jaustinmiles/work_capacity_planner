import Foundation

/// Service for endeavor operations — higher-level groupings of related tasks/workflows
/// for cross-project tracking.
///
/// A thin wrapper over the `endeavor.*` tRPC procedures: all logic (progress roll-ups,
/// dependency graphs, scheduling) stays server-side. The per-endeavor "next task" lives
/// on `TaskService.getNextScheduled(endeavorId:)` because it reuses the task scheduler.
final class EndeavorService {
    private let client: TRPCClient

    init(client: TRPCClient) {
        self.client = client
    }

    /// Fetch all endeavors for the active session, each with hydrated items/tasks/steps.
    /// Defaults to non-archived; pass a `status` to filter, or `includeArchived` to include them.
    func getAll(status: EndeavorStatus? = nil, includeArchived: Bool = false) async throws -> [Endeavor] {
        try await client.query(
            "endeavor.getAll",
            input: GetEndeavorsInput(status: status?.rawValue, includeArchived: includeArchived)
        )
    }

    /// Get a single endeavor by id with full task detail (nil if it doesn't exist).
    func getById(_ id: String) async throws -> Endeavor? {
        try await client.query("endeavor.getById", input: IDInput(id: id))
    }

    /// Progress roll-up (task/duration completion) for an endeavor (nil if it doesn't exist).
    func getProgress(_ id: String) async throws -> EndeavorProgress? {
        try await client.query("endeavor.getProgress", input: IDInput(id: id))
    }
}

// MARK: - Input Types

private struct GetEndeavorsInput: Codable {
    var status: String?
    let includeArchived: Bool
}
