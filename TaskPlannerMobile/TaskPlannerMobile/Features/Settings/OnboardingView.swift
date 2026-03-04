import SwiftUI

/// First-launch onboarding: enter server URL and API key
struct OnboardingView: View {
    @Environment(AppState.self) private var appState
    @State private var serverURL = "https://tasks.left-brain.co"
    @State private var apiKey = ""
    @State private var isConnecting = false
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            VStack(spacing: 32) {
                Spacer()

                // Hero
                VStack(spacing: 12) {
                    Image(systemName: "checkmark.circle.trianglebadge.exclamationmark")
                        .font(.system(size: 64))
                        .foregroundStyle(.blue)
                    Text("Task Planner")
                        .font(.largeTitle)
                        .fontWeight(.bold)
                    Text("Connect to your server to get started")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }

                // Form
                VStack(spacing: 16) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Server URL")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        TextField("https://tasks.left-brain.co", text: $serverURL)
                            .textFieldStyle(.roundedBorder)
                            .textContentType(.URL)
                            .keyboardType(.URL)
                            .autocorrectionDisabled()
                            .textInputAutocapitalization(.never)
                    }

                    VStack(alignment: .leading, spacing: 6) {
                        Text("API Key")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        SecureField("Enter your API key", text: $apiKey)
                            .textFieldStyle(.roundedBorder)
                            .textContentType(.password)
                    }
                }
                .padding(.horizontal)

                if let error = errorMessage {
                    Text(error)
                        .font(.caption)
                        .foregroundStyle(.red)
                        .padding(.horizontal)
                }

                // Connect button
                Button {
                    Task { await connect() }
                } label: {
                    if isConnecting {
                        ProgressView()
                            .frame(maxWidth: .infinity)
                    } else {
                        Text("Connect")
                            .frame(maxWidth: .infinity)
                    }
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
                .disabled(apiKey.isEmpty || isConnecting)
                .padding(.horizontal)

                Spacer()
                Spacer()
            }
            .navigationBarTitleDisplayMode(.inline)
        }
    }

    private func connect() async {
        isConnecting = true
        errorMessage = nil

        // Validate URL
        guard let url = URL(string: serverURL) else {
            errorMessage = "Invalid server URL"
            isConnecting = false
            return
        }

        // Save credentials
        appState.authManager.setServerURL(url)
        appState.authManager.setAPIKey(apiKey)

        // Test connection
        let connected = await appState.checkConnection()
        if connected {
            // Load initial data (sessions, task types)
            await appState.loadInitialData()
            if let error = appState.connectionError {
                errorMessage = error
            }
        } else {
            errorMessage = appState.connectionError ?? "Cannot connect to server"
        }

        isConnecting = false
    }
}
