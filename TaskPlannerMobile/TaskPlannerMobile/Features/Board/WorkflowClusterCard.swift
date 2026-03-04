import SwiftUI

/// A collapsible card representing a workflow from the Deep Work Board.
/// Shows the workflow name, progress, and expandable step list.
struct WorkflowClusterCard: View {
    let cluster: WorkflowCluster
    let taskTypes: [UserTaskType]
    let onStepTap: (TaskStep) -> Void

    @State private var isExpanded = true

    var body: some View {
        VStack(spacing: 0) {
            // Header (always visible)
            Button {
                withAnimation(.easeInOut(duration: 0.2)) {
                    isExpanded.toggle()
                }
            } label: {
                HStack(spacing: 12) {
                    // Progress ring
                    ProgressRing(
                        progress: cluster.progress,
                        lineWidth: 3,
                        size: 28,
                        progressColor: progressColor
                    )

                    // Workflow name & count
                    VStack(alignment: .leading, spacing: 2) {
                        Text(cluster.workflowTask.name)
                            .font(.subheadline)
                            .fontWeight(.semibold)
                            .foregroundStyle(.primary)
                        Text("\(cluster.completedStepCount)/\(cluster.steps.count) steps")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }

                    Spacer()

                    // Duration
                    DurationLabel(minutes: cluster.workflowTask.duration)

                    // Expand chevron
                    Image(systemName: "chevron.right")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .rotationEffect(.degrees(isExpanded ? 90 : 0))
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .padding()

            // Expanded steps
            if isExpanded {
                Divider()
                    .padding(.horizontal)

                VStack(spacing: 0) {
                    ForEach(cluster.steps) { step in
                        StepRow(
                            step: step,
                            taskType: taskTypes.first { $0.id == step.type },
                            onTap: { onStepTap(step) }
                        )

                        if step.id != cluster.steps.last?.id {
                            // Connector line between steps
                            HStack {
                                Rectangle()
                                    .fill(.gray.opacity(0.3))
                                    .frame(width: 1, height: 12)
                                    .padding(.leading, 28)
                                Spacer()
                            }
                        }
                    }
                }
                .padding(.horizontal)
                .padding(.bottom, 12)
            }
        }
        .background(.ultraThinMaterial)
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    private var progressColor: Color {
        if cluster.progress >= 1.0 { return .green }
        if cluster.progress > 0 { return .blue }
        return .gray
    }
}
