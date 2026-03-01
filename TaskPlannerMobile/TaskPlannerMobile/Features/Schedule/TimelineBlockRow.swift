import SwiftUI

/// A single work block in the schedule timeline
struct TimelineBlockRow: View {
    let block: WorkBlock
    let sessions: [WorkSession]
    let taskTypes: [UserTaskType]
    let isCurrentBlock: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            // Block header
            HStack {
                // Time range
                Text("\(block.startTime) - \(block.endTime)")
                    .font(.subheadline)
                    .fontWeight(.semibold)

                if isCurrentBlock {
                    Text("NOW")
                        .font(.caption2)
                        .fontWeight(.bold)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(.blue)
                        .foregroundStyle(.white)
                        .clipShape(Capsule())
                }

                Spacer()

                // Capacity
                if let capacity = block.totalCapacity {
                    Text(DurationLabel.format(minutes: capacity))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }

            // Type config info
            if let config = block.parsedTypeConfig {
                HStack(spacing: 6) {
                    switch config.kind {
                    case .single:
                        if let typeId = config.typeId,
                           let tt = taskTypes.first(where: { $0.id == typeId }) {
                            TypeBadge(taskType: tt, showName: true)
                        }
                    case .combo:
                        if let allocations = config.allocations {
                            ForEach(allocations, id: \.typeId) { alloc in
                                if let tt = taskTypes.first(where: { $0.id == alloc.typeId }) {
                                    HStack(spacing: 2) {
                                        Text(tt.emoji)
                                            .font(.caption2)
                                        Text("\(Int(alloc.ratio * 100))%")
                                            .font(.caption2)
                                            .foregroundStyle(.secondary)
                                    }
                                }
                            }
                        }
                    case .system:
                        Text(config.systemType?.capitalized ?? "System")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
            }

            // Logged sessions in this block
            if !sessions.isEmpty {
                VStack(spacing: 4) {
                    ForEach(sessions) { session in
                        HStack(spacing: 6) {
                            Circle()
                                .fill(.green)
                                .frame(width: 6, height: 6)
                            Text(session.Task?.name ?? "Work session")
                                .font(.caption)
                                .lineLimit(1)
                            Spacer()
                            if let minutes = session.actualMinutes {
                                Text(DurationLabel.format(minutes: minutes))
                                    .font(.caption2)
                                    .foregroundStyle(.secondary)
                            } else if session.isActive {
                                Text("Active")
                                    .font(.caption2)
                                    .foregroundStyle(.blue)
                            }
                        }
                    }
                }
                .padding(.leading, 4)
            }
        }
        .padding()
        .background(isCurrentBlock ? .blue.opacity(0.08) : .gray.opacity(0.05))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(isCurrentBlock ? .blue.opacity(0.3) : .clear, lineWidth: 1)
        )
    }
}
