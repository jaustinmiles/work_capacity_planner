import Foundation

/// Service for Deep Work Board operations.
///
/// The board is a freeform canvas on desktop. On mobile, we present
/// it as a list of workflow clusters with their steps.
final class DeepWorkBoardService {
    private let client: TRPCClient

    init(client: TRPCClient) {
        self.client = client
    }

    /// Get all boards for the active session
    func getAll() async throws -> [DeepWorkBoard] {
        try await client.query("deepWorkBoard.getAll")
    }

    /// Get a specific board with all its nodes
    func getById(_ id: String) async throws -> DeepWorkBoardWithNodes {
        try await client.query("deepWorkBoard.getById", input: IDInput(id: id))
    }
}

// MARK: - Models

struct DeepWorkBoard: Codable, Identifiable {
    let id: String
    var sessionId: String
    var name: String
    var zoom: Double
    var panX: Double
    var panY: Double
    var actionPanelOpen: Bool
    var actionPanelWidth: Double
    var createdAt: Date
    var updatedAt: Date
}

struct DeepWorkNode: Codable, Identifiable {
    let id: String
    var boardId: String
    var taskId: String?
    var stepId: String?
    var positionX: Double
    var positionY: Double
    var width: Double
    var height: Double
    var createdAt: Date
    var updatedAt: Date
}

struct DeepWorkBoardWithNodes: Codable {
    let board: DeepWorkBoard
    let nodes: [DeepWorkNode]
}

/// A workflow cluster groups related nodes for mobile display
struct WorkflowCluster: Identifiable {
    let id: String
    let workflowTask: TaskItem
    let steps: [TaskStep]
    let nodeIds: Set<String>

    /// Progress as fraction (0-1)
    var progress: Double {
        guard !steps.isEmpty else { return 0 }
        let completed = steps.filter { $0.status == .completed }.count
        return Double(completed) / Double(steps.count)
    }

    /// Number of completed steps
    var completedStepCount: Int {
        steps.filter { $0.status == .completed }.count
    }
}
