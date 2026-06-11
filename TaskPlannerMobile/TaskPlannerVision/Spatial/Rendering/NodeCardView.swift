import SwiftUI

/// A task or workflow-step node, rendered through the shared `SpatialCard` glass surface.
/// Content is SwiftUI — never primitive meshes/3D text.
///
/// For step nodes, `status` drives a lifecycle treatment so a workflow's progress reads at a
/// glance: a corner status badge over the type emoji, a status word in the meta row, and (for
/// finished/skipped steps) a struck-through, dimmed title. Standalone task nodes pass `status: nil`
/// and keep their plain look (completed tasks leave the scene for the Done tray, so they never
/// render here as "done").
struct NodeCardView: View {
    let title: String
    let type: UserTaskType?
    let durationMinutes: Int
    let isStep: Bool
    var status: StepStatus? = nil
    var state: InteractionState = .rest

    /// Finished or skipped steps are visually "settled": struck-through + dimmed.
    private var isSettled: Bool { status == .completed || status == .skipped }

    /// SF Symbol + tint for the corner status badge, when the status warrants one.
    private var statusBadge: (symbol: String, tint: Color)? {
        guard let status, let tint = SpatialColor.stepStatus(status) else { return nil }
        switch status {
        case .completed: return ("checkmark.circle.fill", tint)
        case .inProgress: return ("play.circle.fill", tint)
        case .waiting: return ("hourglass.circle.fill", tint)
        case .skipped: return ("minus.circle.fill", tint)
        case .pending: return nil
        }
    }

    /// Short uppercase status word for the meta row (`pending` shows nothing).
    private var statusLabel: String? {
        switch status {
        case .completed: return "DONE"
        case .inProgress: return "IN PROGRESS"
        case .waiting: return "WAITING"
        case .skipped: return "SKIPPED"
        case .pending, .none: return nil
        }
    }

    var body: some View {
        SpatialCard(kind: isStep ? .stepNode : .taskNode,
                    tint: type?.swiftUIColor ?? .gray,
                    state: state) {
            HStack(spacing: 10) {
                ZStack {
                    Circle()
                        .fill((type?.swiftUIColor ?? .gray).opacity(0.9))
                        .frame(width: 34, height: 34)
                    Text(type?.emoji ?? "•")
                        .font(.title3)
                }
                .overlay(alignment: .bottomTrailing) {
                    if let badge = statusBadge {
                        Image(systemName: badge.symbol)
                            .font(.system(size: 16))
                            .foregroundStyle(.white, badge.tint)
                            .background(Circle().fill(.background))
                            .offset(x: 4, y: 4)
                    }
                }
                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .font(.headline)
                        .lineLimit(2)
                        .strikethrough(isSettled, color: .secondary)
                    HStack(spacing: 6) {
                        if isStep {
                            Text("STEP").font(.caption2.bold()).foregroundStyle(.secondary)
                        }
                        if let statusLabel, let tint = status.flatMap(SpatialColor.stepStatus) {
                            Text(statusLabel).font(.caption2.bold()).foregroundStyle(tint)
                        }
                        Text("\(durationMinutes)m")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
                Spacer(minLength: 0)
            }
            // Settled steps recede; reduced-motion users still get the strikethrough + badge cues.
            .opacity(isSettled ? 0.55 : 1)
        }
    }
}
