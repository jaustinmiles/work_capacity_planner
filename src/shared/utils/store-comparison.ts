/**
 * Store comparison utilities
 * Provides proper content-based comparison for detecting actual changes in store data
 */

import type { Task } from '@shared/types'
import type { SequencedTask } from '@shared/sequencing-types'
import type { WorkSettings } from '@shared/work-settings-types'
import { StepStatus } from '@shared/enums'

/**
 * Creates a deterministic key representing all relevant task properties
 * that affect scheduling decisions
 */
export function createTaskComparisonKey(task: Task): string {
  // Include all properties that affect scheduling
  const props = [
    task.id,
    task.name,
    task.completed ? '1' : '0',
    task.type,
    task.duration?.toString() ?? 'null',
    task.actualDuration?.toString() ?? 'null',
    task.urgency?.toString() ?? '0',
    task.importance?.toString() ?? '0',
    task.cognitiveComplexity?.toString() ?? '0',
    task.asyncWaitTime?.toString() ?? '0',
    task.deadline ?? 'null',
    task.isLocked ? '1' : '0',
    task.lockedStartTime?.toString() ?? 'null',
    task.inActiveSprint ? '1' : '0',
  ]

  return props.join(':')
}

/**
 * Creates a deterministic key for a sequenced task (workflow)
 */
export function createSequencedTaskComparisonKey(workflow: SequencedTask): string {
  const workflowProps = [
    workflow.id,
    workflow.name,
    workflow.completed ? '1' : '0',
    workflow.type,
    workflow.urgency?.toString() ?? '0',
    workflow.importance?.toString() ?? '0',
    workflow.deadline ?? 'null',
    workflow.overallStatus ?? 'null',
    workflow.inActiveSprint ? '1' : '0',
  ]

  // Include all step states
  const stepKeys = workflow.steps.map(step => [
    step.id,
    step.status,
    step.name,
    step.duration?.toString() ?? 'null',
    step.actualDuration?.toString() ?? 'null',
    step.percentComplete?.toString() ?? '0',
    step.cognitiveComplexity?.toString() ?? '0',
    step.asyncWaitTime?.toString() ?? '0',
    step.isAsyncTrigger ? '1' : '0',
  ].join('/')).join(',')

  return `${workflowProps.join(':')}|${stepKeys}`
}

/**
 * Compares two task arrays for actual content changes
 * Returns true if tasks have changed in a way that requires schedule recomputation
 */
export function haveTasksChanged(current: Task[], previous: Task[]): boolean {
  // Different lengths means tasks added/removed
  if (current.length !== previous.length) {
    return true
  }

  // Create sorted comparison keys for both arrays
  const currentKeys = current.map(createTaskComparisonKey).sort()
  const previousKeys = previous.map(createTaskComparisonKey).sort()

  // Compare all keys
  return currentKeys.some((key, index) => key !== previousKeys[index])
}

/**
 * Compares two sequenced task arrays for actual content changes
 */
export function haveSequencedTasksChanged(
  current: SequencedTask[],
  previous: SequencedTask[],
): boolean {
  if (current.length !== previous.length) {
    return true
  }

  const currentKeys = current.map(createSequencedTaskComparisonKey).sort()
  const previousKeys = previous.map(createSequencedTaskComparisonKey).sort()

  return currentKeys.some((key, index) => key !== previousKeys[index])
}

/**
 * Compares work settings for changes
 */
export function haveWorkSettingsChanged(
  current: WorkSettings | null,
  previous: WorkSettings | null,
): boolean {
  // Handle null cases
  if (current === null && previous === null) return false
  if (current === null || previous === null) return true

  // Compare default work hours
  if (
    current.defaultWorkHours.startTime !== previous.defaultWorkHours.startTime ||
    current.defaultWorkHours.endTime !== previous.defaultWorkHours.endTime ||
    current.defaultWorkHours.lunchStart !== previous.defaultWorkHours.lunchStart ||
    current.defaultWorkHours.lunchDuration !== previous.defaultWorkHours.lunchDuration
  ) {
    return true
  }

  // Compare default capacity
  if (
    current.defaultCapacity.maxFocusHours !== previous.defaultCapacity.maxFocusHours ||
    current.defaultCapacity.maxAdminHours !== previous.defaultCapacity.maxAdminHours
  ) {
    return true
  }

  // Compare custom work hours keys
  const currentCustomKeys = Object.keys(current.customWorkHours).sort()
  const previousCustomKeys = Object.keys(previous.customWorkHours).sort()
  if (currentCustomKeys.join(',') !== previousCustomKeys.join(',')) {
    return true
  }

  // Compare custom capacity keys
  const currentCapacityKeys = Object.keys(current.customCapacity).sort()
  const previousCapacityKeys = Object.keys(previous.customCapacity).sort()
  if (currentCapacityKeys.join(',') !== previousCapacityKeys.join(',')) {
    return true
  }

  return current.timeZone !== previous.timeZone
}

/**
 * Compares active work sessions for changes
 * Returns true if sessions have been added or removed
 */
export function haveActiveSessionsChanged(
  current: Map<string, any>,
  previous: Map<string, any>,
): boolean {
  // Check if size changed
  if (current.size !== previous.size) {
    return true
  }

  // Check if all keys match
  const currentKeys = Array.from(current.keys()).sort()
  const previousKeys = Array.from(previous.keys()).sort()

  return currentKeys.some((key, index) => key !== previousKeys[index])
}

/**
 * Filters out completed tasks and workflows that shouldn't be scheduled
 */
export function filterSchedulableItems(tasks: Task[]): Task[] {
  return tasks.filter(task => {
    // Don't schedule completed tasks
    if (task.completed) return false

    // Tasks don't have isWaitBlock property, so we can't filter on that
    // The scheduler will handle wait time logic

    return true
  })
}

/**
 * Filters schedulable workflows (those with actionable steps)
 *
 * A workflow is schedulable if it has at least one step that:
 * - Is not completed
 * - Is not skipped
 * - Is not waiting (async work in progress)
 *
 * Workflows with ONLY waiting steps should still appear on the schedule
 * (to show wait blocks), but they shouldn't be in the "next task" queue.
 * This filtering happens at the workflow level for the store connector.
 */
export function filterSchedulableWorkflows(workflows: SequencedTask[]): SequencedTask[] {
  return workflows.filter(workflow => {
    // Don't schedule completed workflows
    if (workflow.completed) return false

    // Must have at least one actionable step (not completed, skipped, or waiting)
    // Steps in 'waiting' status have async work in progress and can't be started
    const hasActionableStep = workflow.steps.some(step =>
      step.status !== StepStatus.Completed &&
      step.status !== StepStatus.Skipped &&
      step.status !== StepStatus.Waiting,
    )

    // Also include workflows that have waiting steps (for schedule display)
    // but only if they also have pending steps that could become actionable
    const hasWaitingStep = workflow.steps.some(step => step.status === StepStatus.Waiting)
    const hasPendingStep = workflow.steps.some(step =>
      step.status === StepStatus.Pending || step.status === StepStatus.InProgress,
    )

    // Include if:
    // 1. Has actionable steps (can be worked on now), OR
    // 2. Has waiting steps AND pending steps (will become actionable after wait)
    return hasActionableStep || (hasWaitingStep && hasPendingStep)
  })
}

/**
 * Filters tasks to only include those in the active sprint.
 * Used when sprint mode is enabled for scheduling.
 */
export function filterSprintTasks(tasks: Task[]): Task[] {
  return tasks.filter(task => task.inActiveSprint === true)
}

/**
 * Filters workflows to only include those in the active sprint.
 * Used when sprint mode is enabled for scheduling.
 */
export function filterSprintWorkflows(workflows: SequencedTask[]): SequencedTask[] {
  return workflows.filter(workflow => workflow.inActiveSprint === true)
}
