/**
 * Test utilities for server router tests
 *
 * Provides mock context creation and common test helpers
 */

import { vi } from 'vitest'
import type { Context } from '../../trpc'

/**
 * Creates a mock Prisma client with all models stubbed
 */
export function createMockPrisma() {
  return {
    task: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    taskStep: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      createMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    workSession: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    workPattern: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    workBlock: {
      findMany: vi.fn(),
      create: vi.fn(),
      createMany: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    workMeeting: {
      findMany: vi.fn(),
      create: vi.fn(),
      createMany: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    session: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    timeSink: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    timeSinkSession: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    conversation: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    chatMessage: {
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    jargonTerm: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    jobContext: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn(),
    },
    contextEntry: {
      findMany: vi.fn(),
      create: vi.fn(),
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
    $transaction: vi.fn((callback) => {
      // For simple transactions, just execute the callback
      if (typeof callback === 'function') {
        return callback(createMockPrisma())
      }
      // For array of promises, resolve them
      return Promise.all(callback)
    }),
  }
}

export type MockPrisma = ReturnType<typeof createMockPrisma>

/**
 * Creates a mock tRPC context for testing
 */
export function createMockContext(overrides: Partial<Context> = {}): Context {
  const mockPrisma = createMockPrisma()

  return {
    prisma: mockPrisma as unknown as Context['prisma'],
    auth: {
      isAuthenticated: true,
      apiKey: 'test-api-key',
    },
    activeSessionId: 'test-session-id',
    ...overrides,
  }
}

/**
 * Creates a mock task for testing
 */
export function createMockTask(overrides: Record<string, unknown> = {}) {
  return {
    id: 'task-123',
    name: 'Test Task',
    type: 'development',
    duration: 60,
    importance: 5,
    urgency: 5,
    completed: false,
    archived: false,
    hasSteps: false,
    overallStatus: 'not_started',
    dependencies: '[]',
    criticalPathDuration: 60,
    worstCaseDuration: 60,
    cumulativeMinutesSpent: 0,
    sessionId: 'test-session-id',
    createdAt: new Date(),
    updatedAt: new Date(),
    deadline: null,
    deadlineType: null,
    notes: null,
    startedAt: null,
    completedAt: null,
    ...overrides,
  }
}

/**
 * Creates a mock task step for testing
 */
export function createMockStep(overrides: Record<string, unknown> = {}) {
  return {
    id: 'step-123',
    taskId: 'task-123',
    name: 'Test Step',
    type: 'development',
    duration: 30,
    stepIndex: 0,
    status: 'pending',
    percentComplete: 0,
    dependsOn: '[]',
    asyncWaitTime: 0,
    cognitiveComplexity: null,
    isAsyncTrigger: false,
    expectedResponseTime: null,
    actualDuration: null,
    notes: null,
    importance: null,
    urgency: null,
    startedAt: null,
    completedAt: null,
    ...overrides,
  }
}

/**
 * Creates a mock work session for testing
 */
export function createMockWorkSession(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ws-123',
    taskId: 'task-123',
    stepId: null,
    sessionId: 'test-session-id',
    date: '2025-01-26',
    startTime: new Date(),
    endTime: null,
    plannedMinutes: 60,
    actualMinutes: null,
    notes: null,
    type: 'development',
    ...overrides,
  }
}
