import { Task, TaskStep } from './types'
import { SequencedTask } from './sequencing-types'
import { TaskStatus, StepStatus } from './enums'

/**
 * Creates a default Task object with all required fields
 * Can be customized by passing partial overrides
 */
export function createMockTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    name: 'Test Task',
    duration: 60,
    importance: 5,
    urgency: 5,
    type: 'focused',
    asyncWaitTime: 0,
    dependencies: [],
    completed: false,
    sessionId: 'session-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    hasSteps: false,
    overallStatus: TaskStatus.NotStarted,
    criticalPathDuration: 60,
    worstCaseDuration: 60,
    archived: false,
    ...overrides,
  }
}

/**
 * Creates a default SequencedTask (workflow) object with all required fields
 * Can be customized by passing partial overrides
 */
export function createMockSequencedTask(overrides: Partial<SequencedTask> = {}): SequencedTask {
  const steps: TaskStep[] = overrides.steps || [
    {
      id: 'step-1',
      taskId: overrides.id || 'task-1',
      name: 'Step 1',
      duration: 30,
      type: 'focused',
      dependsOn: [],
      asyncWaitTime: 0,
      status: StepStatus.Pending,
      stepIndex: 0,
      percentComplete: 0,
    },
    {
      id: 'step-2',
      taskId: overrides.id || 'task-1',
      name: 'Step 2',
      duration: 30,
      type: 'admin',
      dependsOn: ['step-1'],
      asyncWaitTime: 0,
      status: StepStatus.Pending,
      stepIndex: 1,
      percentComplete: 0,
    },
  ]

  const totalDuration = steps.reduce((sum, step) => sum + step.duration, 0)
  const criticalPathDuration = steps.reduce((sum, step) => sum + step.duration + step.asyncWaitTime, 0)

  return {
    id: 'workflow-1',
    name: 'Test Workflow',
    duration: totalDuration,
    importance: 7,
    urgency: 6,
    type: 'focused',
    asyncWaitTime: 0,
    dependencies: [],
    completed: false,
    sessionId: 'session-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    hasSteps: true,
    overallStatus: TaskStatus.NotStarted,
    criticalPathDuration,
    worstCaseDuration: criticalPathDuration * 1.5,
    steps,
    archived: false,
    ...overrides,
  }
}
