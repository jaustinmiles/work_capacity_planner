import SwiftUI

/// Minimal onboarding for the visionOS app: enter the server URL + API key, then pick a
/// session. The iOS app's richer Settings/Onboarding views live in `Features/` (iOS-only),
/// so the spatial target carries its own compact setup.
struct SpatialSetupView: View {
    @Bindable var root: SpatialRoot

    @State private var serverURLString: String = ""
    @State private var apiKey: String = ""
    @State private var isWorking = false

    var body: some View {
        VStack(spacing: 24) {
            Text("Connect to Task Planner")
                .font(.largeTitle.bold())

            if !root.isConfigured {
                credentialsForm
            } else {
                sessionPicker
            }

            if let error = root.connectionError {
                Text(error)
                    .font(.callout)
                    .foregroundStyle(.red)
                    .multilineTextAlignment(.center)
            }
        }
        .padding(40)
        .frame(maxWidth: 560)
        .onAppear {
            serverURLString = root.authManager.serverURL.absoluteString
        }
    }

    private var credentialsForm: some View {
        VStack(spacing: 16) {
            TextField("Server URL", text: $serverURLString)
                .textFieldStyle(.roundedBorder)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()

            SecureField("API Key", text: $apiKey)
                .textFieldStyle(.roundedBorder)

            Button {
                connect()
            } label: {
                Text(isWorking ? "Connecting…" : "Connect")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .disabled(apiKey.isEmpty || isWorking)
        }
    }

    private var sessionPicker: some View {
        VStack(spacing: 16) {
            Text("Choose a session")
                .font(.title2)

            if root.sessions.isEmpty {
                ProgressView()
            } else {
                ForEach(root.sessions) { session in
                    Button {
                        Task { await root.selectSession(session) }
                    } label: {
                        HStack {
                            Text(session.name)
                            Spacer()
                            if session.isActive { Image(systemName: "checkmark.circle.fill") }
                        }
                        .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.bordered)
                }
            }
        }
        .task {
            if root.sessions.isEmpty { await root.loadInitialData() }
        }
    }

    private func connect() {
        guard let url = URL(string: serverURLString) else {
            root.connectionError = "Invalid server URL"
            return
        }
        isWorking = true
        root.authManager.setServerURL(url)
        root.authManager.setAPIKey(apiKey)
        Task {
            await root.loadInitialData()
            isWorking = false
        }
    }
}
