/**
 * Integration test utilities for server router tests
 *
 * Uses tRPC's createCaller to actually invoke router procedures,
 * providing real code coverage on the router logic.
 */

import { vi } from 'vitest'
import type { Context } from '../../trpc'
import { appRouter } from '../index'

/**
 * Creates a mock Prisma client for integration tests
 * These mocks return data that allows the router code to execute
 */
export function createIntegrationMockPrisma() {
  return {
    task: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation((args) => Promise.resolve({
        id: 'task-new',
        ...args.data,
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
      update: vi.fn().mockImplementation((args) => Promise.resolve({
        id: args.where.id,
        ...args.data,
        updatedAt: new Date(),
      })),
      delete: vi.fn().mockImplementation((args) => Promise.resolve({ id: args.where.id })),
    },
    taskStep: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation((args) => Promise.resolve({
        id: 'step-new',
        ...args.data,
      })),
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
      update: vi.fn().mockImplementation((args) => Promise.resolve({
        id: args.where.id,
        ...args.data,
      })),
      delete: vi.fn().mockImplementation((args) => Promise.resolve({ id: args.where.id })),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    workSession: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation((args) => Promise.resolve({
        id: 'ws-new',
        ...args.data,
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
      update: vi.fn().mockImplementation((args) => Promise.resolve({
        id: args.where.id,
        ...args.data,
        updatedAt: new Date(),
      })),
      delete: vi.fn().mockImplementation((args) => Promise.resolve({ id: args.where.id })),
      aggregate: vi.fn().mockResolvedValue({ _sum: { actualMinutes: 0 } }),
    },
    workPattern: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation((args) => Promise.resolve({
        id: 'pattern-new',
        ...args.data,
        WorkBlock: [],
        WorkMeeting: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
      update: vi.fn().mockImplementation((args) => Promise.resolve({
        id: args.where.id,
        ...args.data,
        WorkBlock: [],
        WorkMeeting: [],
        updatedAt: new Date(),
      })),
      delete: vi.fn().mockImplementation((args) => Promise.resolve({ id: args.where.id })),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    workBlock: {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockImplementation((args) => Promise.resolve({
        id: 'block-new',
        ...args.data,
      })),
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
      delete: vi.fn().mockResolvedValue({}),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    workMeeting: {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockImplementation((args) => Promise.resolve({
        id: 'meeting-new',
        ...args.data,
      })),
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
      delete: vi.fn().mockResolvedValue({}),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    session: {
      findFirst: vi.fn().mockResolvedValue({ id: 'test-session', name: 'Test Session' }),
      findUnique: vi.fn().mockResolvedValue({ id: 'test-session', name: 'Test Session' }),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockImplementation((args) => Promise.resolve({
        id: 'session-new',
        ...args.data,
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
      update: vi.fn().mockImplementation((args) => Promise.resolve({
        id: args.where.id,
        ...args.data,
      })),
    },
    timeSink: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation((args) => Promise.resolve({
        id: 'sink-new',
        ...args.data,
        createdAt: new Date(),
      })),
      update: vi.fn().mockImplementation((args) => Promise.resolve({
        id: args.where.id,
        ...args.data,
      })),
      delete: vi.fn().mockImplementation((args) => Promise.resolve({ id: args.where.id })),
    },
    timeSinkSession: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation((args) => Promise.resolve({
        id: 'sinksession-new',
        ...args.data,
        createdAt: new Date(),
      })),
      update: vi.fn().mockImplementation((args) => Promise.resolve({
        id: args.where.id,
        ...args.data,
      })),
      delete: vi.fn().mockImplementation((args) => Promise.resolve({ id: args.where.id })),
    },
    conversation: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation((args) => Promise.resolve({
        id: 'conv-new',
        ...args.data,
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
      update: vi.fn().mockImplementation((args) => Promise.resolve({
        id: args.where.id,
        ...args.data,
      })),
      delete: vi.fn().mockImplementation((args) => Promise.resolve({ id: args.where.id })),
    },
    chatMessage: {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockImplementation((args) => Promise.resolve({
        id: 'msg-new',
        ...args.data,
        createdAt: new Date(),
      })),
      update: vi.fn().mockImplementation((args) => Promise.resolve({
        id: args.where.id,
        ...args.data,
      })),
      delete: vi.fn().mockImplementation((args) => Promise.resolve({ id: args.where.id })),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    jargonTerm: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation((args) => Promise.resolve({
        id: 'jargon-new',
        ...args.data,
        createdAt: new Date(),
      })),
      update: vi.fn().mockImplementation((args) => Promise.resolve({
        id: args.where.id,
        ...args.data,
      })),
      delete: vi.fn().mockImplementation((args) => Promise.resolve({ id: args.where.id })),
    },
    jobContext: {
      findFirst: vi.fn().mockResolvedValue(null),
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation((args) => Promise.resolve({
        id: 'jobctx-new',
        ...args.data,
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
      update: vi.fn().mockImplementation((args) => Promise.resolve({
        id: args.where.id,
        ...args.data,
      })),
      upsert: vi.fn().mockImplementation((args) => Promise.resolve({
        id: args.where.id || 'jobctx-new',
        ...args.create,
        ...args.update,
      })),
    },
    contextEntry: {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockImplementation((args) => Promise.resolve({
        id: 'entry-new',
        ...args.data,
      })),
      upsert: vi.fn().mockImplementation((args) => Promise.resolve({
        id: args.where.id || 'entry-new',
        ...args.create,
        ...args.update,
      })),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    $transaction: vi.fn().mockImplementation(async (callback) => {
      if (typeof callback === 'function') {
        const mockTx = createIntegrationMockPrisma()
        return callback(mockTx)
      }
      return Promise.all(callback)
    }),
  }
}

export type IntegrationMockPrisma = ReturnType<typeof createIntegrationMockPrisma>

/**
 * Creates an integration test context with mocked Prisma
 */
export function createIntegrationContext(
  mockPrisma: IntegrationMockPrisma,
  overrides: Partial<Context> = {},
): Context {
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
 * Creates a tRPC caller for testing router procedures directly
 * This allows us to invoke procedures and get actual code coverage
 */
export function createTestCaller(mockPrisma: IntegrationMockPrisma) {
  const ctx = createIntegrationContext(mockPrisma)
  return appRouter.createCaller(ctx)
}

/**
 * Creates a session-aware test caller (with sessionId in context)
 */
export function createSessionTestCaller(mockPrisma: IntegrationMockPrisma, sessionId = 'test-session-id') {
  // Ensure the session exists for session procedures
  mockPrisma.session.findUnique.mockResolvedValue({
    id: sessionId,
    name: 'Test Session',
    createdAt: new Date(),
    updatedAt: new Date(),
  })

  const ctx = createIntegrationContext(mockPrisma, { activeSessionId: sessionId })
  return {
    caller: appRouter.createCaller(ctx),
    ctx,
  }
}
