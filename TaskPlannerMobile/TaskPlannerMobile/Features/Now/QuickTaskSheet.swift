import SwiftUI

/// Half-sheet for quickly creating a task from the Now tab.
///
/// Optimized for speed: name field auto-focused, type picker as horizontal pills,
/// duration as preset buttons, priority hidden behind a disclosure.
struct QuickTaskSheet: View {
    @Environment(AppState.self) private var appState
    @Environment(\.dismiss) private var dismiss
    @State private var viewModel = QuickTaskViewModel()
    @FocusState private var nameFieldFocused: Bool

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 20) {
                    // Task name
                    TextField("What do you need to do?", text: $viewModel.name)
                        .font(.title3)
                        .focused($nameFieldFocused)
                        .textInputAutocapitalization(.sentences)
                        .autocorrectionDisabled()
                        .submitLabel(.done)

                    // Type picker
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Type")
                            .font(.caption)
                            .foregroundStyle(.secondary)

                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 8) {
                                ForEach(appState.userTaskTypes) { taskType in
                                    TypePill(
                                        taskType: taskType,
                                        isSelected: viewModel.selectedTypeId == taskType.id
                                    )
                                    .onTapGesture {
                                        viewModel.selectedTypeId = taskType.id
                                        UIImpactFeedbackGenerator(style: .light).impactOccurred()
                                    }
                                }
                            }
                        }
                    }

                    // Duration presets
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Duration")
                            .font(.caption)
                            .foregroundStyle(.secondary)

                        HStack(spacing: 8) {
                            ForEach(DurationPreset.allCases) { preset in
                                Button {
                                    viewModel.durationMinutes = preset.minutes
                                } label: {
                                    Text(preset.label)
                                        .font(.subheadline)
                                        .fontWeight(viewModel.durationMinutes == preset.minutes ? .semibold : .regular)
                                        .padding(.horizontal, 12)
                                        .padding(.vertical, 8)
                                        .background(
                                            viewModel.durationMinutes == preset.minutes
                                                ? Color.blue
                                                : Color(.systemGray5)
                                        )
                                        .foregroundStyle(
                                            viewModel.durationMinutes == preset.minutes
                                                ? .white
                                                : .primary
                                        )
                                        .clipShape(RoundedRectangle(cornerRadius: 8))
                                }
                                .buttonStyle(.plain)
                            }
                        }

                        // Custom duration stepper
                        if !DurationPreset.allCases.map(\.minutes).contains(viewModel.durationMinutes) || viewModel.durationMinutes > 120 {
                            Stepper(
                                "\(DurationLabel.format(minutes: viewModel.durationMinutes))",
                                value: $viewModel.durationMinutes,
                                in: 5...480,
                                step: 5
                            )
                            .font(.subheadline)
                        }

                        // "Custom" button to toggle stepper
                        if DurationPreset.allCases.map(\.minutes).contains(viewModel.durationMinutes) {
                            Button {
                                viewModel.durationMinutes = viewModel.durationMinutes + 1 // force non-preset to show stepper
                            } label: {
                                Text("Custom...")
                                    .font(.caption)
                                    .foregroundStyle(.blue)
                            }
                        }
                    }

                    // Priority (collapsible)
                    DisclosureGroup("Priority", isExpanded: $viewModel.showPriority) {
                        VStack(spacing: 12) {
                            HStack {
                                Text("Importance")
                                    .font(.subheadline)
                                Spacer()
                                Text("\(viewModel.importance)")
                                    .font(.subheadline)
                                    .monospacedDigit()
                                    .foregroundStyle(.secondary)
                                Stepper("", value: $viewModel.importance, in: 1...10)
                                    .labelsHidden()
                            }
                            HStack {
                                Text("Urgency")
                                    .font(.subheadline)
                                Spacer()
                                Text("\(viewModel.urgency)")
                                    .font(.subheadline)
                                    .monospacedDigit()
                                    .foregroundStyle(.secondary)
                                Stepper("", value: $viewModel.urgency, in: 1...10)
                                    .labelsHidden()
                            }
                        }
                        .padding(.top, 8)
                    }
                    .font(.subheadline)
                    .foregroundStyle(.secondary)

                    // Error
                    if let error = viewModel.errorMessage {
                        Text(error)
                            .font(.caption)
                            .foregroundStyle(.red)
                    }

                    // Create button
                    Button {
                        Task { await viewModel.createTask() }
                    } label: {
                        if viewModel.isCreating {
                            ProgressView()
                                .frame(maxWidth: .infinity)
                        } else {
                            Text("Create Task")
                                .frame(maxWidth: .infinity)
                        }
                    }
                    .buttonStyle(.borderedProminent)
                    .controlSize(.large)
                    .disabled(!viewModel.canCreate || viewModel.isCreating)
                }
                .padding()
            }
            .navigationTitle("New Task")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
        .task {
            viewModel.configure(with: appState)
            nameFieldFocused = true
        }
        .onChange(of: viewModel.didCreate) {
            if viewModel.didCreate { dismiss() }
        }
    }
}

// MARK: - Type Picker Pill

private struct TypePill: View {
    let taskType: UserTaskType
    let isSelected: Bool

    var body: some View {
        HStack(spacing: 4) {
            Text(taskType.emoji)
                .font(.callout)
            Text(taskType.name)
                .font(.caption)
                .fontWeight(isSelected ? .semibold : .regular)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(
            isSelected
                ? taskType.swiftUIColor.opacity(0.2)
                : Color(.systemGray6)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 10)
                .stroke(isSelected ? taskType.swiftUIColor : .clear, lineWidth: 2)
        )
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }
}

// MARK: - Duration Presets

private enum DurationPreset: Int, CaseIterable, Identifiable {
    case fifteen = 15
    case thirty = 30
    case fortyFive = 45
    case oneHour = 60
    case twoHours = 120

    var id: Int { rawValue }
    var minutes: Int { rawValue }

    var label: String {
        switch self {
        case .fifteen: "15m"
        case .thirty: "30m"
        case .fortyFive: "45m"
        case .oneHour: "1h"
        case .twoHours: "2h"
        }
    }
}
