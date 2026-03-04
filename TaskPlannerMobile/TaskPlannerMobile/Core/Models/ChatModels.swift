import Foundation

struct Conversation: Codable, Identifiable {
    let id: String
    var sessionId: String
    var jobContextId: String?
    var title: String
    var createdAt: Date
    var updatedAt: Date
    var isArchived: Bool
    var messageCount: Int?
}

struct ChatMessage: Codable, Identifiable {
    let id: String
    var conversationId: String
    var role: ChatMessageRole
    var content: String
    var amendments: [AmendmentCard]?
    var createdAt: Date
}

struct AmendmentCard: Codable, Identifiable {
    let id: String
    var status: AmendmentCardStatus
    var preview: AmendmentPreview
    // The full amendment data is complex and varies by type;
    // for now we keep it as raw JSON for display purposes
    var amendment: AnyCodable?
}

struct AmendmentPreview: Codable {
    var title: String
    var description: String
    var targetView: String?
}

// MARK: - Chat Input Types

struct SendMessageInput: Codable {
    let conversationId: String
    let content: String
}

struct CreateConversationInput: Codable {
    var title: String?
    var jobContextId: String?
}

// MARK: - AI Input Types

struct AICallInput: Codable {
    let message: String
    var conversationId: String?
    var jobContextId: String?
}

// MARK: - AnyCodable for flexible JSON

/// A type-erased Codable wrapper for arbitrary JSON values
struct AnyCodable: Codable {
    let value: Any

    init(_ value: Any) {
        self.value = value
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() {
            value = NSNull()
        } else if let bool = try? container.decode(Bool.self) {
            value = bool
        } else if let int = try? container.decode(Int.self) {
            value = int
        } else if let double = try? container.decode(Double.self) {
            value = double
        } else if let string = try? container.decode(String.self) {
            value = string
        } else if let array = try? container.decode([AnyCodable].self) {
            value = array.map(\.value)
        } else if let dict = try? container.decode([String: AnyCodable].self) {
            value = dict.mapValues(\.value)
        } else {
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "Unsupported type")
        }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch value {
        case is NSNull:
            try container.encodeNil()
        case let bool as Bool:
            try container.encode(bool)
        case let int as Int:
            try container.encode(int)
        case let double as Double:
            try container.encode(double)
        case let string as String:
            try container.encode(string)
        case let array as [Any]:
            try container.encode(array.map { AnyCodable($0) })
        case let dict as [String: Any]:
            try container.encode(dict.mapValues { AnyCodable($0) })
        default:
            throw EncodingError.invalidValue(value, .init(codingPath: [], debugDescription: "Unsupported type"))
        }
    }
}
