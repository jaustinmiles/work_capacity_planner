import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { DatabaseService } from '../database'

// Mock PrismaClient
vi.mock('@prisma/client', () => {
  const mockPrismaClient = {
    session: {
      findFirst: vi.fn(),
    },
    workBlock: {
      findMany: vi.fn(),
      deleteMany: vi.fn(),
      update: vi.fn(),
    },
    workMeeting: {
      deleteMany: vi.fn(),
    },
    workPattern: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    workSession: {
      count: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
    },
  }

  return {
    PrismaClient: vi.fn(() => mockPrismaClient),
  }
})

// Mock time-provider
vi.mock('@shared/time-provider', () => ({
  getCurrentTime: () => new Date('2024-12-04T10:00:00'),
  getLocalDateString: () => '2024-12-04',
}))

// Mock capacity calculator
vi.mock('@shared/capacity-calculator', () => ({
  calculateBlockCapacity: vi.fn(() => ({ totalMinutes: 120 })),
}))

describe('Block-Session Linking', () => {
  let db: DatabaseService
  let mockPrisma: any

  beforeEach(() => {
    vi.clearAllMocks()
    db = DatabaseService.getInstance()
    mockPrisma = (db as any).client

    // Mock active session
    mockPrisma.session.findFirst.mockResolvedValue({ id: 'session-1' })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('findBlockAtTime', () => {
    it('returns correct block for time within block range', async () => {
      mockPrisma.workPattern.findUnique.mockResolvedValue({
        id: 'pattern-1',
        date: '2024-12-04',
        WorkBlock: [
          { id: 'block-1', startTime: '09:00', endTime: '12:00', typeConfig: '{"kind":"single","typeId":"type-test"}' },
          { id: 'block-2', startTime: '13:00', endTime: '17:00', typeConfig: '{"kind":"single","typeId":"type-test"}' },
        ],
        WorkMeeting: [],
      })

      // 10:30 AM = 630 minutes, should be in block-1 (9:00-12:00)
      const result = await db.findBlockAtTime('2024-12-04', 630)
      expect(result).toEqual({ id: 'block-1' })
    })

    it('returns correct block when time is exactly at block start', async () => {
      mockPrisma.workPattern.findUnique.mockResolvedValue({
        id: 'pattern-1',
        date: '2024-12-04',
        WorkBlock: [
          { id: 'block-1', startTime: '09:00', endTime: '12:00', typeConfig: '{"kind":"single","typeId":"type-test"}' },
        ],
        WorkMeeting: [],
      })

      // 9:00 AM = 540 minutes (exactly at block start)
      const result = await db.findBlockAtTime('2024-12-04', 540)
      expect(result).toEqual({ id: 'block-1' })
    })

    it('returns null when time is outside all blocks', async () => {
      mockPrisma.workPattern.findUnique.mockResolvedValue({
        id: 'pattern-1',
        date: '2024-12-04',
        WorkBlock: [
          { id: 'block-1', startTime: '09:00', endTime: '12:00', typeConfig: '{"kind":"single","typeId":"type-test"}' },
        ],
        WorkMeeting: [],
      })

      // 8:00 AM = 480 minutes (before block-1)
      const result = await db.findBlockAtTime('2024-12-04', 480)
      expect(result).toBeNull()
    })

    it('handles blocks crossing midnight', async () => {
      mockPrisma.workPattern.findUnique.mockResolvedValue({
        id: 'pattern-1',
        date: '2024-12-04',
        WorkBlock: [
          { id: 'night-block', startTime: '22:00', endTime: '02:00', typeConfig: '{"kind":"single","typeId":"type-test"}' },
        ],
        WorkMeeting: [],
      })

      // 23:00 = 1380 minutes (within the block before midnight)
      const result1 = await db.findBlockAtTime('2024-12-04', 1380)
      expect(result1).toEqual({ id: 'night-block' })

      // 01:00 = 60 minutes (within the block after midnight)
      const result2 = await db.findBlockAtTime('2024-12-04', 60)
      expect(result2).toEqual({ id: 'night-block' })
    })

    it('returns null when no pattern exists', async () => {
      mockPrisma.workPattern.findUnique.mockResolvedValue(null)

      const result = await db.findBlockAtTime('2024-12-04', 600)
      expect(result).toBeNull()
    })
  })

  describe('updateWorkPattern - Block ID Preservation', () => {
    it('preserves block IDs when updating existing blocks', async () => {
      const existingBlocks = [
        { id: 'block-1', startTime: '09:00', endTime: '12:00', typeConfig: '{"kind":"single","typeId":"type-test"}' },
        { id: 'block-2', startTime: '13:00', endTime: '17:00', typeConfig: '{"kind":"single","typeId":"type-test"}' },
      ]

      mockPrisma.workBlock.findMany.mockResolvedValue(existingBlocks)
      mockPrisma.workSession.count.mockResolvedValue(0)
      mockPrisma.workPattern.update.mockResolvedValue({
        id: 'pattern-1',
        date: '2024-12-04',
        WorkBlock: existingBlocks,
        WorkMeeting: [],
      })

      // Update with same block IDs but different times
      await db.updateWorkPattern('pattern-1', {
        blocks: [
          { id: 'block-1', startTime: '08:00', endTime: '11:00', typeConfig: {} },
          { id: 'block-2', startTime: '14:00', endTime: '18:00', typeConfig: {} },
        ],
      })

      // Should have updated existing blocks, not created new ones
      expect(mockPrisma.workBlock.update).toHaveBeenCalledTimes(2)
      expect(mockPrisma.workBlock.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'block-1' },
          data: expect.objectContaining({ startTime: '08:00', endTime: '11:00' }),
        }),
      )
    })

    it('throws error when trying to delete block with sessions', async () => {
      const existingBlocks = [
        { id: 'block-1', startTime: '09:00', endTime: '12:00', typeConfig: '{"kind":"single","typeId":"type-test"}' },
      ]

      mockPrisma.workBlock.findMany.mockResolvedValue(existingBlocks)
      // Block has 2 sessions
      mockPrisma.workSession.count.mockResolvedValue(2)

      // Try to update with empty blocks (removing block-1)
      await expect(
        db.updateWorkPattern('pattern-1', { blocks: [] }),
      ).rejects.toThrow(/Cannot delete block block-1.*has 2 work session/)
    })

    it('allows deleting blocks without sessions', async () => {
      const existingBlocks = [
        { id: 'block-1', startTime: '09:00', endTime: '12:00', typeConfig: '{"kind":"single","typeId":"type-test"}' },
        { id: 'block-2', startTime: '13:00', endTime: '17:00', typeConfig: '{"kind":"single","typeId":"type-test"}' },
      ]

      mockPrisma.workBlock.findMany.mockResolvedValue(existingBlocks)
      mockPrisma.workSession.count.mockResolvedValue(0) // No sessions
      mockPrisma.workPattern.update.mockResolvedValue({
        id: 'pattern-1',
        date: '2024-12-04',
        WorkBlock: [{ id: 'block-1', startTime: '09:00', endTime: '12:00', typeConfig: '{"kind":"single","typeId":"type-test"}' }],
        WorkMeeting: [],
      })

      // Remove block-2
      await db.updateWorkPattern('pattern-1', {
        blocks: [{ id: 'block-1', startTime: '09:00', endTime: '12:00', typeConfig: {} }],
      })

      // Should delete block-2
      expect(mockPrisma.workBlock.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ['block-2'] } },
      })
    })

    it('creates new blocks while preserving existing ones', async () => {
      const existingBlocks = [
        { id: 'block-1', startTime: '09:00', endTime: '12:00', typeConfig: '{"kind":"single","typeId":"type-test"}' },
      ]

      mockPrisma.workBlock.findMany.mockResolvedValue(existingBlocks)
      mockPrisma.workSession.count.mockResolvedValue(0)
      mockPrisma.workPattern.update.mockResolvedValue({
        id: 'pattern-1',
        date: '2024-12-04',
        WorkBlock: [
          { id: 'block-1', startTime: '09:00', endTime: '12:00', typeConfig: '{"kind":"single","typeId":"type-test"}' },
          { id: 'new-block', startTime: '13:00', endTime: '17:00', typeConfig: '{"kind":"single","typeId":"type-test"}' },
        ],
        WorkMeeting: [],
      })

      // Add a new block while keeping block-1
      await db.updateWorkPattern('pattern-1', {
        blocks: [
          { id: 'block-1', startTime: '09:00', endTime: '12:00', typeConfig: {} },
          { startTime: '13:00', endTime: '17:00', typeConfig: {} }, // New block without ID
        ],
      })

      // block-1 should be updated
      expect(mockPrisma.workBlock.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'block-1' } }),
      )

      // New block should be created via pattern.update
      expect(mockPrisma.workPattern.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            WorkBlock: expect.objectContaining({
              create: expect.arrayContaining([
                expect.objectContaining({ startTime: '13:00', endTime: '17:00' }),
              ]),
            }),
          }),
        }),
      )
    })
  })
})
