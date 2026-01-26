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
      findFirst: vi.fn(),
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
      updateMany: vi.fn(),
      delete: vi.fn(),
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
      findUnique: vi.fn(),
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
      findUnique: vi.fn(),
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
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      upsert: vi.fn(),
      delete: vi.fn(),
    },
    contextEntry: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    appLog: {
      create: vi.fn(),
      createMany: vi.fn(),
      findMany: vi.fn(),
      groupBy: vi.fn(),
      deleteMany: vi.fn(),
    },
    scheduleSnapshot: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
    userTaskType: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    jargonEntry: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
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

/**
 * Creates a mock time sink for testing
 */
export function createMockTimeSink(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sink-123',
    sessionId: 'test-session-id',
    name: 'Phone Calls',
    emoji: '📞',
    color: '#FF5733',
    typeId: null,
    sortOrder: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

/**
 * Creates a mock time sink session for testing
 */
export function createMockTimeSinkSession(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sinksession-123',
    timeSinkId: 'sink-123',
    startTime: new Date(),
    endTime: null,
    actualMinutes: null,
    notes: null,
    ...overrides,
  }
}

/**
 * Creates a mock conversation for testing
 */
export function createMockConversation(overrides: Record<string, unknown> = {}) {
  return {
    id: 'conv-123',
    sessionId: 'test-session-id',
    title: 'Test Conversation',
    jobContextId: null,
    isArchived: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ChatMessage: [],
    JobContext: null,
    ...overrides,
  }
}

/**
 * Creates a mock chat message for testing
 */
export function createMockChatMessage(overrides: Record<string, unknown> = {}) {
  return {
    id: 'msg-123',
    conversationId: 'conv-123',
    role: 'user',
    content: 'Hello',
    amendments: null,
    createdAt: new Date(),
    ...overrides,
  }
}

/**
 * Creates a mock job context for testing
 */
export function createMockJobContext(overrides: Record<string, unknown> = {}) {
  return {
    id: 'jctx-123',
    sessionId: 'test-session-id',
    name: 'Development',
    description: 'Software development context',
    context: 'Working on Task Planner',
    asyncPatterns: '',
    reviewCycles: '',
    tools: '',
    isActive: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ContextEntry: [],
    ...overrides,
  }
}

/**
 * Creates a mock context entry for testing
 */
export function createMockContextEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: 'entry-123',
    jobContextId: 'jctx-123',
    key: 'tech_stack',
    value: 'TypeScript, React',
    category: 'technical',
    notes: null,
    ...overrides,
  }
}

/**
 * Creates a mock jargon entry for testing
 */
export function createMockJargonEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: 'jargon-123',
    sessionId: 'test-session-id',
    term: 'MVP',
    definition: 'Minimum Viable Product',
    category: 'business',
    examples: null,
    relatedTerms: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

/**
 * Creates a mock user task type for testing
 */
export function createMockUserTaskType(overrides: Record<string, unknown> = {}) {
  return {
    id: 'type-123',
    sessionId: 'test-session-id',
    name: 'Development',
    emoji: '💻',
    color: '#3B82F6',
    sortOrder: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

/**
 * Creates a mock session for testing
 */
export function createMockSession(overrides: Record<string, unknown> = {}) {
  return {
    id: 'session-123',
    name: 'Default Session',
    description: null,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

/**
 * Creates a mock schedule snapshot for testing
 */
export function createMockSnapshot(overrides: Record<string, unknown> = {}) {
  return {
    id: 'snapshot-123',
    sessionId: 'test-session-id',
    label: 'Morning Snapshot',
    snapshotData: '{}',
    createdAt: new Date(),
    ...overrides,
  }
}

/**
 * Creates a mock app log entry for testing
 */
export function createMockAppLog(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    level: 'info',
    message: 'Test log',
    source: 'test',
    context: '{}',
    sessionId: 'test-session-id',
    createdAt: new Date(),
    ...overrides,
  }
}
