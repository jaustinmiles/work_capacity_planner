import Foundation
import SwiftUI

struct Endeavor: Codable, Identifiable {
    let id: String
    var name: String
    var description: String?
    var notes: String?
    var status: EndeavorStatus
    var importance: Int
    var urgency: Int
    var deadline: Date?
    var deadlineType: DeadlineType?
    var color: String?
    var sessionId: String
    var createdAt: Date
    var updatedAt: Date
    var items: [EndeavorItemWithTask]?

    /// SwiftUI Color from hex string, defaults to blue
    var swiftUIColor: Color {
        guard let color else { return .blue }
        return Color(hex: color)
    }
}

struct EndeavorItem: Codable, Identifiable {
    let id: String
    var endeavorId: String
    var taskId: String
    var sortOrder: Int
    var addedAt: Date
}

struct EndeavorItemWithTask: Codable, Identifiable {
    let id: String
    var endeavorId: String
    var taskId: String
    var sortOrder: Int
    var addedAt: Date
    var task: TaskItem
}

struct EndeavorProgress: Codable {
    var totalTasks: Int
    var completedTasks: Int
    var inProgressTasks: Int
    var totalDuration: Int
    var completedDuration: Int
    var percentComplete: Double
}
