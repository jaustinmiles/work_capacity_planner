/**
 * Work Session Router
 *
 * Handles time tracking for tasks and workflow steps.
 * Work sessions track actual time spent on tasks.
 */

import { z } from 'zod'
import { router, sessionProcedure, protectedProcedure } from '../trpc'
import { generateUniqueId } from '../../shared/step-id-utils'
import { getCurrentTime, getLocalDateString } from '../../shared/time-provider'
import { parseDateString, calculateMinutesBetweenDates } from '../../shared/time-utils'

/**
 * Schema for creating a work session
 */
const createSessionInput = z.object({
  taskId: z.string(),
  stepId: z.string().optional(),
  startTime: z.date(),
  endTime: z.date().optional(),
  plannedMinutes: z.number().int().default(0),
  actualMinutes: z.number().int().optional(),
  notes: z.string().optional(),
  blockId: z.string().optional(),
  patternId: z.string().optional(),
})

/**
 * Schema for updating a work session
 */
const updateSessionInput = z.object({
  id: z.string(),
  startTime: z.date().optional(),
  endTime: z.date().optional(),
  plannedMinutes: z.number().int().optional(),
  actualMinutes: z.number().int().optional(),
  notes: z.string().optional(),
  taskId: z.string().optional(),
  stepId: z.string().optional(),
  blockId: z.string().optional(),
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

export const workSessionRouter = router({
  /**
   * Create a new work session
   */
  create: protectedProcedure.input(createSessionInput).mutation(async ({ ctx, input }) => {
    const id = generateUniqueId('wsession')

    // Try to find a block for this session if not provided
    let blockId = input.blockId

    if (!blockId && input.startTime) {
      // Get the date string from startTime
      const dateStr = getLocalDateString(input.startTime)
      const timeMinutes =
        input.startTime.getHours() * 60 + input.startTime.getMinutes()

      // Find work pattern for this date
      const task = await ctx.prisma.task.findUnique({
        where: { id: input.taskId },
        select: { sessionId: true },
      })

      if (task?.sessionId) {
        const pattern = await ctx.prisma.workPattern.findUnique({
          where: {
            sessionId_date: {
              sessionId: task.sessionId,
              date: dateStr,
            },
          },
          include: { WorkBlock: true },
        })

        if (pattern) {
          // Find block containing this time
          const hours = Math.floor(timeMinutes / 60)
          const minutes = timeMinutes % 60
          const timeStr = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`

          const block = pattern.WorkBlock.find((b) => {
            return b.startTime <= timeStr && b.endTime > timeStr
          })

          if (block) {
            blockId = block.id
          }
        }
      }
    }

    const session = await ctx.prisma.workSession.create({
      data: {
        id,
        taskId: input.taskId,
        stepId: input.stepId || null,
        startTime: input.startTime,
        endTime: input.endTime || null,
        plannedMinutes: input.plannedMinutes,
        actualMinutes: input.actualMinutes || null,
        notes: input.notes || null,
        blockId: blockId || null,
        patternId: input.patternId || null,
      },
      include: {
        Task: true,
        WorkBlock: true,
      },
    })

    return session
  }),

  /**
   * End a work session
   */
  end: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        actualMinutes: z.number().int(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const now = getCurrentTime()

      const session = await ctx.prisma.workSession.update({
        where: { id: input.id },
        data: {
          endTime: now,
          actualMinutes: input.actualMinutes,
        },
        include: {
          Task: true,
          WorkBlock: true,
        },
      })

      return session
    }),

  /**
   * Get work sessions for a specific date
   */
  getByDate: sessionProcedure
    .input(z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }))
    .query(async ({ ctx, input }) => {
      const { startOfDay, endOfDay } = getLocalDateRange(input.date)

      // Get all tasks for this session
      const tasks = await ctx.prisma.task.findMany({
        where: { sessionId: ctx.sessionId },
        select: { id: true },
      })

      const taskIds = tasks.map((t) => t.id)

      const sessions = await ctx.prisma.workSession.findMany({
        where: {
          taskId: { in: taskIds },
          startTime: {
            gte: startOfDay,
            lte: endOfDay,
          },
        },
        include: {
          Task: true,
          WorkBlock: true,
        },
        orderBy: { startTime: 'asc' },
      })

      return sessions
    }),

  /**
   * Get active work session (no end time)
   */
  getActive: sessionProcedure.query(async ({ ctx }) => {
    // Get all tasks for this session
    const tasks = await ctx.prisma.task.findMany({
      where: { sessionId: ctx.sessionId },
      select: { id: true },
    })

    const taskIds = tasks.map((t) => t.id)

    const session = await ctx.prisma.workSession.findFirst({
      where: {
        taskId: { in: taskIds },
        endTime: null,
      },
      include: {
        Task: true,
        WorkBlock: true,
      },
    })

    return session
  }),

  /**
   * Get work sessions for a specific task
   */
  getByTask: protectedProcedure
    .input(z.object({ taskId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.prisma.workSession.findMany({
        where: { taskId: input.taskId },
        include: {
          Task: true,
          WorkBlock: true,
        },
        orderBy: { startTime: 'asc' },
      })
    }),

  /**
   * Get work sessions for a specific pattern
   */
  getByPattern: protectedProcedure
    .input(z.object({ patternId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.prisma.workSession.findMany({
        where: { patternId: input.patternId },
        include: {
          Task: true,
          WorkBlock: true,
        },
        orderBy: { startTime: 'asc' },
      })
    }),

  /**
   * Update a work session
   */
  update: protectedProcedure.input(updateSessionInput).mutation(async ({ ctx, input }) => {
    const { id, ...updates } = input

    const session = await ctx.prisma.workSession.update({
      where: { id },
      data: updates,
      include: {
        Task: true,
        WorkBlock: true,
      },
    })

    return session
  }),

  /**
   * Delete a work session
   */
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.workSession.delete({
        where: { id: input.id },
      })
      return { success: true }
    }),

  /**
   * Split a work session at a specific time
   */
  split: protectedProcedure
    .input(
      z.object({
        sessionId: z.string(),
        splitTime: z.date(),
        secondHalfTaskId: z.string().optional(),
        secondHalfStepId: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const original = await ctx.prisma.workSession.findUnique({
        where: { id: input.sessionId },
      })

      if (!original) {
        throw new Error(`Work session ${input.sessionId} not found`)
      }

      const result = await ctx.prisma.$transaction(async (tx) => {
        // Calculate minutes for first half
        const firstHalfMinutes = calculateMinutesBetweenDates(
          original.startTime,
          input.splitTime,
        )

        // Update original session to end at split time
        const firstHalf = await tx.workSession.update({
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
        const secondHalf = await tx.workSession.create({
          data: {
            id: generateUniqueId('wsession'),
            taskId: input.secondHalfTaskId || original.taskId,
            stepId: input.secondHalfStepId || original.stepId,
            startTime: input.splitTime,
            endTime: original.endTime,
            plannedMinutes: 0,
            actualMinutes: secondHalfMinutes,
            notes: original.notes,
            blockId: original.blockId,
            patternId: original.patternId,
          },
        })

        return { firstHalf, secondHalf }
      })

      return result
    }),

  /**
   * Get total logged time for a task
   */
  getTotalTimeForTask: protectedProcedure
    .input(z.object({ taskId: z.string() }))
    .query(async ({ ctx, input }) => {
      const sessions = await ctx.prisma.workSession.findMany({
        where: { taskId: input.taskId },
        select: { actualMinutes: true },
      })

      const total = sessions.reduce(
        (sum, s) => sum + (s.actualMinutes || 0),
        0,
      )

      return { totalMinutes: total }
    }),

  /**
   * Get accumulated time by type for a specific date
   */
  getAccumulatedByDate: sessionProcedure
    .input(z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }))
    .query(async ({ ctx, input }) => {
      const { startOfDay, endOfDay } = getLocalDateRange(input.date)

      // Get all tasks for this session
      const tasks = await ctx.prisma.task.findMany({
        where: { sessionId: ctx.sessionId },
        select: { id: true, type: true },
      })

      const taskMap = new Map(tasks.map((t) => [t.id, t.type]))
      const taskIds = tasks.map((t) => t.id)

      const sessions = await ctx.prisma.workSession.findMany({
        where: {
          taskId: { in: taskIds },
          startTime: {
            gte: startOfDay,
            lte: endOfDay,
          },
        },
        select: {
          taskId: true,
          actualMinutes: true,
        },
      })

      // Accumulate by type
      const byType = new Map<string, number>()
      let total = 0

      for (const session of sessions) {
        const type = taskMap.get(session.taskId) || 'unknown'
        const minutes = session.actualMinutes || 0
        byType.set(type, (byType.get(type) || 0) + minutes)
        total += minutes
      }

      return {
        byType: Object.fromEntries(byType),
        totalMinutes: total,
      }
    }),

  /**
   * Recalculate actual duration for a task from work sessions
   */
  recalculateTaskDuration: protectedProcedure
    .input(z.object({ taskId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const sessions = await ctx.prisma.workSession.findMany({
        where: { taskId: input.taskId },
        select: { actualMinutes: true },
      })

      const total = sessions.reduce(
        (sum, s) => sum + (s.actualMinutes || 0),
        0,
      )

      await ctx.prisma.task.update({
        where: { id: input.taskId },
        data: {
          actualDuration: total,
          updatedAt: getCurrentTime(),
        },
      })

      return { totalMinutes: total }
    }),
})
