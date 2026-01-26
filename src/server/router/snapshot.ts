/**
 * Snapshot Router
 *
 * Handles schedule snapshots for comparing planned vs actual time use.
 * Snapshots capture the schedule state at a point in time.
 */

import { z } from 'zod'
import { router, sessionProcedure, protectedProcedure } from '../trpc'
import { getCurrentTime, getLocalDateString } from '../../shared/time-provider'

/**
 * Schema for creating a snapshot
 */
const createSnapshotInput = z.object({
  label: z.string().optional(),
  snapshotData: z.string(), // JSON string of ScheduleSnapshotData
})

export const snapshotRouter = router({
  /**
   * Get all snapshots for the session
   */
  getAll: sessionProcedure.query(async ({ ctx }) => {
    return ctx.prisma.scheduleSnapshot.findMany({
      where: { sessionId: ctx.sessionId },
      orderBy: { createdAt: 'desc' },
    })
  }),

  /**
   * Get a single snapshot by ID
   */
  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.prisma.scheduleSnapshot.findUnique({
        where: { id: input.id },
      })
    }),

  /**
   * Get today's snapshot (if any)
   */
  getToday: sessionProcedure.query(async ({ ctx }) => {
    const today = getLocalDateString(getCurrentTime())
    const startOfDay = new Date(today)
    startOfDay.setHours(0, 0, 0, 0)
    const endOfDay = new Date(today)
    endOfDay.setHours(23, 59, 59, 999)

    return ctx.prisma.scheduleSnapshot.findFirst({
      where: {
        sessionId: ctx.sessionId,
        createdAt: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
      orderBy: { createdAt: 'desc' },
    })
  }),

  /**
   * Create a new snapshot
   */
  create: sessionProcedure
    .input(createSnapshotInput)
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.scheduleSnapshot.create({
        data: {
          sessionId: ctx.sessionId,
          label: input.label || null,
          snapshotData: input.snapshotData,
        },
      })
    }),

  /**
   * Delete a snapshot
   */
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.scheduleSnapshot.delete({
        where: { id: input.id },
      })
      return { success: true }
    }),
})
