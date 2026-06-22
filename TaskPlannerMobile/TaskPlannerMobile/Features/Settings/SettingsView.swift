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

                    NavigationLink {
                        ServerConfigView()
                    } label: {
                        Label("Edit Server & API Key", systemImage: "key.horizontal")
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

/// Edit the server URL + API key. Both are read dynamically by TRPCClient (baseURL + auth headers),
/// so saving takes effect on the next request — no relaunch needed.
struct ServerConfigView: View {
    @Environment(AppState.self) private var appState
    @Environment(\.dismiss) private var dismiss
    @State private var serverURL: String = ""
    @State private var apiKey: String = ""
    @State private var showInvalidURL = false

    private var trimmedURL: String { serverURL.trimmingCharacters(in: .whitespacesAndNewlines) }

    var body: some View {
        Form {
            Section {
                TextField("https://tasks.example.com", text: $serverURL)
                    .textContentType(.URL)
                    .keyboardType(.URL)
                    .autocorrectionDisabled()
                    .textInputAutocapitalization(.never)
                    .onChange(of: serverURL) { showInvalidURL = false }
            } header: {
                Text("Server URL")
            } footer: {
                if showInvalidURL {
                    Label("Enter a full URL including the scheme, e.g. https://tasks.left-brain.co",
                          systemImage: "exclamationmark.triangle.fill")
                        .foregroundStyle(.orange)
                }
            }

            Section("Authentication") {
                SecureField("API Key", text: $apiKey)
                    .textContentType(.password)
                    .autocorrectionDisabled()
                    .textInputAutocapitalization(.never)
            }

            Section {
                Button("Save", action: save)
                    .disabled(trimmedURL.isEmpty)
            }
        }
        .navigationTitle("Server & API Key")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear {
            serverURL = appState.authManager.serverURL.absoluteString
            apiKey = appState.authManager.apiKey ?? ""
        }
    }

    private func save() {
        // Require a real, schemed URL — TRPCClient appends paths to it, so a bare host would break requests.
        guard let url = URL(string: trimmedURL), url.scheme != nil, url.host != nil else {
            showInvalidURL = true
            return
        }
        appState.authManager.setServerURL(url)
        let key = apiKey.trimmingCharacters(in: .whitespacesAndNewlines)
        if !key.isEmpty {
            appState.authManager.setAPIKey(key)
        }
        dismiss()
    }
}
