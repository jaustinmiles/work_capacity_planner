import SwiftUI

/// Voice-first AI chat window — drives the Electron brainstorm agent (server-side tool execution),
/// shows streaming replies, live tool activity, and Apply/Skip cards for proposed writes. When the
/// agent finishes after making changes, the volume reloads so new tasks/workflows appear.
struct SpatialChatView: View {
    @Environment(SpatialRoot.self) private var root
    @State private var model: SpatialChatModel?

    var body: some View {
        Group {
            if let model {
                ChatBody(model: model)
            } else {
                ProgressView()
            }
        }
        .onAppear { if model == nil { model = SpatialChatModel(root: root) } }
        .onDisappear { model?.cancelVoice() }   // stop the mic if the window closes mid-dictation
        .navigationTitle("Assistant")
    }
}

private struct ChatBody: View {
    @Bindable var model: SpatialChatModel

    var body: some View {
        VStack(spacing: 0) {
            transcript
            Divider()
            composer
        }
        .frame(minWidth: 440, minHeight: 540)
    }

    private var transcript: some View {
        ScrollViewReader { proxy in
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    if model.messages.isEmpty && model.streamingText.isEmpty {
                        ContentUnavailableView(
                            "Plan by voice",
                            systemImage: "waveform.and.mic",
                            description: Text("Tap the mic and describe what you want — the assistant can create tasks, build workflows, and manage your sprint.")
                        )
                        .padding(.top, 40)
                    }
                    ForEach(model.messages) { MessageRow(line: $0) }
                    if !model.streamingText.isEmpty {
                        MessageRow(line: ChatLine(role: .assistant, text: model.streamingText))
                    }
                    if let status = model.toolStatus {
                        Label(status, systemImage: "gearshape.2.fill")
                            .font(.caption).foregroundStyle(.secondary)
                    }
                    ForEach(model.pendingActions) { action in
                        ProposedActionRow(
                            action: action,
                            onApply: { model.approve(action.id) },
                            onSkip: { model.reject(action.id) }
                        )
                    }
                    if let warn = model.noToolWarning {
                        Label(warn, systemImage: "exclamationmark.triangle.fill")
                            .font(.caption).foregroundStyle(.orange)
                    }
                    if let err = model.errorMessage {
                        Label(err, systemImage: "xmark.octagon.fill")
                            .font(.caption).foregroundStyle(.red)
                    }
                    Color.clear.frame(height: 1).id(bottomAnchor)
                }
                .padding()
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .onChange(of: model.streamingText) { _, _ in proxy.scrollTo(bottomAnchor, anchor: .bottom) }
            .onChange(of: model.messages.count) { _, _ in proxy.scrollTo(bottomAnchor, anchor: .bottom) }
        }
    }

    private let bottomAnchor = "chat-bottom"

    private var composer: some View {
        HStack(spacing: 10) {
            Button {
                model.toggleVoice()
            } label: {
                Image(systemName: model.isRecording ? "mic.fill" : "mic")
                    .font(.title3)
                    .foregroundStyle(model.isRecording ? .red : .primary)
            }
            .help("Dictate")

            TextField("Ask the assistant…", text: $model.input, axis: .vertical)
                .lineLimit(1...4)
                .textFieldStyle(.roundedBorder)
                .onSubmit { model.send() }

            Toggle("Auto", isOn: $model.autoApprove)
                .toggleStyle(.button)
                .help("Auto-approve proposed actions")

            Button {
                model.send()
            } label: {
                Image(systemName: "arrow.up.circle.fill").font(.title)
            }
            .disabled(model.input.isEmpty || model.isStreaming)
        }
        .padding()
    }
}

private struct MessageRow: View {
    let line: ChatLine

    var body: some View {
        HStack {
            if line.role == .user { Spacer(minLength: 48) }
            Text(line.text)
                .padding(10)
                .background(
                    line.role == .user ? Color.accentColor.opacity(0.25) : Color.secondary.opacity(0.15),
                    in: RoundedRectangle(cornerRadius: 14)
                )
            if line.role == .assistant { Spacer(minLength: 48) }
        }
    }
}

private struct ProposedActionRow: View {
    let action: PendingAction
    let onApply: () -> Void
    let onSkip: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Label(action.title, systemImage: "wand.and.stars").font(.headline)
            if !action.description.isEmpty {
                Text(action.description).font(.callout).foregroundStyle(.secondary)
            }
            HStack {
                Button("Skip", role: .cancel, action: onSkip)
                Button("Apply", action: onApply).buttonStyle(.borderedProminent)
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 14))
    }
}
