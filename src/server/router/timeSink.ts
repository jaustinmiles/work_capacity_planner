/**
 * Time Sink Router
 *
 * Handles time sink tracking for non-task activities.
 * Time sinks are activities that consume time but don't have completion (e.g., phone calls, social media).
 */

import { z } from 'zod'
import { router, sessionProcedure, protectedProcedure } from '../trpc'
import { generateUniqueId } from '../../shared/step-id-utils'
import { getCurrentTime } from '../../shared/time-provider'
import { parseDateString, calculateMinutesBetweenDates } from '../../shared/time-utils'

/**
 * Schema for creating a time sink
 */
const createTimeSinkInput = z.object({
  name: z.string().min(1),
  emoji: z.string().min(1),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  typeId: z.string().optional(),
  sortOrder: z.number().int().optional(),
})

/**
 * Schema for updating a time sink
 */
const updateTimeSinkInput = z.object({
  id: z.string(),
  name: z.string().min(1).optional(),
  emoji: z.string().min(1).optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  typeId: z.string().optional(),
  sortOrder: z.number().int().optional(),
})

/**
 * Schema for creating a time sink session
 */
const createTimeSinkSessionInput = z.object({
  timeSinkId: z.string(),
  startTime: z.date(),
  endTime: z.date().optional(),
  actualMinutes: z.number().int().optional(),
  notes: z.string().optional(),
})

/**
 * Get local date range for a date string
 */
function getLocalDateRange(dateString: string): { startOfDay: Date; endOfDay: Date } {
  const [year, month, day] = parseDateString(dateString)
  const startOfDay = new Date(year, month - 1, day, 0, 0, 0, 0)
  const endOfDay = new Date(year, month - 1, day, 23, 59, 59, 999)
  return { startOfDay, endOfDay }
}

export const timeSinkRouter = router({
  // ============================================================================
  // Time Sink CRUD
  // ============================================================================

  /**
   * Get all time sinks for the current session
   */
  getAll: sessionProcedure.query(async ({ ctx }) => {
    return ctx.prisma.timeSink.findMany({
      where: { sessionId: ctx.sessionId },
      orderBy: { sortOrder: 'asc' },
    })
  }),

  /**
   * Get a single time sink by ID
   */
  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.prisma.timeSink.findUnique({
        where: { id: input.id },
      })
    }),

  /**
   * Create a new time sink
   */
  create: sessionProcedure.input(createTimeSinkInput).mutation(async ({ ctx, input }) => {
    // Get the next sort order
    const existingSinks = await ctx.prisma.timeSink.findMany({
      where: { sessionId: ctx.sessionId },
      orderBy: { sortOrder: 'desc' },
      take: 1,
    })

    const nextSortOrder = (existingSinks[0]?.sortOrder ?? -1) + 1
    const now = getCurrentTime()

    return ctx.prisma.timeSink.create({
      data: {
        id: generateUniqueId('sink'),
        sessionId: ctx.sessionId,
        name: input.name,
        emoji: input.emoji,
        color: input.color,
        typeId: input.typeId || null,
        sortOrder: input.sortOrder ?? nextSortOrder,
        createdAt: now,
        updatedAt: now,
      },
    })
  }),

  /**
   * Update a time sink
   */
  update: protectedProcedure.input(updateTimeSinkInput).mutation(async ({ ctx, input }) => {
    const { id, ...updates } = input

    return ctx.prisma.timeSink.update({
      where: { id },
      data: {
        ...updates,
        updatedAt: getCurrentTime(),
      },
    })
  }),

  /**
   * Delete a time sink
   */
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.timeSink.delete({
        where: { id: input.id },
      })
      return { success: true }
    }),

  /**
   * Reorder time sinks
   */
  reorder: sessionProcedure
    .input(z.object({ orderedIds: z.array(z.string()) }))
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.$transaction(
        input.orderedIds.map((id, index) =>
          ctx.prisma.timeSink.update({
            where: { id },
            data: { sortOrder: index },
          }),
        ),
      )
      return { success: true }
    }),

  // ============================================================================
  // Time Sink Sessions
  // ============================================================================

  /**
   * Create a time sink session
   */
  createSession: protectedProcedure
    .input(createTimeSinkSessionInput)
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.timeSinkSession.create({
        data: {
          id: generateUniqueId('sinksession'),
          timeSinkId: input.timeSinkId,
          startTime: input.startTime,
          endTime: input.endTime || null,
          actualMinutes: input.actualMinutes || null,
          notes: input.notes || null,
        },
      })
    }),

  /**
   * End a time sink session
   */
  endSession: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        actualMinutes: z.number().int(),
        notes: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.timeSinkSession.update({
        where: { id: input.id },
        data: {
          endTime: getCurrentTime(),
          actualMinutes: input.actualMinutes,
          notes: input.notes,
        },
      })
    }),

  /**
   * Get sessions for a specific time sink
   */
  getSessions: protectedProcedure
    .input(z.object({ timeSinkId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.prisma.timeSinkSession.findMany({
        where: { timeSinkId: input.timeSinkId },
        orderBy: { startTime: 'desc' },
      })
    }),

  /**
   * Get time sink sessions by date
   */
  getSessionsByDate: sessionProcedure
    .input(z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }))
    .query(async ({ ctx, input }) => {
      const { startOfDay, endOfDay } = getLocalDateRange(input.date)

      // Get all time sinks for this session
      const sinks = await ctx.prisma.timeSink.findMany({
        where: { sessionId: ctx.sessionId },
        select: { id: true },
      })

      const sinkIds = sinks.map((s) => s.id)

      return ctx.prisma.timeSinkSession.findMany({
        where: {
          timeSinkId: { in: sinkIds },
          startTime: {
            gte: startOfDay,
            lte: endOfDay,
          },
        },
        include: { TimeSink: true },
        orderBy: { startTime: 'asc' },
      })
    }),

  /**
   * Get active time sink session (no end time)
   */
  getActiveSession: sessionProcedure.query(async ({ ctx }) => {
    // Get all time sinks for this session
    const sinks = await ctx.prisma.timeSink.findMany({
      where: { sessionId: ctx.sessionId },
      select: { id: true },
    })

    const sinkIds = sinks.map((s) => s.id)

    return ctx.prisma.timeSinkSession.findFirst({
      where: {
        timeSinkId: { in: sinkIds },
        endTime: null,
      },
      include: { TimeSink: true },
    })
  }),

  /**
   * Delete a time sink session
   */
  deleteSession: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.timeSinkSession.delete({
        where: { id: input.id },
      })
      return { success: true }
    }),

  /**
   * Split a time sink session
   */
  splitSession: protectedProcedure
    .input(
      z.object({
        sessionId: z.string(),
        splitTime: z.date(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const original = await ctx.prisma.timeSinkSession.findUnique({
        where: { id: input.sessionId },
      })

      if (!original) {
        throw new Error(`Time sink session ${input.sessionId} not found`)
      }

      return ctx.prisma.$transaction(async (tx) => {
        // Calculate minutes for first half
        const firstHalfMinutes = calculateMinutesBetweenDates(
          original.startTime,
          input.splitTime,
        )

        // Update original session to end at split time
        const firstHalf = await tx.timeSinkSession.update({
          where: { id: input.sessionId },
          data: {
            endTime: input.splitTime,
            actualMinutes: firstHalfMinutes,
          },
        })

        // Calculate minutes for second half
        const secondHalfMinutes = original.endTime
          ? calculateMinutesBetweenDates(input.splitTime, original.endTime)
          : null

        // Create second half session
        const secondHalf = await tx.timeSinkSession.create({
          data: {
            id: generateUniqueId('sinksession'),
            timeSinkId: original.timeSinkId,
            startTime: input.splitTime,
            endTime: original.endTime,
            actualMinutes: secondHalfMinutes,
            notes: original.notes,
          },
        })

        return { firstHalf, secondHalf }
      })
    }),

  /**
   * Get accumulated time for time sinks in a date range
   */
  getAccumulated: sessionProcedure
    .input(
      z.object({
        startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { startOfDay } = getLocalDateRange(input.startDate)
      const { endOfDay } = getLocalDateRange(input.endDate)

      // Get all time sinks for this session
      const sinks = await ctx.prisma.timeSink.findMany({
        where: { sessionId: ctx.sessionId },
      })

      const sinkIds = sinks.map((s) => s.id)
      const sinkMap = new Map(sinks.map((s) => [s.id, s]))

      const sessions = await ctx.prisma.timeSinkSession.findMany({
        where: {
          timeSinkId: { in: sinkIds },
          startTime: {
            gte: startOfDay,
            lte: endOfDay,
          },
        },
      })

      // Accumulate by time sink
      const bySink = new Map<string, { sink: typeof sinks[0]; totalMinutes: number }>()
      let total = 0

      for (const session of sessions) {
        const sink = sinkMap.get(session.timeSinkId)
        if (sink) {
          const existing = bySink.get(session.timeSinkId) || { sink, totalMinutes: 0 }
          const minutes = session.actualMinutes || 0
          existing.totalMinutes += minutes
          bySink.set(session.timeSinkId, existing)
          total += minutes
        }
      }

      return {
        bySink: Array.from(bySink.values()),
        totalMinutes: total,
      }
    }),
})
