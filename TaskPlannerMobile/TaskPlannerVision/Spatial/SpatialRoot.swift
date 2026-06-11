import Foundation
import Observation

/// Composition root for the visionOS app.
///
/// The iOS app's `AppState` lives in `App/` (alongside the iOS `@main`) and is not a
/// member of the visionOS target, so the spatial app has its own thin root. It reuses
/// the shared Core infrastructure (AuthManager, TRPCClient, and the domain services) —
/// only the wiring is duplicated, not the logic.
@Observable
final class SpatialRoot {
    let authManager: AuthManager
    let client: TRPCClient
    let taskService: TaskService
    let userTaskTypeService: UserTaskTypeService
    let sessionService: SessionService
    let spatialService: SpatialSceneService
    let conversationService: ConversationService
    let agentService: AgentService
    let agentStream: AgentStreamService
    let endeavorService: EndeavorService

    var sessions: [Session] = []
    var activeSession: Session?
    var userTaskTypes: [UserTaskType] = []
    var endeavors: [Endeavor] = []
    var isLoading = false
    var connectionError: String?
    /// Bumped after the AI agent applies changes; the volumetric workspace observes it and reloads.
    var sceneReloadToken = 0

    init() {
        let auth = AuthManager()
        self.authManager = auth
        self.client = TRPCClient(authManager: auth)
        self.taskService = TaskService(client: client)
        self.userTaskTypeService = UserTaskTypeService(client: client)
        self.sessionService = SessionService(client: client)
        self.spatialService = SpatialSceneService(client: client)
        self.conversationService = ConversationService(client: client)
        self.agentService = AgentService(client: client)
        self.agentStream = AgentStreamService(authManager: auth)
        self.endeavorService = EndeavorService(client: client)
    }

    /// Ask the volumetric workspace to reload after the AI agent changed data.
    func requestSceneReload() { sceneReloadToken += 1 }

    var isConfigured: Bool { authManager.isConfigured }
    var isFullyConfigured: Bool { authManager.isFullyConfigured }

    /// Load sessions + the active session's task types after the API key is set.
    func loadInitialData() async {
        isLoading = true
        connectionError = nil
        do {
            sessions = try await sessionService.getAll()
            // Prefer the server's active session, else fall back to a persisted selection — so types
            // still load when no session is flagged active server-side (the empty-trays cause).
            activeSession = sessions.first { $0.isActive }
                ?? sessions.first { $0.id == authManager.activeSessionId }
            if let active = activeSession {
                authManager.setActiveSessionId(active.id)
            }
            if authManager.activeSessionId != nil {
                userTaskTypes = try await userTaskTypeService.getAll()
                endeavors = try await endeavorService.getAll()
            }
        } catch {
            connectionError = error.localizedDescription
        }
        isLoading = false
    }

    /// Switch the active session and reload its task types.
    func selectSession(_ session: Session) async {
        do {
            _ = try await sessionService.setActive(session.id)
            authManager.setActiveSessionId(session.id)
            activeSession = session
            userTaskTypes = try await userTaskTypeService.getAll()
        } catch {
            connectionError = error.localizedDescription
        }
    }

    /// (Re)load the active session's task types. The volume calls this on load so its trays / type
    /// wheel / edit picker always reflect the current session — independent of the management window
    /// (which only loaded types when a session was flagged active server-side).
    func refreshTaskTypes() async {
        guard authManager.activeSessionId != nil else { return }
        do {
            userTaskTypes = try await userTaskTypeService.getAll()
        } catch {
            connectionError = error.localizedDescription
        }
    }

    /// (Re)load the active session's endeavors (panel legend + edge colors).
    func refreshEndeavors() async {
        guard authManager.activeSessionId != nil else { return }
        do {
            endeavors = try await endeavorService.getAll()
        } catch {
            connectionError = error.localizedDescription
        }
    }

    /// Create a new endeavor and reload.
    func createEndeavor(name: String, color: String?) async {
        do {
            try await endeavorService.create(name: name, color: color)
            await refreshEndeavors()
        } catch {
            connectionError = error.localizedDescription
        }
    }

    /// Rename / recolor an endeavor and reload.
    func updateEndeavor(id: String, name: String?, color: String?) async {
        do {
            try await endeavorService.update(id: id, name: name, color: color)
            await refreshEndeavors()
        } catch {
            connectionError = error.localizedDescription
        }
    }

    func taskType(for id: String) -> UserTaskType? {
        userTaskTypes.first { $0.id == id }
    }

    /// Create a new task type and reload the type list (so its panel/tray appears).
    func createTaskType(name: String, emoji: String, color: String) async {
        do {
            try await userTaskTypeService.create(name: name, emoji: emoji, color: color)
            userTaskTypes = try await userTaskTypeService.getAll()
        } catch {
            connectionError = error.localizedDescription
        }
    }

    /// Create a new session, make it active, and reload sessions + that session's task types.
    func createSession(name: String) async {
        do {
            let created = try await sessionService.create(name: name)
            _ = try await sessionService.setActive(created.id)
            authManager.setActiveSessionId(created.id)
            sessions = try await sessionService.getAll()
            activeSession = sessions.first { $0.id == created.id }
            userTaskTypes = try await userTaskTypeService.getAll()
        } catch {
            connectionError = error.localizedDescription
        }
    }
}
