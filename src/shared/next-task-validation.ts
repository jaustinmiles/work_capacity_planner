/**
 * Next-task validation
 *
 * Live-data check that a scheduled item can actually be STARTED right now.
 * The scheduler store's cached `nextScheduledItem` is derived from a frozen
 * scheduleResult whose completed/waiting flags can go stale (see
 * decisions/2026-06-11-hardening-findings/complete-task-stale-start.json) —
 * always validate against the CURRENT task/step arrays before starting work.
 */

import { TaskStatus, StepStatus, NextScheduledItemType } from './enums'
import type { Task } from './types'
import type { SequencedTask } from './sequencing-types'

/** The minimal identity needed to validate and start a scheduled item. */
export interface StartableItemRef {
  id: string
  type: NextScheduledItemType | 'task' | 'step'
  workflowId?: string
}

/**
 * True when the item refers to live task/step data that is startable:
 * present, not completed/skipped, and not parked on an async wait.
 */
export function isItemStartable(
  item: StartableItemRef,
  tasks: Task[],
  sequencedTasks: SequencedTask[],
): boolean {
  if (item.type === NextScheduledItemType.Step) {
    const workflow = sequencedTasks.find(w => w.steps.some(s => s.id === item.id))
    const step = workflow?.steps.find(s => s.id === item.id)
    if (!step) return false
    return step.status !== StepStatus.Completed
      && step.status !== StepStatus.Waiting
      && step.status !== StepStatus.Skipped
  }
  const task = tasks.find(t => t.id === item.id)
  if (!task) return false
  return !task.completed
    && task.overallStatus !== TaskStatus.Completed
    && task.overallStatus !== TaskStatus.Waiting
}
