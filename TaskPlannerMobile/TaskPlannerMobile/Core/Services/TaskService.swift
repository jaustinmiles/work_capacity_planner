import Foundation

/// Service for task and workflow operations
final class TaskService {
    private let client: TRPCClient

    init(client: TRPCClient) {
        self.client = client
    }

    // MARK: - Queries

    /// Fetch all tasks for the active session
    func getAll(includeArchived: Bool = false) async throws -> [TaskItem] {
        try await client.query("task.getAll", input: GetAllTasksInput(includeArchived: includeArchived))
    }

    /// Get a specific task by ID, including steps if it's a workflow
    func getById(_ id: String) async throws -> TaskItem {
        try await client.query("task.getById", input: IDInput(id: id))
    }

    /// Get tasks with upcoming deadlines
    func getWithDeadlines() async throws -> [TaskItem] {
        let allTasks: [TaskItem] = try await getAll()
        return allTasks
            .filter { $0.deadline != nil && !$0.completed }
            .sorted { ($0.deadline ?? .distantFuture) < ($1.deadline ?? .distantFuture) }
    }

    /// Get sprint tasks (inActiveSprint = true)
    func getSprintTasks() async throws -> [TaskItem] {
        let allTasks: [TaskItem] = try await getAll()
        return allTasks.filter { $0.inActiveSprint && !$0.completed }
    }

    /// Get the next scheduled item from the server-side scheduler
    func getNextScheduled(skipIndex: Int = 0) async throws -> NextScheduledItem? {
        try await client.query(
            "task.getNextScheduled",
            input: GetNextScheduledInput(skipIndex: skipIndex)
        )
    }

    // MARK: - Mutations

    /// Create a new task
    func create(_ input: CreateTaskInput) async throws -> TaskItem {
        try await client.mutate("task.create", input: input)
    }

    /// Update an existing task
    func update(_ input: UpdateTaskInput) async throws -> TaskItem {
        try await client.mutate("task.update", input: input)
    }

    /// Mark a task as completed
    func complete(id: String, actualDuration: Int? = nil) async throws -> TaskItem {
        try await client.mutate("task.update", input: UpdateTaskInput(
            id: id,
            completed: true,
            overallStatus: TaskStatus.completed.rawValue
        ))
    }

    /// Archive a task
    func archive(id: String) async throws -> TaskItem {
        try await client.mutate("task.update", input: UpdateTaskInput(
            id: id,
            archived: true
        ))
    }

    /// Toggle sprint membership
    func setSprintMembership(id: String, inSprint: Bool) async throws -> TaskItem {
        try await client.mutate("task.update", input: UpdateTaskInput(
            id: id,
            inActiveSprint: inSprint
        ))
    }

    // MARK: - Workflow Step Operations

    /// Complete a workflow step
    func completeStep(taskId: String, stepId: String, actualMinutes: Int? = nil) async throws -> TaskItem {
        try await client.mutate("workflow.completeStep", input: CompleteStepInput(
            taskId: taskId,
            stepId: stepId,
            actualMinutes: actualMinutes
        ))
    }

    /// Start a workflow step
    func startStep(taskId: String, stepId: String) async throws -> TaskItem {
        try await client.mutate("workflow.startStep", input: StartStepInput(
            taskId: taskId,
            stepId: stepId
        ))
    }
}

// MARK: - Input Types

private struct GetAllTasksInput: Codable {
    let includeArchived: Bool
}

private struct GetNextScheduledInput: Codable {
    let skipIndex: Int
}

private struct CompleteStepInput: Codable {
    let taskId: String
    let stepId: String
    var actualMinutes: Int?
}

private struct StartStepInput: Codable {
    let taskId: String
    let stepId: String
}
