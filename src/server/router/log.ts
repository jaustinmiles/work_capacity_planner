/**
 * Log Router
 *
 * Handles application logging (development only).
 * Logs are persisted for debugging and diagnostics.
 */

import { z } from 'zod'
import { router, protectedProcedure } from '../trpc'

/**
 * Schema for a log entry
 */
const logEntrySchema = z.object({
  level: z.string(),
  message: z.string(),
  source: z.string(),
  context: z.string(), // JSON string
  sessionId: z.string().optional(),
})

/**
 * Schema for log query options
 */
const logQueryOptions = z.object({
  level: z.string().optional(),
  source: z.string().optional(),
  sessionId: z.string().optional(),
  limit: z.number().int().positive().default(100),
  offset: z.number().int().nonnegative().default(0),
  startTime: z.date().optional(),
  endTime: z.date().optional(),
})

export const logRouter = router({
  /**
   * Persist a single log entry
   */
  persist: protectedProcedure
    .input(logEntrySchema)
    .mutation(async ({ ctx, input }) => {
      // Only persist in development
      if (process.env.NODE_ENV !== 'development') {
        return { success: true }
      }

      await ctx.prisma.appLog.create({
        data: {
          level: input.level,
          message: input.message,
          source: input.source,
          context: input.context,
          sessionId: input.sessionId || null,
        },
      })

      return { success: true }
    }),

  /**
   * Persist multiple log entries in batch
   */
  persistBatch: protectedProcedure
    .input(z.object({ logs: z.array(logEntrySchema) }))
    .mutation(async ({ ctx, input }) => {
      // Only persist in development
      if (process.env.NODE_ENV !== 'development') {
        return { success: true, count: 0 }
      }

      const result = await ctx.prisma.appLog.createMany({
        data: input.logs.map((log) => ({
          level: log.level,
          message: log.message,
          source: log.source,
          context: log.context,
          sessionId: log.sessionId || null,
        })),
      })

      return { success: true, count: result.count }
    }),

  /**
   * Query logs with filters
   */
  query: protectedProcedure.input(logQueryOptions).query(async ({ ctx, input }) => {
    return ctx.prisma.appLog.findMany({
      where: {
        ...(input.level && { level: input.level }),
        ...(input.source && { source: input.source }),
        ...(input.sessionId && { sessionId: input.sessionId }),
        ...(input.startTime &&
          input.endTime && {
            createdAt: {
              gte: input.startTime,
              lte: input.endTime,
            },
          }),
      },
      orderBy: { createdAt: 'desc' },
      take: input.limit,
      skip: input.offset,
    })
  }),

  /**
   * Get sessions with log activity
   */
  getLoggedSessions: protectedProcedure.query(async ({ ctx }) => {
    const sessions = await ctx.prisma.appLog.groupBy({
      by: ['sessionId'],
      _count: { id: true },
      _max: { createdAt: true },
      where: {
        sessionId: { not: null },
      },
    })

    return sessions.map((s) => ({
      sessionId: s.sessionId,
      logCount: s._count.id,
      lastLogAt: s._max.createdAt,
    }))
  }),

  /**
   * Clear old logs (keeps last 7 days)
   */
  cleanup: protectedProcedure.mutation(async ({ ctx }) => {
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

    const result = await ctx.prisma.appLog.deleteMany({
      where: {
        createdAt: { lt: sevenDaysAgo },
      },
    })

    return { deleted: result.count }
  }),
})
