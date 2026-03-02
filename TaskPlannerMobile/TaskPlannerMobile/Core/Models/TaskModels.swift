import Foundation

struct TaskItem: Codable, Identifiable {
    let id: String
    var name: String
    var duration: Int
    var importance: Int
    var urgency: Int
    var type: String
    var category: String
    var asyncWaitTime: Int
    var dependencies: [String]
    var completed: Bool
    var completedAt: Date?
    var actualDuration: Int?
    var notes: String?
    var projectId: String?
    var deadline: Date?
    var deadlineType: DeadlineType?
    var cognitiveComplexity: Int?
    var isLocked: Bool
    var lockedStartTime: Date?
    var hasSteps: Bool
    var currentStepId: String?
    var overallStatus: TaskStatus
    var criticalPathDuration: Int
    var worstCaseDuration: Int
    var archived: Bool
    var inActiveSprint: Bool
    var sessionId: String?
    var createdAt: Date
    var updatedAt: Date
    var steps: [TaskStep]?

    /// Priority score (importance * urgency), higher = more important
    var priorityScore: Int { importance * urgency }

    /// Whether this task is a workflow (has steps)
    var isWorkflow: Bool { hasSteps }

    /// Remaining duration considering logged time
    var remainingDuration: Int {
        guard let actual = actualDuration else { return duration }
        return max(0, duration - actual)
    }
}

struct TaskStep: Codable, Identifiable {
    let id: String
    var name: String
    var duration: Int
    var type: String
    var taskId: String
    var dependsOn: [String]
    var asyncWaitTime: Int
    var status: StepStatus
    var stepIndex: Int
    var percentComplete: Int
    var actualDuration: Int?
    var startedAt: Date?
    var completedAt: Date?
    var notes: String?
    var cognitiveComplexity: Int?
    var isAsyncTrigger: Bool
    var expectedResponseTime: Int?
    var importance: Int?
    var urgency: Int?
}

// MARK: - Next Scheduled Item (from server scheduler)

struct NextScheduledItem: Codable {
    let type: NextScheduledItemType
    let id: String
    var workflowId: String?
    let title: String
    let estimatedDuration: Int
    let scheduledStartTime: Date
    var loggedMinutes: Int
    var workflowName: String?
}

// MARK: - Task Input Types

struct CreateTaskInput: Codable {
    let name: String
    let duration: Int
    let importance: Int
    let urgency: Int
    let type: String
    var category: String = "work"
    var asyncWaitTime: Int = 0
    var dependencies: [String] = []
    var notes: String?
    var deadline: Date?
    var deadlineType: DeadlineType?
    var cognitiveComplexity: Int?
    var hasSteps: Bool = false
    var steps: [CreateStepInput]?
}

struct CreateStepInput: Codable {
    let name: String
    let duration: Int
    let type: String
    var dependsOn: [String] = []
    var asyncWaitTime: Int = 0
    var cognitiveComplexity: Int?
    var isAsyncTrigger: Bool = false
    var expectedResponseTime: Int?
}

struct UpdateTaskInput: Codable {
    let id: String
    var name: String?
    var duration: Int?
    var importance: Int?
    var urgency: Int?
    var type: String?
    var completed: Bool?
    var completedAt: Date?
    var actualDuration: Int?
    var notes: String?
    var deadline: Date?
    var deadlineType: DeadlineType?
    var overallStatus: String?
    var archived: Bool?
    var inActiveSprint: Bool?
}
