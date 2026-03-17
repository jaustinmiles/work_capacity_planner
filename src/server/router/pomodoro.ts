/**
 * Pomodoro Router
 *
 * Handles Pomodoro cycle management: settings, cycle lifecycle, and queries.
 * Cycles are a grouping concept that overlay WorkSessions — they don't replace them.
 */

import { z } from 'zod'
import { router, sessionProcedure, protectedProcedure } from '../trpc'
import { generateUniqueId } from '../../shared/step-id-utils'
import { getCurrentTime } from '../../shared/time-provider'
import { getLocalDateRange } from '../../shared/time-utils'
import { PomodoroPhase } from '../../shared/enums'
import { POMODORO_DEFAULTS } from '../../shared/constants'
import { getBreakDurationMinutes } from '../../shared/pomodoro-types'

// ============================================================================
// Input Schemas
// ============================================================================

const updateSettingsInput = z.object({
  workDurationMinutes: z.number().int().min(1).optional(),
  shortBreakMinutes: z.number().int().min(1).optional(),
  longBreakMinutes: z.number().int().min(1).optional(),
  cyclesBeforeLongBreak: z.number().int().min(1).optional(),
  autoStartBreak: z.boolean().optional(),
  autoStartWork: z.boolean().optional(),
  idleReminderMinutes: z.number().int().min(1).nullable().optional(),
  soundEnabled: z.boolean().optional(),
})

const startCycleInput = z.object({
  workDurationMinutes: z.number().int().min(1).optional(),
  breakDurationMinutes: z.number().int().min(1).optional(),
})

const updateCyclePhaseInput = z.object({
  cycleId: z.string(),
  status: z.nativeEnum(PomodoroPhase),
  phaseStartTime: z.date(),
  breakTimeSinkId: z.string().nullable().optional(),
})

const endCycleInput = z.object({
  cycleId: z.string(),
})

const getCyclesByDateInput = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

const getCycleWithSessionsInput = z.object({
  cycleId: z.string(),
})

// ============================================================================
// Helpers
// ============================================================================


// ============================================================================
// Router
// ============================================================================

export const pomodoroRouter = router({
  // --------------------------------------------------------------------------
  // Settings
  // --------------------------------------------------------------------------

  /**
   * Get Pomodoro settings for the current session.
   * Returns null if no settings exist (client should use defaults).
   */
  getSettings: sessionProcedure.query(async ({ ctx }) => {
    return ctx.prisma.pomodoroSettings.findUnique({
      where: { sessionId: ctx.sessionId },
    })
  }),

  /**
   * Update (upsert) Pomodoro settings for the current session.
   */
  updateSettings: sessionProcedure
    .input(updateSettingsInput)
    .mutation(async ({ ctx, input }) => {
      const now = getCurrentTime()

      return ctx.prisma.pomodoroSettings.upsert({
        where: { sessionId: ctx.sessionId },
        create: {
          id: generateUniqueId('pomsettings'),
          sessionId: ctx.sessionId,
          workDurationMinutes: input.workDurationMinutes ?? POMODORO_DEFAULTS.WORK_DURATION_MINUTES,
          shortBreakMinutes: input.shortBreakMinutes ?? POMODORO_DEFAULTS.SHORT_BREAK_MINUTES,
          longBreakMinutes: input.longBreakMinutes ?? POMODORO_DEFAULTS.LONG_BREAK_MINUTES,
          cyclesBeforeLongBreak: input.cyclesBeforeLongBreak ?? POMODORO_DEFAULTS.CYCLES_BEFORE_LONG_BREAK,
          autoStartBreak: input.autoStartBreak ?? true,
          autoStartWork: input.autoStartWork ?? false,
          idleReminderMinutes: input.idleReminderMinutes ?? null,
          soundEnabled: input.soundEnabled ?? true,
          createdAt: now,
          updatedAt: now,
        },
        update: {
          ...input,
          updatedAt: now,
        },
      })
    }),

  // --------------------------------------------------------------------------
  // Cycle Lifecycle
  // --------------------------------------------------------------------------

  /**
   * Start a new Pomodoro cycle.
   * Computes the cycle number from today's existing cycles.
   * Allows per-cycle override of work/break durations.
   */
  startCycle: sessionProcedure
    .input(startCycleInput)
    .mutation(async ({ ctx, input }) => {
      const now = getCurrentTime()

      // Get settings for defaults
      const settings = await ctx.prisma.pomodoroSettings.findUnique({
        where: { sessionId: ctx.sessionId },
      })

      const workMinutes = input.workDurationMinutes
        ?? settings?.workDurationMinutes
        ?? POMODORO_DEFAULTS.WORK_DURATION_MINUTES

      // Compute cycle number: count today's cycles + 1
      const today = now.toISOString().slice(0, 10) // YYYY-MM-DD
      const { startOfDay, endOfDay } = getLocalDateRange(today)

      const todayCycleCount = await ctx.prisma.pomodoroCycle.count({
        where: {
          sessionId: ctx.sessionId,
          startTime: { gte: startOfDay, lte: endOfDay },
        },
      })

      const cycleNumber = todayCycleCount + 1

      // Compute break duration based on cycle number and settings
      const breakMinutes = input.breakDurationMinutes
        ?? getBreakDurationMinutes(cycleNumber, {
          shortBreakMinutes: settings?.shortBreakMinutes ?? POMODORO_DEFAULTS.SHORT_BREAK_MINUTES,
          longBreakMinutes: settings?.longBreakMinutes ?? POMODORO_DEFAULTS.LONG_BREAK_MINUTES,
          cyclesBeforeLongBreak: settings?.cyclesBeforeLongBreak ?? POMODORO_DEFAULTS.CYCLES_BEFORE_LONG_BREAK,
        })

      return ctx.prisma.pomodoroCycle.create({
        data: {
          id: generateUniqueId('cycle'),
          sessionId: ctx.sessionId,
          cycleNumber,
          status: PomodoroPhase.Work,
          workDurationMinutes: workMinutes,
          breakDurationMinutes: breakMinutes,
          phaseStartTime: now,
          startTime: now,
        },
      })
    }),

  /**
   * Get the currently active Pomodoro cycle (endTime is null, status is not completed).
   */
  getActiveCycle: sessionProcedure.query(async ({ ctx }) => {
    return ctx.prisma.pomodoroCycle.findFirst({
      where: {
        sessionId: ctx.sessionId,
        endTime: null,
        status: { not: PomodoroPhase.Completed },
      },
      include: {
        WorkSessions: {
          orderBy: { startTime: 'asc' },
        },
      },
    })
  }),

  /**
   * Update the phase of a Pomodoro cycle (work → break → work, or pause/resume).
   */
  updateCyclePhase: protectedProcedure
    .input(updateCyclePhaseInput)
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.pomodoroCycle.update({
        where: { id: input.cycleId },
        data: {
          status: input.status,
          phaseStartTime: input.phaseStartTime,
          breakTimeSinkId: input.breakTimeSinkId ?? undefined,
        },
      })
    }),

  /**
   * End a Pomodoro cycle (mark as completed with endTime).
   */
  endCycle: protectedProcedure
    .input(endCycleInput)
    .mutation(async ({ ctx, input }) => {
      const now = getCurrentTime()

      return ctx.prisma.pomodoroCycle.update({
        where: { id: input.cycleId },
        data: {
          status: PomodoroPhase.Completed,
          endTime: now,
        },
      })
    }),

  // --------------------------------------------------------------------------
  // Queries
  // --------------------------------------------------------------------------

  /**
   * Get all Pomodoro cycles for a specific date.
   */
  getCyclesByDate: sessionProcedure
    .input(getCyclesByDateInput)
    .query(async ({ ctx, input }) => {
      const { startOfDay, endOfDay } = getLocalDateRange(input.date)

      return ctx.prisma.pomodoroCycle.findMany({
        where: {
          sessionId: ctx.sessionId,
          startTime: { gte: startOfDay, lte: endOfDay },
        },
        orderBy: { startTime: 'asc' },
      })
    }),

  /**
   * Get a Pomodoro cycle with its associated work sessions.
   */
  getCycleWithSessions: protectedProcedure
    .input(getCycleWithSessionsInput)
    .query(async ({ ctx, input }) => {
      return ctx.prisma.pomodoroCycle.findUnique({
        where: { id: input.cycleId },
        include: {
          WorkSessions: {
            orderBy: { startTime: 'asc' },
            include: { Task: true },
          },
        },
      })
    }),
})
