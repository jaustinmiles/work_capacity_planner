import { describe, it, expect } from 'vitest'
import { StepStatus, EndeavorStatus } from '../enums'
import type { EndeavorWithTasks, TaskStep, EndeavorDependencyWithNames } from '../types'
import type { UserTaskType } from '../user-task-types'
import {
  computeEndeavorCriticalPath,
  computeTimeByType,
  computeAllCriticalPaths,
  aggregateTimeByType,
} from '../endeavor-graph-utils'

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

function createWorkflowTask(
  taskId: string,
  steps: TaskStep[],
  overrides: Record<string, unknown> = {},
) {
  return {
    id: 'item-1',
    endeavorId: 'endeavor-1',
    taskId,
    sortOrder: 0,
    addedAt: new Date('2024-01-01'),
    task: {
      id: taskId,
      name: 'Workflow Task',
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

function createSimpleTask(
  taskId: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    id: 'item-1',
    endeavorId: 'endeavor-1',
    taskId,
    sortOrder: 0,
    addedAt: new Date('2024-01-01'),
    task: {
      id: taskId,
      name: 'Simple Task',
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

function createMockType(overrides: Partial<UserTaskType> = {}): UserTaskType {
  return {
    id: 'type-dev',
    sessionId: 'session-1',
    name: 'Development',
    emoji: '💻',
    color: '#4A90D9',
    sortOrder: 0,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  }
}

// --- Tests ---

describe('computeEndeavorCriticalPath', () => {
  it('should return empty result for endeavor with all completed steps', () => {
    const steps = [
      createMockStep({ id: 's1', status: StepStatus.Completed, duration: 30, stepIndex: 0 }),
      createMockStep({ id: 's2', status: StepStatus.Completed, duration: 45, stepIndex: 1, dependsOn: ['s1'] }),
    ]
    const endeavor = createMockEndeavor({
      items: [createWorkflowTask('task-1', steps)] as EndeavorWithTasks['items'],
    })

    const result = computeEndeavorCriticalPath(endeavor, [])

    expect(result.nodeIds.size).toBe(0)
    expect(result.edgeIds.size).toBe(0)
    expect(result.totalDuration).toBe(0)
  })

  it('should find critical path through linear steps', () => {
    const steps = [
      createMockStep({ id: 's1', duration: 30, stepIndex: 0, taskId: 'task-1' }),
      createMockStep({ id: 's2', duration: 45, stepIndex: 1, dependsOn: ['s1'], taskId: 'task-1' }),
      createMockStep({ id: 's3', duration: 15, stepIndex: 2, dependsOn: ['s2'], taskId: 'task-1' }),
    ]
    const endeavor = createMockEndeavor({
      items: [createWorkflowTask('task-1', steps)] as EndeavorWithTasks['items'],
    })

    const result = computeEndeavorCriticalPath(endeavor, [])

    expect(result.nodeIds).toContain('step-s1')
    expect(result.nodeIds).toContain('step-s2')
    expect(result.nodeIds).toContain('step-s3')
    expect(result.totalDuration).toBe(90) // 30 + 45 + 15
  })

  it('should find longest path when there are parallel branches', () => {
    // s1 → s2 (30+45=75)
    // s1 → s3 (30+60=90) ← critical path
    const steps = [
      createMockStep({ id: 's1', duration: 30, stepIndex: 0, taskId: 'task-1' }),
      createMockStep({ id: 's2', duration: 45, stepIndex: 1, dependsOn: ['s1'], taskId: 'task-1' }),
      createMockStep({ id: 's3', duration: 60, stepIndex: 2, dependsOn: ['s1'], taskId: 'task-1' }),
    ]
    const endeavor = createMockEndeavor({
      items: [createWorkflowTask('task-1', steps)] as EndeavorWithTasks['items'],
    })

    const result = computeEndeavorCriticalPath(endeavor, [])

    expect(result.nodeIds).toContain('step-s1')
    expect(result.nodeIds).toContain('step-s3')
    expect(result.nodeIds).not.toContain('step-s2')
    expect(result.totalDuration).toBe(90)
  })

  it('should handle single remaining step', () => {
    const steps = [
      createMockStep({ id: 's1', status: StepStatus.Completed, duration: 30, stepIndex: 0, taskId: 'task-1' }),
      createMockStep({ id: 's2', duration: 45, stepIndex: 1, dependsOn: ['s1'], taskId: 'task-1' }),
    ]
    const endeavor = createMockEndeavor({
      items: [createWorkflowTask('task-1', steps)] as EndeavorWithTasks['items'],
    })

    const result = computeEndeavorCriticalPath(endeavor, [])

    expect(result.nodeIds.size).toBe(1)
    expect(result.nodeIds).toContain('step-s2')
    expect(result.totalDuration).toBe(45)
  })

  it('should include simple task as pseudo-step when not completed', () => {
    const endeavor = createMockEndeavor({
      items: [createSimpleTask('task-simple', { duration: 60 })] as EndeavorWithTasks['items'],
    })

    const result = computeEndeavorCriticalPath(endeavor, [])

    expect(result.nodeIds).toContain('task-task-simple')
    expect(result.totalDuration).toBe(60)
  })

  it('should skip completed simple tasks', () => {
    const endeavor = createMockEndeavor({
      items: [createSimpleTask('task-simple', { completed: true })] as EndeavorWithTasks['items'],
    })

    const result = computeEndeavorCriticalPath(endeavor, [])

    expect(result.nodeIds.size).toBe(0)
    expect(result.totalDuration).toBe(0)
  })

  it('should consider cross-endeavor dependencies', () => {
    // s1 (dur=30), s2 (dur=45, depends on s1 AND cross-dep on 'blocking-step')
    // blocking-step is still pending, so it extends the path through s2
    const steps = [
      createMockStep({ id: 's1', duration: 30, stepIndex: 0, taskId: 'task-1' }),
      createMockStep({ id: 's2', duration: 45, stepIndex: 1, dependsOn: ['s1'], taskId: 'task-1' }),
    ]
    const endeavor = createMockEndeavor({
      items: [createWorkflowTask('task-1', steps)] as EndeavorWithTasks['items'],
    })

    const crossDeps: EndeavorDependencyWithNames[] = [{
      id: 'dep-1',
      endeavorId: 'endeavor-1',
      blockedStepId: 's2',
      blockingStepId: 's1',
      blockingTaskId: 'task-1',
      isHardBlock: true,
      createdAt: new Date(),
      blockingStepName: 'Step 1',
      blockingTaskName: 'Task 1',
      blockingStepStatus: StepStatus.Pending,
    }]

    const result = computeEndeavorCriticalPath(endeavor, crossDeps)

    // Both steps should be on the path
    expect(result.nodeIds).toContain('step-s1')
    expect(result.nodeIds).toContain('step-s2')
  })

  it('should handle zero-duration steps without breaking', () => {
    // A zero-duration dependency root won't appear on the critical path because
    // the strict > comparison in longestPathTo skips 0-duration predecessors,
    // but the algorithm still completes correctly.
    const steps = [
      createMockStep({ id: 's1', duration: 0, stepIndex: 0, taskId: 'task-1' }),
      createMockStep({ id: 's2', duration: 30, stepIndex: 1, dependsOn: ['s1'], taskId: 'task-1' }),
    ]
    const endeavor = createMockEndeavor({
      items: [createWorkflowTask('task-1', steps)] as EndeavorWithTasks['items'],
    })

    const result = computeEndeavorCriticalPath(endeavor, [])

    expect(result.nodeIds).toContain('step-s2')
    expect(result.totalDuration).toBe(30)
  })
})

describe('computeTimeByType', () => {
  const devType = createMockType({ id: 'type-dev', name: 'Development', emoji: '💻', color: '#4A90D9' })
  const designType = createMockType({ id: 'type-design', name: 'Design', emoji: '🎨', color: '#E84D8A' })
  const userTypes = [devType, designType]

  it('should group remaining time by type', () => {
    const steps = [
      createMockStep({ id: 's1', type: 'type-dev', duration: 30, status: StepStatus.Pending, taskId: 'task-1' }),
      createMockStep({ id: 's2', type: 'type-dev', duration: 45, status: StepStatus.Pending, taskId: 'task-1' }),
      createMockStep({ id: 's3', type: 'type-design', duration: 60, status: StepStatus.Pending, taskId: 'task-1' }),
    ]
    const endeavor = createMockEndeavor({
      items: [createWorkflowTask('task-1', steps)] as EndeavorWithTasks['items'],
    })

    const result = computeTimeByType(endeavor, userTypes)

    const devEntry = result.find(e => e.typeId === 'type-dev')
    expect(devEntry).toBeDefined()
    expect(devEntry!.remainingMinutes).toBe(75)
    expect(devEntry!.totalMinutes).toBe(75)

    const designEntry = result.find(e => e.typeId === 'type-design')
    expect(designEntry).toBeDefined()
    expect(designEntry!.remainingMinutes).toBe(60)
  })

  it('should exclude completed steps from remaining but include in total', () => {
    const steps = [
      createMockStep({ id: 's1', type: 'type-dev', duration: 30, status: StepStatus.Completed, taskId: 'task-1' }),
      createMockStep({ id: 's2', type: 'type-dev', duration: 45, status: StepStatus.Pending, taskId: 'task-1' }),
    ]
    const endeavor = createMockEndeavor({
      items: [createWorkflowTask('task-1', steps)] as EndeavorWithTasks['items'],
    })

    const result = computeTimeByType(endeavor, userTypes)

    const devEntry = result.find(e => e.typeId === 'type-dev')
    expect(devEntry!.remainingMinutes).toBe(45)
    expect(devEntry!.totalMinutes).toBe(75)
  })

  it('should use fallback for unknown types', () => {
    const steps = [
      createMockStep({ id: 's1', type: 'unknown-type', duration: 30, taskId: 'task-1' }),
    ]
    const endeavor = createMockEndeavor({
      items: [createWorkflowTask('task-1', steps)] as EndeavorWithTasks['items'],
    })

    const result = computeTimeByType(endeavor, userTypes)

    expect(result).toHaveLength(1)
    expect(result[0].typeId).toBe('unknown-type')
    expect(result[0].remainingMinutes).toBe(30)
  })

  it('should return empty array for empty endeavor', () => {
    const endeavor = createMockEndeavor({ items: [] })

    const result = computeTimeByType(endeavor, userTypes)

    expect(result).toEqual([])
  })

  it('should sort by remaining minutes descending', () => {
    const steps = [
      createMockStep({ id: 's1', type: 'type-dev', duration: 30, taskId: 'task-1' }),
      createMockStep({ id: 's2', type: 'type-design', duration: 90, taskId: 'task-1' }),
    ]
    const endeavor = createMockEndeavor({
      items: [createWorkflowTask('task-1', steps)] as EndeavorWithTasks['items'],
    })

    const result = computeTimeByType(endeavor, userTypes)

    expect(result[0].typeId).toBe('type-design')
    expect(result[1].typeId).toBe('type-dev')
  })

  it('should handle simple tasks', () => {
    const endeavor = createMockEndeavor({
      items: [createSimpleTask('task-1', { type: 'type-dev', duration: 45 })] as EndeavorWithTasks['items'],
    })

    const result = computeTimeByType(endeavor, userTypes)

    expect(result).toHaveLength(1)
    expect(result[0].remainingMinutes).toBe(45)
  })
})

describe('computeAllCriticalPaths', () => {
  it('should return union of critical paths across multiple endeavors', () => {
    const endeavor1 = createMockEndeavor({
      id: 'e1',
      items: [createWorkflowTask('task-1', [
        createMockStep({ id: 's1', duration: 30, taskId: 'task-1' }),
      ])] as EndeavorWithTasks['items'],
    })
    const endeavor2 = createMockEndeavor({
      id: 'e2',
      items: [createWorkflowTask('task-2', [
        createMockStep({ id: 's2', duration: 60, taskId: 'task-2' }),
      ])] as EndeavorWithTasks['items'],
    })

    const deps = new Map<string, EndeavorDependencyWithNames[]>()
    const result = computeAllCriticalPaths([endeavor1, endeavor2], deps)

    expect(result.nodeIds).toContain('step-s1')
    expect(result.nodeIds).toContain('step-s2')
    expect(result.nodeIds.size).toBe(2)
  })

  it('should return empty sets for empty endeavors array', () => {
    const deps = new Map<string, EndeavorDependencyWithNames[]>()
    const result = computeAllCriticalPaths([], deps)

    expect(result.nodeIds.size).toBe(0)
    expect(result.edgeIds.size).toBe(0)
  })

  it('should return empty sets when all steps are completed', () => {
    const endeavor = createMockEndeavor({
      items: [createWorkflowTask('task-1', [
        createMockStep({ id: 's1', status: StepStatus.Completed, taskId: 'task-1' }),
      ])] as EndeavorWithTasks['items'],
    })

    const deps = new Map<string, EndeavorDependencyWithNames[]>()
    const result = computeAllCriticalPaths([endeavor], deps)

    expect(result.nodeIds.size).toBe(0)
    expect(result.edgeIds.size).toBe(0)
  })
})

describe('aggregateTimeByType', () => {
  const devType = createMockType({ id: 'type-dev', name: 'Development', emoji: '💻', color: '#4A90D9' })
  const designType = createMockType({ id: 'type-design', name: 'Design', emoji: '🎨', color: '#E84D8A' })
  const userTypes = [devType, designType]

  it('should aggregate time across multiple endeavors', () => {
    const endeavor1 = createMockEndeavor({
      id: 'e1',
      items: [createWorkflowTask('task-1', [
        createMockStep({ id: 's1', type: 'type-dev', duration: 30, taskId: 'task-1' }),
      ])] as EndeavorWithTasks['items'],
    })
    const endeavor2 = createMockEndeavor({
      id: 'e2',
      items: [createWorkflowTask('task-2', [
        createMockStep({ id: 's2', type: 'type-dev', duration: 45, taskId: 'task-2' }),
      ])] as EndeavorWithTasks['items'],
    })

    const result = aggregateTimeByType([endeavor1, endeavor2], userTypes)

    const devEntry = result.find(e => e.typeName === 'Development')
    expect(devEntry).toBeDefined()
    expect(devEntry!.remaining).toBe(75)
    expect(devEntry!.total).toBe(75)
  })

  it('should include emoji in aggregated results', () => {
    const endeavor = createMockEndeavor({
      items: [createWorkflowTask('task-1', [
        createMockStep({ id: 's1', type: 'type-dev', duration: 30, taskId: 'task-1' }),
      ])] as EndeavorWithTasks['items'],
    })

    const result = aggregateTimeByType([endeavor], userTypes)

    expect(result[0].typeEmoji).toBe('💻')
  })

  it('should return empty array for empty endeavors', () => {
    const result = aggregateTimeByType([], userTypes)
    expect(result).toEqual([])
  })

  it('should sort by remaining time descending', () => {
    const endeavor = createMockEndeavor({
      items: [createWorkflowTask('task-1', [
        createMockStep({ id: 's1', type: 'type-dev', duration: 30, taskId: 'task-1' }),
        createMockStep({ id: 's2', type: 'type-design', duration: 90, taskId: 'task-1' }),
      ])] as EndeavorWithTasks['items'],
    })

    const result = aggregateTimeByType([endeavor], userTypes)

    expect(result[0].typeName).toBe('Design')
    expect(result[1].typeName).toBe('Development')
  })
})
