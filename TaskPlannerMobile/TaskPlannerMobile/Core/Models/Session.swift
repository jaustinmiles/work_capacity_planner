import Foundation

struct Session: Codable, Identifiable {
    let id: String
    var name: String
    var description: String?
    var isActive: Bool
    var createdAt: Date
    var updatedAt: Date
}
