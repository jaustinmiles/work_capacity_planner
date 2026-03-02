import SwiftUI

/// The Chat tab — AI conversation with voice input and amendment cards.
struct ChatView: View {
    @Environment(AppState.self) private var appState
    @State private var viewModel = ChatViewModel()
    @State private var showConversationList = false

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                // Messages
                if viewModel.messages.isEmpty && !viewModel.isSending {
                    emptyState
                } else {
                    messageList
                }

                Divider()

                // Input bar
                inputBar
            }
            .navigationTitle(currentTitle)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button {
                        showConversationList = true
                    } label: {
                        Image(systemName: "list.bullet")
                    }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        Task { await viewModel.createNewConversation() }
                    } label: {
                        Image(systemName: "square.and.pencil")
                    }
                }
            }
            .sheet(isPresented: $showConversationList) {
                ConversationListSheet(
                    conversations: viewModel.conversations,
                    activeId: viewModel.activeConversationId,
                    onSelect: { id in
                        Task { await viewModel.loadMessages(for: id) }
                        showConversationList = false
                    }
                )
                .presentationDetents([.medium, .large])
            }
            .task {
                viewModel.configure(with: appState)
                await viewModel.loadConversations()
            }
        }
    }

    // MARK: - Subviews

    private var currentTitle: String {
        if let id = viewModel.activeConversationId,
           let conv = viewModel.conversations.first(where: { $0.id == id }) {
            return conv.title
        }
        return "Chat"
    }

    private var emptyState: some View {
        VStack(spacing: 16) {
            Spacer()
            Image(systemName: "bubble.left.and.bubble.right")
                .font(.system(size: 48))
                .foregroundStyle(.blue.opacity(0.5))
            Text("Start a Conversation")
                .font(.headline)
            Text("Ask the AI to create tasks, build workflows, or brainstorm your work plan.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)

            // Quick prompts
            VStack(spacing: 8) {
                QuickPromptButton(text: "What should I work on next?") {
                    viewModel.inputText = "What should I work on next?"
                    Task { await viewModel.sendMessage() }
                }
                QuickPromptButton(text: "Create a task for reviewing PRs") {
                    viewModel.inputText = "Create a task for reviewing PRs, 30 minutes, high urgency"
                    Task { await viewModel.sendMessage() }
                }
                QuickPromptButton(text: "Help me plan my afternoon") {
                    viewModel.inputText = "Help me plan my afternoon based on my current tasks and schedule"
                    Task { await viewModel.sendMessage() }
                }
            }
            .padding(.top, 8)
            Spacer()
        }
    }

    private var messageList: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(spacing: 12) {
                    ForEach(viewModel.messages) { message in
                        MessageBubble(
                            message: message,
                            onApplyAmendment: { amendment in
                                Task { await viewModel.applyAmendment(amendment, in: message.id) }
                            },
                            onSkipAmendment: { amendment in
                                viewModel.skipAmendment(amendment, in: message.id)
                            }
                        )
                        .id(message.id)
                    }

                    if viewModel.isSending {
                        HStack {
                            ProgressView()
                                .padding(.horizontal)
                            Spacer()
                        }
                        .id("loading")
                    }
                }
                .padding()
            }
            .onChange(of: viewModel.messages.count) {
                if let lastId = viewModel.messages.last?.id {
                    withAnimation {
                        proxy.scrollTo(lastId, anchor: .bottom)
                    }
                }
            }
        }
    }

    private var inputBar: some View {
        HStack(spacing: 8) {
            // Voice input button
            VoiceInputButton(
                isTranscribing: viewModel.isTranscribing,
                onTranscription: { text in
                    viewModel.inputText = text
                },
                onAudioData: { base64 in
                    Task { await viewModel.transcribeAudio(base64Data: base64) }
                }
            )

            // Text input
            TextField("Message...", text: $viewModel.inputText, axis: .vertical)
                .textFieldStyle(.roundedBorder)
                .lineLimit(1...4)

            // Send button
            Button {
                Task { await viewModel.sendMessage() }
            } label: {
                Image(systemName: "arrow.up.circle.fill")
                    .font(.title2)
            }
            .disabled(viewModel.inputText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || viewModel.isSending)
        }
        .padding(.horizontal)
        .padding(.vertical, 8)
        .background(.ultraThinMaterial)
    }
}

// MARK: - Quick Prompt Button

private struct QuickPromptButton: View {
    let text: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(text)
                .font(.subheadline)
                .padding(.horizontal, 16)
                .padding(.vertical, 10)
                .background(.blue.opacity(0.1))
                .foregroundStyle(.blue)
                .clipShape(Capsule())
        }
    }
}

// MARK: - Conversation List Sheet

private struct ConversationListSheet: View {
    let conversations: [Conversation]
    let activeId: String?
    let onSelect: (String) -> Void

    var body: some View {
        NavigationStack {
            List {
                ForEach(conversations) { conv in
                    Button {
                        onSelect(conv.id)
                    } label: {
                        HStack {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(conv.title)
                                    .font(.subheadline)
                                    .fontWeight(conv.id == activeId ? .semibold : .regular)
                                Text(conv.updatedAt, style: .relative)
                                    .font(.caption2)
                                    .foregroundStyle(.secondary)
                            }
                            Spacer()
                            if conv.id == activeId {
                                Image(systemName: "checkmark")
                                    .foregroundStyle(.blue)
                            }
                        }
                    }
                    .buttonStyle(.plain)
                }
            }
            .navigationTitle("Conversations")
            .navigationBarTitleDisplayMode(.inline)
        }
    }
}
