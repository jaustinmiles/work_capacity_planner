import Foundation

/// Service for session management operations
final class SessionService {
    private let client: TRPCClient

    init(client: TRPCClient) {
        self.client = client
    }

    /// Fetch all sessions
    func getAll() async throws -> [Session] {
        try await client.query("session.getAll")
    }

    /// Get a specific session by ID
    func getById(_ id: String) async throws -> Session {
        try await client.query("session.getById", input: IDInput(id: id))
    }

    /// Set a session as active
    func setActive(_ id: String) async throws -> Session {
        try await client.mutate("session.setActive", input: IDInput(id: id))
    }

    /// Create a new session.
    @discardableResult
    func create(name: String, description: String? = nil) async throws -> Session {
        try await client.mutate("session.create", input: CreateSessionInput(name: name, description: description))
    }

    /// Check server health
    func healthCheck() async throws -> Bool {
        try await client.healthCheck()
    }
}

private struct CreateSessionInput: Codable {
    let name: String
    var description: String?
}
