import SwiftUI
import UIKit

/// Semantic colors for the spatial scene. Per-task-type colors come from
/// `UserTaskType.swiftUIColor`; everything that is NOT type-derived (notes, selection, edges)
/// is centralized here so the SwiftUI cards and the RealityKit edge meshes draw from one palette
/// instead of scattered `.yellow` / `.systemTeal` / `.systemOrange` literals.
enum SpatialColor {
    /// SwiftUI tints (cards).
    static let noteAccent = Color.yellow
    static let selection = Color.accentColor

    /// RealityKit edge colors (`UIColor` for `UnlitMaterial`).
    static let dependencyEdge = UIColor.systemTeal
    static let crossLinkEdge = UIColor.systemOrange
    /// The transient rubber-band edge drawn while dragging from a port.
    static let pendingEdge = UIColor.systemGreen

    /// SwiftUI accent for a workflow step's lifecycle status. Drives the step-node status badge so
    /// completed/in-progress/waiting/skipped read at a glance (the canonical type color stays the
    /// card's identity tint). `nil` for `pending` — a todo step keeps its plain type-tinted look.
    static func stepStatus(_ status: StepStatus) -> Color? {
        switch status {
        case .completed: return .green
        case .inProgress: return .blue
        case .waiting: return .orange
        case .skipped: return .secondary
        case .pending: return nil
        }
    }
}

extension Color {
    /// #RRGGBB hex string (the server's `color` format; alpha dropped). Used by the create/edit
    /// forms for task types and endeavors.
    func toHexString() -> String {
        let ui = UIColor(self)
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        ui.getRed(&r, green: &g, blue: &b, alpha: &a)
        let clamp = { (v: CGFloat) -> Int in min(max(Int((v * 255).rounded()), 0), 255) }
        return String(format: "#%02X%02X%02X", clamp(r), clamp(g), clamp(b))
    }
}
