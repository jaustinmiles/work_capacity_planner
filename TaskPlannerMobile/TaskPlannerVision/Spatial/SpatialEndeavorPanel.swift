import SwiftUI

/// Dismissable Endeavors panel (leading ornament): the legend + control center for endeavors.
/// Each row is the endeavor's color swatch + name (the swatches ARE the edge-color legend), a
/// "Show in scene" action (pops its members into the volume), and an edit action (rename / recolor).
/// Plus "New Endeavor".
struct EndeavorPanelView: View {
    let viewModel: SpatialSceneViewModel
    @State private var showCreate = false
    @State private var editing: Endeavor?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Endeavors").font(.headline)

            if viewModel.endeavors.isEmpty {
                Text("No endeavors yet. Create one, or link two workflows to start a cluster.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            } else {
                ScrollView {
                    VStack(alignment: .leading, spacing: 8) {
                        ForEach(viewModel.endeavors) { endeavor in
                            HStack(spacing: 10) {
                                Circle()
                                    .fill(endeavor.swiftUIColor)
                                    .frame(width: 16, height: 16)
                                    .overlay(Circle().strokeBorder(.white.opacity(0.6), lineWidth: 1))
                                Text(endeavor.name).lineLimit(1)
                                Spacer()
                                Button {
                                    Task { await viewModel.showEndeavor(endeavor) }
                                } label: {
                                    Image(systemName: "eye")
                                }
                                .buttonStyle(.borderless)
                                .help("Show this endeavor's tasks + links in the scene")
                                Button {
                                    editing = endeavor
                                } label: {
                                    Image(systemName: "pencil")
                                }
                                .buttonStyle(.borderless)
                                .help("Rename / recolor")
                            }
                            .padding(.vertical, 2)
                        }
                    }
                }
                .frame(maxHeight: 280)
            }

            Divider()
            Button {
                showCreate = true
            } label: {
                Label("New Endeavor", systemImage: "plus.circle.fill")
            }
        }
        .padding(20)
        .frame(width: 320)
        .glassBackgroundEffect()
        .sheet(isPresented: $showCreate) {
            EndeavorEditView(title: "New Endeavor", initialName: "", initialColor: .blue) { name, hex in
                Task { await viewModel.createEndeavor(name: name, color: hex) }
            }
        }
        .sheet(item: $editing) { endeavor in
            EndeavorEditView(
                title: "Edit Endeavor",
                initialName: endeavor.name,
                initialColor: endeavor.swiftUIColor
            ) { name, hex in
                Task { await viewModel.updateEndeavor(id: endeavor.id, name: name, color: hex) }
            }
        }
    }
}

/// Create or edit an endeavor: name + color (the color tints its links + the legend swatch).
private struct EndeavorEditView: View {
    let title: String
    let initialName: String
    let initialColor: Color
    let onSave: (String, String) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var name: String
    @State private var color: Color

    init(title: String, initialName: String, initialColor: Color, onSave: @escaping (String, String) -> Void) {
        self.title = title
        self.initialName = initialName
        self.initialColor = initialColor
        self.onSave = onSave
        _name = State(initialValue: initialName)
        _color = State(initialValue: initialColor)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Name") { TextField("Endeavor name", text: $name) }
                Section("Color") { ColorPicker("Color", selection: $color, supportsOpacity: false) }
            }
            .navigationTitle(title)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { onSave(name, color.toHexString()); dismiss() }
                        .disabled(name.isEmpty)
                }
            }
        }
        .frame(minWidth: 380, minHeight: 280)
    }
}
