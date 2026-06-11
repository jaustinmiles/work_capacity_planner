import SwiftUI

/// Radial task-type picker — the visionOS analog of the Deep Work board's `RadialTypePicker`.
/// Types are arranged evenly on a circle (starting at 12 o'clock); pinch one to assign it. Shown
/// as a sheet right after a node spawns (and reusable to re-type a node). Pure presentation: it
/// reports the chosen type id and dismisses; the view model performs the assignment.
struct SpatialTypeWheel: View {
    let types: [UserTaskType]
    let currentTypeId: String?
    let onSelect: (String) -> Void
    @Environment(\.dismiss) private var dismiss

    /// Circle radius scales with how many types there are (mirrors RadialTypePicker's tiers).
    private var radius: CGFloat {
        switch types.count {
        case 0...4: 90
        case 5...8: 110
        default: 130
        }
    }

    var body: some View {
        NavigationStack {
            Group {
                if types.isEmpty {
                    ContentUnavailableView(
                        "No Task Types",
                        systemImage: "circle.grid.cross",
                        description: Text("Create a task type from the tray first.")
                    )
                } else {
                    ZStack {
                        ForEach(Array(types.enumerated()), id: \.element.id) { index, type in
                            let pos = position(index: index, count: types.count)
                            typeButton(type)
                                .offset(x: pos.x, y: pos.y)
                        }
                        Image(systemName: "hand.point.up.left.fill")
                            .font(.system(size: 20))
                            .foregroundStyle(.secondary)
                    }
                    .frame(width: radius * 2 + 80, height: radius * 2 + 80)
                }
            }
            .navigationTitle("Choose Type")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
            }
        }
        .frame(minWidth: radius * 2 + 140, minHeight: radius * 2 + 200)
    }

    private func typeButton(_ type: UserTaskType) -> some View {
        Button {
            onSelect(type.id)
            dismiss()
        } label: {
            Text(type.emoji)
                .font(.system(size: 24))
                .frame(width: 58, height: 58)
                .background(type.swiftUIColor.opacity(0.85), in: Circle())
                .overlay(
                    Circle().strokeBorder(.white, lineWidth: type.id == currentTypeId ? 3 : 0)
                )
        }
        .buttonStyle(.plain)
        .hoverEffect()
        .help(type.name)
    }

    /// Even angular placement around the circle, starting at 12 o'clock (matches RadialTypePicker).
    private func position(index: Int, count: Int) -> CGPoint {
        let angle = (2 * Double.pi * Double(index)) / Double(count) - Double.pi / 2
        return CGPoint(x: cos(angle) * radius, y: sin(angle) * radius)
    }
}
