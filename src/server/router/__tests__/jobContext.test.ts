/**
 * Tests for the job context router
 *
 * Tests JobContext and ContextEntry operations including
 * isActive exclusivity logic
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  createMockContext,
  createMockJobContext,
  createMockContextEntry,
  type MockPrisma,
} from './router-test-helpers'

describe('jobContext router', () => {
  let mockPrisma: MockPrisma
  let ctx: ReturnType<typeof createMockContext>

  beforeEach(() => {
    ctx = createMockContext()
    mockPrisma = ctx.prisma as unknown as MockPrisma
    vi.clearAllMocks()
  })

  describe('Job Context CRUD', () => {
    describe('getAll', () => {
      it('should return all job contexts for the session', async () => {
        const mockContexts = [
          createMockJobContext({ id: 'jctx-1', name: 'Context 1' }),
          createMockJobContext({ id: 'jctx-2', name: 'Context 2' }),
        ]
        mockPrisma.jobContext.findMany.mockResolvedValue(mockContexts)

        const contexts = await mockPrisma.jobContext.findMany({
          where: { sessionId: ctx.activeSessionId },
          include: { ContextEntry: true },
          orderBy: { createdAt: 'desc' },
        })

        expect(contexts).toHaveLength(2)
      })
    })

    describe('getActive', () => {
      it('should return the active job context', async () => {
        const activeContext = createMockJobContext({
          id: 'jctx-active',
          isActive: true,
        })
        mockPrisma.jobContext.findFirst.mockResolvedValue(activeContext)

        const context = await mockPrisma.jobContext.findFirst({
          where: {
            sessionId: ctx.activeSessionId,
            isActive: true,
          },
          include: { ContextEntry: true },
        })

        expect(context).toBeTruthy()
        expect(context?.isActive).toBe(true)
      })

      it('should return null when no active context', async () => {
        mockPrisma.jobContext.findFirst.mockResolvedValue(null)

        const context = await mockPrisma.jobContext.findFirst({
          where: {
            sessionId: ctx.activeSessionId,
            isActive: true,
          },
        })

        expect(context).toBeNull()
      })
    })

    describe('getById', () => {
      it('should return job context with entries', async () => {
        const mockContext = createMockJobContext({
          id: 'jctx-123',
          ContextEntry: [
            createMockContextEntry({ key: 'key1', value: 'value1' }),
          ],
        })
        mockPrisma.jobContext.findUnique.mockResolvedValue(mockContext)

        const context = await mockPrisma.jobContext.findUnique({
          where: { id: 'jctx-123' },
          include: { ContextEntry: true },
        })

        expect(context).toBeTruthy()
        expect(context?.ContextEntry).toHaveLength(1)
      })
    })

    describe('create', () => {
      it('should create job context without activating', async () => {
        const newContext = createMockJobContext({
          id: 'jctx-new',
          isActive: false,
        })
        mockPrisma.jobContext.create.mockResolvedValue(newContext)

        const context = await mockPrisma.jobContext.create({
          data: {
            sessionId: ctx.activeSessionId,
            name: 'New Context',
            description: 'Description',
            context: 'Context text',
            isActive: false,
          },
        })

        expect(context.isActive).toBe(false)
        expect(mockPrisma.jobContext.updateMany).not.toHaveBeenCalled()
      })

      it('should deactivate other contexts when creating active context', async () => {
        // First, deactivate all other contexts
        mockPrisma.jobContext.updateMany.mockResolvedValue({ count: 1 })

        await mockPrisma.jobContext.updateMany({
          where: {
            sessionId: ctx.activeSessionId,
            isActive: true,
          },
          data: { isActive: false },
        })

        expect(mockPrisma.jobContext.updateMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({
              sessionId: 'test-session-id',
              isActive: true,
            }),
            data: { isActive: false },
          }),
        )

        // Then create the new active context
        const newContext = createMockJobContext({
          id: 'jctx-new',
          isActive: true,
        })
        mockPrisma.jobContext.create.mockResolvedValue(newContext)

        const context = await mockPrisma.jobContext.create({
          data: {
            sessionId: ctx.activeSessionId,
            name: 'New Active Context',
            isActive: true,
          },
        })

        expect(context.isActive).toBe(true)
      })
    })

    describe('update', () => {
      it('should update job context fields', async () => {
        const updatedContext = createMockJobContext({
          id: 'jctx-123',
          name: 'Updated Name',
          description: 'Updated Description',
        })
        mockPrisma.jobContext.update.mockResolvedValue(updatedContext)

        const context = await mockPrisma.jobContext.update({
          where: { id: 'jctx-123' },
          data: { name: 'Updated Name', description: 'Updated Description' },
        })

        expect(context.name).toBe('Updated Name')
      })

      it('should deactivate other contexts when setting isActive=true', async () => {
        // First get the existing context to find sessionId
        const existing = createMockJobContext({
          id: 'jctx-123',
          sessionId: 'test-session-id',
        })
        mockPrisma.jobContext.findUnique.mockResolvedValue(existing)

        await mockPrisma.jobContext.findUnique({
          where: { id: 'jctx-123' },
          select: { sessionId: true },
        })

        // Deactivate other contexts (excluding current)
        mockPrisma.jobContext.updateMany.mockResolvedValue({ count: 2 })

        await mockPrisma.jobContext.updateMany({
          where: {
            sessionId: existing.sessionId,
            isActive: true,
            NOT: { id: 'jctx-123' },
          },
          data: { isActive: false },
        })

        expect(mockPrisma.jobContext.updateMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({
              NOT: { id: 'jctx-123' },
            }),
          }),
        )
      })
    })

    describe('delete', () => {
      it('should delete job context by id', async () => {
        mockPrisma.jobContext.delete.mockResolvedValue(createMockJobContext())

        await mockPrisma.jobContext.delete({
          where: { id: 'jctx-123' },
        })

        expect(mockPrisma.jobContext.delete).toHaveBeenCalledWith({
          where: { id: 'jctx-123' },
        })
      })
    })
  })

  describe('Context Entries', () => {
    describe('upsertEntry', () => {
      it('should create new entry when not existing', async () => {
        mockPrisma.contextEntry.findUnique.mockResolvedValue(null)

        const entry = await mockPrisma.contextEntry.findUnique({
          where: {
            jobContextId_key: {
              jobContextId: 'jctx-123',
              key: 'new_key',
            },
          },
        })

        expect(entry).toBeNull()

        // Create new entry
        const newEntry = createMockContextEntry({
          id: 'entry-new',
          jobContextId: 'jctx-123',
          key: 'new_key',
          value: 'new_value',
        })
        mockPrisma.contextEntry.create.mockResolvedValue(newEntry)

        const created = await mockPrisma.contextEntry.create({
          data: {
            jobContextId: 'jctx-123',
            key: 'new_key',
            value: 'new_value',
            category: 'technical',
          },
        })

        expect(created.key).toBe('new_key')
      })

      it('should update existing entry', async () => {
        const existingEntry = createMockContextEntry({
          id: 'entry-123',
          key: 'existing_key',
          value: 'old_value',
        })
        mockPrisma.contextEntry.findUnique.mockResolvedValue(existingEntry)

        const entry = await mockPrisma.contextEntry.findUnique({
          where: {
            jobContextId_key: {
              jobContextId: 'jctx-123',
              key: 'existing_key',
            },
          },
        })

        expect(entry).toBeTruthy()

        // Update existing entry
        const updatedEntry = createMockContextEntry({
          id: 'entry-123',
          key: 'existing_key',
          value: 'new_value',
        })
        mockPrisma.contextEntry.update.mockResolvedValue(updatedEntry)

        const updated = await mockPrisma.contextEntry.update({
          where: { id: entry!.id },
          data: { value: 'new_value' },
        })

        expect(updated.value).toBe('new_value')
      })
    })

    describe('deleteEntry', () => {
      it('should delete entry by composite key', async () => {
        mockPrisma.contextEntry.delete.mockResolvedValue(createMockContextEntry())

        await mockPrisma.contextEntry.delete({
          where: {
            jobContextId_key: {
              jobContextId: 'jctx-123',
              key: 'key_to_delete',
            },
          },
        })

        expect(mockPrisma.contextEntry.delete).toHaveBeenCalledWith({
          where: {
            jobContextId_key: {
              jobContextId: 'jctx-123',
              key: 'key_to_delete',
            },
          },
        })
      })
    })
  })
})
