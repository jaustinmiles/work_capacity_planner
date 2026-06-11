import Foundation

/// Which surface a task belongs to in the spatial workspace. The single source of truth for the
/// partition the scene + ornaments depend on — so "what's done", "what's in the backlog", and
/// "what materializes in the volume" can never disagree (they were four hand-rolled, drifting
/// filters before). Pure + `nonisolated` (primitive flags only) so it unit-tests in `SpatialKit`.
public enum SpatialTaskBucket: Equatable, Sendable {
    /// Archived — never shown anywhere in the scene or its trays.
    case hidden
    /// Completed (and not archived) — lives in the Done tray, removed from the live scene.
    case done
    /// Not in the active sprint and not done — offered in the Backlog tray.
    case backlog
    /// Active-sprint standalone task — materializes as a node in its type tray.
    case sprintTask
    /// Active-sprint workflow (has steps) — materializes as a collapsed volume card.
    case sprintWorkflow
}

public enum SpatialTaskClassifier {
    /// Classify a task from its canonical lifecycle flags. Precedence is deliberate:
    /// archived hides it outright; completion wins over sprint membership (a finished task leaves
    /// the live scene for the Done tray even if it's still flagged `inActiveSprint`).
    public static func bucket(
        completed: Bool,
        archived: Bool,
        inActiveSprint: Bool,
        hasSteps: Bool
    ) -> SpatialTaskBucket {
        if archived { return .hidden }
        if completed { return .done }
        if !inActiveSprint { return .backlog }
        return hasSteps ? .sprintWorkflow : .sprintTask
    }
}
