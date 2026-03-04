import SwiftUI

/// Displays a duration in minutes as a human-readable label (e.g., "2h 30m")
struct DurationLabel: View {
    let minutes: Int
    var style: Font = .caption
    var color: Color = .secondary

    var body: some View {
        Text(Self.format(minutes: minutes))
            .font(style)
            .foregroundStyle(color)
    }

    /// Format minutes into a readable duration string
    static func format(minutes: Int) -> String {
        if minutes < 1 { return "0m" }
        let hours = minutes / 60
        let mins = minutes % 60
        if hours == 0 { return "\(mins)m" }
        if mins == 0 { return "\(hours)h" }
        return "\(hours)h \(mins)m"
    }
}
