import Foundation
import SwiftUI

/// ViewModel for the Board tab — presents Deep Work Board data as workflow clusters.
///
/// On desktop, the Deep Work Board is a freeform canvas with draggable nodes.
/// On mobile, we present the same data as a list of collapsible workflow cards.
/// Each card shows the workflow's steps in order with status badges.
@Observable
final class BoardViewModel {
    var boards: [DeepWorkBoard] = []
    var selectedBoardId: String?
    var clusters: [WorkflowCluster] = []
    var orphanTasks: [TaskItem] = []

    var isLoading = false
    var errorMessage: String?

    private var appState: AppState?

    func configure(with appState: AppState) {
        self.appState = appState
    }

    // MARK: - Data Loading

    func loadBoards() async {
        guard let appState else { return }
        isLoading = true
        errorMessage = nil

        do {
            boards = try await appState.deepWorkBoardService.getAll()

            // Select the first board if none selected
            if selectedBoardId == nil, let first = boards.first {
                selectedBoardId = first.id
            }

            if let boardId = selectedBoardId {
                await loadBoard(boardId)
            }
        } catch {
            errorMessage = error.localizedDescription
        }

        isLoading = false
    }

    func loadBoard(_ id: String) async {
        guard let appState else { return }

        do {
            let boardWithNodes = try await appState.deepWorkBoardService.getById(id)
            let allTasks = try await appState.taskService.getAll()

            // Build clusters from nodes
            buildClusters(from: boardWithNodes.nodes, allTasks: allTasks)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func selectBoard(_ id: String) async {
        selectedBoardId = id
        await loadBoard(id)
    }

    // MARK: - Cluster Building

    /// Groups board nodes into workflow clusters and orphan tasks
    private func buildClusters(from nodes: [DeepWorkNode], allTasks: [TaskItem]) {
        let taskMap = Dictionary(uniqueKeysWithValues: allTasks.map { ($0.id, $0) })

        var workflowClusters: [String: (task: TaskItem, stepIds: [String], nodeIds: Set<String>)] = [:]
        var orphans: [TaskItem] = []

        for node in nodes {
            if let stepId = node.stepId {
                // This is a workflow step node — find the parent task
                for task in allTasks where task.hasSteps {
                    if let steps = task.steps, steps.contains(where: { $0.id == stepId }) {
                        var entry = workflowClusters[task.id] ?? (task: task, stepIds: [], nodeIds: Set())
                        entry.stepIds.append(stepId)
                        entry.nodeIds.insert(node.id)
                        workflowClusters[task.id] = entry
                        break
                    }
                }
            } else if let taskId = node.taskId {
                // Orphan task node (not a workflow step)
                if let task = taskMap[taskId], !task.hasSteps {
                    orphans.append(task)
                } else if let task = taskMap[taskId], task.hasSteps {
                    // Workflow task node — add all its steps
                    var entry = workflowClusters[task.id] ?? (task: task, stepIds: [], nodeIds: Set())
                    entry.nodeIds.insert(node.id)
                    if let steps = task.steps {
                        entry.stepIds = steps.map(\.id)
                    }
                    workflowClusters[task.id] = entry
                }
            }
        }

        // Convert to WorkflowCluster
        clusters = workflowClusters.map { (taskId, entry) in
            let allSteps = entry.task.steps ?? []
            let relevantSteps = allSteps.sorted { $0.stepIndex < $1.stepIndex }
            return WorkflowCluster(
                id: taskId,
                workflowTask: entry.task,
                steps: relevantSteps,
                nodeIds: entry.nodeIds
            )
        }.sorted { $0.workflowTask.name < $1.workflowTask.name }

        orphanTasks = orphans
    }

    // MARK: - Actions

    /// Start a work session on a step
    func startWorkOnStep(taskId: String, stepId: String, duration: Int) async {
        guard let appState else { return }

        do {
            _ = try await appState.workSessionService.create(CreateWorkSessionInput(
                taskId: taskId,
                stepId: stepId,
                startTime: Date(),
                plannedMinutes: duration
            ))

            let generator = UIImpactFeedbackGenerator(style: .medium)
            generator.impactOccurred()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    /// Complete a workflow step
    func completeStep(taskId: String, stepId: String) async {
        guard let appState else { return }

        do {
            _ = try await appState.taskService.completeStep(taskId: taskId, stepId: stepId)

            // Refresh the board
            if let boardId = selectedBoardId {
                await loadBoard(boardId)
            }

            let generator = UINotificationFeedbackGenerator()
            generator.notificationOccurred(.success)
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
