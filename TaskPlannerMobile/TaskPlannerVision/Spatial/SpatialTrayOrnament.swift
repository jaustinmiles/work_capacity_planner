import SwiftUI

/// Dismissable tray ornament for the spatial workspace: the BACKLOG (tasks not in the active
/// sprint — tap one to pull it into its type tray) plus a "New Task Type" action. The voice AI
/// chat lives in its own window (the split chosen for the port), opened elsewhere.
struct BacklogTrayView: View {
    let viewModel: SpatialSceneViewModel
    @State private var showCreateType = false

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Backlog")
                .font(.headline)

            if viewModel.backlogTasks.isEmpty {
                Text("Nothing in the backlog — everything is in the sprint.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            } else {
                ScrollView {
                    VStack(alignment: .leading, spacing: 6) {
                        ForEach(viewModel.backlogTasks) { task in
                            Button {
                                Task { await viewModel.addToSprint(taskId: task.id) }
                            } label: {
                                HStack(spacing: 8) {
                                    Text(viewModel.type(id: task.type)?.emoji ?? "📌")
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
                .frame(maxHeight: 260)
            }

            Divider()

            Button {
                showCreateType = true
            } label: {
                Label("New Task Type", systemImage: "paintpalette.fill")
            }
        }
        .padding(20)
        .frame(width: 300)
        .glassBackgroundEffect()
        .sheet(isPresented: $showCreateType) {
            CreateTypeView { name, emoji, hex in
                Task { await viewModel.createTaskType(name: name, emoji: emoji, color: hex) }
            }
        }
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

