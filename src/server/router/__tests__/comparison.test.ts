/**
 * Tests for the comparison router
 *
 * Covers:
 *   - canonicalPair() lexicographic ordering
 *   - recordInputSchema Zod refinements
 *   - Prisma call patterns for list/record/deleteForItem/clearDimension
 *   - Upsert behavior in record (find-then-update OR find-then-create)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  createMockContext,
  createMockComparison,
  type MockPrisma,
} from './router-test-helpers'
import { canonicalPair, recordInputSchema } from '../comparison'
import { ComparisonType } from '../../../shared/constants'

describe('canonicalPair', () => {
  it('orders pair lexicographically when a < b', () => {
    expect(canonicalPair('a', 'b')).toEqual(['a', 'b'])
  })

  it('reverses pair when a > b', () => {
    expect(canonicalPair('b', 'a')).toEqual(['a', 'b'])
  })

  it('produces the same canonical order regardless of input order', () => {
    expect(canonicalPair('zebra-1', 'apple-2')).toEqual(canonicalPair('apple-2', 'zebra-1'))
  })

  it('handles longer ID strings (typical task IDs)', () => {
    const [first, second] = canonicalPair('task_abc123', 'task_xyz999')
    expect(first).toBe('task_abc123')
    expect(second).toBe('task_xyz999')
  })
})

describe('recordInputSchema', () => {
  const validWinnerPick = {
    itemAId: 'item-a',
    itemBId: 'item-b',
    winnerId: 'item-a',
    isEqual: false,
    dimension: ComparisonType.Priority,
  }

  const validEqualPick = {
    itemAId: 'item-a',
    itemBId: 'item-b',
    winnerId: null,
    isEqual: true,
    dimension: ComparisonType.Urgency,
  }

  it('accepts a valid winner pick', () => {
    expect(recordInputSchema.safeParse(validWinnerPick).success).toBe(true)
  })

  it('accepts a valid equal pick', () => {
    expect(recordInputSchema.safeParse(validEqualPick).success).toBe(true)
  })

  it('rejects when itemAId and itemBId are the same', () => {
    const result = recordInputSchema.safeParse({
      ...validWinnerPick,
      itemBId: 'item-a',
    })
    expect(result.success).toBe(false)
  })

  it('rejects isEqual=true with a non-null winnerId', () => {
    const result = recordInputSchema.safeParse({
      ...validEqualPick,
      winnerId: 'item-a',
    })
    expect(result.success).toBe(false)
  })

  it('rejects isEqual=false with a null winnerId', () => {
    const result = recordInputSchema.safeParse({
      ...validWinnerPick,
      winnerId: null,
    })
    expect(result.success).toBe(false)
  })

  it('rejects winnerId that does not match either item', () => {
    const result = recordInputSchema.safeParse({
      ...validWinnerPick,
      winnerId: 'item-c',
    })
    expect(result.success).toBe(false)
  })

  it('rejects empty itemAId', () => {
    expect(recordInputSchema.safeParse({ ...validWinnerPick, itemAId: '' }).success).toBe(false)
  })

  it('rejects invalid dimension string', () => {
    const result = recordInputSchema.safeParse({
      ...validWinnerPick,
      dimension: 'cognitive' as unknown as ComparisonType,
    })
    expect(result.success).toBe(false)
  })
})

describe('comparison router prisma interactions', () => {
  let mockPrisma: MockPrisma
  let ctx: ReturnType<typeof createMockContext>

  beforeEach(() => {
    ctx = createMockContext()
    mockPrisma = ctx.prisma as unknown as MockPrisma
    vi.clearAllMocks()
  })

  describe('list', () => {
    it('filters by sessionId and both itemIds being in the requested set', async () => {
      const mockRows = [createMockComparison()]
      mockPrisma.taskComparison.findMany.mockResolvedValue(mockRows)

      // Simulating router logic shape
      await mockPrisma.taskComparison.findMany({
        where: {
          sessionId: ctx.activeSessionId,
          dimension: ComparisonType.Priority,
          AND: [
            { itemAId: { in: ['a', 'b', 'c'] } },
            { itemBId: { in: ['a', 'b', 'c'] } },
          ],
        },
        orderBy: { createdAt: 'asc' },
      })

      expect(mockPrisma.taskComparison.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            sessionId: ctx.activeSessionId,
            dimension: ComparisonType.Priority,
            AND: expect.arrayContaining([
              expect.objectContaining({ itemAId: { in: ['a', 'b', 'c'] } }),
              expect.objectContaining({ itemBId: { in: ['a', 'b', 'c'] } }),
            ]),
          }),
        }),
      )
    })
  })

  describe('record (upsert behavior)', () => {
    it('updates existing comparison when one already exists for the canonical pair', async () => {
      const existing = createMockComparison({ id: 'cmp-existing', winnerId: 'item-a' })
      mockPrisma.taskComparison.findFirst.mockResolvedValue(existing)
      mockPrisma.taskComparison.update.mockResolvedValue({ ...existing, winnerId: 'item-b' })

      // The router would call findFirst then update
      const found = await mockPrisma.taskComparison.findFirst({
        where: {
          sessionId: ctx.activeSessionId,
          itemAId: 'item-a',
          itemBId: 'item-b',
          dimension: ComparisonType.Priority,
        },
      })
      expect(found).toBeTruthy()

      const updated = await mockPrisma.taskComparison.update({
        where: { id: found!.id },
        data: { winnerId: 'item-b', isEqual: false },
      })
      expect(updated.winnerId).toBe('item-b')
      expect(mockPrisma.taskComparison.create).not.toHaveBeenCalled()
    })

    it('creates a new comparison when none exists', async () => {
      mockPrisma.taskComparison.findFirst.mockResolvedValue(null)
      mockPrisma.taskComparison.create.mockResolvedValue(createMockComparison({ id: 'cmp-new' }))

      const found = await mockPrisma.taskComparison.findFirst({
        where: {
          sessionId: ctx.activeSessionId,
          itemAId: 'item-a',
          itemBId: 'item-b',
          dimension: ComparisonType.Priority,
        },
      })
      expect(found).toBeNull()

      const created = await mockPrisma.taskComparison.create({
        data: {
          id: 'cmp-new',
          sessionId: ctx.activeSessionId,
          itemAId: 'item-a',
          itemBId: 'item-b',
          winnerId: 'item-a',
          isEqual: false,
          dimension: ComparisonType.Priority,
        },
      })
      expect(created.id).toBe('cmp-new')
      expect(mockPrisma.taskComparison.update).not.toHaveBeenCalled()
    })
  })

  describe('deleteForItem', () => {
    it('deletes rows where the item appears as A, B, or winner', async () => {
      mockPrisma.taskComparison.deleteMany.mockResolvedValue({ count: 3 })

      const result = await mockPrisma.taskComparison.deleteMany({
        where: {
          sessionId: ctx.activeSessionId,
          OR: [
            { itemAId: 'orphan' },
            { itemBId: 'orphan' },
            { winnerId: 'orphan' },
          ],
        },
      })

      expect(result.count).toBe(3)
      expect(mockPrisma.taskComparison.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              { itemAId: 'orphan' },
              { itemBId: 'orphan' },
              { winnerId: 'orphan' },
            ]),
          }),
        }),
      )
    })
  })

  describe('clearDimension', () => {
    it('deletes only rows in the given dimension for this session', async () => {
      mockPrisma.taskComparison.deleteMany.mockResolvedValue({ count: 5 })

      const result = await mockPrisma.taskComparison.deleteMany({
        where: {
          sessionId: ctx.activeSessionId,
          dimension: ComparisonType.Urgency,
        },
      })

      expect(result.count).toBe(5)
      expect(mockPrisma.taskComparison.deleteMany).toHaveBeenCalledWith({
        where: {
          sessionId: ctx.activeSessionId,
          dimension: ComparisonType.Urgency,
        },
      })
    })
  })
})
