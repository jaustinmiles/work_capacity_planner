import SwiftUI

/// Settings screen accessible from the Now tab
struct SettingsView: View {
    @Environment(AppState.self) private var appState
    @Environment(\.dismiss) private var dismiss
    @State private var isCheckingConnection = false
    @State private var connectionStatus: ConnectionStatus?

    var body: some View {
        NavigationStack {
            List {
                // Connection section
                Section("Connection") {
                    LabeledContent("Server") {
                        Text(appState.authManager.serverURL.host ?? "Unknown")
                            .foregroundStyle(.secondary)
                    }

                    LabeledContent("API Key") {
                        if appState.authManager.apiKey != nil {
                            Text("••••••••")
                                .foregroundStyle(.secondary)
                        } else {
                            Text("Not set")
                                .foregroundStyle(.red)
                        }
                    }

                    Button {
                        Task { await checkConnection() }
                    } label: {
                        HStack {
                            Text("Test Connection")
                            Spacer()
                            if isCheckingConnection {
                                ProgressView()
                            } else if let status = connectionStatus {
                                Image(systemName: status == .connected ? "checkmark.circle.fill" : "xmark.circle.fill")
                                    .foregroundStyle(status == .connected ? .green : .red)
                            }
                        }
                    }
                }

                // Session section
                Section("Session") {
                    if let session = appState.activeSession {
                        LabeledContent("Active") {
                            Text(session.name)
                                .foregroundStyle(.secondary)
                        }
                    }

                    NavigationLink("Switch Session") {
                        SessionPickerView()
                    }
                }

                // Task Types section
                if !appState.userTaskTypes.isEmpty {
                    Section("Task Types") {
                        ForEach(appState.userTaskTypes) { taskType in
                            HStack(spacing: 8) {
                                Text(taskType.emoji)
                                Text(taskType.name)
                                Spacer()
                                Circle()
                                    .fill(taskType.swiftUIColor)
                                    .frame(width: 12, height: 12)
                            }
                        }
                    }
                }

                // Danger zone
                Section {
                    Button("Sign Out", role: .destructive) {
                        appState.authManager.clearAll()
                    }
                }
            }
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }

    private func checkConnection() async {
        isCheckingConnection = true
        let connected = await appState.checkConnection()
        connectionStatus = connected ? .connected : .failed
        isCheckingConnection = false

        // Clear status after 3 seconds
        try? await Task.sleep(for: .seconds(3))
        connectionStatus = nil
    }
}

private enum ConnectionStatus {
    case connected, failed
}

struct ServerConfigView: View {
    @Environment(AppState.self) private var appState
    @Environment(\.dismiss) private var dismiss
    @State private var serverURL: String = ""
    @State private var apiKey: String = ""

    var body: some View {
        Form {
            Section("Server") {
                TextField("Server URL", text: $serverURL)
                    .textContentType(.URL)
                    .keyboardType(.URL)
                    .autocorrectionDisabled()
                    .textInputAutocapitalization(.never)
            }

            Section("Authentication") {
                SecureField("API Key", text: $apiKey)
                    .textContentType(.password)
            }

            Section {
                Button("Save") {
                    if let url = URL(string: serverURL) {
                        appState.authManager.setServerURL(url)
                    }
                    if !apiKey.isEmpty {
                        appState.authManager.setAPIKey(apiKey)
                    }
                    dismiss()
                }
                .disabled(serverURL.isEmpty)
            }
        }
        .navigationTitle("Server Config")
        .onAppear {
            serverURL = appState.authManager.serverURL.absoluteString
            apiKey = appState.authManager.apiKey ?? ""
        }
    }
}
