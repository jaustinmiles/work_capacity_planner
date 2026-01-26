/**
 * Session Router
 *
 * Handles all session-related operations:
 * - List all sessions
 * - Create new session
 * - Get/update session details
 * - Switch active session
 */

import { z } from 'zod'
import { router, protectedProcedure } from '../trpc'

/**
 * Input schema for creating a session
 */
const createSessionInput = z.object({
  name: z.string().min(1, 'Session name is required'),
  description: z.string().optional(),
})

/**
 * Input schema for updating a session
 */
const updateSessionInput = z.object({
  id: z.string(),
  name: z.string().min(1).optional(),
  description: z.string().optional(),
})

export const sessionRouter = router({
  /**
   * Get all sessions
   */
  getAll: protectedProcedure.query(async ({ ctx }) => {
    return ctx.prisma.session.findMany({
      orderBy: { createdAt: 'desc' },
    })
  }),

  /**
   * Get a single session by ID
   */
  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.prisma.session.findUnique({
        where: { id: input.id },
      })
    }),

  /**
   * Get the currently active session
   */
  getActive: protectedProcedure.query(async ({ ctx }) => {
    return ctx.prisma.session.findFirst({
      where: { isActive: true },
    })
  }),

  /**
   * Create a new session
   */
  create: protectedProcedure
    .input(createSessionInput)
    .mutation(async ({ ctx, input }) => {
      // Generate unique ID using the pattern from the codebase
      const id = `session_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`

      return ctx.prisma.session.create({
        data: {
          id,
          name: input.name,
          description: input.description || null,
          isActive: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      })
    }),

  /**
   * Update session details
   */
  update: protectedProcedure
    .input(updateSessionInput)
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input

      return ctx.prisma.session.update({
        where: { id },
        data: {
          ...data,
          updatedAt: new Date(),
        },
      })
    }),

  /**
   * Switch to a different session (set as active)
   */
  setActive: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Use transaction to ensure atomicity
      return ctx.prisma.$transaction(async (tx) => {
        // Deactivate all sessions
        await tx.session.updateMany({
          where: { isActive: true },
          data: { isActive: false },
        })

        // Activate the selected session
        return tx.session.update({
          where: { id: input.id },
          data: {
            isActive: true,
            updatedAt: new Date(),
          },
        })
      })
    }),

  /**
   * Delete a session and all related data
   */
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Prisma's cascade delete will handle related records
      // based on the schema's onDelete: Cascade settings
      return ctx.prisma.session.delete({
        where: { id: input.id },
      })
    }),
})
