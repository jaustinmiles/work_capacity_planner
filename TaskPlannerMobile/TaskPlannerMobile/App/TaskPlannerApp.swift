import SwiftUI

@main
struct TaskPlannerApp: App {
    @State private var appState = AppState()

    var body: some Scene {
        WindowGroup {
            Group {
                if appState.authManager.isFullyConfigured {
                    MainTabView()
                } else if appState.authManager.isConfigured {
                    SessionPickerView(isOnboarding: true)
                } else {
                    OnboardingView()
                }
            }
            .environment(appState)
        }
    }
}

// MARK: - Main Tab View

struct MainTabView: View {
    @Environment(AppState.self) private var appState
    @State private var selectedTab = 0

    var body: some View {
        TabView(selection: $selectedTab) {
            Tab("Now", systemImage: "play.circle.fill", value: 0) {
                NowView()
            }

            Tab("Schedule", systemImage: "calendar.day.timeline.left", value: 1) {
                ScheduleView()
            }

            Tab("Board", systemImage: "square.grid.3x3.topleft.filled", value: 2) {
                BoardView()
            }

            Tab("Chat", systemImage: "bubble.left.and.bubble.right.fill", value: 3) {
                ChatView()
            }
        }
        .tint(.blue)
    }
}
