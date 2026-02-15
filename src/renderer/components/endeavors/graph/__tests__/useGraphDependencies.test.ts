import { describe, it, expect } from 'vitest'
import { StepStatus, EndeavorStatus } from '@shared/enums'
import type { EndeavorWithTasks, TaskStep } from '@shared/types'
import { parseGraphNodeId } from '../useGraphDependencies'

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

// --- Tests ---

describe('parseGraphNodeId', () => {
  it('should parse step-{id} format correctly', () => {
    const steps = [createMockStep({ id: 'abc123', taskId: 'task-1' })]
    const endeavor = createMockEndeavor({
      id: 'e1',
      items: [createWorkflowItem('task-1', steps)] as EndeavorWithTasks['items'],
    })

    const result = parseGraphNodeId('step-abc123', [endeavor])

    expect(result).not.toBeNull()
    expect(result!.type).toBe('step')
    expect(result!.id).toBe('abc123')
    expect(result!.endeavorId).toBe('e1')
    expect(result!.taskId).toBe('task-1')
  })

  it('should parse task-{id} format correctly', () => {
    const endeavor = createMockEndeavor({
      id: 'e1',
      items: [createSimpleItem('xyz789')] as EndeavorWithTasks['items'],
    })

    const result = parseGraphNodeId('task-xyz789', [endeavor])

    expect(result).not.toBeNull()
    expect(result!.type).toBe('task')
    expect(result!.id).toBe('xyz789')
    expect(result!.endeavorId).toBe('e1')
    expect(result!.taskId).toBe('xyz789')
  })

  it('should return null for unknown node ID format', () => {
    const endeavor = createMockEndeavor({
      items: [createSimpleItem('task-1')] as EndeavorWithTasks['items'],
    })

    const result = parseGraphNodeId('unknown-abc123', [endeavor])

    expect(result).toBeNull()
  })

  it('should return null when node not found in endeavors', () => {
    const endeavor = createMockEndeavor({
      items: [createSimpleItem('task-1')] as EndeavorWithTasks['items'],
    })

    const result = parseGraphNodeId('step-nonexistent', [endeavor])

    expect(result).toBeNull()
  })

  it('should search across multiple endeavors', () => {
    const endeavor1 = createMockEndeavor({
      id: 'e1',
      items: [createSimpleItem('task-1')] as EndeavorWithTasks['items'],
    })
    const endeavor2 = createMockEndeavor({
      id: 'e2',
      items: [createWorkflowItem('task-2', [
        createMockStep({ id: 'target-step', taskId: 'task-2' }),
      ])] as EndeavorWithTasks['items'],
    })

    const result = parseGraphNodeId('step-target-step', [endeavor1, endeavor2])

    expect(result).not.toBeNull()
    expect(result!.endeavorId).toBe('e2')
    expect(result!.taskId).toBe('task-2')
  })

  it('should return null for empty endeavors array', () => {
    const result = parseGraphNodeId('step-abc123', [])
    expect(result).toBeNull()
  })
})
