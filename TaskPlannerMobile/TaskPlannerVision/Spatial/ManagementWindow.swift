import SwiftUI

/// Companion 2D window: setup/auth, a persistent session switcher (fixes "I couldn't tell
/// or pick my session"), connection status, and a button to open the spatial workspace.
/// Lists/forms are far more reliable as flat SwiftUI than as 3D content.
struct ManagementWindow: View {
    @Bindable var root: SpatialRoot
    @Environment(\.openWindow) private var openWindow
    @State private var showNewSession = false

    var body: some View {
        NavigationStack {
            Group {
                if root.isConfigured {
                    configured
                } else {
                    CredentialsForm(root: root)
                }
            }
            .navigationTitle("Task Planner")
        }
        .frame(minWidth: 380, minHeight: 460)
    }

    private var configured: some View {
        Form {
            Section("Session") {
                if root.sessions.isEmpty {
                    HStack { ProgressView(); Text("Loading sessions…") }
                } else {
                    Picker("Active", selection: sessionSelection) {
                        ForEach(root.sessions) { session in
                            Text(session.name).tag(session.id)
                        }
                    }
                }
                if let active = root.activeSession {
                    LabeledContent("Current", value: active.name)
                }
                Button {
                    showNewSession = true
                } label: {
                    Label("New Session", systemImage: "plus")
                }
            }

            Section("Workspace") {
                Button {
                    openWindow(id: SpatialWindowID.volume)
                } label: {
                    Label("Open Spatial Workspace", systemImage: "cube.transparent")
                }
                .disabled(!root.isFullyConfigured)
            }

            if let error = root.connectionError {
                Section { Text(error).foregroundStyle(.red).font(.callout) }
            }

            Section {
                Button("Sign Out", role: .destructive) {
                    root.authManager.clearAll()
                }
            }
        }
        .task {
            if root.sessions.isEmpty { await root.loadInitialData() }
            if root.isFullyConfigured { openWindow(id: SpatialWindowID.volume) }
        }
        .sheet(isPresented: $showNewSession) {
            NewSessionView { name in
                Task { await root.createSession(name: name) }
            }
        }
    }

    /// Picker binding that switches the active session on change.
    private var sessionSelection: Binding<String> {
        Binding(
            get: { root.activeSession?.id ?? root.sessions.first?.id ?? "" },
            set: { id in
                guard let session = root.sessions.first(where: { $0.id == id }) else { return }
                Task { await root.selectSession(session) }
            }
        )
    }
}

/// Compact credentials entry (server URL + API key), then loads sessions.
private struct CredentialsForm: View {
    @Bindable var root: SpatialRoot
    @State private var serverURLString = ""
    @State private var apiKey = ""
    @State private var isWorking = false

    var body: some View {
        Form {
            Section("Connect to Task Planner") {
                TextField("Server URL", text: $serverURLString)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                SecureField("API Key", text: $apiKey)
            }
            Section {
                Button(isWorking ? "Connecting…" : "Connect") { connect() }
                    .disabled(apiKey.isEmpty || isWorking)
            }
            if let error = root.connectionError {
                Section { Text(error).foregroundStyle(.red).font(.callout) }
            }
        }
        .onAppear { serverURLString = root.authManager.serverURL.absoluteString }
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

/// Sheet to create + activate a new session in-app.
private struct NewSessionView: View {
    let onCreate: (String) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""

    var body: some View {
        NavigationStack {
            Form {
                TextField("Session name", text: $name)
                    .autocorrectionDisabled()
            }
            .navigationTitle("New Session")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Create") { onCreate(name); dismiss() }.disabled(name.isEmpty)
                }
            }
        }
        .frame(minWidth: 360, minHeight: 200)
    }
}
