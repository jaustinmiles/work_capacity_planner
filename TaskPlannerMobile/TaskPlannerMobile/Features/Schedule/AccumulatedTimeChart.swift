import SwiftUI

/// Bar chart showing accumulated time by task type for the day
struct AccumulatedTimeChart: View {
    let accumulated: AccumulatedTimeByDate
    let taskTypes: [UserTaskType]

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("Time Logged")
                    .font(.subheadline)
                    .fontWeight(.semibold)
                Spacer()
                Text(DurationLabel.format(minutes: accumulated.totalMinutes))
                    .font(.caption)
                    .fontWeight(.medium)
                    .foregroundStyle(.blue)
            }

            // Stacked bar
            if accumulated.totalMinutes > 0 {
                GeometryReader { geo in
                    HStack(spacing: 1) {
                        ForEach(sortedEntries, id: \.typeId) { entry in
                            let fraction = Double(entry.minutes) / Double(accumulated.totalMinutes)
                            let tt = taskTypes.first { $0.id == entry.typeId }
                            RoundedRectangle(cornerRadius: 3)
                                .fill(tt?.swiftUIColor ?? .gray)
                                .frame(width: max(4, geo.size.width * fraction))
                        }
                    }
                }
                .frame(height: 12)
                .clipShape(RoundedRectangle(cornerRadius: 6))
            }

            // Legend
            HStack(spacing: 12) {
                ForEach(sortedEntries, id: \.typeId) { entry in
                    let tt = taskTypes.first { $0.id == entry.typeId }
                    HStack(spacing: 4) {
                        Circle()
                            .fill(tt?.swiftUIColor ?? .gray)
                            .frame(width: 8, height: 8)
                        Text(tt?.emoji ?? "")
                            .font(.caption2)
                        Text(DurationLabel.format(minutes: entry.minutes))
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                }
            }
        }
        .padding()
        .background(.ultraThinMaterial)
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    private var sortedEntries: [(typeId: String, minutes: Int)] {
        accumulated.byType
            .map { (typeId: $0.key, minutes: $0.value) }
            .sorted { $0.minutes > $1.minutes }
    }
}
