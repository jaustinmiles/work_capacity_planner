import SwiftUI

/// Shows today's work capacity progress — logged vs. planned by type.
struct TodayProgressCard: View {
    let accumulatedTime: AccumulatedTimeByDate?
    let totalPlannedMinutes: Int
    let currentBlock: WorkBlock?
    let nextBlock: WorkBlock?
    let taskTypes: [UserTaskType]

    var body: some View {
        VStack(spacing: 12) {
            // Header with overall progress
            HStack {
                Text("Today's Progress")
                    .font(.subheadline)
                    .fontWeight(.semibold)

                Spacer()

                let logged = accumulatedTime?.totalMinutes ?? 0
                Text("\(DurationLabel.format(minutes: logged)) / \(DurationLabel.format(minutes: totalPlannedMinutes))")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            // Overall progress bar
            if totalPlannedMinutes > 0 {
                let progress = Double(accumulatedTime?.totalMinutes ?? 0) / Double(totalPlannedMinutes)
                GeometryReader { geo in
                    ZStack(alignment: .leading) {
                        RoundedRectangle(cornerRadius: 6)
                            .fill(.gray.opacity(0.15))
                        RoundedRectangle(cornerRadius: 6)
                            .fill(.blue)
                            .frame(width: geo.size.width * min(1.0, progress))
                    }
                }
                .frame(height: 8)
            }

            // Per-type breakdown
            if let byType = accumulatedTime?.byType, !byType.isEmpty {
                VStack(spacing: 6) {
                    ForEach(sortedTypeEntries(byType), id: \.typeId) { entry in
                        HStack(spacing: 8) {
                            // Type indicator
                            if let tt = taskTypes.first(where: { $0.id == entry.typeId }) {
                                Text(tt.emoji)
                                    .font(.caption)
                                Text(tt.name)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            } else {
                                Text(entry.typeId.prefix(8))
                                    .font(.caption2)
                                    .foregroundStyle(.secondary)
                            }

                            Spacer()

                            Text(DurationLabel.format(minutes: entry.minutes))
                                .font(.caption)
                                .fontWeight(.medium)
                                .monospacedDigit()
                        }
                    }
                }
            }

            // Current / Next block info
            Divider()

            HStack(spacing: 16) {
                // Current block
                VStack(alignment: .leading, spacing: 2) {
                    Text("Current Block")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                    if let block = currentBlock {
                        Text("\(block.startTime) - \(block.endTime)")
                            .font(.caption)
                            .fontWeight(.medium)
                    } else {
                        Text("None")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }

                Spacer()

                // Next block
                VStack(alignment: .trailing, spacing: 2) {
                    Text("Next Block")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                    if let block = nextBlock {
                        Text("\(block.startTime) - \(block.endTime)")
                            .font(.caption)
                            .fontWeight(.medium)
                    } else {
                        Text("Done for today")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
            }
        }
        .padding()
        .background(.ultraThinMaterial)
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    private func sortedTypeEntries(_ byType: [String: Int]) -> [TypeEntry] {
        byType.map { TypeEntry(typeId: $0.key, minutes: $0.value) }
            .sorted { $0.minutes > $1.minutes }
    }
}

private struct TypeEntry {
    let typeId: String
    let minutes: Int
}
