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

enum AppTab: Hashable {
    case now, today, endeavors, chat, search
}

struct MainTabView: View {
    @Environment(AppState.self) private var appState
    @State private var selectedTab: AppTab = .now

    var body: some View {
        TabView(selection: $selectedTab) {
            Tab("Now", systemImage: "play.circle.fill", value: AppTab.now) {
                NowView()
            }

            Tab("Today", systemImage: "clock.fill", value: AppTab.today) {
                TodayView()
            }

            Tab("Endeavors", systemImage: "square.stack.3d.up.fill", value: AppTab.endeavors) {
                EndeavorsView()
            }

            Tab("Chat", systemImage: "bubble.left.and.bubble.right.fill", value: AppTab.chat) {
                ChatView()
            }

            Tab(value: AppTab.search, role: .search) {
                SearchView()
            }
        }
        // iOS 26: the floating glass tab bar minimizes while scrolling a long timeline/list...
        .tabBarMinimizeBehavior(.onScrollDown)
        // ...and the persistent running-task pill rides above it as the "what am I doing now" surface.
        .tabViewBottomAccessory {
            CurrentTaskPill()
        }
    }
}
