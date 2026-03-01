import Foundation
import SwiftUI

/// ViewModel for the Chat tab — manages conversations, messages, and AI interactions.
@Observable
final class ChatViewModel {
    var conversations: [Conversation] = []
    var activeConversationId: String?
    var messages: [ChatMessage] = []
    var inputText = ""

    var isLoadingConversations = false
    var isSending = false
    var isTranscribing = false
    var errorMessage: String?

    private var appState: AppState?

    func configure(with appState: AppState) {
        self.appState = appState
    }

    // MARK: - Conversation Management

    func loadConversations() async {
        guard let appState else { return }
        isLoadingConversations = true

        do {
            conversations = try await appState.conversationService.getAll()

            // If we have an active conversation, load its messages
            if let activeId = activeConversationId {
                await loadMessages(for: activeId)
            }
        } catch {
            errorMessage = error.localizedDescription
        }

        isLoadingConversations = false
    }

    func loadMessages(for conversationId: String) async {
        guard let appState else { return }

        do {
            let result = try await appState.conversationService.getById(conversationId)
            messages = result.messages
            activeConversationId = conversationId
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func createNewConversation() async {
        guard let appState else { return }

        do {
            let conversation = try await appState.conversationService.create(title: "Mobile Chat")
            conversations.insert(conversation, at: 0)
            activeConversationId = conversation.id
            messages = []
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    // MARK: - Sending Messages

    func sendMessage() async {
        guard let appState else { return }
        let text = inputText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }

        isSending = true
        inputText = ""
        errorMessage = nil

        // Create conversation if needed
        if activeConversationId == nil {
            await createNewConversation()
        }

        guard let conversationId = activeConversationId else {
            isSending = false
            return
        }

        do {
            // Add user message locally for immediate display
            let userMessage = ChatMessage(
                id: UUID().uuidString,
                conversationId: conversationId,
                role: .user,
                content: text,
                amendments: nil,
                createdAt: Date()
            )
            messages.append(userMessage)

            // Call AI
            let response = try await appState.conversationService.callAI(
                message: text,
                conversationId: conversationId
            )

            // Add assistant response
            let assistantMessage = ChatMessage(
                id: UUID().uuidString,
                conversationId: conversationId,
                role: .assistant,
                content: response.response,
                amendments: response.amendments,
                createdAt: Date()
            )
            messages.append(assistantMessage)

            let generator = UIImpactFeedbackGenerator(style: .light)
            generator.impactOccurred()
        } catch {
            errorMessage = error.localizedDescription
        }

        isSending = false
    }

    // MARK: - Voice Input

    func transcribeAudio(base64Data: String) async {
        guard let appState else { return }
        isTranscribing = true

        do {
            let result = try await appState.conversationService.transcribeAudio(base64Audio: base64Data)
            inputText = result.text
        } catch {
            errorMessage = error.localizedDescription
        }

        isTranscribing = false
    }

    // MARK: - Amendment Actions

    func applyAmendment(_ amendment: AmendmentCard, in messageId: String) async {
        // Amendments are applied through the AI system on the server.
        // For now, mark as applied locally. Full implementation would
        // call the amendment application endpoint.
        if let msgIndex = messages.firstIndex(where: { $0.id == messageId }),
           var amendments = messages[msgIndex].amendments,
           let amendIndex = amendments.firstIndex(where: { $0.id == amendment.id }) {
            amendments[amendIndex] = AmendmentCard(
                id: amendment.id,
                status: .applied,
                preview: amendment.preview,
                amendment: amendment.amendment
            )
            messages[msgIndex].amendments = amendments

            let generator = UINotificationFeedbackGenerator()
            generator.notificationOccurred(.success)
        }
    }

    func skipAmendment(_ amendment: AmendmentCard, in messageId: String) {
        if let msgIndex = messages.firstIndex(where: { $0.id == messageId }),
           var amendments = messages[msgIndex].amendments,
           let amendIndex = amendments.firstIndex(where: { $0.id == amendment.id }) {
            amendments[amendIndex] = AmendmentCard(
                id: amendment.id,
                status: .skipped,
                preview: amendment.preview,
                amendment: amendment.amendment
            )
            messages[msgIndex].amendments = amendments
        }
    }
}
