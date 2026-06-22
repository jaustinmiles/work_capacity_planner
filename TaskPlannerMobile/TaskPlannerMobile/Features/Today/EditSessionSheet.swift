import SwiftUI

/// Edit a single logged work session — adjust its start/end (the duration re-derives) or delete it.
/// A medium-detent sheet; glass is the iOS 26 default (no custom background).
struct EditSessionSheet: View {
    let session: WorkSession
    let taskTypes: [UserTaskType]
    let onSave: (Date, Date) -> Void
    let onDelete: () -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var start: Date
    @State private var end: Date
    @State private var showDeleteConfirm = false

    init(session: WorkSession,
         taskTypes: [UserTaskType],
         onSave: @escaping (Date, Date) -> Void,
         onDelete: @escaping () -> Void) {
        self.session = session
        self.taskTypes = taskTypes
        self.onSave = onSave
        self.onDelete = onDelete
        _start = State(initialValue: session.startTime)
        _end = State(initialValue: session.endTime ?? Date())
    }

    private var durationMinutes: Int { max(0, Int(end.timeIntervalSince(start) / 60)) }
    private var taskType: UserTaskType? { taskTypes.first { $0.id == session.Task?.type } }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    HStack {
                        Text(session.Task?.name ?? "Untitled")
                            .font(.headline)
                        Spacer()
                        if let taskType { TypeBadge(taskType: taskType, showName: true) }
                    }
                }

                Section("Logged time") {
                    DatePicker("Start", selection: $start, displayedComponents: [.hourAndMinute])
                    DatePicker("End", selection: $end, in: start..., displayedComponents: [.hourAndMinute])
                    HStack {
                        Text("Duration")
                        Spacer()
                        Text(DurationLabel.format(minutes: durationMinutes))
                            .monospacedDigit()
                            .foregroundStyle(.secondary)
                            .contentTransition(.numericText())
                            .animation(.snappy, value: durationMinutes)
                    }
                }

                Section {
                    Button(role: .destructive) { showDeleteConfirm = true } label: {
                        Label("Delete this session", systemImage: "trash")
                            .frame(maxWidth: .infinity)
                    }
                }
            }
            .navigationTitle("Edit Session")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { onSave(start, end) }.disabled(durationMinutes == 0)
                }
            }
            .confirmationDialog("Delete this session?", isPresented: $showDeleteConfirm, titleVisibility: .visible) {
                Button("Delete", role: .destructive) { onDelete() }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("This removes the logged time from the task. This can't be undone.")
            }
        }
        .presentationDetents([.medium])
    }
}
