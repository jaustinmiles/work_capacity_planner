import XCTest
@testable import TaskPlannerMobile

/// Port-fidelity tests for `NextTaskValidation.isItemStartable` — mirrors
/// `src/shared/__tests__/next-task-validation.test.ts` so the client and server agree
/// on what "startable" means.
final class NextTaskValidationTests: XCTestCase {

    // MARK: - Fixtures

    private func makeTask(
        id: String,
        completed: Bool = false,
        overallStatus: TaskStatus = .notStarted,
        steps: [TaskStep]? = nil
    ) -> TaskItem {
        TaskItem(
            id: id, name: "Task \(id)", duration: 60, importance: 5, urgency: 5,
            type: "focused", category: "work", asyncWaitTime: 0, dependencies: [],
            completed: completed, completedAt: nil, actualDuration: nil, notes: nil,
            projectId: nil, deadline: nil, deadlineType: nil, cognitiveComplexity: nil,
            isLocked: false, lockedStartTime: nil, hasSteps: steps != nil, currentStepId: nil,
            overallStatus: overallStatus, criticalPathDuration: 60, worstCaseDuration: 60,
            archived: false, inActiveSprint: true, sessionId: "s1",
            createdAt: Date(), updatedAt: Date(), steps: steps
        )
    }

    private func makeStep(id: String, taskId: String, status: StepStatus) -> TaskStep {
        TaskStep(
            id: id, name: "Step \(id)", duration: 30, type: "focused", taskId: taskId,
            dependsOn: [], asyncWaitTime: 0, status: status, stepIndex: 0, percentComplete: 0,
            actualDuration: nil, startedAt: nil, completedAt: nil, notes: nil,
            cognitiveComplexity: nil, isAsyncTrigger: false, expectedResponseTime: nil,
            importance: nil, urgency: nil
        )
    }

    private func taskItem(_ id: String) -> NextScheduledItem {
        NextScheduledItem(type: .task, id: id, workflowId: nil, title: "t",
                          estimatedDuration: 60, scheduledStartTime: Date(),
                          loggedMinutes: 0, workflowName: nil)
    }

    private func stepItem(_ id: String, workflowId: String) -> NextScheduledItem {
        NextScheduledItem(type: .step, id: id, workflowId: workflowId, title: "s",
                          estimatedDuration: 30, scheduledStartTime: Date(),
                          loggedMinutes: 0, workflowName: "wf")
    }

    // MARK: - Task cases

    func testPendingTaskIsStartable() {
        XCTAssertTrue(NextTaskValidation.isItemStartable(taskItem("t1"), tasks: [makeTask(id: "t1")]))
    }

    func testCompletedTaskIsNotStartable() {
        let tasks = [makeTask(id: "t1", completed: true, overallStatus: .completed)]
        XCTAssertFalse(NextTaskValidation.isItemStartable(taskItem("t1"), tasks: tasks))
    }

    func testWaitingTaskIsNotStartable() {
        // completed == false but Waiting — the async-completion shape that bit desktop.
        let tasks = [makeTask(id: "t1", completed: false, overallStatus: .waiting)]
        XCTAssertFalse(NextTaskValidation.isItemStartable(taskItem("t1"), tasks: tasks))
    }

    func testMissingTaskIsNotStartable() {
        XCTAssertFalse(NextTaskValidation.isItemStartable(taskItem("ghost"), tasks: []))
    }

    // MARK: - Step cases

    func testPendingStepIsStartable() {
        let wf = makeTask(id: "w1", steps: [makeStep(id: "s1", taskId: "w1", status: .pending)])
        XCTAssertTrue(NextTaskValidation.isItemStartable(stepItem("s1", workflowId: "w1"), tasks: [wf]))
    }

    func testInProgressStepIsStartable() {
        let wf = makeTask(id: "w1", steps: [makeStep(id: "s1", taskId: "w1", status: .inProgress)])
        XCTAssertTrue(NextTaskValidation.isItemStartable(stepItem("s1", workflowId: "w1"), tasks: [wf]))
    }

    func testTerminalStepsAreNotStartable() {
        for status in [StepStatus.completed, .waiting, .skipped] {
            let wf = makeTask(id: "w1", steps: [makeStep(id: "s1", taskId: "w1", status: status)])
            XCTAssertFalse(
                NextTaskValidation.isItemStartable(stepItem("s1", workflowId: "w1"), tasks: [wf]),
                "step status \(status.rawValue) should not be startable"
            )
        }
    }

    func testMissingStepIsNotStartable() {
        XCTAssertFalse(NextTaskValidation.isItemStartable(stepItem("ghost", workflowId: "w1"), tasks: []))
    }
}
