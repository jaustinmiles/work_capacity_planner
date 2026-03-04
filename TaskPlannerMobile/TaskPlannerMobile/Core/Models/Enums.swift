import Foundation

// MARK: - Task & Workflow Enums

enum TaskStatus: String, Codable, CaseIterable {
    case notStarted = "not_started"
    case inProgress = "in_progress"
    case waiting = "waiting"
    case completed = "completed"
}

enum StepStatus: String, Codable, CaseIterable {
    case pending = "pending"
    case inProgress = "in_progress"
    case waiting = "waiting"
    case completed = "completed"
    case skipped = "skipped"
}

enum DeadlineType: String, Codable {
    case hard = "hard"
    case soft = "soft"
}

enum EndeavorStatus: String, Codable, CaseIterable {
    case active = "active"
    case completed = "completed"
    case paused = "paused"
    case archived = "archived"
}

// MARK: - Work Pattern Enums

enum MeetingType: String, Codable {
    case meeting = "meeting"
    case breakTime = "break"
    case personal = "personal"
    case blocked = "blocked"
}

enum BlockConfigKind: String, Codable {
    case single = "single"
    case combo = "combo"
    case system = "system"
}

// MARK: - Chat Enums

enum ChatMessageRole: String, Codable {
    case user = "user"
    case assistant = "assistant"
    case system = "system"
}

enum AmendmentCardStatus: String, Codable {
    case pending = "pending"
    case applied = "applied"
    case skipped = "skipped"
}

// MARK: - Scheduler Enums

enum NextScheduledItemType: String, Codable {
    case task = "task"
    case step = "step"
}
