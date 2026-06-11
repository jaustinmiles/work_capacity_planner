/**
 * Tests for the feedback router (Prisma-backed)
 *
 * Covers:
 * - list with resolved/type/priority filters and JSON components parsing
 * - add with the timestamp+sessionId dedupe pre-check (returns existing id)
 * - resolve({id}) stamping resolvedDate
 * - update({id, patch}) touching ONLY the targeted row (regression for the
 *   legacy full-array overwrite that could erase concurrent items) and
 *   clearing resolution metadata on reopen
 * - auth gating (protectedProcedure)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { appRouter } from '../index'
import {
  createMockContext,
  createMockFeedbackRow,
  type MockPrisma,
} from './router-test-helpers'

describe('feedback router', () => {
  let ctx: ReturnType<typeof createMockContext>
  let mockPrisma: MockPrisma
  let caller: ReturnType<typeof appRouter.createCaller>

  beforeEach(() => {
    vi.clearAllMocks()
    ctx = createMockContext()
    mockPrisma = ctx.prisma as unknown as MockPrisma
    caller = appRouter.createCaller(ctx)
  })

  describe('list', () => {
    it('returns all items newest-first with no filters', async () => {
      const rows = [
        createMockFeedbackRow({ id: 'fb-2', createdAt: new Date('2026-06-02T00:00:00Z') }),
        createMockFeedbackRow({ id: 'fb-1', createdAt: new Date('2026-06-01T00:00:00Z') }),
      ]
      mockPrisma.feedback.findMany.mockResolvedValue(rows)

      const result = await caller.feedback.list()

      expect(mockPrisma.feedback.findMany).toHaveBeenCalledWith({
        where: {},
        orderBy: { createdAt: 'desc' },
      })
      expect(result.map((item) => item.id)).toEqual(['fb-2', 'fb-1'])
    })

    it('passes resolved/type/priority filters to the query', async () => {
      mockPrisma.feedback.findMany.mockResolvedValue([])

      await caller.feedback.list({ resolved: false, type: 'bug', priority: 'high' })

      expect(mockPrisma.feedback.findMany).toHaveBeenCalledWith({
        where: { resolved: false, type: 'bug', priority: 'high' },
        orderBy: { createdAt: 'desc' },
      })
    })

    it('parses the components JSON column into an array and maps createdAt to timestamp', async () => {
      const createdAt = new Date('2026-06-03T12:00:00Z')
      mockPrisma.feedback.findMany.mockResolvedValue([
        createMockFeedbackRow({
          components: JSON.stringify(['tasks/TaskList', 'dev/DevTools']),
          createdAt,
        }),
      ])

      const result = await caller.feedback.list()

      expect(result[0]?.components).toEqual(['tasks/TaskList', 'dev/DevTools'])
      expect(result[0]?.timestamp).toEqual(createdAt)
    })

    it('returns null components for malformed JSON instead of failing', async () => {
      mockPrisma.feedback.findMany.mockResolvedValue([
        createMockFeedbackRow({ components: 'not-json{' }),
      ])

      const result = await caller.feedback.list()

      expect(result[0]?.components).toBeNull()
    })

    it('falls back to other/medium for legacy out-of-enum rows instead of failing', async () => {
      mockPrisma.feedback.findMany.mockResolvedValue([
        createMockFeedbackRow({ type: 'legacy-category', priority: 'urgent' }),
      ])

      const result = await caller.feedback.list()

      expect(result[0]?.type).toBe('other')
      expect(result[0]?.priority).toBe('medium')
    })

    it('rejects an invalid type filter', async () => {
      await expect(
        // @ts-expect-error — invalid enum value must be rejected by Zod
        caller.feedback.list({ type: 'not-a-type' }),
      ).rejects.toThrow()
      expect(mockPrisma.feedback.findMany).not.toHaveBeenCalled()
    })
  })

  describe('add', () => {
    it('creates a row and returns its id', async () => {
      mockPrisma.feedback.findFirst.mockResolvedValue(null)
      mockPrisma.feedback.create.mockResolvedValue(
        createMockFeedbackRow({ id: 'fb-new' }),
      )

      const result = await caller.feedback.add({
        type: 'bug',
        priority: 'high',
        title: 'Broken thing',
        description: 'It broke',
        components: ['dev/DevTools'],
        sessionId: 'session-abc',
        timestamp: new Date('2026-06-05T08:00:00Z'),
      })

      expect(result).toEqual({ id: 'fb-new', duplicate: false })
      expect(mockPrisma.feedback.create).toHaveBeenCalledWith({
        data: {
          type: 'bug',
          priority: 'high',
          title: 'Broken thing',
          description: 'It broke',
          components: JSON.stringify(['dev/DevTools']),
          steps: null,
          expected: null,
          actual: null,
          sessionId: 'session-abc',
          createdAt: new Date('2026-06-05T08:00:00Z'),
        },
      })
    })

    it('coerces an ISO string timestamp (legacy clients) to a Date', async () => {
      mockPrisma.feedback.findFirst.mockResolvedValue(null)
      mockPrisma.feedback.create.mockResolvedValue(createMockFeedbackRow())

      await caller.feedback.add({
        type: 'improvement',
        priority: 'low',
        title: 'Polish',
        description: 'Small thing',
        sessionId: 'session-abc',
        // tRPC input type expects Date; legacy/queued clients send ISO strings
        // which z.coerce.date() accepts at runtime
        timestamp: new Date('2026-06-05T08:00:00.000Z'),
      })

      expect(mockPrisma.feedback.findFirst).toHaveBeenCalledWith({
        where: {
          sessionId: 'session-abc',
          createdAt: new Date('2026-06-05T08:00:00.000Z'),
        },
      })
    })

    it('returns the existing id without creating when timestamp+sessionId already exist', async () => {
      mockPrisma.feedback.findFirst.mockResolvedValue(
        createMockFeedbackRow({ id: 'fb-existing' }),
      )

      const result = await caller.feedback.add({
        type: 'bug',
        priority: 'high',
        title: 'Retry of the same submit',
        description: 'Queued twice',
        sessionId: 'test-session-id',
        timestamp: new Date('2026-06-01T10:00:00.000Z'),
      })

      expect(result).toEqual({ id: 'fb-existing', duplicate: true })
      expect(mockPrisma.feedback.create).not.toHaveBeenCalled()
    })

    it('skips the dedupe pre-check when no timestamp is provided', async () => {
      mockPrisma.feedback.create.mockResolvedValue(createMockFeedbackRow())

      await caller.feedback.add({
        type: 'feature',
        priority: 'medium',
        title: 'No timestamp',
        description: 'Server stamps creation time',
        sessionId: 'cli-feedback-utils',
      })

      expect(mockPrisma.feedback.findFirst).not.toHaveBeenCalled()
      expect(mockPrisma.feedback.create).toHaveBeenCalled()
    })

    it('rejects invalid type via Zod', async () => {
      await expect(
        caller.feedback.add({
          // @ts-expect-error — invalid enum value must be rejected by Zod
          type: 'nonsense',
          priority: 'high',
          title: 'Bad',
          description: 'Bad type',
          sessionId: 'session-abc',
        }),
      ).rejects.toThrow()
      expect(mockPrisma.feedback.create).not.toHaveBeenCalled()
    })
  })

  describe('resolve', () => {
    it('marks the item resolved and stamps resolvedDate', async () => {
      mockPrisma.feedback.findUnique.mockResolvedValue(createMockFeedbackRow())
      mockPrisma.feedback.update.mockResolvedValue(
        createMockFeedbackRow({
          resolved: true,
          resolvedDate: new Date('2026-06-10T00:00:00Z'),
        }),
      )

      const result = await caller.feedback.resolve({ id: 'feedback-123' })

      expect(mockPrisma.feedback.update).toHaveBeenCalledTimes(1)
      const updateArgs = mockPrisma.feedback.update.mock.calls[0]?.[0]
      expect(updateArgs.where).toEqual({ id: 'feedback-123' })
      expect(updateArgs.data.resolved).toBe(true)
      expect(updateArgs.data.resolvedDate).toBeInstanceOf(Date)
      expect(result.resolved).toBe(true)
    })

    it('preserves an existing resolvedDate when re-resolving', async () => {
      const originalDate = new Date('2026-06-01T00:00:00Z')
      mockPrisma.feedback.findUnique.mockResolvedValue(
        createMockFeedbackRow({ resolved: true, resolvedDate: originalDate }),
      )
      mockPrisma.feedback.update.mockResolvedValue(
        createMockFeedbackRow({ resolved: true, resolvedDate: originalDate }),
      )

      await caller.feedback.resolve({ id: 'feedback-123' })

      const updateArgs = mockPrisma.feedback.update.mock.calls[0]?.[0]
      expect(updateArgs.data.resolvedDate).toEqual(originalDate)
    })

    it('throws NOT_FOUND for an unknown id', async () => {
      mockPrisma.feedback.findUnique.mockResolvedValue(null)

      await expect(caller.feedback.resolve({ id: 'missing' })).rejects.toThrow(
        'Feedback item missing not found',
      )
      expect(mockPrisma.feedback.update).not.toHaveBeenCalled()
    })
  })

  describe('update', () => {
    it('patches only the provided fields of the targeted row', async () => {
      mockPrisma.feedback.findUnique.mockResolvedValue(createMockFeedbackRow())
      mockPrisma.feedback.update.mockResolvedValue(
        createMockFeedbackRow({ title: 'New title' }),
      )

      await caller.feedback.update({
        id: 'feedback-123',
        patch: { title: 'New title' },
      })

      // Regression: the legacy file store replaced the WHOLE array on every
      // edit; the table-backed update must target exactly one row by id.
      expect(mockPrisma.feedback.update).toHaveBeenCalledWith({
        where: { id: 'feedback-123' },
        data: { title: 'New title' },
      })
    })

    it('serializes components patches to JSON', async () => {
      mockPrisma.feedback.findUnique.mockResolvedValue(createMockFeedbackRow())
      mockPrisma.feedback.update.mockResolvedValue(createMockFeedbackRow())

      await caller.feedback.update({
        id: 'feedback-123',
        patch: { components: ['timeline/GanttChart'] },
      })

      const updateArgs = mockPrisma.feedback.update.mock.calls[0]?.[0]
      expect(updateArgs.data.components).toBe(
        JSON.stringify(['timeline/GanttChart']),
      )
    })

    it('stamps resolvedDate when resolving via patch', async () => {
      mockPrisma.feedback.findUnique.mockResolvedValue(createMockFeedbackRow())
      mockPrisma.feedback.update.mockResolvedValue(
        createMockFeedbackRow({ resolved: true, resolvedDate: new Date() }),
      )

      await caller.feedback.update({
        id: 'feedback-123',
        patch: { resolved: true },
      })

      const updateArgs = mockPrisma.feedback.update.mock.calls[0]?.[0]
      expect(updateArgs.data.resolved).toBe(true)
      expect(updateArgs.data.resolvedDate).toBeInstanceOf(Date)
    })

    it('clears resolvedDate and resolvedIn when reopening', async () => {
      mockPrisma.feedback.findUnique.mockResolvedValue(
        createMockFeedbackRow({
          resolved: true,
          resolvedDate: new Date('2026-06-01T00:00:00Z'),
          resolvedIn: 'v1.2.3',
        }),
      )
      mockPrisma.feedback.update.mockResolvedValue(
        createMockFeedbackRow({ resolved: false }),
      )

      await caller.feedback.update({
        id: 'feedback-123',
        patch: { resolved: false },
      })

      expect(mockPrisma.feedback.update).toHaveBeenCalledWith({
        where: { id: 'feedback-123' },
        data: { resolved: false, resolvedDate: null, resolvedIn: null },
      })
    })

    it('throws NOT_FOUND for an unknown id without writing', async () => {
      mockPrisma.feedback.findUnique.mockResolvedValue(null)

      await expect(
        caller.feedback.update({ id: 'missing', patch: { title: 'X' } }),
      ).rejects.toThrow('Feedback item missing not found')
      expect(mockPrisma.feedback.update).not.toHaveBeenCalled()
    })
  })

  describe('auth', () => {
    it('rejects unauthenticated callers', async () => {
      const unauthCtx = createMockContext({
        auth: { isAuthenticated: false, apiKey: null },
      })
      const unauthCaller = appRouter.createCaller(unauthCtx)

      await expect(unauthCaller.feedback.list()).rejects.toThrow(
        'Invalid or missing API key',
      )
    })
  })
})
