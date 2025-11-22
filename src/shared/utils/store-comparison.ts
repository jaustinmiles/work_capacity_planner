/**
 * Store comparison utilities
 * Provides proper content-based comparison for detecting actual changes in store data
 */

import type { Task } from '@shared/types'
import type { SequencedTask } from '@shared/sequencing-types'
import type { WorkSettings } from '@shared/work-settings-types'

/**
 * Creates a deterministic key representing all relevant task properties
 * that affect scheduling decisions
 */
export function createTaskComparisonKey(task: Task): string {
  // Include all properties that affect scheduling
  const props = [
    task.id,
    task.title,
    task.completed ? '1' : '0',
    task.type,
    task.targetDuration?.toString() ?? 'null',
    task.actualDuration?.toString() ?? 'null',
    task.percentComplete?.toString() ?? '0',
    task.urgency?.toString() ?? '0',
    task.importance?.toString() ?? '0',
    task.cognitiveComplexity?.toString() ?? '0',
    task.waitTime?.toString() ?? '0',
    task.deadline ?? 'null',
    task.isWaitBlock ? '1' : '0',
    task.parentId ?? 'null',
  ]

  return props.join(':')
}

/**
 * Creates a deterministic key for a sequenced task (workflow)
 */
export function createSequencedTaskComparisonKey(workflow: SequencedTask): string {
  const workflowProps = [
    workflow.id,
    workflow.title,
    workflow.completed ? '1' : '0',
    workflow.type,
    workflow.urgency?.toString() ?? '0',
    workflow.importance?.toString() ?? '0',
    workflow.overallDeadline ?? 'null',
    workflow.percentComplete?.toString() ?? '0',
  ]

  // Include all step states
  const stepKeys = workflow.steps.map(step => [
    step.id,
    step.status,
    step.title,
    step.targetDuration?.toString() ?? 'null',
    step.actualDuration?.toString() ?? 'null',
    step.percentComplete?.toString() ?? '0',
    step.cognitiveComplexity?.toString() ?? '0',
    step.waitTime?.toString() ?? '0',
    step.isWaitBlock ? '1' : '0',
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

  // Compare all relevant properties
  return (
    current.focusHours !== previous.focusHours ||
    current.adminHours !== previous.adminHours ||
    current.totalHours !== previous.totalHours ||
    current.startTime !== previous.startTime ||
    current.endTime !== previous.endTime ||
    current.excludeWeekends !== previous.excludeWeekends ||
    current.excludeHolidays !== previous.excludeHolidays ||
    current.splitRatio !== previous.splitRatio ||
    current.defaultType !== previous.defaultType
  )
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

    // Don't schedule wait blocks that are actively waiting
    // (they're handled differently in the scheduler)
    if (task.isWaitBlock && task.waitStartTime) {
      return false
    }

    return true
  })
}

/**
 * Filters schedulable workflows (those with incomplete steps)
 */
export function filterSchedulableWorkflows(workflows: SequencedTask[]): SequencedTask[] {
  return workflows.filter(workflow => {
    // Don't schedule completed workflows
    if (workflow.completed) return false

    // Must have at least one incomplete step
    return workflow.steps.some(step =>
      step.status !== 'completed' &&
      step.status !== 'skipped',
    )
  })
}
