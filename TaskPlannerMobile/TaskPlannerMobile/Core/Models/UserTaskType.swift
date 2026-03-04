import Foundation
import SwiftUI

struct UserTaskType: Codable, Identifiable {
    let id: String
    var sessionId: String
    var name: String
    var emoji: String
    var color: String           // hex "#RRGGBB"
    var sortOrder: Int
    var createdAt: Date
    var updatedAt: Date

    /// SwiftUI Color from hex string
    var swiftUIColor: Color {
        Color(hex: color)
    }
}
