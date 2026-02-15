import { describe, it, expect } from 'vitest'
import { StepStatus, EndeavorStatus } from '../enums'
import type { EndeavorWithTasks, TaskStep, EndeavorDependencyWithNames } from '../types'
import { findNextUnblockedStep } from '../next-unblocked-step'

// --- Factories ---

function createMockStep(overrides: Partial<TaskStep> = {}): TaskStep {
  return {
    id: `step-${Math.random().toString(36).slice(2, 8)}`,
    name: 'Test Step',
    duration: 30,
    type: 'type-dev',
    taskId: 'task-1',
    dependsOn: [],
    asyncWaitTime: 0,
    status: StepStatus.Pending,
    stepIndex: 0,
    percentComplete: 0,
    ...overrides,
  }
}

function createMockEndeavor(overrides: Partial<EndeavorWithTasks> = {}): EndeavorWithTasks {
  return {
    id: 'endeavor-1',
    name: 'Test Endeavor',
    status: EndeavorStatus.Active,
    importance: 5,
    urgency: 5,
    sessionId: 'session-1',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    items: [],
    ...overrides,
  }
}

function createWorkflowItem(
  taskId: string,
  steps: TaskStep[],
  overrides: Record<string, unknown> = {},
) {
  return {
    id: `item-${taskId}`,
    endeavorId: 'endeavor-1',
    taskId,
    sortOrder: 0,
    addedAt: new Date('2024-01-01'),
    task: {
      id: taskId,
      name: `Workflow ${taskId}`,
      duration: steps.reduce((sum, s) => sum + s.duration, 0),
      importance: 5,
      urgency: 5,
      asyncWaitTime: 0,
      dependencies: [],
      completed: false,
      sessionId: 'session-1',
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
      hasSteps: true,
      overallStatus: 'in_progress',
      criticalPathDuration: 0,
      worstCaseDuration: 0,
      steps,
      ...overrides,
    },
  }
}

function createSimpleItem(
  taskId: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    id: `item-${taskId}`,
    endeavorId: 'endeavor-1',
    taskId,
    sortOrder: 0,
    addedAt: new Date('2024-01-01'),
    task: {
      id: taskId,
      name: `Simple ${taskId}`,
      duration: 30,
      importance: 5,
      urgency: 5,
      asyncWaitTime: 0,
      dependencies: [],
      completed: false,
      sessionId: 'session-1',
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
      hasSteps: false,
      overallStatus: 'not_started',
      criticalPathDuration: 0,
      worstCaseDuration: 0,
      ...overrides,
    },
  }
}

const emptyDeps = new Map<string, EndeavorDependencyWithNames[]>()

// --- Tests ---

describe('findNextUnblockedStep', () => {
  it('should return the first pending step in a single-task endeavor', () => {
    const steps = [
      createMockStep({ id: 's1', stepIndex: 0, taskId: 'task-1' }),
      createMockStep({ id: 's2', stepIndex: 1, dependsOn: ['s1'], taskId: 'task-1' }),
    ]
    const endeavor = createMockEndeavor({
      items: [createWorkflowItem('task-1', steps)] as EndeavorWithTasks['items'],
    })

    const result = findNextUnblockedStep([endeavor], emptyDeps)

    expect(result).not.toBeNull()
    expect(result!.stepId).toBe('s1')
    expect(result!.isSimpleTask).toBe(false)
  })

  it('should return null when all steps are completed', () => {
    const steps = [
      createMockStep({ id: 's1', stepIndex: 0, status: StepStatus.Completed, taskId: 'task-1' }),
      createMockStep({ id: 's2', stepIndex: 1, status: StepStatus.Completed, taskId: 'task-1' }),
    ]
    const endeavor = createMockEndeavor({
      items: [createWorkflowItem('task-1', steps, { completed: true })] as EndeavorWithTasks['items'],
    })

    const result = findNextUnblockedStep([endeavor], emptyDeps)

    expect(result).toBeNull()
  })

  it('should skip steps blocked by incomplete dependencies', () => {
    const steps = [
      createMockStep({ id: 's1', stepIndex: 0, status: StepStatus.InProgress, taskId: 'task-1' }),
      createMockStep({ id: 's2', stepIndex: 1, dependsOn: ['s1'], taskId: 'task-1' }),
      createMockStep({ id: 's3', stepIndex: 2, taskId: 'task-1' }), // no deps, should be returned
    ]
    const endeavor = createMockEndeavor({
      items: [createWorkflowItem('task-1', steps)] as EndeavorWithTasks['items'],
    })

    const result = findNextUnblockedStep([endeavor], emptyDeps)

    // s1 is in_progress (not pending), s2 is blocked by s1, s3 is unblocked and pending
    expect(result).not.toBeNull()
    expect(result!.stepId).toBe('s3')
  })

  it('should skip steps with hard-block cross-endeavor dependencies', () => {
    const steps = [
      createMockStep({ id: 's1', stepIndex: 0, taskId: 'task-1' }),
    ]
    const endeavor = createMockEndeavor({
      items: [createWorkflowItem('task-1', steps)] as EndeavorWithTasks['items'],
    })

    const deps = new Map<string, EndeavorDependencyWithNames[]>()
    deps.set('endeavor-1', [{
      id: 'dep-1',
      endeavorId: 'endeavor-1',
      blockedStepId: 's1',
      blockingStepId: 'blocking-step',
      blockingTaskId: 'blocking-task',
      isHardBlock: true,
      createdAt: new Date(),
      blockingStepName: 'Blocking Step',
      blockingTaskName: 'Blocking Task',
      blockingStepStatus: StepStatus.Pending, // not completed
    }])

    const result = findNextUnblockedStep([endeavor], deps)

    expect(result).toBeNull()
  })

  it('should NOT skip steps with soft-block dependencies', () => {
    const steps = [
      createMockStep({ id: 's1', stepIndex: 0, taskId: 'task-1' }),
    ]
    const endeavor = createMockEndeavor({
      items: [createWorkflowItem('task-1', steps)] as EndeavorWithTasks['items'],
    })

    const deps = new Map<string, EndeavorDependencyWithNames[]>()
    deps.set('endeavor-1', [{
      id: 'dep-1',
      endeavorId: 'endeavor-1',
      blockedStepId: 's1',
      blockingStepId: 'blocking-step',
      blockingTaskId: 'blocking-task',
      isHardBlock: false, // soft block
      createdAt: new Date(),
      blockingStepName: 'Blocking Step',
      blockingTaskName: 'Blocking Task',
      blockingStepStatus: StepStatus.Pending,
    }])

    const result = findNextUnblockedStep([endeavor], deps)

    expect(result).not.toBeNull()
    expect(result!.stepId).toBe('s1')
  })

  it('should return step from highest priority endeavor first', () => {
    const endeavor1 = createMockEndeavor({
      id: 'e1',
      importance: 3,
      urgency: 3,
      items: [createWorkflowItem('task-1', [
        createMockStep({ id: 's1', name: 'Low priority step', stepIndex: 0, taskId: 'task-1' }),
      ])] as EndeavorWithTasks['items'],
    })
    const endeavor2 = createMockEndeavor({
      id: 'e2',
      importance: 10,
      urgency: 10,
      items: [createWorkflowItem('task-2', [
        createMockStep({ id: 's2', name: 'High priority step', stepIndex: 0, taskId: 'task-2' }),
      ])] as EndeavorWithTasks['items'],
    })

    const result = findNextUnblockedStep([endeavor1, endeavor2], emptyDeps)

    expect(result).not.toBeNull()
    expect(result!.stepId).toBe('s2')
    expect(result!.endeavorId).toBe('e2')
  })

  it('should return simple task when it has no steps', () => {
    const endeavor = createMockEndeavor({
      items: [createSimpleItem('task-simple', { duration: 45 })] as EndeavorWithTasks['items'],
    })

    const result = findNextUnblockedStep([endeavor], emptyDeps)

    expect(result).not.toBeNull()
    expect(result!.isSimpleTask).toBe(true)
    expect(result!.taskId).toBe('task-simple')
    expect(result!.duration).toBe(45)
  })

  it('should skip paused endeavors', () => {
    const endeavor = createMockEndeavor({
      status: EndeavorStatus.Paused,
      items: [createWorkflowItem('task-1', [
        createMockStep({ id: 's1', stepIndex: 0, taskId: 'task-1' }),
      ])] as EndeavorWithTasks['items'],
    })

    const result = findNextUnblockedStep([endeavor], emptyDeps)

    expect(result).toBeNull()
  })

  it('should skip archived endeavors', () => {
    const endeavor = createMockEndeavor({
      status: EndeavorStatus.Archived,
      items: [createWorkflowItem('task-1', [
        createMockStep({ id: 's1', stepIndex: 0, taskId: 'task-1' }),
      ])] as EndeavorWithTasks['items'],
    })

    const result = findNextUnblockedStep([endeavor], emptyDeps)

    expect(result).toBeNull()
  })

  it('should return null for empty endeavors array', () => {
    const result = findNextUnblockedStep([], emptyDeps)
    expect(result).toBeNull()
  })

  it('should allow step when blocking step is completed', () => {
    const steps = [
      createMockStep({ id: 's1', stepIndex: 0, taskId: 'task-1' }),
    ]
    const endeavor = createMockEndeavor({
      items: [createWorkflowItem('task-1', steps)] as EndeavorWithTasks['items'],
    })

    const deps = new Map<string, EndeavorDependencyWithNames[]>()
    deps.set('endeavor-1', [{
      id: 'dep-1',
      endeavorId: 'endeavor-1',
      blockedStepId: 's1',
      blockingStepId: 'blocking-step',
      blockingTaskId: 'blocking-task',
      isHardBlock: true,
      createdAt: new Date(),
      blockingStepName: 'Blocking Step',
      blockingTaskName: 'Blocking Task',
      blockingStepStatus: StepStatus.Completed, // completed, so no longer blocking
    }])

    const result = findNextUnblockedStep([endeavor], deps)

    expect(result).not.toBeNull()
    expect(result!.stepId).toBe('s1')
  })
})
