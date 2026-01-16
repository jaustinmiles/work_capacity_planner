/**
 * Jargon Router
 *
 * Handles jargon dictionary entries.
 * Jargon entries help define domain-specific terminology.
 */

import { z } from 'zod'
import { router, sessionProcedure, protectedProcedure } from '../trpc'
import { generateUniqueId } from '../../shared/step-id-utils'
import { getCurrentTime } from '../../shared/time-provider'

/**
 * Schema for creating a jargon entry
 */
const createInput = z.object({
  term: z.string().min(1),
  definition: z.string().min(1),
  category: z.string().optional(),
  examples: z.string().optional(),
  relatedTerms: z.string().optional(),
})

/**
 * Schema for updating a jargon entry
 */
const updateInput = z.object({
  id: z.string(),
  term: z.string().min(1).optional(),
  definition: z.string().min(1).optional(),
  category: z.string().optional(),
  examples: z.string().optional(),
  relatedTerms: z.string().optional(),
})

/**
 * Schema for filtering jargon entries
 */
const filtersInput = z.object({
  category: z.string().optional(),
  searchTerm: z.string().optional(),
})

export const jargonRouter = router({
  /**
   * Get all jargon entries with optional filters
   */
  getAll: sessionProcedure.input(filtersInput.optional()).query(async ({ ctx, input }) => {
    const filters = input || {}

    return ctx.prisma.jargonEntry.findMany({
      where: {
        sessionId: ctx.sessionId,
        ...(filters.category && { category: filters.category }),
        ...(filters.searchTerm && {
          OR: [
            { term: { contains: filters.searchTerm } },
            { definition: { contains: filters.searchTerm } },
          ],
        }),
      },
      orderBy: { term: 'asc' },
    })
  }),

  /**
   * Get a single jargon entry by ID
   */
  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.prisma.jargonEntry.findUnique({
        where: { id: input.id },
      })
    }),

  /**
   * Create a new jargon entry
   */
  create: sessionProcedure.input(createInput).mutation(async ({ ctx, input }) => {
    const now = getCurrentTime()

    return ctx.prisma.jargonEntry.create({
      data: {
        id: generateUniqueId('jargon'),
        sessionId: ctx.sessionId,
        term: input.term,
        definition: input.definition,
        category: input.category || null,
        examples: input.examples || null,
        relatedTerms: input.relatedTerms || null,
        createdAt: now,
        updatedAt: now,
      },
    })
  }),

  /**
   * Update a jargon entry
   */
  update: protectedProcedure.input(updateInput).mutation(async ({ ctx, input }) => {
    const { id, ...updates } = input

    return ctx.prisma.jargonEntry.update({
      where: { id },
      data: {
        ...updates,
        updatedAt: getCurrentTime(),
      },
    })
  }),

  /**
   * Delete a jargon entry
   */
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.jargonEntry.delete({
        where: { id: input.id },
      })
      return { success: true }
    }),

  /**
   * Get jargon dictionary as term -> definition map
   */
  getDictionary: sessionProcedure.query(async ({ ctx }) => {
    const entries = await ctx.prisma.jargonEntry.findMany({
      where: { sessionId: ctx.sessionId },
      select: { term: true, definition: true },
    })

    return Object.fromEntries(entries.map((e) => [e.term, e.definition]))
  }),

  /**
   * Upsert jargon by term (update if exists, create if not)
   */
  upsertByTerm: sessionProcedure
    .input(z.object({ term: z.string(), definition: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.jargonEntry.findUnique({
        where: {
          sessionId_term: {
            sessionId: ctx.sessionId,
            term: input.term,
          },
        },
      })

      const now = getCurrentTime()

      if (existing) {
        return ctx.prisma.jargonEntry.update({
          where: { id: existing.id },
          data: {
            definition: input.definition,
            updatedAt: now,
          },
        })
      } else {
        return ctx.prisma.jargonEntry.create({
          data: {
            id: generateUniqueId('jargon'),
            sessionId: ctx.sessionId,
            term: input.term,
            definition: input.definition,
            createdAt: now,
            updatedAt: now,
          },
        })
      }
    }),
})
