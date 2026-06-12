import SwiftUI

/// Standalone, user-movable Backlog window. This was a fixed trailing ORNAMENT — feedback:
/// the panel couldn't be moved, and the New Task Type sheet it presented spawned far overhead.
/// A real window can be grabbed and placed anywhere, and its sheets center over it.
///
/// Fetches its OWN task list (each surface fetches what it needs — the data-loading doctrine)
/// and syncs with the volume through `SpatialRoot.sceneReloadToken` in both directions: it
/// reloads when the volume changes data, and bumps the token after its own mutations so the
/// volume materializes new sprint tasks / type panels.
struct BacklogWindowView: View {
    @Environment(SpatialRoot.self) private var root
    @State private var tasks: [TaskItem] = []
    @State private var showCreateType = false
    @State private var isLoading = false

    private var backlogTasks: [TaskItem] {
        tasks
            .filter {
                SpatialTaskClassifier.bucket(
                    completed: $0.completed,
                    archived: $0.archived,
                    inActiveSprint: $0.inActiveSprint,
                    hasSteps: $0.hasSteps
                ) == .backlog
            }
            .sorted { $0.name < $1.name }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("Backlog")
                    .font(.headline)
                Spacer()
                if isLoading { ProgressView().controlSize(.small) }
            }

            if backlogTasks.isEmpty {
                Text("Nothing in the backlog — everything is in the sprint.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer()
            } else {
                ScrollView {
                    VStack(alignment: .leading, spacing: 6) {
                        ForEach(backlogTasks) { task in
                            Button {
                                Task { await addToSprint(task) }
                            } label: {
                                HStack(spacing: 8) {
                                    Text(root.taskType(for: task.type)?.emoji ?? "📌")
                                    Text(task.name).lineLimit(1)
                                    Spacer()
                                    Image(systemName: "plus.circle.fill").foregroundStyle(.tint)
                                }
                                .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                            .hoverEffect()
                        }
                    }
                }
            }

            Divider()

            Button {
                showCreateType = true
            } label: {
                Label("New Task Type", systemImage: "paintpalette.fill")
            }
        }
        .padding(20)
        .frame(minWidth: 300, minHeight: 360)
        .sheet(isPresented: $showCreateType) {
            CreateTypeView { name, emoji, hex in
                Task {
                    await root.createTaskType(name: name, emoji: emoji, color: hex)
                    root.requestSceneReload()   // the volume re-flows so the new type's panel + tray appear
                }
            }
        }
        .task { await load() }
        // Reload when the volume (or the AI agent) changes data — same cross-window channel the chat uses.
        .onChange(of: root.sceneReloadToken) { _, _ in
            Task { await load() }
        }
    }

    private func load() async {
        isLoading = true
        defer { isLoading = false }
        tasks = (try? await root.taskService.getAll()) ?? []
        await root.refreshTaskTypes()
    }

    /// Pull a backlog task into the active sprint; the volume materializes it in its type tray
    /// on the reload the token bump triggers.
    private func addToSprint(_ task: TaskItem) async {
        _ = try? await root.taskService.setSprintMembership(id: task.id, inSprint: true)
        await load()
        root.requestSceneReload()
    }
}

/// Sheet to create a new user task type (name, emoji, color → `userTaskType.create`).
struct CreateTypeView: View {
    let onCreate: (String, String, String) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var emoji = "🗂️"
    @State private var color = Color.blue

    var body: some View {
        NavigationStack {
            Form {
                Section("Name") { TextField("e.g. Deep Work", text: $name) }
                Section("Emoji") { TextField("Emoji", text: $emoji) }
                Section("Color") { ColorPicker("Color", selection: $color, supportsOpacity: false) }
            }
            .navigationTitle("New Task Type")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Create") {
                        onCreate(name, emoji.isEmpty ? "🗂️" : emoji, color.toHexString())
                        dismiss()
                    }
                    .disabled(name.isEmpty)
                }
            }
        }
        .frame(minWidth: 380, minHeight: 320)
    }
}
