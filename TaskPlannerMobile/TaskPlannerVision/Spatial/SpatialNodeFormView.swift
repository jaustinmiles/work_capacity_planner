import SwiftUI

/// Editable properties for a node entity (task or workflow step), mirroring the desktop
/// deep-work detail panel. Presented as a sheet when a node is tapped — kept separate
/// from the 3D graph rendering, per the design.
struct SpatialNodeFormView: View {
    @Bindable var viewModel: SpatialSceneViewModel
    let entity: SpatialEntity
    @Environment(\.dismiss) private var dismiss

    @State private var edits: TaskEdits
    @State private var isSaving = false
    @State private var confirmingDelete = false
    private let isStep: Bool
    private let isWorkflow: Bool

    private var deleteLabel: String {
        isStep ? "Delete Step" : (isWorkflow ? "Delete Workflow" : "Delete Task")
    }

    init(viewModel: SpatialSceneViewModel, entity: SpatialEntity) {
        self.viewModel = viewModel
        self.entity = entity
        self.isWorkflow = entity.kind == .workflowVolume

        // Seed the form from the current task / workflow / step content.
        if let task = viewModel.editableTask(for: entity) {
            _edits = State(initialValue: TaskEdits(
                name: task.name,
                duration: task.duration,
                importance: task.importance,
                urgency: task.urgency,
                type: task.type,
                asyncWaitTime: task.asyncWaitTime,
                cognitiveComplexity: task.cognitiveComplexity,
                notes: task.notes,
                deadline: task.deadline,
                deadlineType: task.deadlineType
            ))
            isStep = false
        } else if let step = viewModel.step(for: entity) {
            _edits = State(initialValue: TaskEdits(
                name: step.name,
                duration: step.duration,
                importance: step.importance ?? 5,
                urgency: step.urgency ?? 5,
                type: step.type,
                asyncWaitTime: step.asyncWaitTime,
                cognitiveComplexity: step.cognitiveComplexity,
                notes: step.notes,
                deadline: nil,
                deadlineType: nil
            ))
            isStep = true
        } else {
            _edits = State(initialValue: TaskEdits(
                name: "", duration: 30, importance: 5, urgency: 5,
                type: "", asyncWaitTime: 0, cognitiveComplexity: nil,
                notes: nil, deadline: nil, deadlineType: nil
            ))
            isStep = false
        }
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Basics") {
                    TextField("Name", text: $edits.name)

                    Picker("Type", selection: $edits.type) {
                        ForEach(viewModel.userTaskTypes) { type in
                            Text("\(type.emoji) \(type.name)").tag(type.id)
                        }
                    }

                    if !isWorkflow {
                        // A workflow's duration is derived from its steps; don't edit it here.
                        Stepper("Duration: \(edits.duration) min", value: $edits.duration, in: 1...480, step: 5)
                    }
                }

                Section("Priority") {
                    Stepper("Importance: \(edits.importance)", value: $edits.importance, in: 1...10)
                    Stepper("Urgency: \(edits.urgency)", value: $edits.urgency, in: 1...10)
                    Picker("Cognitive load", selection: cognitiveBinding) {
                        Text("—").tag(0)
                        ForEach(1...5, id: \.self) { Text("\($0)").tag($0) }
                    }
                }

                Section("Timing") {
                    Stepper("Async wait: \(edits.asyncWaitTime) min", value: $edits.asyncWaitTime, in: 0...1440, step: 5)
                    if !isStep {
                        Toggle("Has deadline", isOn: deadlineToggle)
                        if edits.deadline != nil {
                            DatePicker("Deadline", selection: deadlineBinding)
                            Picker("Deadline type", selection: deadlineTypeBinding) {
                                Text("Soft").tag(DeadlineType.soft)
                                Text("Hard").tag(DeadlineType.hard)
                            }
                        }
                    }
                }

                Section("Notes") {
                    TextField("Notes", text: notesBinding, axis: .vertical)
                        .lineLimit(3...6)
                }

                Section {
                    Button(role: .destructive) {
                        confirmingDelete = true
                    } label: {
                        Label(deleteLabel, systemImage: "trash")
                    }
                    .disabled(isSaving)
                }
            }
            .navigationTitle(isStep ? "Edit Step" : (isWorkflow ? "Edit Workflow" : "Edit Task"))
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(isSaving ? "Saving…" : "Save") { save() }
                        .disabled(isSaving || edits.name.isEmpty)
                }
            }
            .confirmationDialog(deleteLabel, isPresented: $confirmingDelete, titleVisibility: .visible) {
                Button(deleteLabel, role: .destructive) {
                    Task { await viewModel.deleteNode(entity); dismiss() }
                }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text(isStep
                     ? "Remove this step from its workflow."
                     : "This removes it from your board. Archived items can be restored later.")
            }
        }
        .frame(minWidth: 420, minHeight: 540)
    }

    // MARK: - Bindings for optionals

    private var cognitiveBinding: Binding<Int> {
        Binding(
            get: { edits.cognitiveComplexity ?? 0 },
            set: { edits.cognitiveComplexity = $0 == 0 ? nil : $0 }
        )
    }

    private var notesBinding: Binding<String> {
        Binding(get: { edits.notes ?? "" }, set: { edits.notes = $0.isEmpty ? nil : $0 })
    }

    private var deadlineToggle: Binding<Bool> {
        Binding(
            get: { edits.deadline != nil },
            set: { on in
                edits.deadline = on ? Date() : nil
                edits.deadlineType = on ? (edits.deadlineType ?? .soft) : nil
            }
        )
    }

    private var deadlineBinding: Binding<Date> {
        Binding(get: { edits.deadline ?? Date() }, set: { edits.deadline = $0 })
    }

    private var deadlineTypeBinding: Binding<DeadlineType> {
        Binding(get: { edits.deadlineType ?? .soft }, set: { edits.deadlineType = $0 })
    }

    private func save() {
        isSaving = true
        Task {
            await viewModel.saveTaskEdits(for: entity, edits)
            isSaving = false
            dismiss()
        }
    }
}
