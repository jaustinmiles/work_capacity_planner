import AppIntents
import Foundation

/// Quick-capture a task from Siri / Spotlight / the Action Button / Shortcuts — WITHOUT opening the
/// app. This is the App Intent foundation the broader capture surfaces build on (interactive widget,
/// Control Center control, Share extension — all reuse this one intent). See
/// .claude/rules/ios-development-guidelines.md §4.
struct CaptureTaskIntent: AppIntent {
    static var title: LocalizedStringResource = "Add Task"
    static var description = IntentDescription("Quickly capture a task in TaskPlanner.")

    @Parameter(title: "Task", requestValueDialog: "What do you want to capture?")
    var taskName: String

    func perform() async throws -> some IntentResult & ProvidesDialog {
        let trimmed = taskName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { throw CaptureError.emptyTask }

        // App-target intents run in the app's process, so they share the Keychain credentials.
        let auth = AuthManager()
        guard auth.isFullyConfigured else { throw CaptureError.notConfigured }

        let client = TRPCClient(authManager: auth)
        let types = try await UserTaskTypeService(client: client).getAll()
        guard let defaultType = types.first else { throw CaptureError.noTaskTypes }

        _ = try await TaskService(client: client).create(CreateTaskInput(
            name: trimmed,
            duration: 30,
            importance: 5,
            urgency: 5,
            type: defaultType.id
        ))

        return .result(dialog: "Added “\(trimmed)” to TaskPlanner.")
    }
}

enum CaptureError: Error, CustomLocalizedStringResourceConvertible {
    case emptyTask
    case notConfigured
    case noTaskTypes

    var localizedStringResource: LocalizedStringResource {
        switch self {
        case .emptyTask: "The task can't be empty."
        case .notConfigured: "Open TaskPlanner and sign in first, then try again."
        case .noTaskTypes: "Set up at least one task type in TaskPlanner first."
        }
    }
}

/// Exposes the capture intent to Siri / Spotlight / the Action Button. One provider per app.
struct TaskPlannerShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: CaptureTaskIntent(),
            phrases: [
                "Add a task to \(.applicationName)",
                "Capture a task in \(.applicationName)",
                "New task in \(.applicationName)"
            ],
            shortTitle: "Add Task",
            systemImageName: "plus.circle.fill"
        )
    }
}
