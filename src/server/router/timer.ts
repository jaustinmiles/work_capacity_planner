/**
 * Timer Router
 *
 * Handles first-class countdown timers. Timers can be:
 * - Auto-created when a task/step completes with asyncWaitTime > 0
 * - Manually created for arbitrary countdowns
 *
 * Timer state uses absolute timestamps (expiresAt).
 * Client derives remaining time — no server-side ticking needed.
 */

import { z } from 'zod'
import { router, sessionProcedure, protectedProcedure } from '../trpc'
import { generateUniqueId } from '../../shared/step-id-utils'
import { getCurrentTime } from '../../shared/time-provider'
import { TimerStatus, StepStatus, TaskStatus } from '../../shared/enums'
import { createTimerExpiresAt } from '../../shared/timer-types'

export const timerRouter = router({
  /**
   * Create a new timer.
   * If linked to a task/step, the timer is associated for auto-completion on expiry.
   */
  create: sessionProcedure
    .input(z.object({
      name: z.string().min(1),
      durationMinutes: z.number().positive(),
      linkedTaskId: z.string().optional(),
      linkedStepId: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const now = getCurrentTime()
      const expiresAt = createTimerExpiresAt(now, input.durationMinutes)

      const timer = await ctx.prisma.timer.create({
        data: {
          id: generateUniqueId('timer'),
          sessionId: ctx.sessionId,
          name: input.name,
          status: TimerStatus.Active,
          originalDurationMinutes: input.durationMinutes,
          startedAt: now,
          expiresAt,
          linkedTaskId: input.linkedTaskId ?? null,
          linkedStepId: input.linkedStepId ?? null,
          createdAt: now,
          updatedAt: now,
        },
      })

      return timer
    }),

  /**
   * Get all active and paused timers for the session.
   * Used on startup to restore timer state.
   */
  getActive: sessionProcedure.query(async ({ ctx }) => {
    return ctx.prisma.timer.findMany({
      where: {
        sessionId: ctx.sessionId,
        status: { in: [TimerStatus.Active, TimerStatus.Paused] },
      },
      orderBy: { expiresAt: 'asc' },
    })
  }),

  /**
   * Get all timers for the session with optional status filter.
   */
  getAll: sessionProcedure
    .input(z.object({
      statuses: z.array(z.nativeEnum(TimerStatus)).optional(),
      limit: z.number().int().positive().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      return ctx.prisma.timer.findMany({
        where: {
          sessionId: ctx.sessionId,
          ...(input?.statuses ? { status: { in: input.statuses } } : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: input?.limit,
      })
    }),

  /**
   * Extend a timer by adding minutes.
   */
  extend: protectedProcedure
    .input(z.object({
      timerId: z.string(),
      addMinutes: z.number().positive(),
    }))
    .mutation(async ({ ctx, input }) => {
      const timer = await ctx.prisma.timer.findUnique({
        where: { id: input.timerId },
      })
      if (!timer) throw new Error(`Timer ${input.timerId} not found`)

      const addMs = input.addMinutes * 60 * 1000
      const newExpiresAt = new Date(timer.expiresAt.getTime() + addMs)

      return ctx.prisma.timer.update({
        where: { id: input.timerId },
        data: {
          expiresAt: newExpiresAt,
          extendedByMinutes: timer.extendedByMinutes + input.addMinutes,
          // If timer was expired, reactivate it
          status: timer.status === TimerStatus.Expired ? TimerStatus.Active : timer.status,
          expiredAt: timer.status === TimerStatus.Expired ? null : timer.expiredAt,
          updatedAt: getCurrentTime(),
        },
      })
    }),

  /**
   * Pause a timer. Stores remaining time so it can be resumed accurately.
   */
  pause: protectedProcedure
    .input(z.object({ timerId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const timer = await ctx.prisma.timer.findUnique({
        where: { id: input.timerId },
      })
      if (!timer) throw new Error(`Timer ${input.timerId} not found`)
      if (timer.status !== TimerStatus.Active) throw new Error('Can only pause active timers')

      const now = getCurrentTime()
      const remainingMs = Math.max(0, timer.expiresAt.getTime() - now.getTime())

      return ctx.prisma.timer.update({
        where: { id: input.timerId },
        data: {
          status: TimerStatus.Paused,
          pausedAt: now,
          pausedRemainingMs: remainingMs,
          updatedAt: now,
        },
      })
    }),

  /**
   * Resume a paused timer. Computes new expiresAt from remaining time.
   */
  resume: protectedProcedure
    .input(z.object({ timerId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const timer = await ctx.prisma.timer.findUnique({
        where: { id: input.timerId },
      })
      if (!timer) throw new Error(`Timer ${input.timerId} not found`)
      if (timer.status !== TimerStatus.Paused) throw new Error('Can only resume paused timers')

      const now = getCurrentTime()
      const newExpiresAt = new Date(now.getTime() + (timer.pausedRemainingMs ?? 0))

      return ctx.prisma.timer.update({
        where: { id: input.timerId },
        data: {
          status: TimerStatus.Active,
          expiresAt: newExpiresAt,
          pausedAt: null,
          pausedRemainingMs: null,
          updatedAt: now,
        },
      })
    }),

  /**
   * Mark a timer as expired.
   * If linked to a step/task, transitions it from 'waiting' to 'completed'.
   */
  expire: protectedProcedure
    .input(z.object({ timerId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const now = getCurrentTime()

      const timer = await ctx.prisma.timer.update({
        where: { id: input.timerId },
        data: {
          status: TimerStatus.Expired,
          expiredAt: now,
          updatedAt: now,
        },
      })

      // Transition linked step from waiting → completed
      if (timer.linkedStepId) {
        const step = await ctx.prisma.taskStep.findUnique({
          where: { id: timer.linkedStepId },
        })
        if (step && step.status === StepStatus.Waiting) {
          await ctx.prisma.taskStep.update({
            where: { id: timer.linkedStepId },
            data: { status: StepStatus.Completed },
          })

          // Recalculate workflow overallStatus
          const allSteps = await ctx.prisma.taskStep.findMany({
            where: { taskId: step.taskId },
          })
          const allDone = allSteps.every(
            (s) => s.status === 'completed' || s.status === 'skipped',
          )
          if (allDone) {
            await ctx.prisma.task.update({
              where: { id: step.taskId },
              data: {
                overallStatus: TaskStatus.Completed,
                completed: true,
                completedAt: now,
                updatedAt: now,
              },
            })
          }
        }
      }

      // Transition linked task (no step) from waiting → completed
      if (timer.linkedTaskId && !timer.linkedStepId) {
        const task = await ctx.prisma.task.findUnique({
          where: { id: timer.linkedTaskId },
        })
        if (task && task.overallStatus === TaskStatus.Waiting) {
          await ctx.prisma.task.update({
            where: { id: timer.linkedTaskId },
            data: {
              overallStatus: TaskStatus.Completed,
              completed: true,
              completedAt: now,
              updatedAt: now,
            },
          })
        }
      }

      return timer
    }),

  /**
   * Dismiss an expired timer notification.
   */
  dismiss: protectedProcedure
    .input(z.object({ timerId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const now = getCurrentTime()
      return ctx.prisma.timer.update({
        where: { id: input.timerId },
        data: {
          status: TimerStatus.Dismissed,
          dismissedAt: now,
          updatedAt: now,
        },
      })
    }),

  /**
   * Cancel a timer (delete it from active tracking).
   */
  cancel: protectedProcedure
    .input(z.object({ timerId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.timer.update({
        where: { id: input.timerId },
        data: {
          status: TimerStatus.Cancelled,
          updatedAt: getCurrentTime(),
        },
      })
    }),
})

export type TimerRouter = typeof timerRouter
