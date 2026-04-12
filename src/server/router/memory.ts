/**
 * Memory Router
 *
 * CRUD for agent memories and conversation summary search.
 * Memories are session-scoped facts the agent learns autonomously.
 */

import { z } from 'zod'
import { router, sessionProcedure, protectedProcedure } from '../trpc'
import { generateUniqueId } from '../../shared/step-id-utils'
import { getCurrentTime } from '../../shared/time-provider'
import { MemoryCategory, MemorySource } from '../../shared/enums'
import { MAX_CORE_MEMORIES } from '../../shared/memory-types'

export const memoryRouter = router({
  /**
   * Get all core memories for the session.
   * Returns up to MAX_CORE_MEMORIES, sorted by pinned first, then recency.
   */
  getAll: sessionProcedure.query(async ({ ctx }) => {
    return ctx.prisma.agentMemory.findMany({
      where: { sessionId: ctx.sessionId },
      orderBy: [
        { pinned: 'desc' },
        { lastAccessedAt: 'desc' },
      ],
      take: MAX_CORE_MEMORIES,
    })
  }),

  /**
   * Get all memories (no limit) for the memory panel UI.
   */
  getAllForPanel: sessionProcedure.query(async ({ ctx }) => {
    return ctx.prisma.agentMemory.findMany({
      where: { sessionId: ctx.sessionId },
      orderBy: [
        { pinned: 'desc' },
        { category: 'asc' },
        { updatedAt: 'desc' },
      ],
    })
  }),

  /**
   * Save a new memory. Upserts by key — if a memory with the same key
   * exists, it's updated instead of duplicated.
   */
  save: sessionProcedure
    .input(z.object({
      category: z.nativeEnum(MemoryCategory),
      key: z.string().min(1),
      value: z.string().min(1),
      confidence: z.number().min(0).max(1).optional(),
      source: z.nativeEnum(MemorySource).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const now = getCurrentTime()

      return ctx.prisma.agentMemory.upsert({
        where: {
          sessionId_key: {
            sessionId: ctx.sessionId,
            key: input.key,
          },
        },
        create: {
          id: generateUniqueId('mem'),
          sessionId: ctx.sessionId,
          category: input.category,
          key: input.key,
          value: input.value,
          confidence: input.confidence ?? 0.8,
          source: input.source ?? MemorySource.AgentObserved,
          createdAt: now,
          updatedAt: now,
          lastAccessedAt: now,
        },
        update: {
          value: input.value,
          confidence: input.confidence,
          category: input.category,
          source: input.source,
          updatedAt: now,
        },
      })
    }),

  /**
   * Update an existing memory.
   */
  update: protectedProcedure
    .input(z.object({
      memoryId: z.string(),
      value: z.string().optional(),
      confidence: z.number().min(0).max(1).optional(),
      pinned: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const data: Record<string, unknown> = { updatedAt: getCurrentTime() }
      if (input.value !== undefined) data.value = input.value
      if (input.confidence !== undefined) data.confidence = input.confidence
      if (input.pinned !== undefined) data.pinned = input.pinned

      return ctx.prisma.agentMemory.update({
        where: { id: input.memoryId },
        data,
      })
    }),

  /**
   * Delete a memory.
   */
  delete: protectedProcedure
    .input(z.object({ memoryId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.agentMemory.delete({
        where: { id: input.memoryId },
      })
      return { success: true }
    }),

  /**
   * Search conversation summaries by keyword and/or date range.
   */
  searchSummaries: sessionProcedure
    .input(z.object({
      query: z.string().min(1),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      limit: z.number().int().positive().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const where: Record<string, unknown> = {
        sessionId: ctx.sessionId,
      }

      // Date range filter
      if (input.startDate || input.endDate) {
        const createdAt: Record<string, Date> = {}
        if (input.startDate) createdAt.gte = new Date(input.startDate)
        if (input.endDate) createdAt.lte = new Date(input.endDate)
        where.createdAt = createdAt
      }

      // Text search — search in summary and keyDecisions
      where.OR = [
        { summary: { contains: input.query, mode: 'insensitive' } },
        { keyDecisions: { contains: input.query, mode: 'insensitive' } },
      ]

      return ctx.prisma.conversationSummary.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: input.limit ?? 10,
      })
    }),

  /**
   * Get all conversation summaries for the session.
   */
  getAllSummaries: sessionProcedure.query(async ({ ctx }) => {
    return ctx.prisma.conversationSummary.findMany({
      where: { sessionId: ctx.sessionId },
      orderBy: { createdAt: 'desc' },
    })
  }),

  /**
   * Save a conversation summary (called by agent-chat-handler after summarization).
   */
  saveSummary: sessionProcedure
    .input(z.object({
      conversationId: z.string(),
      summary: z.string(),
      keyDecisions: z.array(z.string()),
      memoriesExtracted: z.array(z.string()),
      messageCount: z.number().int(),
    }))
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.conversationSummary.upsert({
        where: { conversationId: input.conversationId },
        create: {
          id: generateUniqueId('summary'),
          sessionId: ctx.sessionId,
          conversationId: input.conversationId,
          summary: input.summary,
          keyDecisions: JSON.stringify(input.keyDecisions),
          memoriesExtracted: JSON.stringify(input.memoriesExtracted),
          messageCount: input.messageCount,
          createdAt: getCurrentTime(),
        },
        update: {
          summary: input.summary,
          keyDecisions: JSON.stringify(input.keyDecisions),
          memoriesExtracted: JSON.stringify(input.memoriesExtracted),
          messageCount: input.messageCount,
        },
      })
    }),

  /**
   * Mark memories as accessed (updates lastAccessedAt for relevance ranking).
   */
  markAccessed: protectedProcedure
    .input(z.object({ memoryIds: z.array(z.string()) }))
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.agentMemory.updateMany({
        where: { id: { in: input.memoryIds } },
        data: { lastAccessedAt: getCurrentTime() },
      })
      return { success: true }
    }),
})

export type MemoryRouter = typeof memoryRouter
