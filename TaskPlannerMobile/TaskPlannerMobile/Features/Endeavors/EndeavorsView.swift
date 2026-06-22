import SwiftUI

/// Identity-based equality so endeavors can drive value-based navigation (zoom transition).
extension Endeavor: Hashable {
    static func == (lhs: Endeavor, rhs: Endeavor) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }
}

/// Endeavors tab — browse the session's endeavors (color-coded) and drill into one to work on its
/// next task. Endeavors are authored on desktop/Vision Pro; iOS is for inspecting + executing them.
struct EndeavorsView: View {
    @Environment(AppState.self) private var appState
    @State private var viewModel = EndeavorsViewModel()
    @Namespace private var zoom

    var body: some View {
        NavigationStack {
            Group {
                if viewModel.endeavors.isEmpty && !viewModel.isLoading {
                    ContentUnavailableView {
                        Label("No endeavors", systemImage: "square.stack.3d.up")
                    } description: {
                        Text("Create endeavors on desktop or Vision Pro to group related work, then track them here.")
                    }
                } else {
                    List(viewModel.endeavors) { endeavor in
                        NavigationLink(value: endeavor) {
                            EndeavorRow(endeavor: endeavor)
                        }
                        .matchedTransitionSource(id: endeavor.id, in: zoom)
                    }
                }
            }
            .navigationTitle("Endeavors")
            .navigationDestination(for: Endeavor.self) { endeavor in
                EndeavorDetailView(endeavor: endeavor)
                    .navigationTransition(.zoom(sourceID: endeavor.id, in: zoom))
            }
            .overlay {
                if viewModel.isLoading && viewModel.endeavors.isEmpty { ProgressView() }
            }
            .refreshable { await viewModel.load() }
            .task {
                viewModel.configure(with: appState)
                await viewModel.load()
            }
        }
    }
}

/// A single endeavor row: color swatch (the legend), name, and task-completion progress.
struct EndeavorRow: View {
    let endeavor: Endeavor

    private var items: [EndeavorItemWithTask] { endeavor.items ?? [] }
    private var completed: Int { items.filter { $0.task.completed }.count }
    private var progress: Double { items.isEmpty ? 0 : Double(completed) / Double(items.count) }

    var body: some View {
        HStack(spacing: DS.Space.md) {
            Circle()
                .fill(endeavor.swiftUIColor)
                .frame(width: 12, height: 12)

            VStack(alignment: .leading, spacing: DS.Space.xs) {
                Text(endeavor.name)
                    .font(.body.weight(.medium))
                    .lineLimit(1)
                if !items.isEmpty {
                    HStack(spacing: DS.Space.sm) {
                        ProgressView(value: progress)
                            .tint(endeavor.swiftUIColor)
                            .frame(width: 80)
                        Text("\(completed)/\(items.count)")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
            }
            Spacer()
        }
        .padding(.vertical, DS.Space.xs)
    }
}
