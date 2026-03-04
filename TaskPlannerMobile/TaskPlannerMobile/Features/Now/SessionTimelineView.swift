import SwiftUI

/// Horizontal timeline showing today's work sessions as colored blocks.
///
/// Each block's width is proportional to the session's duration, and color
/// matches the task type. A red vertical line marks the current time.
struct SessionTimelineView: View {
    let sessions: [WorkSession]
    let taskTypes: [UserTaskType]

    @State private var selectedSession: WorkSession?

    /// Completed sessions only (have an end time)
    private var completedSessions: [WorkSession] {
        sessions
            .filter { $0.endTime != nil }
            .sorted { $0.startTime < $1.startTime }
    }

    /// Active session (no end time)
    private var activeSession: WorkSession? {
        sessions.first { $0.endTime == nil }
    }

    /// Time bounds for the visible range
    private var timeRange: (start: Date, end: Date)? {
        let allSessions = completedSessions + (activeSession.map { [$0] } ?? [])
        guard let earliest = allSessions.map(\.startTime).min() else { return nil }

        // Round down to the nearest hour for clean display
        let calendar = Calendar.current
        let startHour = calendar.dateComponents([.year, .month, .day, .hour], from: earliest)
        let roundedStart = calendar.date(from: startHour) ?? earliest

        // End is current time (or latest end time, whichever is later)
        let latestEnd = completedSessions.compactMap(\.endTime).max() ?? Date()
        let end = max(latestEnd, Date())

        // Round up to the next hour
        var endHour = calendar.dateComponents([.year, .month, .day, .hour], from: end)
        endHour.hour = (endHour.hour ?? 0) + 1
        let roundedEnd = calendar.date(from: endHour) ?? end

        return (roundedStart, roundedEnd)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("Today's Sessions")
                    .font(.subheadline)
                    .fontWeight(.semibold)
                Spacer()
                let totalMinutes = completedSessions.compactMap(\.actualMinutes).reduce(0, +)
                if totalMinutes > 0 {
                    Text(DurationLabel.format(minutes: totalMinutes))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }

            if let range = timeRange {
                timelineContent(range: range)
            } else {
                // Empty state
                VStack(spacing: 8) {
                    Image(systemName: "clock")
                        .font(.title2)
                        .foregroundStyle(.secondary)
                    Text("No work sessions yet today")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 16)
            }

            // Selected session detail
            if let session = selectedSession {
                sessionDetailBanner(session)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .padding()
        .background(.ultraThinMaterial)
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .animation(.easeInOut(duration: 0.2), value: selectedSession?.id)
    }

    // MARK: - Timeline Content

    @ViewBuilder
    private func timelineContent(range: (start: Date, end: Date)) -> some View {
        let span = range.end.timeIntervalSince(range.start)

        VStack(spacing: 4) {
            // Session blocks
            GeometryReader { geo in
                let totalWidth = geo.size.width

                ZStack(alignment: .leading) {
                    // Background track
                    RoundedRectangle(cornerRadius: 6)
                        .fill(.gray.opacity(0.08))

                    // Completed session blocks
                    ForEach(completedSessions, id: \.id) { session in
                        let endTime = session.endTime ?? Date()
                        let xStart = CGFloat(session.startTime.timeIntervalSince(range.start) / span) * totalWidth
                        let xEnd = CGFloat(endTime.timeIntervalSince(range.start) / span) * totalWidth
                        let width = max(4, xEnd - xStart)

                        let taskType = session.Task.flatMap { task in
                            taskTypes.first { $0.id == task.type }
                        }
                        let color = taskType?.swiftUIColor ?? .gray

                        RoundedRectangle(cornerRadius: 4)
                            .fill(color)
                            .frame(width: width, height: 32)
                            .overlay {
                                if width > 30, let emoji = taskType?.emoji {
                                    Text(emoji)
                                        .font(.caption2)
                                }
                            }
                            .offset(x: xStart)
                            .onTapGesture {
                                selectedSession = selectedSession?.id == session.id ? nil : session
                            }
                    }

                    // Active session (pulsing)
                    if let active = activeSession {
                        let xStart = CGFloat(active.startTime.timeIntervalSince(range.start) / span) * totalWidth
                        let xEnd = CGFloat(Date().timeIntervalSince(range.start) / span) * totalWidth
                        let width = max(4, xEnd - xStart)

                        let taskType = active.Task.flatMap { task in
                            taskTypes.first { $0.id == task.type }
                        }
                        let color = taskType?.swiftUIColor ?? .blue

                        RoundedRectangle(cornerRadius: 4)
                            .fill(color.opacity(0.6))
                            .frame(width: width, height: 32)
                            .overlay(
                                RoundedRectangle(cornerRadius: 4)
                                    .stroke(color, lineWidth: 1.5)
                            )
                            .offset(x: xStart)
                    }

                    // Current time indicator
                    let nowX = CGFloat(Date().timeIntervalSince(range.start) / span) * totalWidth
                    if nowX > 0 && nowX < totalWidth {
                        Rectangle()
                            .fill(.red)
                            .frame(width: 1.5, height: 38)
                            .offset(x: nowX)
                    }
                }
            }
            .frame(height: 36)

            // Hour markers
            GeometryReader { geo in
                let totalWidth = geo.size.width
                let hourMarkers = generateHourMarkers(range: range)

                ForEach(hourMarkers, id: \.date) { marker in
                    let x = CGFloat(marker.date.timeIntervalSince(range.start) / span) * totalWidth

                    Text(marker.label)
                        .font(.system(size: 9))
                        .foregroundStyle(.tertiary)
                        .position(x: x, y: 6)
                }
            }
            .frame(height: 14)
        }
    }

    // MARK: - Session Detail Banner

    private func sessionDetailBanner(_ session: WorkSession) -> some View {
        HStack(spacing: 8) {
            if let task = session.Task {
                let taskType = taskTypes.first { $0.id == task.type }
                if let emoji = taskType?.emoji {
                    Text(emoji)
                }
                Text(task.name)
                    .font(.caption)
                    .fontWeight(.medium)
                    .lineLimit(1)
            }
            Spacer()
            if let minutes = session.actualMinutes {
                Text(DurationLabel.format(minutes: minutes))
                    .font(.caption)
                    .monospacedDigit()
                    .foregroundStyle(.secondary)
            }
            Button {
                selectedSession = nil
            } label: {
                Image(systemName: "xmark.circle.fill")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 6)
        .background(.gray.opacity(0.1))
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }

    // MARK: - Hour Markers

    private struct HourMarker {
        let date: Date
        let label: String
    }

    private func generateHourMarkers(range: (start: Date, end: Date)) -> [HourMarker] {
        let calendar = Calendar.current
        let formatter = DateFormatter()
        formatter.dateFormat = "ha"  // "9AM", "12PM"

        var markers: [HourMarker] = []
        var current = range.start

        while current <= range.end {
            markers.append(HourMarker(
                date: current,
                label: formatter.string(from: current).lowercased()
            ))
            current = calendar.date(byAdding: .hour, value: 1, to: current) ?? range.end
        }

        return markers
    }
}
