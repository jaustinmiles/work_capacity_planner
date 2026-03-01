import Foundation

// MARK: - Work Pattern & Blocks

struct WorkPattern: Codable, Identifiable {
    let id: String
    var date: String            // "YYYY-MM-DD"
    var isTemplate: Bool
    var templateName: String?
    var sessionId: String
    var blocks: [WorkBlock]?
    var meetings: [WorkMeeting]?
    var createdAt: Date
    var updatedAt: Date

    // Server returns blocks and meetings under different key names
    enum CodingKeys: String, CodingKey {
        case id, date, isTemplate, templateName, sessionId, createdAt, updatedAt
        case blocks = "WorkBlock"
        case meetings = "WorkMeeting"
    }
}

struct WorkBlock: Codable, Identifiable {
    let id: String
    var startTime: String       // "HH:MM"
    var endTime: String         // "HH:MM"
    var typeConfig: String      // JSON string of BlockTypeConfig
    var totalCapacity: Int?

    /// Parse the typeConfig JSON into a structured config
    var parsedTypeConfig: BlockTypeConfig? {
        guard let data = typeConfig.data(using: .utf8) else { return nil }
        return try? JSONDecoder().decode(BlockTypeConfig.self, from: data)
    }
}

struct BlockTypeConfig: Codable {
    let kind: BlockConfigKind
    var typeId: String?                 // For "single" kind
    var allocations: [TypeAllocation]?  // For "combo" kind
    var systemType: String?             // For "system" kind ("blocked" | "sleep")
}

struct TypeAllocation: Codable {
    let typeId: String
    let ratio: Double
}

struct WorkMeeting: Codable, Identifiable {
    let id: String
    var name: String
    var startTime: String       // "HH:MM"
    var endTime: String         // "HH:MM"
    var type: String
    var recurring: String?
    var daysOfWeek: String?
}

// MARK: - Work Session (Time Tracking)

struct WorkSession: Codable, Identifiable {
    let id: String
    var taskId: String
    var stepId: String?
    var patternId: String?
    var blockId: String?
    var startTime: Date
    var endTime: Date?
    var plannedMinutes: Int
    var actualMinutes: Int?
    var notes: String?
    var createdAt: Date

    // Included relations from server
    var Task: TaskItem?
    var WorkBlock: WorkBlock?

    /// Whether this session is currently active (no end time)
    var isActive: Bool { endTime == nil }

    /// Elapsed time from start until now (or end time if completed)
    var elapsedSeconds: TimeInterval {
        let end = endTime ?? Date()
        return end.timeIntervalSince(startTime)
    }

    /// Elapsed minutes
    var elapsedMinutes: Int {
        Int(elapsedSeconds / 60)
    }
}

// MARK: - Work Session Input Types

struct CreateWorkSessionInput: Codable {
    let taskId: String
    var stepId: String?
    let startTime: Date
    var endTime: Date?
    var plannedMinutes: Int = 0
    var actualMinutes: Int?
    var notes: String?
    var blockId: String?
    var patternId: String?
}

struct EndWorkSessionInput: Codable {
    let id: String
    let actualMinutes: Int
}

// MARK: - Accumulated Time

struct AccumulatedTimeByDate: Codable {
    let byType: [String: Int]
    let totalMinutes: Int
}
