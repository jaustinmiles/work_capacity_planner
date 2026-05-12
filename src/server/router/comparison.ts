/**
 * Comparison Router
 *
 * Persists pairwise tournament comparisons between tasks/workflows so rankings
 * survive across sessions and accumulate over multiple tournament runs.
 *
 * The graph that drives pair selection (see comparison-graph.ts) is hydrated
 * from these rows on tournament open.
 */

import { z } from 'zod'
import { router, sessionProcedure } from '../trpc'
import { generateUniqueId } from '../../shared/step-id-utils'
import { ComparisonType } from '../../shared/constants'

const dimensionEnum = z.nativeEnum(ComparisonType)

// Canonical pair ordering so (A, B) and (B, A) collapse to one row.
// Exported for unit testing.
export function canonicalPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a]
}

export const recordInputSchema = z.object({
  itemAId: z.string().min(1),
  itemBId: z.string().min(1),
  winnerId: z.string().nullable(),
  isEqual: z.boolean(),
  dimension: dimensionEnum,
}).refine(
  data => data.itemAId !== data.itemBId,
  { message: 'itemAId and itemBId must differ' },
).refine(
  data => data.isEqual ? data.winnerId === null : data.winnerId !== null,
  { message: 'isEqual=true requires winnerId=null; isEqual=false requires a winnerId' },
).refine(
  data => data.winnerId === null || data.winnerId === data.itemAId || data.winnerId === data.itemBId,
  { message: 'winnerId must be itemAId or itemBId' },
)

export const comparisonRouter = router({
  /**
   * List all persisted comparisons relevant to the given items.
   * If dimension is omitted, returns both dimensions.
   */
  list: sessionProcedure
    .input(z.object({
      itemIds: z.array(z.string()),
      dimension: dimensionEnum.optional(),
    }))
    .query(async ({ ctx, input }) => {
      if (input.itemIds.length === 0) return []
      return ctx.prisma.taskComparison.findMany({
        where: {
          sessionId: ctx.sessionId,
          ...(input.dimension ? { dimension: input.dimension } : {}),
          AND: [
            { itemAId: { in: input.itemIds } },
            { itemBId: { in: input.itemIds } },
          ],
        },
        orderBy: { createdAt: 'asc' },
      })
    }),

  /**
   * Record (or overwrite) one pairwise comparison.
   * Idempotent: the same pair/dimension upserts.
   */
  record: sessionProcedure
    .input(recordInputSchema)
    .mutation(async ({ ctx, input }) => {
      const [itemAId, itemBId] = canonicalPair(input.itemAId, input.itemBId)

      const existing = await ctx.prisma.taskComparison.findFirst({
        where: {
          sessionId: ctx.sessionId,
          itemAId,
          itemBId,
          dimension: input.dimension,
        },
      })

      if (existing) {
        return ctx.prisma.taskComparison.update({
          where: { id: existing.id },
          data: {
            winnerId: input.winnerId,
            isEqual: input.isEqual,
          },
        })
      }

      return ctx.prisma.taskComparison.create({
        data: {
          id: generateUniqueId('cmp'),
          sessionId: ctx.sessionId,
          itemAId,
          itemBId,
          winnerId: input.winnerId,
          isEqual: input.isEqual,
          dimension: input.dimension,
        },
      })
    }),

  /**
   * Delete every comparison that mentions itemId (as A, B, or winner).
   * Called when a task or workflow is deleted so the graph stays clean.
   */
  deleteForItem: sessionProcedure
    .input(z.object({ itemId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.prisma.taskComparison.deleteMany({
        where: {
          sessionId: ctx.sessionId,
          OR: [
            { itemAId: input.itemId },
            { itemBId: input.itemId },
            { winnerId: input.itemId },
          ],
        },
      })
      return { deletedCount: result.count }
    }),

  /**
   * Clear all comparisons for a dimension. Used by "Start fresh" in the UI.
   */
  clearDimension: sessionProcedure
    .input(z.object({ dimension: dimensionEnum }))
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.prisma.taskComparison.deleteMany({
        where: {
          sessionId: ctx.sessionId,
          dimension: input.dimension,
        },
      })
      return { deletedCount: result.count }
    }),
})
