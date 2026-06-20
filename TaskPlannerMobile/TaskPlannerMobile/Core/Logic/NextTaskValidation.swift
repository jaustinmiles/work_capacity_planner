import Foundation

/// Next-task validation — a faithful Swift port of `src/shared/next-task-validation.ts`.
///
/// The server scheduler returns a `NextScheduledItem` derived from a snapshot whose
/// completed/waiting flags can go stale before the user taps Start (a task can be
/// completed on desktop while the phone is pocketed). Always re-validate the cached
/// item against the CURRENT task/step data before starting work. Behavior must stay
/// identical to the TypeScript source — covered by `NextTaskValidationTests`.
enum NextTaskValidation {

    /// True when the scheduled item refers to live task/step data that is startable:
    /// present, not completed/skipped, and not parked on an async wait.
    static func isItemStartable(_ item: NextScheduledItem, tasks: [TaskItem]) -> Bool {
        switch item.type {
        case .step:
            // The step lives inside some workflow's `steps`; find it by id.
            for task in tasks {
                if let step = task.steps?.first(where: { $0.id == item.id }) {
                    return step.status != .completed
                        && step.status != .waiting
                        && step.status != .skipped
                }
            }
            return false

        case .task:
            guard let task = tasks.first(where: { $0.id == item.id }) else { return false }
            return !task.completed
                && task.overallStatus != .completed
                && task.overallStatus != .waiting
        }
    }
}
