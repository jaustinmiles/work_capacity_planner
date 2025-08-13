import { Task } from '@shared/types'
import { SequencedTask, TaskStep } from '@shared/sequencing-types'

/**
 * Type-safe factories for creating test data
 * These ensure all required fields are present with correct types
 */

export function createMockTask(overrides?: Partial<Task>): Task {
  return {
    id: 'task-' + Math.random().toString(36).substr(2, 9),
    name: 'Test Task',
    duration: 60,
    importance: 5,
    urgency: 5,
    type: 'focused',
    asyncWaitTime: 0,
    dependencies: [],
    completed: false,
    sessionId: 'test-session',
    hasSteps: false,
    overallStatus: 'not_started',
    criticalPathDuration: 60,
    worstCaseDuration: 60,
    createdAt: new Date(),
    updatedAt: new Date(),
    // Optional fields explicitly set to undefined
    notes: undefined,
    deadline: undefined,
    completedAt: undefined,
    actualDuration: undefined,
    currentStepId: undefined,
    steps: undefined,
    ...overrides,
  }
}

export function createMockTaskStep(overrides?: Partial<TaskStep>): TaskStep {
  return {
    id: 'step-' + Math.random().toString(36).substr(2, 9),
    taskId: 'task-1',
    name: 'Test Step',
    duration: 30,
    type: 'focused',
    dependsOn: [],
    asyncWaitTime: 0,
    status: 'pending',
    stepIndex: 0,
    percentComplete: 0,
    // Optional fields
    completedAt: undefined,
    actualDuration: undefined,
    startedAt: undefined,
    ...overrides,
  }
}

export function createMockSequencedTask(overrides?: Partial<SequencedTask>): SequencedTask {
  const base = createMockTask({
    hasSteps: true,
    ...overrides,
  })

  return {
    ...base,
    hasSteps: true, // Must be true for SequencedTask
    steps: overrides?.steps || [
      createMockTaskStep({ taskId: base.id }),
    ],
  } as SequencedTask
}

// For Prisma mocks - these return database format, not application format
export function createMockPrismaTask(overrides?: any) {
  return {
    id: overrides?.id || 'task-1',
    name: overrides?.name || 'Test Task',
    duration: overrides?.duration || 60,
    importance: overrides?.importance || 5,
    urgency: overrides?.urgency || 5,
    type: overrides?.type || 'focused',
    asyncWaitTime: overrides?.asyncWaitTime || 0,
    dependencies: JSON.stringify(overrides?.dependencies || []),
    completed: overrides?.completed || false,
    sessionId: overrides?.sessionId || 'test-session',
    hasSteps: overrides?.hasSteps || false,
    overallStatus: overrides?.overallStatus || 'not_started',
    criticalPathDuration: overrides?.criticalPathDuration || 60,
    worstCaseDuration: overrides?.worstCaseDuration || 60,
    createdAt: overrides?.createdAt || new Date(),
    updatedAt: overrides?.updatedAt || new Date(),
    // Database stores these as null, not undefined
    notes: overrides?.notes ?? null,
    deadline: overrides?.deadline ?? null,
    completedAt: overrides?.completedAt ?? null,
    actualDuration: overrides?.actualDuration ?? null,
    currentStepId: overrides?.currentStepId ?? null,
  }
}

export function createMockPrismaSequencedTask(overrides?: any) {
  return {
    ...createMockPrismaTask({
      hasSteps: true,
      ...overrides,
    }),
    totalDuration: overrides?.duration || 180,
    // Note: Prisma uses totalDuration, not duration
  }
}

export function createMockWorkSession(overrides?: any) {
  return {
    id: 'session-' + Math.random().toString(36).substr(2, 9),
    taskId: 'task-1',
    type: 'focused' as const,
    startTime: new Date(),
    endTime: null,
    plannedMinutes: 30,
    actualMinutes: null,
    notes: null,
    stepId: null,
    ...overrides,
  }
}
