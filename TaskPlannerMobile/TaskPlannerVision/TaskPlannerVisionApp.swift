import SwiftUI

/// Window identifiers for the visionOS scenes.
enum SpatialWindowID {
    static let volume = "spatial-volume"
    static let chat = "spatial-chat"
    static let backlog = "spatial-backlog"
}

@main
struct TaskPlannerVisionApp: App {
    /// Shared composition root, owned at the app level so both scenes use one instance.
    @State private var root = SpatialRoot()

    init() {
        // Register custom Components + Systems once, before the volumetric scene is built.
        SpatialSystems.registerAll()
    }

    var body: some Scene {
        // Companion 2D window — the default application scene (required first; a lone
        // volumetric window crashes at launch). Setup/auth, session switcher, controls.
        WindowGroup {
            ManagementWindow(root: root)
                .environment(root)
        }
        .defaultSize(width: 460, height: 560)

        // Volumetric workspace — the 3D scene, opened from the management window.
        WindowGroup(id: SpatialWindowID.volume) {
            SpatialWorkspaceView()
                .environment(root)
        }
        .windowStyle(.volumetric)
        .defaultSize(width: 1.4, height: 1.0, depth: 1.4, in: .meters)
        .volumeWorldAlignment(.gravityAligned)

        // Voice-first AI chat — opened from the workspace toolbar's Assistant button.
        WindowGroup(id: SpatialWindowID.chat) {
            SpatialChatView()
                .environment(root)
        }
        .defaultSize(width: 480, height: 620)

        // Backlog + New Task Type — a user-MOVABLE window (it was a fixed ornament; the user
        // couldn't reposition it and its sheet spawned far overhead). Opened from the toolbar.
        WindowGroup(id: SpatialWindowID.backlog) {
            BacklogWindowView()
                .environment(root)
        }
        .defaultSize(width: 340, height: 540)
    }
}
