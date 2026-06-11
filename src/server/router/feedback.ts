/**
 * Feedback Router
 *
 * Handles development feedback operations backed by the Feedback table.
 * Every client (desktop, web, CLI/MCP, mobile) routes feedback through these
 * procedures so there is exactly ONE store. The legacy context/feedback.json
 * file is a read-only archive (imported via scripts/import-feedback-json.ts).
 *
 * Feedback is intentionally session-independent (protectedProcedure, not
 * sessionProcedure): items carry a free-form sessionId label from the client.
 */

import { z } from 'zod'
import { router, protectedProcedure } from '../trpc'
import { TRPCError } from '@trpc/server'
import { getCurrentTime } from '../../shared/time-provider'

/**
 * Feedback item types present in the feedback data.
 * Includes both user-facing types and internal tracking types.
 */
const feedbackTypeSchema = z.enum([
  'bug',
  'feature',
  'improvement',
  'technical_debt',
  'enhancement',
  'refactoring',
  'other',
])

const feedbackPrioritySchema = z.enum(['critical', 'high', 'medium', 'low'])

export type FeedbackType = z.infer<typeof feedbackTypeSchema>
export type FeedbackPriority = z.infer<typeof feedbackPrioritySchema>

/**
 * Legacy rows (imported from feedback.json) may carry values outside the
 * current enums; fall back rather than failing the whole list query.
 */
const feedbackTypeWithFallback = feedbackTypeSchema.catch('other')
const feedbackPriorityWithFallback = feedbackPrioritySchema.catch('medium')

/** API shape for a feedback item (components JSON column parsed to an array) */
export interface FeedbackItemDto {
  id: string
  type: FeedbackType
  priority: FeedbackPriority
  title: string
  description: string
  components: string[] | null
  steps: string | null
  expected: string | null
  actual: string | null
  sessionId: string
  timestamp: Date
  resolved: boolean
  resolvedDate: Date | null
  resolvedIn: string | null
}

/** Database row shape for a feedback item (components stored as JSON string) */
interface FeedbackRow {
  id: string
  type: string
  priority: string
  title: string
  description: string
  components: string | null
  steps: string | null
  expected: string | null
  actual: string | null
  sessionId: string
  createdAt: Date
  resolved: boolean
  resolvedDate: Date | null
  resolvedIn: string | null
}

/** Parse the components JSON column into a string array (null if absent/invalid) */
function parseComponents(value: string | null): string[] | null {
  if (!value) {
    return null
  }
  try {
    const parsed: unknown = JSON.parse(value)
    if (Array.isArray(parsed)) {
      const strings = parsed.filter(
        (entry): entry is string => typeof entry === 'string',
      )
      return strings.length > 0 ? strings : null
    }
  } catch {
    // Malformed JSON in a legacy row — treat as no components
  }
  return null
}

/** Map a database row to the API shape */
function toFeedbackDto(row: FeedbackRow): FeedbackItemDto {
  return {
    id: row.id,
    type: feedbackTypeWithFallback.parse(row.type),
    priority: feedbackPriorityWithFallback.parse(row.priority),
    title: row.title,
    description: row.description,
    components: parseComponents(row.components),
    steps: row.steps,
    expected: row.expected,
    actual: row.actual,
    sessionId: row.sessionId,
    timestamp: row.createdAt,
    resolved: row.resolved,
    resolvedDate: row.resolvedDate,
    resolvedIn: row.resolvedIn,
  }
}

const addFeedbackSchema = z.object({
  type: feedbackTypeSchema,
  priority: feedbackPrioritySchema,
  title: z.string().min(1),
  description: z.string().min(1),
  components: z.array(z.string()).optional(),
  steps: z.string().optional(),
  expected: z.string().optional(),
  actual: z.string().optional(),
  sessionId: z.string().min(1),
  /** Client-side creation time; used for the legacy timestamp+sessionId dedupe */
  timestamp: z.coerce.date().optional(),
})

const updateFeedbackPatchSchema = z.object({
  type: feedbackTypeSchema.optional(),
  priority: feedbackPrioritySchema.optional(),
  title: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  components: z.array(z.string()).optional(),
  steps: z.string().optional(),
  expected: z.string().optional(),
  actual: z.string().optional(),
  resolved: z.boolean().optional(),
  resolvedIn: z.string().optional(),
})

export const feedbackRouter = router({
  /**
   * List feedback items, optionally filtered by resolved/type/priority.
   * Newest first.
   */
  list: protectedProcedure
    .input(
      z
        .object({
          resolved: z.boolean().optional(),
          type: feedbackTypeSchema.optional(),
          priority: feedbackPrioritySchema.optional(),
        })
        .optional(),
    )
    .query(async ({ input, ctx }): Promise<FeedbackItemDto[]> => {
      const rows = await ctx.prisma.feedback.findMany({
        where: {
          ...(input?.resolved !== undefined && { resolved: input.resolved }),
          ...(input?.type !== undefined && { type: input.type }),
          ...(input?.priority !== undefined && { priority: input.priority }),
        },
        orderBy: { createdAt: 'desc' },
      })
      return rows.map(toFeedbackDto)
    }),

  /**
   * Add a single feedback item. Returns the created row's id.
   * Pre-checks timestamp+sessionId so legacy clients that retry a submit
   * (or flush an offline queue twice) never create duplicates.
   */
  add: protectedProcedure
    .input(addFeedbackSchema)
    .mutation(
      async ({
        input,
        ctx,
      }): Promise<{ id: string; duplicate: boolean }> => {
        if (input.timestamp) {
          const existing = await ctx.prisma.feedback.findFirst({
            where: {
              sessionId: input.sessionId,
              createdAt: input.timestamp,
            },
          })
          if (existing) {
            return { id: existing.id, duplicate: true }
          }
        }

        const created = await ctx.prisma.feedback.create({
          data: {
            type: input.type,
            priority: input.priority,
            title: input.title,
            description: input.description,
            components:
              input.components !== undefined
                ? JSON.stringify(input.components)
                : null,
            steps: input.steps ?? null,
            expected: input.expected ?? null,
            actual: input.actual ?? null,
            sessionId: input.sessionId,
            createdAt: input.timestamp ?? getCurrentTime(),
          },
        })
        return { id: created.id, duplicate: false }
      },
    ),

  /**
   * Mark a single feedback item resolved by id.
   */
  resolve: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ input, ctx }): Promise<FeedbackItemDto> => {
      const existing = await ctx.prisma.feedback.findUnique({
        where: { id: input.id },
      })
      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Feedback item ${input.id} not found`,
        })
      }

      const updated = await ctx.prisma.feedback.update({
        where: { id: input.id },
        data: {
          resolved: true,
          resolvedDate: existing.resolvedDate ?? getCurrentTime(),
        },
      })
      return toFeedbackDto(updated)
    }),

  /**
   * Patch a single feedback item by id. Only the provided fields change,
   * so concurrent edits to OTHER items can never be erased (this replaces
   * the dangerous full-array overwrite the file store required).
   */
  update: protectedProcedure
    .input(z.object({ id: z.string().min(1), patch: updateFeedbackPatchSchema }))
    .mutation(async ({ input, ctx }): Promise<FeedbackItemDto> => {
      const existing = await ctx.prisma.feedback.findUnique({
        where: { id: input.id },
      })
      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Feedback item ${input.id} not found`,
        })
      }

      const { patch } = input
      const updated = await ctx.prisma.feedback.update({
        where: { id: input.id },
        data: {
          ...(patch.type !== undefined && { type: patch.type }),
          ...(patch.priority !== undefined && { priority: patch.priority }),
          ...(patch.title !== undefined && { title: patch.title }),
          ...(patch.description !== undefined && {
            description: patch.description,
          }),
          ...(patch.components !== undefined && {
            components: JSON.stringify(patch.components),
          }),
          ...(patch.steps !== undefined && { steps: patch.steps }),
          ...(patch.expected !== undefined && { expected: patch.expected }),
          ...(patch.actual !== undefined && { actual: patch.actual }),
          ...(patch.resolvedIn !== undefined && {
            resolvedIn: patch.resolvedIn,
          }),
          ...(patch.resolved === true && {
            resolved: true,
            resolvedDate: existing.resolvedDate ?? getCurrentTime(),
          }),
          // Reopening clears resolution metadata (clients whose serializers
          // omit nil optionals cannot send explicit nulls)
          ...(patch.resolved === false && {
            resolved: false,
            resolvedDate: null,
            resolvedIn: null,
          }),
        },
      })
      return toFeedbackDto(updated)
    }),
})
