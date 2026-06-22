import SwiftUI

/// Visual encoding for task / step status.
///
/// ADHD-calm rule: status is **never color-only**. Every state carries an SF Symbol + a word + a tint,
/// so it reads correctly under Differentiate Without Color and is parsed faster by glyph than by hue.
/// Mirrors the Vision step-status spectrum for cross-platform consistency.
struct StatusStyle {
    let symbol: String
    let label: String
    let tint: Color

    /// Style for a (possibly workflow) task's overall status.
    static func task(_ status: TaskStatus, completed: Bool) -> StatusStyle {
        if completed || status == .completed {
            return StatusStyle(symbol: "checkmark.circle.fill", label: "Done", tint: .green)
        }
        switch status {
        case .inProgress: return StatusStyle(symbol: "play.circle.fill", label: "In progress", tint: .blue)
        case .waiting:    return StatusStyle(symbol: "hourglass", label: "Waiting", tint: .orange)
        case .notStarted: return StatusStyle(symbol: "circle", label: "Not started", tint: .secondary)
        case .completed:  return StatusStyle(symbol: "checkmark.circle.fill", label: "Done", tint: .green)
        }
    }

    /// Style for an individual workflow step's status.
    static func step(_ status: StepStatus) -> StatusStyle {
        switch status {
        case .pending:    return StatusStyle(symbol: "circle", label: "Pending", tint: .secondary)
        case .inProgress: return StatusStyle(symbol: "play.circle.fill", label: "In progress", tint: .blue)
        case .waiting:    return StatusStyle(symbol: "hourglass", label: "Waiting", tint: .orange)
        case .completed:  return StatusStyle(symbol: "checkmark.circle.fill", label: "Done", tint: .green)
        case .skipped:    return StatusStyle(symbol: "slash.circle", label: "Skipped", tint: .secondary)
        }
    }
}

/// A compact status chip: symbol + word + tint. The canonical "never color-only" status presentation.
struct StatusChip: View {
    let style: StatusStyle
    var body: some View {
        HStack(spacing: DS.Space.xs) {
            Image(systemName: style.symbol)
                .imageScale(.small)
            Text(style.label)
                .font(.caption)
                .fontWeight(.medium)
        }
        .foregroundStyle(style.tint)
        .padding(.horizontal, DS.Space.sm)
        .padding(.vertical, DS.Space.xs)
        .background(style.tint.opacity(0.12), in: Capsule())
    }
}
