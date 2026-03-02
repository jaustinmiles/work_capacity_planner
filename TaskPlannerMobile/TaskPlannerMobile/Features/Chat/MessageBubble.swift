import SwiftUI

/// A single chat message bubble with optional amendment cards
struct MessageBubble: View {
    let message: ChatMessage
    let onApplyAmendment: (AmendmentCard) -> Void
    let onSkipAmendment: (AmendmentCard) -> Void

    var body: some View {
        VStack(alignment: message.role == .user ? .trailing : .leading, spacing: 8) {
            // Message bubble
            HStack {
                if message.role == .user { Spacer(minLength: 40) }

                VStack(alignment: .leading, spacing: 4) {
                    Text(message.content)
                        .font(.subheadline)
                        .foregroundStyle(message.role == .user ? .white : .primary)
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .background(
                    message.role == .user
                        ? AnyShapeStyle(.blue)
                        : AnyShapeStyle(.gray.opacity(0.15))
                )
                .clipShape(RoundedRectangle(cornerRadius: 16))

                if message.role != .user { Spacer(minLength: 40) }
            }

            // Amendment cards
            if let amendments = message.amendments, !amendments.isEmpty {
                VStack(spacing: 8) {
                    ForEach(amendments) { amendment in
                        AmendmentCardView(
                            card: amendment,
                            onApply: { onApplyAmendment(amendment) },
                            onSkip: { onSkipAmendment(amendment) }
                        )
                    }
                }
            }
        }
    }
}

/// Displays an amendment card with apply/skip actions
struct AmendmentCardView: View {
    let card: AmendmentCard
    let onApply: () -> Void
    let onSkip: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            // Header
            HStack {
                Image(systemName: "wand.and.stars")
                    .foregroundStyle(.purple)
                    .font(.caption)
                Text(card.preview.title)
                    .font(.subheadline)
                    .fontWeight(.semibold)
                Spacer()
                amendmentStatusBadge
            }

            // Description
            Text(card.preview.description)
                .font(.caption)
                .foregroundStyle(.secondary)

            // Action buttons (only for pending)
            if card.status == .pending {
                HStack(spacing: 8) {
                    Button {
                        onApply()
                    } label: {
                        Label("Apply", systemImage: "checkmark")
                            .font(.caption)
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.purple)
                    .controlSize(.small)

                    Button {
                        onSkip()
                    } label: {
                        Label("Skip", systemImage: "forward.fill")
                            .font(.caption)
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.bordered)
                    .controlSize(.small)
                }
            }
        }
        .padding(12)
        .background(.purple.opacity(0.05))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(.purple.opacity(0.2), lineWidth: 1)
        )
    }

    @ViewBuilder
    private var amendmentStatusBadge: some View {
        switch card.status {
        case .applied:
            Label("Applied", systemImage: "checkmark.circle.fill")
                .font(.caption2)
                .foregroundStyle(.green)
        case .skipped:
            Label("Skipped", systemImage: "forward.fill")
                .font(.caption2)
                .foregroundStyle(.secondary)
        case .pending:
            EmptyView()
        }
    }
}
