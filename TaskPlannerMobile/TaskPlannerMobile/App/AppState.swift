import Foundation

/// Root application state — owns the auth manager, tRPC client, and all services.
///
/// Injected into the SwiftUI environment so all views can access services.
/// Uses iOS 17 @Observable for clean, automatic UI updates.
@Observable
final class AppState {
    // MARK: - Core Infrastructure
    let authManager: AuthManager
    let client: TRPCClient

    // MARK: - Services (lazy-initialized from client)
    let sessionService: SessionService
    let taskService: TaskService
    let workSessionService: WorkSessionService
    let workPatternService: WorkPatternService
    let userTaskTypeService: UserTaskTypeService
    let conversationService: ConversationService
    let deepWorkBoardService: DeepWorkBoardService

    // MARK: - App-Level State
    var sessions: [Session] = []
    var activeSession: Session?
    var userTaskTypes: [UserTaskType] = []
    var isLoading = false
    var connectionError: String?

    init() {
        let auth = AuthManager()
        self.authManager = auth
        self.client = TRPCClient(authManager: auth)

        // Initialize services
        self.sessionService = SessionService(client: client)
        self.taskService = TaskService(client: client)
        self.workSessionService = WorkSessionService(client: client)
        self.workPatternService = WorkPatternService(client: client)
        self.userTaskTypeService = UserTaskTypeService(client: client)
        self.conversationService = ConversationService(client: client)
        self.deepWorkBoardService = DeepWorkBoardService(client: client)
    }

    // MARK: - Initial Data Loading

    /// Load sessions and task types after authentication
    func loadInitialData() async {
        isLoading = true
        connectionError = nil

        do {
            // Fetch sessions and task types in parallel
            async let sessionsResult = sessionService.getAll()
            async let typesResult = userTaskTypeService.getAll()

            sessions = try await sessionsResult
            userTaskTypes = try await typesResult

            // Set active session if one exists
            activeSession = sessions.first { $0.isActive }

            if let active = activeSession {
                authManager.setActiveSessionId(active.id)
            }
        } catch {
            connectionError = error.localizedDescription
        }

        isLoading = false
    }

    /// Check server connectivity
    func checkConnection() async -> Bool {
        do {
            return try await client.healthCheck()
        } catch {
            connectionError = error.localizedDescription
            return false
        }
    }

    /// Select and activate a session
    func selectSession(_ session: Session) async throws {
        authManager.setActiveSessionId(session.id)
        activeSession = session

        // Reload task types for this session
        userTaskTypes = try await userTaskTypeService.getAll()
    }

    /// Look up a UserTaskType by its ID
    func taskType(for typeId: String) -> UserTaskType? {
        userTaskTypes.first { $0.id == typeId }
    }

    /// Today's date as "YYYY-MM-DD"
    var todayDateString: String {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: Date())
    }
}
