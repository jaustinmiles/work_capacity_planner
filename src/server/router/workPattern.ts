/**
 * Work Pattern Router
 *
 * Handles work patterns, blocks, and meetings.
 * Work patterns define the schedule structure for a day.
 */

import { z } from 'zod'
import { router, sessionProcedure, protectedProcedure } from '../trpc'
import { generateUniqueId } from '../../shared/step-id-utils'
import { getCurrentTime } from '../../shared/time-provider'
import { BlockConfigKind, WorkBlockType } from '../../shared/enums'
import { calculateBlockCapacity } from '../../shared/capacity-calculator'

/**
 * Schema for block type configuration
 */
const blockTypeConfigSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal(BlockConfigKind.Single),
    typeId: z.string(),
  }),
  z.object({
    kind: z.literal(BlockConfigKind.Combo),
    allocations: z.array(
      z.object({
        typeId: z.string(),
        percentage: z.number().min(0).max(100),
      }),
    ),
  }),
  z.object({
    kind: z.literal(BlockConfigKind.System),
    systemType: z.nativeEnum(WorkBlockType),
  }),
])

/**
 * Schema for a work block
 */
const workBlockSchema = z.object({
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  typeConfig: blockTypeConfigSchema,
})

/**
 * Schema for a work meeting
 */
const workMeetingSchema = z.object({
  name: z.string().min(1),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  type: z.string(),
  recurring: z.string().default('none'),
  daysOfWeek: z.string().optional(),
})

/**
 * Schema for creating a work pattern
 */
const createPatternInput = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  blocks: z.array(workBlockSchema).optional(),
  meetings: z.array(workMeetingSchema).optional(),
  isTemplate: z.boolean().default(false),
  templateName: z.string().optional(),
})

/**
 * Schema for updating a work pattern
 */
const updatePatternInput = z.object({
  id: z.string(),
  blocks: z.array(workBlockSchema).optional(),
  meetings: z.array(workMeetingSchema).optional(),
})

/**
 * Parse and validate typeConfig JSON
 */
function parseTypeConfig(typeConfigJson: string) {
  const parsed = JSON.parse(typeConfigJson)
  return parsed
}

/**
 * Format a work pattern from database
 */
function formatPattern(pattern: {
  id: string
  date: string
  isTemplate: boolean
  templateName: string | null
  sessionId: string
  createdAt: Date
  updatedAt: Date
  WorkBlock: Array<{
    id: string
    startTime: string
    endTime: string
    typeConfig: string
    totalCapacity: number
    patternId: string
  }>
  WorkMeeting: Array<{
    id: string
    name: string
    startTime: string
    endTime: string
    type: string
    recurring: string
    daysOfWeek: string | null
    patternId: string
  }>
}) {
  return {
    ...pattern,
    blocks: pattern.WorkBlock.map((block) => {
      const typeConfig = parseTypeConfig(block.typeConfig)
      const capacity = calculateBlockCapacity(typeConfig, block.startTime, block.endTime)
      return {
        id: block.id,
        startTime: block.startTime,
        endTime: block.endTime,
        typeConfig,
        capacity,
        totalCapacity: capacity.totalMinutes,
        patternId: block.patternId,
      }
    }),
    meetings: pattern.WorkMeeting.map((meeting) => ({
      id: meeting.id,
      name: meeting.name,
      startTime: meeting.startTime,
      endTime: meeting.endTime,
      type: meeting.type,
      recurring: meeting.recurring,
      daysOfWeek: meeting.daysOfWeek,
      patternId: meeting.patternId,
    })),
  }
}

export const workPatternRouter = router({
  /**
   * Get all non-template work patterns for the session
   */
  getAll: sessionProcedure.query(async ({ ctx }) => {
    const patterns = await ctx.prisma.workPattern.findMany({
      where: {
        sessionId: ctx.sessionId,
        isTemplate: false,
      },
      include: {
        WorkBlock: true,
        WorkMeeting: true,
      },
      orderBy: { date: 'desc' },
    })

    return patterns.map(formatPattern)
  }),

  /**
   * Get work pattern for a specific date
   */
  getByDate: sessionProcedure
    .input(z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }))
    .query(async ({ ctx, input }) => {
      const pattern = await ctx.prisma.workPattern.findUnique({
        where: {
          sessionId_date: {
            sessionId: ctx.sessionId,
            date: input.date,
          },
        },
        include: {
          WorkBlock: true,
          WorkMeeting: true,
        },
      })

      if (!pattern) return null
      return formatPattern(pattern)
    }),

  /**
   * Get all template patterns
   */
  getTemplates: sessionProcedure.query(async ({ ctx }) => {
    const patterns = await ctx.prisma.workPattern.findMany({
      where: {
        sessionId: ctx.sessionId,
        isTemplate: true,
      },
      include: {
        WorkBlock: true,
        WorkMeeting: true,
      },
    })

    return patterns.map(formatPattern)
  }),

  /**
   * Create or update a work pattern (upsert)
   * Uses upsert to handle unique constraint on (sessionId, date)
   */
  create: sessionProcedure.input(createPatternInput).mutation(async ({ ctx, input }) => {
    const now = getCurrentTime()

    // Use transaction to handle upsert with related blocks/meetings
    const pattern = await ctx.prisma.$transaction(async (tx) => {
      // Check if pattern exists for this date
      const existing = await tx.workPattern.findUnique({
        where: {
          sessionId_date: {
            sessionId: ctx.sessionId,
            date: input.date,
          },
        },
      })

      if (existing) {
        // Delete existing blocks and meetings before update
        await tx.workBlock.deleteMany({ where: { patternId: existing.id } })
        await tx.workMeeting.deleteMany({ where: { patternId: existing.id } })

        // Update existing pattern
        return tx.workPattern.update({
          where: { id: existing.id },
          data: {
            isTemplate: input.isTemplate,
            templateName: input.templateName || null,
            updatedAt: now,
            WorkBlock: input.blocks
              ? {
                  create: input.blocks.map((block) => ({
                    id: generateUniqueId('block'),
                    startTime: block.startTime,
                    endTime: block.endTime,
                    typeConfig: JSON.stringify(block.typeConfig),
                    totalCapacity: 0,
                  })),
                }
              : undefined,
            WorkMeeting: input.meetings
              ? {
                  create: input.meetings.map((meeting) => ({
                    id: generateUniqueId('meeting'),
                    name: meeting.name,
                    startTime: meeting.startTime,
                    endTime: meeting.endTime,
                    type: meeting.type,
                    recurring: meeting.recurring,
                    daysOfWeek: meeting.daysOfWeek || null,
                  })),
                }
              : undefined,
          },
          include: {
            WorkBlock: true,
            WorkMeeting: true,
          },
        })
      } else {
        // Create new pattern
        const id = generateUniqueId('pattern')
        return tx.workPattern.create({
          data: {
            id,
            date: input.date,
            isTemplate: input.isTemplate,
            templateName: input.templateName || null,
            sessionId: ctx.sessionId,
            createdAt: now,
            updatedAt: now,
            WorkBlock: input.blocks
              ? {
                  create: input.blocks.map((block) => ({
                    id: generateUniqueId('block'),
                    startTime: block.startTime,
                    endTime: block.endTime,
                    typeConfig: JSON.stringify(block.typeConfig),
                    totalCapacity: 0,
                  })),
                }
              : undefined,
            WorkMeeting: input.meetings
              ? {
                  create: input.meetings.map((meeting) => ({
                    id: generateUniqueId('meeting'),
                    name: meeting.name,
                    startTime: meeting.startTime,
                    endTime: meeting.endTime,
                    type: meeting.type,
                    recurring: meeting.recurring,
                    daysOfWeek: meeting.daysOfWeek || null,
                  })),
                }
              : undefined,
          },
          include: {
            WorkBlock: true,
            WorkMeeting: true,
          },
        })
      }
    })

    return formatPattern(pattern)
  }),

  /**
   * Update a work pattern (replace blocks and meetings)
   */
  update: protectedProcedure.input(updatePatternInput).mutation(async ({ ctx, input }) => {
    const { id, blocks, meetings } = input

    // Use transaction to replace blocks and meetings atomically
    const pattern = await ctx.prisma.$transaction(async (tx) => {
      // Delete existing blocks and meetings
      if (blocks !== undefined) {
        await tx.workBlock.deleteMany({ where: { patternId: id } })
      }
      if (meetings !== undefined) {
        await tx.workMeeting.deleteMany({ where: { patternId: id } })
      }

      // Update pattern with new blocks and meetings
      return tx.workPattern.update({
        where: { id },
        data: {
          updatedAt: getCurrentTime(),
          WorkBlock: blocks
            ? {
                create: blocks.map((block) => ({
                  id: generateUniqueId('block'),
                  startTime: block.startTime,
                  endTime: block.endTime,
                  typeConfig: JSON.stringify(block.typeConfig),
                  totalCapacity: 0,
                })),
              }
            : undefined,
          WorkMeeting: meetings
            ? {
                create: meetings.map((meeting) => ({
                  id: generateUniqueId('meeting'),
                  name: meeting.name,
                  startTime: meeting.startTime,
                  endTime: meeting.endTime,
                  type: meeting.type,
                  recurring: meeting.recurring,
                  daysOfWeek: meeting.daysOfWeek || null,
                })),
              }
            : undefined,
        },
        include: {
          WorkBlock: true,
          WorkMeeting: true,
        },
      })
    })

    return formatPattern(pattern)
  }),

  /**
   * Delete a work pattern
   */
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.workPattern.delete({
        where: { id: input.id },
      })
      return { success: true }
    }),

  /**
   * Create pattern from template
   */
  createFromTemplate: sessionProcedure
    .input(
      z.object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        templateName: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Find the template
      const template = await ctx.prisma.workPattern.findFirst({
        where: {
          sessionId: ctx.sessionId,
          isTemplate: true,
          templateName: input.templateName,
        },
        include: {
          WorkBlock: true,
          WorkMeeting: true,
        },
      })

      if (!template) {
        throw new Error(`Template "${input.templateName}" not found`)
      }

      const id = generateUniqueId('pattern')
      const now = getCurrentTime()

      // Create new pattern copying template data
      const pattern = await ctx.prisma.workPattern.create({
        data: {
          id,
          date: input.date,
          isTemplate: false,
          sessionId: ctx.sessionId,
          createdAt: now,
          updatedAt: now,
          WorkBlock: {
            create: template.WorkBlock.map((block) => ({
              id: generateUniqueId('block'),
              startTime: block.startTime,
              endTime: block.endTime,
              typeConfig: block.typeConfig,
              totalCapacity: block.totalCapacity,
            })),
          },
          WorkMeeting: {
            create: template.WorkMeeting.map((meeting) => ({
              id: generateUniqueId('meeting'),
              name: meeting.name,
              startTime: meeting.startTime,
              endTime: meeting.endTime,
              type: meeting.type,
              recurring: meeting.recurring,
              daysOfWeek: meeting.daysOfWeek,
            })),
          },
        },
        include: {
          WorkBlock: true,
          WorkMeeting: true,
        },
      })

      return formatPattern(pattern)
    }),

  /**
   * Find block at a specific time
   */
  findBlockAtTime: sessionProcedure
    .input(
      z.object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        timeMinutes: z.number().int(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const pattern = await ctx.prisma.workPattern.findUnique({
        where: {
          sessionId_date: {
            sessionId: ctx.sessionId,
            date: input.date,
          },
        },
        include: { WorkBlock: true },
      })

      if (!pattern) return null

      // Convert time to HH:MM format for comparison
      const hours = Math.floor(input.timeMinutes / 60)
      const minutes = input.timeMinutes % 60
      const timeStr = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`

      // Find block containing this time
      const block = pattern.WorkBlock.find((b) => {
        return b.startTime <= timeStr && b.endTime > timeStr
      })

      return block ? { id: block.id } : null
    }),
})
