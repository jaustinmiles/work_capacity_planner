/**
 * Next Unblocked Step Finder
 *
 * Finds the next actionable step across all endeavors, respecting
 * dependency ordering and hard blocks. Used by the "Work on Next Step"
 * button in the graph view.
 */

import { StepStatus, EndeavorStatus } from './enums'
import { sortEndeavorsByPriority } from './endeavor-utils'
import type { EndeavorWithTasks, EndeavorDependencyWithNames, TaskStep } from './types'

export interface NextUnblockedStep {
  stepId: string
  taskId: string
  endeavorId: string
  name: string
  duration: number
  isSimpleTask: boolean
}

/**
 * Find the next unblocked step across all active endeavors.
 *
 * Algorithm:
 * 1. Sort endeavors by priority (importance × urgency)
 * 2. For each endeavor, iterate tasks by sort order
 * 3. For each task, iterate steps by stepIndex
 * 4. A step is "unblocked" if:
 *    - Status is pending (not completed, skipped, or in_progress)
 *    - All dependsOn steps within the workflow are completed/skipped
 *    - No hard-block EndeavorDependency has an incomplete blocking step
 * 5. Return the first unblocked step found
 */
export function findNextUnblockedStep(
  endeavors: EndeavorWithTasks[],
  dependencies: Map<string, EndeavorDependencyWithNames[]>,
): NextUnblockedStep | null {
  // Only consider active endeavors
  const activeEndeavors = sortEndeavorsByPriority(
    endeavors.filter(e => e.status === EndeavorStatus.Active),
  )

  for (const endeavor of activeEndeavors) {
    for (const item of endeavor.items) {
      const task = item.task
      if (task.completed) continue

      if (task.hasSteps && task.steps && task.steps.length > 0) {
        // Workflow: find first unblocked step
        const stepMap = new Map<string, TaskStep>()
        task.steps.forEach(s => stepMap.set(s.id, s))

        // Sort steps by stepIndex
        const sortedSteps = [...task.steps].sort((a, b) => a.stepIndex - b.stepIndex)

        for (const step of sortedSteps) {
          if (step.status !== StepStatus.Pending) continue

          // Check intra-workflow dependencies
          const intraBlocked = step.dependsOn.some(depId => {
            const dep = stepMap.get(depId)
            return dep && dep.status !== StepStatus.Completed && dep.status !== StepStatus.Skipped
          })
          if (intraBlocked) continue

          // Check cross-endeavor hard blocks
          const crossDeps = dependencies.get(endeavor.id) ?? []
          const crossBlocked = crossDeps.some(dep => {
            if (!dep.isHardBlock) return false
            // Does this dep block our step?
            if (dep.blockedStepId === step.id || dep.blockedTaskId === task.id) {
              return dep.blockingStepStatus !== StepStatus.Completed
                && dep.blockingStepStatus !== StepStatus.Skipped
            }
            return false
          })
          if (crossBlocked) continue

          return {
            stepId: step.id,
            taskId: task.id,
            endeavorId: endeavor.id,
            name: step.name,
            duration: step.duration,
            isSimpleTask: false,
          }
        }
      } else {
        // Simple task: check if it's actionable
        // Check cross-endeavor hard blocks
        const crossDeps = dependencies.get(endeavor.id) ?? []
        const crossBlocked = crossDeps.some(dep => {
          if (!dep.isHardBlock) return false
          if (dep.blockedTaskId === task.id) {
            return dep.blockingStepStatus !== StepStatus.Completed
              && dep.blockingStepStatus !== StepStatus.Skipped
          }
          return false
        })
        if (crossBlocked) continue

        return {
          stepId: task.id,
          taskId: task.id,
          endeavorId: endeavor.id,
          name: task.name,
          duration: task.duration,
          isSimpleTask: true,
        }
      }
    }
  }

  return null
}
