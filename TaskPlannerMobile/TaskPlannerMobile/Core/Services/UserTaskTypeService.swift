import Foundation

/// Service for user-defined task type categories.
///
/// Task types define categories like "Deep Work", "Admin", "Errands"
/// with associated emoji and color. They're used throughout the UI
/// to visually identify task categories.
final class UserTaskTypeService {
    private let client: TRPCClient

    init(client: TRPCClient) {
        self.client = client
    }

    /// Get all task types for the active session
    func getAll() async throws -> [UserTaskType] {
        try await client.query("userTaskType.getAll")
    }
}
