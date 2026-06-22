import SwiftUI

/// Endeavors tab — browse endeavors and drill into "work on the next task in this endeavor".
/// Stub shell for Phase 5; the list + detail + per-endeavor next-task land in Phase 8.
struct EndeavorsView: View {
    @Environment(AppState.self) private var appState

    var body: some View {
        NavigationStack {
            ContentUnavailableView {
                Label("Endeavors", systemImage: "square.stack.3d.up")
            } description: {
                Text("Browse your endeavors and start their next task — coming next.")
            }
            .navigationTitle("Endeavors")
        }
    }
}
