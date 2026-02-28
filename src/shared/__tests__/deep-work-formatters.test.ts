import { describe, it, expect } from 'vitest'
import {
  formatTaskFromPrisma,
  formatStepFromPrisma,
} from '../deep-work-formatters'
import type { PrismaTaskResult, PrismaStepResult } from '../deep-work-formatters'
import { StepStatus } from '../enums'

// =============================================================================
// Test Helpers
// =============================================================================

function makeBasePrismaTask(overrides: Partial<PrismaTaskResult> = {}): PrismaTaskResult {
  return {
    id: 'task-1',
    name: 'Test Task',
    duration: 30,
    importance: 5,
    urgency: 5,
    type: 'focused',
    category: 'default',
    asyncWaitTime: 0,
    dependencies: '[]',
    completed: false,
    completedAt: null,
    actualDuration: null,
    notes: null,
    projectId: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    sessionId: null,
    deadline: null,
    deadlineType: null,
    cognitiveComplexity: null,
    isLocked: false,
    lockedStartTime: null,
    hasSteps: false,
    currentStepId: null,
    overallStatus: 'not_started',
    criticalPathDuration: 0,
    worstCaseDuration: 0,
    archived: false,
    inActiveSprint: false,
    ...overrides,
  }
}

function makeBasePrismaStep(overrides: Partial<PrismaStepResult> = {}): PrismaStepResult {
  return {
    id: 'step-1',
    name: 'Test Step',
    duration: 15,
    type: 'focused',
    dependsOn: '[]',
    asyncWaitTime: 0,
    status: 'pending',
    stepIndex: 0,
    taskId: 'task-1',
    percentComplete: 0,
    actualDuration: null,
    startedAt: null,
    completedAt: null,
    notes: null,
    cognitiveComplexity: null,
    isAsyncTrigger: false,
    expectedResponseTime: null,
    importance: null,
    urgency: null,
    ...overrides,
  }
}

// =============================================================================
// formatTaskFromPrisma
// =============================================================================

describe('formatTaskFromPrisma', () => {
  it('formats a basic task with default/null fields', () => {
    const prismaTask = makeBasePrismaTask()
    const result = formatTaskFromPrisma(prismaTask)

    expect(result.id).toBe('task-1')
    expect(result.name).toBe('Test Task')
    expect(result.duration).toBe(30)
    expect(result.sessionId).toBe('') // null → ''
    expect(result.deadline).toBeUndefined() // null → undefined
    expect(result.completedAt).toBeUndefined()
    expect(result.actualDuration).toBeUndefined()
    expect(result.notes).toBeUndefined()
    expect(result.projectId).toBeUndefined()
    expect(result.lockedStartTime).toBeUndefined()
    expect(result.currentStepId).toBeUndefined()
  })

  it('parses JSON dependencies string into array', () => {
    const prismaTask = makeBasePrismaTask({
      dependencies: '["dep-1", "dep-2"]',
    })
    const result = formatTaskFromPrisma(prismaTask)

    expect(result.dependencies).toEqual(['dep-1', 'dep-2'])
  })

  it('parses empty dependencies string as empty array', () => {
    const prismaTask = makeBasePrismaTask({ dependencies: '' })
    const result = formatTaskFromPrisma(prismaTask)

    expect(result.dependencies).toEqual([])
  })

  it('preserves non-null optional fields', () => {
    const now = new Date('2024-06-15T12:00:00Z')
    const prismaTask = makeBasePrismaTask({
      sessionId: 'session-abc',
      deadline: now,
      completedAt: now,
      actualDuration: 25,
      notes: 'Important task',
      projectId: 'proj-1',
      lockedStartTime: now,
      currentStepId: 'step-x',
      deadlineType: 'hard',
      cognitiveComplexity: 4,
    })
    const result = formatTaskFromPrisma(prismaTask)

    expect(result.sessionId).toBe('session-abc')
    expect(result.deadline).toEqual(now)
    expect(result.completedAt).toEqual(now)
    expect(result.actualDuration).toBe(25)
    expect(result.notes).toBe('Important task')
    expect(result.projectId).toBe('proj-1')
    expect(result.lockedStartTime).toEqual(now)
    expect(result.currentStepId).toBe('step-x')
    expect(result.deadlineType).toBe('hard')
    expect(result.cognitiveComplexity).toBe(4)
  })

  it('casts overallStatus to TaskStatus type', () => {
    const prismaTask = makeBasePrismaTask({ overallStatus: 'in_progress' })
    const result = formatTaskFromPrisma(prismaTask)

    expect(result.overallStatus).toBe('in_progress')
  })

  it('formats included TaskStep array', () => {
    const prismaTask = makeBasePrismaTask({
      hasSteps: true,
      TaskStep: [
        makeBasePrismaStep({ id: 'step-a', name: 'Step A' }),
        makeBasePrismaStep({ id: 'step-b', name: 'Step B', dependsOn: '["step-a"]' }),
      ],
    })
    const result = formatTaskFromPrisma(prismaTask)

    expect(result.steps).toHaveLength(2)
    expect(result.steps![0]!.id).toBe('step-a')
    expect(result.steps![0]!.dependsOn).toEqual([])
    expect(result.steps![1]!.id).toBe('step-b')
    expect(result.steps![1]!.dependsOn).toEqual(['step-a'])
  })

  it('returns undefined steps when TaskStep is not included', () => {
    const prismaTask = makeBasePrismaTask()
    const result = formatTaskFromPrisma(prismaTask)

    expect(result.steps).toBeUndefined()
  })
})

// =============================================================================
// formatStepFromPrisma
// =============================================================================

describe('formatStepFromPrisma', () => {
  it('formats a basic step with default/null fields', () => {
    const prismaStep = makeBasePrismaStep()
    const result = formatStepFromPrisma(prismaStep)

    expect(result.id).toBe('step-1')
    expect(result.name).toBe('Test Step')
    expect(result.duration).toBe(15)
    expect(result.status).toBe(StepStatus.Pending)
    expect(result.dependsOn).toEqual([])
    expect(result.startedAt).toBeUndefined()
    expect(result.completedAt).toBeUndefined()
    expect(result.actualDuration).toBeUndefined()
    expect(result.notes).toBeUndefined()
    expect(result.cognitiveComplexity).toBeNull()
    expect(result.importance).toBeUndefined()
    expect(result.urgency).toBeUndefined()
    expect(result.expectedResponseTime).toBeUndefined()
  })

  it('parses JSON dependsOn string into array', () => {
    const prismaStep = makeBasePrismaStep({
      dependsOn: '["step-a", "step-b"]',
    })
    const result = formatStepFromPrisma(prismaStep)

    expect(result.dependsOn).toEqual(['step-a', 'step-b'])
  })

  it('parses empty dependsOn string as empty array', () => {
    const prismaStep = makeBasePrismaStep({ dependsOn: '' })
    const result = formatStepFromPrisma(prismaStep)

    expect(result.dependsOn).toEqual([])
  })

  it('preserves non-null optional fields', () => {
    const now = new Date('2024-06-15T12:00:00Z')
    const prismaStep = makeBasePrismaStep({
      status: 'in_progress',
      startedAt: now,
      completedAt: now,
      actualDuration: 12,
      notes: 'Step notes here',
      cognitiveComplexity: 3,
      importance: 7,
      urgency: 8,
      expectedResponseTime: 120,
    })
    const result = formatStepFromPrisma(prismaStep)

    expect(result.status).toBe(StepStatus.InProgress)
    expect(result.startedAt).toEqual(now)
    expect(result.completedAt).toEqual(now)
    expect(result.actualDuration).toBe(12)
    expect(result.notes).toBe('Step notes here')
    expect(result.cognitiveComplexity).toBe(3)
    expect(result.importance).toBe(7)
    expect(result.urgency).toBe(8)
    expect(result.expectedResponseTime).toBe(120)
  })

  it('maps status string to StepStatus enum', () => {
    const statuses = ['pending', 'in_progress', 'completed', 'waiting', 'skipped'] as const
    for (const status of statuses) {
      const prismaStep = makeBasePrismaStep({ status })
      const result = formatStepFromPrisma(prismaStep)
      expect(result.status).toBe(status)
    }
  })
})
