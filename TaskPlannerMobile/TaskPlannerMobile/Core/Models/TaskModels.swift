import Foundation

struct TaskItem: Identifiable {
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

// Custom Codable: `dependencies` can be a JSON string (raw Prisma) or a parsed [String] array (formatted).
// Same for TaskStep.dependsOn.
extension TaskItem: Codable {
    enum CodingKeys: String, CodingKey {
        case id, name, duration, importance, urgency, type, category
        case asyncWaitTime, dependencies, completed, completedAt, actualDuration
        case notes, projectId, deadline, deadlineType, cognitiveComplexity
        case isLocked, lockedStartTime, hasSteps, currentStepId, overallStatus
        case criticalPathDuration, worstCaseDuration, archived, inActiveSprint
        case sessionId, createdAt, updatedAt, steps
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        name = try c.decode(String.self, forKey: .name)
        duration = try c.decode(Int.self, forKey: .duration)
        importance = try c.decode(Int.self, forKey: .importance)
        urgency = try c.decode(Int.self, forKey: .urgency)
        type = try c.decode(String.self, forKey: .type)
        category = try c.decode(String.self, forKey: .category)
        asyncWaitTime = try c.decode(Int.self, forKey: .asyncWaitTime)
        completed = try c.decode(Bool.self, forKey: .completed)
        completedAt = try c.decodeIfPresent(Date.self, forKey: .completedAt)
        actualDuration = try c.decodeIfPresent(Int.self, forKey: .actualDuration)
        notes = try c.decodeIfPresent(String.self, forKey: .notes)
        projectId = try c.decodeIfPresent(String.self, forKey: .projectId)
        deadline = try c.decodeIfPresent(Date.self, forKey: .deadline)
        deadlineType = try c.decodeIfPresent(DeadlineType.self, forKey: .deadlineType)
        cognitiveComplexity = try c.decodeIfPresent(Int.self, forKey: .cognitiveComplexity)
        isLocked = try c.decode(Bool.self, forKey: .isLocked)
        lockedStartTime = try c.decodeIfPresent(Date.self, forKey: .lockedStartTime)
        hasSteps = try c.decode(Bool.self, forKey: .hasSteps)
        currentStepId = try c.decodeIfPresent(String.self, forKey: .currentStepId)
        overallStatus = try c.decode(TaskStatus.self, forKey: .overallStatus)
        criticalPathDuration = try c.decode(Int.self, forKey: .criticalPathDuration)
        worstCaseDuration = try c.decode(Int.self, forKey: .worstCaseDuration)
        archived = try c.decode(Bool.self, forKey: .archived)
        inActiveSprint = try c.decode(Bool.self, forKey: .inActiveSprint)
        sessionId = try c.decodeIfPresent(String.self, forKey: .sessionId)
        createdAt = try c.decode(Date.self, forKey: .createdAt)
        updatedAt = try c.decode(Date.self, forKey: .updatedAt)
        steps = try c.decodeIfPresent([TaskStep].self, forKey: .steps)

        // `dependencies` can be a JSON string (raw Prisma) or [String] (formatted by formatTask)
        dependencies = Self.decodeStringArray(from: c, forKey: .dependencies)
    }

    /// Decode a field that may be either a JSON-encoded string or a native array
    static func decodeStringArray(from container: KeyedDecodingContainer<CodingKeys>, forKey key: CodingKeys) -> [String] {
        // Try array first (formatted response)
        if let arr = try? container.decode([String].self, forKey: key) {
            return arr
        }
        // Fall back to JSON string (raw Prisma)
        if let str = try? container.decode(String.self, forKey: key),
           let data = str.data(using: .utf8),
           let arr = try? JSONDecoder().decode([String].self, from: data) {
            return arr
        }
        return []
    }
}

struct TaskStep: Identifiable {
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

// Custom Codable: `dependsOn` can be a JSON string (raw Prisma) or [String] (formatted)
extension TaskStep: Codable {
    enum CodingKeys: String, CodingKey {
        case id, name, duration, type, taskId, dependsOn, asyncWaitTime
        case status, stepIndex, percentComplete, actualDuration
        case startedAt, completedAt, notes, cognitiveComplexity
        case isAsyncTrigger, expectedResponseTime, importance, urgency
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        name = try c.decode(String.self, forKey: .name)
        duration = try c.decode(Int.self, forKey: .duration)
        type = try c.decode(String.self, forKey: .type)
        taskId = try c.decode(String.self, forKey: .taskId)
        asyncWaitTime = try c.decode(Int.self, forKey: .asyncWaitTime)
        status = try c.decode(StepStatus.self, forKey: .status)
        stepIndex = try c.decode(Int.self, forKey: .stepIndex)
        percentComplete = try c.decode(Int.self, forKey: .percentComplete)
        actualDuration = try c.decodeIfPresent(Int.self, forKey: .actualDuration)
        startedAt = try c.decodeIfPresent(Date.self, forKey: .startedAt)
        completedAt = try c.decodeIfPresent(Date.self, forKey: .completedAt)
        notes = try c.decodeIfPresent(String.self, forKey: .notes)
        cognitiveComplexity = try c.decodeIfPresent(Int.self, forKey: .cognitiveComplexity)
        isAsyncTrigger = try c.decode(Bool.self, forKey: .isAsyncTrigger)
        expectedResponseTime = try c.decodeIfPresent(Int.self, forKey: .expectedResponseTime)
        importance = try c.decodeIfPresent(Int.self, forKey: .importance)
        urgency = try c.decodeIfPresent(Int.self, forKey: .urgency)

        // `dependsOn` can be a JSON string (raw Prisma) or [String] (formatted)
        if let arr = try? c.decode([String].self, forKey: .dependsOn) {
            dependsOn = arr
        } else if let str = try? c.decode(String.self, forKey: .dependsOn),
                  let data = str.data(using: .utf8),
                  let arr = try? JSONDecoder().decode([String].self, from: data) {
            dependsOn = arr
        } else {
            dependsOn = []
        }
    }
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
