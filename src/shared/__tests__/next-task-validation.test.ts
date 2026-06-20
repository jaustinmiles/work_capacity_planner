/**
 * Tests for isItemStartable — the live-data validation that prevents the
 * Start button from acting on a stale cached next-task (the bug where
 * completing a task logged new work onto it because the cached item was
 * never revalidated).
 */

import { describe, it, expect } from 'vitest'
import { isItemStartable, itemBelongsToEndeavor } from '../next-task-validation'
import { TaskStatus, StepStatus, NextScheduledItemType } from '../enums'
import type { Task } from '../types'
import type { SequencedTask, TaskStep } from '../sequencing-types'

function makeTask(id: string, overrides: Partial<Task> = {}): Task {
  return {
    id,
    name: `Task ${id}`,
    duration: 60,
    importance: 5,
    urgency: 5,
    type: 'focused',
    sessionId: 'session-1',
    asyncWaitTime: 0,
    dependencies: [],
    completed: false,
    hasSteps: false,
    overallStatus: TaskStatus.NotStarted,
    criticalPathDuration: 60,
    worstCaseDuration: 60,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

function makeStep(id: string, taskId: string, status: StepStatus): TaskStep {
  return {
    id,
    taskId,
    name: `Step ${id}`,
    duration: 30,
    type: 'focused',
    dependsOn: [],
    asyncWaitTime: 0,
    status,
    stepIndex: 0,
    percentComplete: 0,
  }
}

function makeWorkflow(id: string, steps: TaskStep[]): SequencedTask {
  return {
    ...makeTask(id, { hasSteps: true }),
    steps,
  }
}

describe('isItemStartable', () => {
  it('a pending task is startable', () => {
    const tasks = [makeTask('t1')]
    expect(isItemStartable({ id: 't1', type: NextScheduledItemType.Task }, tasks, [])).toBe(true)
  })

  it('a completed task is NOT startable', () => {
    const tasks = [makeTask('t1', { completed: true, overallStatus: TaskStatus.Completed })]
    expect(isItemStartable({ id: 't1', type: NextScheduledItemType.Task }, tasks, [])).toBe(false)
  })

  it('a WAITING task is NOT startable even with completed=false (the async-completion shape)', () => {
    const tasks = [makeTask('t1', { completed: false, overallStatus: TaskStatus.Waiting })]
    expect(isItemStartable({ id: 't1', type: NextScheduledItemType.Task }, tasks, [])).toBe(false)
  })

  it('a missing task is NOT startable', () => {
    expect(isItemStartable({ id: 'ghost', type: NextScheduledItemType.Task }, [], [])).toBe(false)
  })

  it('a pending step is startable', () => {
    const workflows = [makeWorkflow('w1', [makeStep('s1', 'w1', StepStatus.Pending)])]
    expect(isItemStartable({ id: 's1', type: NextScheduledItemType.Step, workflowId: 'w1' }, [], workflows)).toBe(true)
  })

  it('completed / waiting / skipped steps are NOT startable', () => {
    for (const status of [StepStatus.Completed, StepStatus.Waiting, StepStatus.Skipped]) {
      const workflows = [makeWorkflow('w1', [makeStep('s1', 'w1', status)])]
      expect(isItemStartable({ id: 's1', type: NextScheduledItemType.Step, workflowId: 'w1' }, [], workflows)).toBe(false)
    }
  })

  it('a missing step is NOT startable', () => {
    expect(isItemStartable({ id: 'ghost', type: NextScheduledItemType.Step }, [], [])).toBe(false)
  })
})

describe('itemBelongsToEndeavor', () => {
  it('a simple task belongs when its id is linked to the endeavor', () => {
    expect(itemBelongsToEndeavor('t1', false, [], new Set(['t1']))).toBe(true)
  })

  it('a simple task not linked to the endeavor is excluded', () => {
    expect(itemBelongsToEndeavor('t1', false, [], new Set(['other']))).toBe(false)
  })

  it('a step belongs via its containing workflow, not the step id', () => {
    const workflows = [makeWorkflow('w1', [makeStep('s1', 'w1', StepStatus.Pending)])]
    // membership is resolved on the workflow container...
    expect(itemBelongsToEndeavor('s1', true, workflows, new Set(['w1']))).toBe(true)
    // ...so linking the step id directly does NOT count
    expect(itemBelongsToEndeavor('s1', true, workflows, new Set(['s1']))).toBe(false)
  })

  it('a step whose workflow is not linked is excluded', () => {
    const workflows = [makeWorkflow('w1', [makeStep('s1', 'w1', StepStatus.Pending)])]
    expect(itemBelongsToEndeavor('s1', true, workflows, new Set(['w2']))).toBe(false)
  })

  it('a step with no matching workflow is excluded', () => {
    expect(itemBelongsToEndeavor('ghost', true, [], new Set(['w1']))).toBe(false)
  })
})
