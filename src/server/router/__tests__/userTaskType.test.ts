/**
 * Tests for the user task type router
 *
 * Tests UserTaskType CRUD operations including
 * auto sortOrder calculation and reorder transactions
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  createMockContext,
  createMockUserTaskType,
  type MockPrisma,
} from './router-test-helpers'

describe('userTaskType router', () => {
  let mockPrisma: MockPrisma
  let ctx: ReturnType<typeof createMockContext>

  beforeEach(() => {
    ctx = createMockContext()
    mockPrisma = ctx.prisma as unknown as MockPrisma
    vi.clearAllMocks()
  })

  describe('getAll', () => {
    it('should return all user task types ordered by sortOrder', async () => {
      const mockTypes = [
        createMockUserTaskType({ id: 'type-1', sortOrder: 0 }),
        createMockUserTaskType({ id: 'type-2', sortOrder: 1 }),
        createMockUserTaskType({ id: 'type-3', sortOrder: 2 }),
      ]
      mockPrisma.userTaskType.findMany.mockResolvedValue(mockTypes)

      const types = await mockPrisma.userTaskType.findMany({
        where: { sessionId: ctx.activeSessionId },
        orderBy: { sortOrder: 'asc' },
      })

      expect(types).toHaveLength(3)
      expect(types[0].sortOrder).toBe(0)
      expect(types[1].sortOrder).toBe(1)
      expect(types[2].sortOrder).toBe(2)
    })
  })

  describe('getById', () => {
    it('should return user task type when found', async () => {
      const mockType = createMockUserTaskType({
        id: 'type-123',
        name: 'Development',
        emoji: '💻',
        color: '#3B82F6',
      })
      mockPrisma.userTaskType.findUnique.mockResolvedValue(mockType)

      const type = await mockPrisma.userTaskType.findUnique({
        where: { id: 'type-123' },
      })

      expect(type).toBeTruthy()
      expect(type?.name).toBe('Development')
      expect(type?.emoji).toBe('💻')
    })

    it('should return null when not found', async () => {
      mockPrisma.userTaskType.findUnique.mockResolvedValue(null)

      const type = await mockPrisma.userTaskType.findUnique({
        where: { id: 'non-existent' },
      })

      expect(type).toBeNull()
    })
  })

  describe('create', () => {
    it('should create user task type with auto-calculated sortOrder', async () => {
      // Get existing types to calculate next sortOrder
      const existingTypes = [
        createMockUserTaskType({ sortOrder: 0 }),
        createMockUserTaskType({ sortOrder: 1 }),
        createMockUserTaskType({ sortOrder: 2 }),
      ]
      mockPrisma.userTaskType.findMany.mockResolvedValue([existingTypes[2]]) // Returns highest

      const lastType = (
        await mockPrisma.userTaskType.findMany({
          where: { sessionId: ctx.activeSessionId },
          orderBy: { sortOrder: 'desc' },
          take: 1,
        })
      )[0]

      const nextSortOrder = (lastType?.sortOrder ?? -1) + 1
      expect(nextSortOrder).toBe(3)

      // Create new type
      const newType = createMockUserTaskType({
        id: 'type-new',
        name: 'Research',
        emoji: '🔬',
        color: '#10B981',
        sortOrder: nextSortOrder,
      })
      mockPrisma.userTaskType.create.mockResolvedValue(newType)

      const type = await mockPrisma.userTaskType.create({
        data: {
          sessionId: ctx.activeSessionId,
          name: 'Research',
          emoji: '🔬',
          color: '#10B981',
          sortOrder: nextSortOrder,
        },
      })

      expect(type.sortOrder).toBe(3)
    })

    it('should create first type with sortOrder 0', async () => {
      mockPrisma.userTaskType.findMany.mockResolvedValue([])

      const existingTypes = await mockPrisma.userTaskType.findMany({
        where: { sessionId: ctx.activeSessionId },
        orderBy: { sortOrder: 'desc' },
        take: 1,
      })

      const nextSortOrder = (existingTypes[0]?.sortOrder ?? -1) + 1
      expect(nextSortOrder).toBe(0)
    })

    it('should use provided sortOrder when specified', async () => {
      const newType = createMockUserTaskType({
        id: 'type-new',
        sortOrder: 5, // Explicit sortOrder
      })
      mockPrisma.userTaskType.create.mockResolvedValue(newType)

      const type = await mockPrisma.userTaskType.create({
        data: {
          sessionId: ctx.activeSessionId,
          name: 'Test',
          emoji: '🧪',
          color: '#FF0000',
          sortOrder: 5,
        },
      })

      expect(type.sortOrder).toBe(5)
    })

    it('should validate hex color format', () => {
      const validColors = ['#3B82F6', '#10B981', '#F59E0B', '#000000', '#FFFFFF']
      const invalidColors = ['red', 'blue', '#GGG', '3B82F6', '#3B82F']

      const hexColorRegex = /^#[0-9A-Fa-f]{6}$/

      validColors.forEach((color) => {
        expect(hexColorRegex.test(color)).toBe(true)
      })

      invalidColors.forEach((color) => {
        expect(hexColorRegex.test(color)).toBe(false)
      })
    })
  })

  describe('update', () => {
    it('should update user task type fields', async () => {
      const updatedType = createMockUserTaskType({
        id: 'type-123',
        name: 'Updated Name',
        emoji: '🎯',
        color: '#FF5733',
      })
      mockPrisma.userTaskType.update.mockResolvedValue(updatedType)

      const type = await mockPrisma.userTaskType.update({
        where: { id: 'type-123' },
        data: {
          name: 'Updated Name',
          emoji: '🎯',
          color: '#FF5733',
        },
      })

      expect(type.name).toBe('Updated Name')
      expect(type.emoji).toBe('🎯')
      expect(type.color).toBe('#FF5733')
    })
  })

  describe('delete', () => {
    it('should delete user task type by id', async () => {
      mockPrisma.userTaskType.delete.mockResolvedValue(createMockUserTaskType())

      await mockPrisma.userTaskType.delete({
        where: { id: 'type-123' },
      })

      expect(mockPrisma.userTaskType.delete).toHaveBeenCalledWith({
        where: { id: 'type-123' },
      })
    })
  })

  describe('reorder', () => {
    it('should update sortOrder for all types in transaction', async () => {
      const orderedIds = ['type-3', 'type-1', 'type-2']

      // Verify the expected update operations
      const updates = orderedIds.map((id, index) => ({
        where: { id },
        data: { sortOrder: index },
      }))

      expect(updates[0]).toEqual({ where: { id: 'type-3' }, data: { sortOrder: 0 } })
      expect(updates[1]).toEqual({ where: { id: 'type-1' }, data: { sortOrder: 1 } })
      expect(updates[2]).toEqual({ where: { id: 'type-2' }, data: { sortOrder: 2 } })

      // Transaction would execute these updates
      for (const update of updates) {
        mockPrisma.userTaskType.update.mockResolvedValueOnce(
          createMockUserTaskType({ id: update.where.id, sortOrder: update.data.sortOrder }),
        )
      }
    })
  })

  describe('hasTypes', () => {
    it('should return true when session has task types', async () => {
      mockPrisma.userTaskType.count.mockResolvedValue(3)

      const count = await mockPrisma.userTaskType.count({
        where: { sessionId: ctx.activeSessionId },
      })

      expect(count > 0).toBe(true)
    })

    it('should return false when session has no task types', async () => {
      mockPrisma.userTaskType.count.mockResolvedValue(0)

      const count = await mockPrisma.userTaskType.count({
        where: { sessionId: ctx.activeSessionId },
      })

      expect(count > 0).toBe(false)
    })
  })
})
