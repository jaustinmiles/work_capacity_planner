/**
 * User Task Type Router
 *
 * Handles user-defined task types with custom colors and emojis.
 * Task types are session-scoped for multi-tenancy.
 */

import { z } from 'zod'
import { router, sessionProcedure, protectedProcedure } from '../trpc'
import { generateUniqueId } from '../../shared/step-id-utils'
import { getCurrentTime } from '../../shared/time-provider'

/**
 * Schema for creating a user task type
 */
const createInput = z.object({
  name: z.string().min(1),
  emoji: z.string().min(1),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Must be a valid hex color'),
  sortOrder: z.number().int().optional(),
})

/**
 * Schema for updating a user task type
 */
const updateInput = z.object({
  id: z.string(),
  name: z.string().min(1).optional(),
  emoji: z.string().min(1).optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  sortOrder: z.number().int().optional(),
})

export const userTaskTypeRouter = router({
  /**
   * Get all user task types for the current session
   */
  getAll: sessionProcedure.query(async ({ ctx }) => {
    return ctx.prisma.userTaskType.findMany({
      where: { sessionId: ctx.sessionId },
      orderBy: { sortOrder: 'asc' },
    })
  }),

  /**
   * Get a single user task type by ID
   */
  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.prisma.userTaskType.findUnique({
        where: { id: input.id },
      })
    }),

  /**
   * Create a new user task type
   */
  create: sessionProcedure.input(createInput).mutation(async ({ ctx, input }) => {
    // Get the next sort order
    const existingTypes = await ctx.prisma.userTaskType.findMany({
      where: { sessionId: ctx.sessionId },
      orderBy: { sortOrder: 'desc' },
      take: 1,
    })

    const nextSortOrder = (existingTypes[0]?.sortOrder ?? -1) + 1
    const now = getCurrentTime()

    return ctx.prisma.userTaskType.create({
      data: {
        id: generateUniqueId('type'),
        sessionId: ctx.sessionId,
        name: input.name,
        emoji: input.emoji,
        color: input.color,
        sortOrder: input.sortOrder ?? nextSortOrder,
        createdAt: now,
        updatedAt: now,
      },
    })
  }),

  /**
   * Update a user task type
   */
  update: protectedProcedure.input(updateInput).mutation(async ({ ctx, input }) => {
    const { id, ...updates } = input

    return ctx.prisma.userTaskType.update({
      where: { id },
      data: {
        ...updates,
        updatedAt: getCurrentTime(),
      },
    })
  }),

  /**
   * Delete a user task type
   */
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.userTaskType.delete({
        where: { id: input.id },
      })
      return { success: true }
    }),

  /**
   * Reorder user task types
   */
  reorder: sessionProcedure
    .input(z.object({ orderedIds: z.array(z.string()) }))
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.$transaction(
        input.orderedIds.map((id, index) =>
          ctx.prisma.userTaskType.update({
            where: { id },
            data: { sortOrder: index },
          }),
        ),
      )
      return { success: true }
    }),

  /**
   * Check if session has any task types
   */
  hasTypes: sessionProcedure.query(async ({ ctx }) => {
    const count = await ctx.prisma.userTaskType.count({
      where: { sessionId: ctx.sessionId },
    })
    return count > 0
  }),
})
