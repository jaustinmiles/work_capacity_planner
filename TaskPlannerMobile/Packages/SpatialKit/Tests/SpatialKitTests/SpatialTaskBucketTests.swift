import Testing
@testable import SpatialKit

@Suite("SpatialTaskBucket")
struct SpatialTaskBucketTests {
    private func bucket(
        completed: Bool = false,
        archived: Bool = false,
        inActiveSprint: Bool = false,
        hasSteps: Bool = false
    ) -> SpatialTaskBucket {
        SpatialTaskClassifier.bucket(
            completed: completed, archived: archived,
            inActiveSprint: inActiveSprint, hasSteps: hasSteps
        )
    }

    @Test func archivedIsHiddenRegardlessOfOtherFlags() {
        #expect(bucket(completed: true, archived: true, inActiveSprint: true, hasSteps: true) == .hidden)
        #expect(bucket(archived: true) == .hidden)
    }

    @Test func completedGoesToDoneEvenWhenStillInSprint() {
        // Completion wins over sprint membership — a finished task leaves the live scene.
        #expect(bucket(completed: true, inActiveSprint: true) == .done)
        #expect(bucket(completed: true, inActiveSprint: true, hasSteps: true) == .done)
        #expect(bucket(completed: true, inActiveSprint: false) == .done)
    }

    @Test func notInSprintAndNotDoneIsBacklog() {
        #expect(bucket(inActiveSprint: false) == .backlog)
        #expect(bucket(inActiveSprint: false, hasSteps: true) == .backlog)
    }

    @Test func activeSprintStandaloneIsSprintTask() {
        #expect(bucket(inActiveSprint: true, hasSteps: false) == .sprintTask)
    }

    @Test func activeSprintWorkflowIsSprintWorkflow() {
        #expect(bucket(inActiveSprint: true, hasSteps: true) == .sprintWorkflow)
    }

    @Test func bucketsArePairwiseDisjointAcrossTheFlagSpace() {
        // Exhaustively enumerate the 4-bool space; every combination maps to exactly one bucket
        // (the classifier is total), and the headline invariants hold across all of it.
        for completed in [true, false] {
            for archived in [true, false] {
                for inSprint in [true, false] {
                    for hasSteps in [true, false] {
                        let b = bucket(completed: completed, archived: archived,
                                       inActiveSprint: inSprint, hasSteps: hasSteps)
                        if archived { #expect(b == .hidden) }
                        else if completed { #expect(b == .done) }
                        else if !inSprint { #expect(b == .backlog) }
                        else { #expect(b == (hasSteps ? .sprintWorkflow : .sprintTask)) }
                    }
                }
            }
        }
    }
}
