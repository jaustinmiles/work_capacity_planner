import Foundation
import Observation

/// A line in the chat transcript.
struct ChatLine: Identifiable {
    enum Role { case user, assistant }
    let id = UUID()
    let role: Role
    var text: String
}

/// A proposed write action awaiting the user's Apply / Skip.
struct PendingAction: Identifiable {
    let id: String          // proposalId
    let title: String
    let description: String
}

/// Drives the voice-first AI chat: streams the brainstorm agent, surfaces tool activity + proposed
/// actions, relays approvals, and asks the volume to reload when the agent changed data.
@MainActor
@Observable
final class SpatialChatModel {
    private let root: SpatialRoot
    private let dictator = SpeechDictator()

    var messages: [ChatLine] = []
    var streamingText = ""
    var toolStatus: String?
    var pendingActions: [PendingAction] = []
    var noToolWarning: String?
    var autoApprove = false
    var isStreaming = false
    var isRecording = false
    var errorMessage: String?
    var input = ""

    private var conversationId: String?

    init(root: SpatialRoot) { self.root = root }

    func send() {
        let text = input.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, !isStreaming else { return }
        input = ""
        if isRecording { dictator.stop() }
        messages.append(ChatLine(role: .user, text: text))
        Task { await run(userMessage: text) }
    }

    private func run(userMessage: String) async {
        isStreaming = true
        streamingText = ""
        noToolWarning = nil
        errorMessage = nil
        defer { isStreaming = false; toolStatus = nil }
        do {
            let convId = try await ensureConversation()
            for try await event in root.agentStream.stream(userMessage: userMessage, conversationId: convId) {
                handle(event)
            }
            if !streamingText.isEmpty {
                messages.append(ChatLine(role: .assistant, text: streamingText))
                streamingText = ""
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func handle(_ event: AgentEvent) {
        switch event {
        case .textDelta(let delta):
            streamingText += delta
        case .toolStatus(let label):
            toolStatus = label
        case .proposedAction(let id, let title, let description):
            if autoApprove {
                Task { try? await root.agentService.approve(proposalId: id) }
            } else {
                pendingActions.append(PendingAction(id: id, title: title, description: description))
            }
        case .actionResult(let id, _, let err):
            pendingActions.removeAll { $0.id == id }
            if let err { errorMessage = err }
        case .noToolWarning(let reasoning):
            noToolWarning = reasoning
        case .done(let toolCallCount):
            toolStatus = nil
            // The agent executed writes server-side — reload the volume so they appear.
            if toolCallCount > 0 { root.requestSceneReload() }
        case .error(let message):
            errorMessage = message
        }
    }

    func approve(_ id: String) {
        pendingActions.removeAll { $0.id == id }
        Task { try? await root.agentService.approve(proposalId: id) }
    }

    func reject(_ id: String) {
        pendingActions.removeAll { $0.id == id }
        Task { try? await root.agentService.reject(proposalId: id) }
    }

    /// Tear down dictation if active (e.g. when the chat window disappears) so the mic + audio session
    /// don't stay live after the UI is gone.
    func cancelVoice() {
        if isRecording { dictator.stop() }
        isRecording = false
    }

    func toggleVoice() {
        if isRecording {
            dictator.stop()
            isRecording = false
        } else {
            isRecording = true
            dictator.start(
                onText: { [weak self] text in self?.input = text },
                onError: { [weak self] err in self?.errorMessage = err },
                onFinish: { [weak self] in self?.isRecording = false }
            )
        }
    }

    private func ensureConversation() async throws -> String {
        if let id = conversationId { return id }
        let conversation = try await root.conversationService.create(title: "Spatial Brainstorm")
        conversationId = conversation.id
        return conversation.id
    }
}
