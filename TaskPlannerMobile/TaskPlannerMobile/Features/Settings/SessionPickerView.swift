import SwiftUI

/// Session selection screen — shown during onboarding or from settings
struct SessionPickerView: View {
    @Environment(AppState.self) private var appState
    var isOnboarding: Bool = false

    @State private var isLoading = false
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            List {
                if let error = appState.connectionError {
                    ContentUnavailableView(
                        "Connection Error",
                        systemImage: "wifi.exclamationmark",
                        description: Text(error)
                    )
                } else if appState.sessions.isEmpty && !isLoading {
                    ContentUnavailableView(
                        "No Sessions",
                        systemImage: "tray",
                        description: Text("No sessions found on the server. Create one from the desktop app.")
                    )
                }

                ForEach(appState.sessions) { session in
                    Button {
                        Task { await selectSession(session) }
                    } label: {
                        HStack {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(session.name)
                                    .font(.headline)
                                if let desc = session.description, !desc.isEmpty {
                                    Text(desc)
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                            }

                            Spacer()

                            if session.id == appState.activeSession?.id {
                                Image(systemName: "checkmark.circle.fill")
                                    .foregroundStyle(.blue)
                            } else if session.isActive {
                                Image(systemName: "circle")
                                    .foregroundStyle(.secondary)
                            }
                        }
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }
            .navigationTitle(isOnboarding ? "Choose a Session" : "Sessions")
            .navigationBarTitleDisplayMode(isOnboarding ? .large : .inline)
            .refreshable {
                await appState.loadInitialData()
            }
            .overlay {
                if isLoading {
                    ProgressView()
                }
            }
            .task {
                if appState.sessions.isEmpty {
                    isLoading = true
                    await appState.loadInitialData()
                    isLoading = false
                }
            }
        }
    }

    private func selectSession(_ session: Session) async {
        do {
            try await appState.selectSession(session)
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
