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

    /// Create a new user-defined task type (name, emoji, and a #RRGGBB hex color).
    @discardableResult
    func create(name: String, emoji: String, color: String) async throws -> UserTaskType {
        try await client.mutate(
            "userTaskType.create",
            input: CreateUserTaskTypeInput(name: name, emoji: emoji, color: color)
        )
    }
}

private struct CreateUserTaskTypeInput: Codable {
    let name: String
    let emoji: String
    let color: String
}
