/**
 * Job Context Router
 *
 * Handles job contexts and context entries.
 * Job contexts provide work-specific context for AI assistance.
 */

import { z } from 'zod'
import { router, sessionProcedure, protectedProcedure } from '../trpc'
import { generateUniqueId } from '../../shared/step-id-utils'
import { getCurrentTime } from '../../shared/time-provider'

/**
 * Schema for creating a job context
 */
const createInput = z.object({
  name: z.string().min(1),
  description: z.string(),
  context: z.string(),
  asyncPatterns: z.string().optional(),
  reviewCycles: z.string().optional(),
  tools: z.string().optional(),
  isActive: z.boolean().default(false),
})

/**
 * Schema for updating a job context
 */
const updateInput = z.object({
  id: z.string(),
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  context: z.string().optional(),
  asyncPatterns: z.string().optional(),
  reviewCycles: z.string().optional(),
  tools: z.string().optional(),
  isActive: z.boolean().optional(),
})

/**
 * Schema for upserting a context entry
 */
const upsertEntryInput = z.object({
  jobContextId: z.string(),
  key: z.string().min(1),
  value: z.string(),
  category: z.string(),
  notes: z.string().optional(),
})

export const jobContextRouter = router({
  /**
   * Get all job contexts for the session
   */
  getAll: sessionProcedure.query(async ({ ctx }) => {
    return ctx.prisma.jobContext.findMany({
      where: { sessionId: ctx.sessionId },
      include: { ContextEntry: true },
      orderBy: { createdAt: 'desc' },
    })
  }),

  /**
   * Get the active job context
   */
  getActive: sessionProcedure.query(async ({ ctx }) => {
    return ctx.prisma.jobContext.findFirst({
      where: {
        sessionId: ctx.sessionId,
        isActive: true,
      },
      include: { ContextEntry: true },
    })
  }),

  /**
   * Get a single job context by ID
   */
  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.prisma.jobContext.findUnique({
        where: { id: input.id },
        include: { ContextEntry: true },
      })
    }),

  /**
   * Create a new job context
   */
  create: sessionProcedure.input(createInput).mutation(async ({ ctx, input }) => {
    const now = getCurrentTime()

    // If this context should be active, deactivate others first
    if (input.isActive) {
      await ctx.prisma.jobContext.updateMany({
        where: {
          sessionId: ctx.sessionId,
          isActive: true,
        },
        data: { isActive: false },
      })
    }

    return ctx.prisma.jobContext.create({
      data: {
        id: generateUniqueId('jctx'),
        sessionId: ctx.sessionId,
        name: input.name,
        description: input.description,
        context: input.context,
        asyncPatterns: input.asyncPatterns || '',
        reviewCycles: input.reviewCycles || '',
        tools: input.tools || '',
        isActive: input.isActive,
        createdAt: now,
        updatedAt: now,
      },
      include: { ContextEntry: true },
    })
  }),

  /**
   * Update a job context
   */
  update: protectedProcedure.input(updateInput).mutation(async ({ ctx, input }) => {
    const { id, isActive, ...updates } = input

    // If setting this context as active, deactivate others first
    if (isActive === true) {
      const existing = await ctx.prisma.jobContext.findUnique({
        where: { id },
        select: { sessionId: true },
      })

      if (existing) {
        await ctx.prisma.jobContext.updateMany({
          where: {
            sessionId: existing.sessionId,
            isActive: true,
            NOT: { id },
          },
          data: { isActive: false },
        })
      }
    }

    return ctx.prisma.jobContext.update({
      where: { id },
      data: {
        ...updates,
        isActive,
        updatedAt: getCurrentTime(),
      },
      include: { ContextEntry: true },
    })
  }),

  /**
   * Delete a job context
   */
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.jobContext.delete({
        where: { id: input.id },
      })
      return { success: true }
    }),

  /**
   * Upsert a context entry (create or update)
   */
  upsertEntry: protectedProcedure.input(upsertEntryInput).mutation(async ({ ctx, input }) => {
    const existing = await ctx.prisma.contextEntry.findUnique({
      where: {
        jobContextId_key: {
          jobContextId: input.jobContextId,
          key: input.key,
        },
      },
    })

    if (existing) {
      return ctx.prisma.contextEntry.update({
        where: { id: existing.id },
        data: {
          value: input.value,
          category: input.category,
          notes: input.notes || null,
        },
      })
    } else {
      return ctx.prisma.contextEntry.create({
        data: {
          id: generateUniqueId('entry'),
          jobContextId: input.jobContextId,
          key: input.key,
          value: input.value,
          category: input.category,
          notes: input.notes || null,
        },
      })
    }
  }),

  /**
   * Delete a context entry
   */
  deleteEntry: protectedProcedure
    .input(z.object({ jobContextId: z.string(), key: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.contextEntry.delete({
        where: {
          jobContextId_key: {
            jobContextId: input.jobContextId,
            key: input.key,
          },
        },
      })
      return { success: true }
    }),
})
