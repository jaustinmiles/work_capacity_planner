import Foundation

/// Service for endeavors — higher-level groupings of workflows/tasks plus the cross-workflow links
/// between them. Session-scoped. Reuses the same `endeavor.*` tRPC procedures as the desktop app.
///
/// Lives in the visionOS target (Core/ files are enrolled per-target by hand; a new shared service
/// would need a pbxproj edit, but TaskPlannerVision/ auto-joins). The iOS app doesn't need it.
final class EndeavorService {
    private let client: TRPCClient

    init(client: TRPCClient) {
        self.client = client
    }

    /// All non-archived endeavors for the active session, each with its member tasks.
    func getAll() async throws -> [Endeavor] {
        try await client.query("endeavor.getAll")
    }

    /// Create a new endeavor (color is a #RRGGBB hex, used to tint its links + the legend).
    @discardableResult
    func create(name: String, color: String?) async throws -> Endeavor {
        try await client.mutate("endeavor.create", input: CreateEndeavorInput(name: name, color: color))
    }

    /// Rename / recolor an endeavor (omitted fields are left unchanged).
    @discardableResult
    func update(id: String, name: String?, color: String?) async throws -> Endeavor {
        try await client.mutate("endeavor.update", input: UpdateEndeavorInput(id: id, name: name, color: color))
    }
}

private struct CreateEndeavorInput: Codable {
    let name: String
    var color: String?
}

private struct UpdateEndeavorInput: Codable {
    let id: String
    var name: String?
    var color: String?
}
