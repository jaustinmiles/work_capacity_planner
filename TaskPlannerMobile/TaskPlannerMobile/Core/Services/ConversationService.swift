import Foundation

/// Service for AI chat and conversation operations
final class ConversationService {
    private let client: TRPCClient

    init(client: TRPCClient) {
        self.client = client
    }

    // MARK: - Conversation CRUD

    /// Get all conversations for the active session
    func getAll() async throws -> [Conversation] {
        try await client.query("conversation.getAll")
    }

    /// Get a specific conversation with messages
    func getById(_ id: String) async throws -> ConversationWithMessages {
        try await client.query("conversation.getById", input: IDInput(id: id))
    }

    /// Create a new conversation
    func create(title: String? = nil, jobContextId: String? = nil) async throws -> Conversation {
        try await client.mutate("conversation.create", input: CreateConversationInput(
            title: title,
            jobContextId: jobContextId
        ))
    }

    /// Delete a conversation
    func delete(id: String) async throws {
        try await client.mutateVoid("conversation.delete", input: IDInput(id: id))
    }

    // MARK: - Messages

    /// Add a message to a conversation
    func addMessage(conversationId: String, role: ChatMessageRole, content: String) async throws -> ChatMessage {
        try await client.mutate("conversation.addMessage", input: AddMessageInput(
            conversationId: conversationId,
            role: role.rawValue,
            content: content
        ))
    }

    // MARK: - AI

    /// Call AI with a message and get a response
    func callAI(message: String, conversationId: String? = nil) async throws -> AIResponse {
        try await client.mutate("ai.callAI", input: AICallInput(
            message: message,
            conversationId: conversationId
        ))
    }

    // MARK: - Speech

    /// Transcribe audio using the server's Whisper endpoint
    func transcribeAudio(base64Audio: String, mimeType: String = "audio/m4a") async throws -> TranscriptionResponse {
        try await client.mutate("speech.transcribeBuffer", input: TranscribeInput(
            audioBuffer: base64Audio,
            mimeType: mimeType
        ))
    }
}

// MARK: - Types

struct ConversationWithMessages: Codable {
    let conversation: Conversation
    let messages: [ChatMessage]
}

struct AIResponse: Codable {
    let response: String
    var amendments: [AmendmentCard]?
    var conversationId: String?
}

struct TranscriptionResponse: Codable {
    let text: String
}

private struct AddMessageInput: Codable {
    let conversationId: String
    let role: String
    let content: String
}

private struct TranscribeInput: Codable {
    let audioBuffer: String
    let mimeType: String
}
