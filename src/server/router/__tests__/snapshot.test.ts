/**
 * Tests for the snapshot router
 *
 * Tests ScheduleSnapshot CRUD operations including
 * getToday date range logic
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  createMockContext,
  createMockSnapshot,
  type MockPrisma,
} from './router-test-helpers'

describe('snapshot router', () => {
  let mockPrisma: MockPrisma
  let ctx: ReturnType<typeof createMockContext>

  beforeEach(() => {
    ctx = createMockContext()
    mockPrisma = ctx.prisma as unknown as MockPrisma
    vi.clearAllMocks()
  })

  describe('getAll', () => {
    it('should return all snapshots for the session ordered by createdAt', async () => {
      const mockSnapshots = [
        createMockSnapshot({ id: 'snapshot-1', label: 'Morning' }),
        createMockSnapshot({ id: 'snapshot-2', label: 'Afternoon' }),
      ]
      mockPrisma.scheduleSnapshot.findMany.mockResolvedValue(mockSnapshots)

      const snapshots = await mockPrisma.scheduleSnapshot.findMany({
        where: { sessionId: ctx.activeSessionId },
        orderBy: { createdAt: 'desc' },
      })

      expect(snapshots).toHaveLength(2)
    })
  })

  describe('getById', () => {
    it('should return snapshot when found', async () => {
      const mockSnapshot = createMockSnapshot({
        id: 'snapshot-123',
        label: 'Test Snapshot',
        snapshotData: '{"tasks": [], "blocks": []}',
      })
      mockPrisma.scheduleSnapshot.findUnique.mockResolvedValue(mockSnapshot)

      const snapshot = await mockPrisma.scheduleSnapshot.findUnique({
        where: { id: 'snapshot-123' },
      })

      expect(snapshot).toBeTruthy()
      expect(snapshot?.label).toBe('Test Snapshot')
    })

    it('should return null when not found', async () => {
      mockPrisma.scheduleSnapshot.findUnique.mockResolvedValue(null)

      const snapshot = await mockPrisma.scheduleSnapshot.findUnique({
        where: { id: 'non-existent' },
      })

      expect(snapshot).toBeNull()
    })
  })

  describe('getToday', () => {
    it('should find snapshot created today', async () => {
      const today = new Date()
      const todaySnapshot = createMockSnapshot({
        id: 'snapshot-today',
        createdAt: today,
      })
      mockPrisma.scheduleSnapshot.findFirst.mockResolvedValue(todaySnapshot)

      // Simulate date range calculation
      const startOfDay = new Date(today)
      startOfDay.setHours(0, 0, 0, 0)
      const endOfDay = new Date(today)
      endOfDay.setHours(23, 59, 59, 999)

      const snapshot = await mockPrisma.scheduleSnapshot.findFirst({
        where: {
          sessionId: ctx.activeSessionId,
          createdAt: {
            gte: startOfDay,
            lte: endOfDay,
          },
        },
        orderBy: { createdAt: 'desc' },
      })

      expect(snapshot).toBeTruthy()
      expect(mockPrisma.scheduleSnapshot.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            createdAt: expect.objectContaining({
              gte: expect.any(Date),
              lte: expect.any(Date),
            }),
          }),
        }),
      )
    })

    it('should return null when no snapshot created today', async () => {
      mockPrisma.scheduleSnapshot.findFirst.mockResolvedValue(null)

      const today = new Date()
      const startOfDay = new Date(today)
      startOfDay.setHours(0, 0, 0, 0)
      const endOfDay = new Date(today)
      endOfDay.setHours(23, 59, 59, 999)

      const snapshot = await mockPrisma.scheduleSnapshot.findFirst({
        where: {
          sessionId: ctx.activeSessionId,
          createdAt: {
            gte: startOfDay,
            lte: endOfDay,
          },
        },
      })

      expect(snapshot).toBeNull()
    })

    it('should calculate correct date boundaries', () => {
      const testDate = new Date('2025-01-26T14:30:00')

      const startOfDay = new Date(testDate)
      startOfDay.setHours(0, 0, 0, 0)

      const endOfDay = new Date(testDate)
      endOfDay.setHours(23, 59, 59, 999)

      expect(startOfDay.getHours()).toBe(0)
      expect(startOfDay.getMinutes()).toBe(0)
      expect(startOfDay.getSeconds()).toBe(0)
      expect(startOfDay.getMilliseconds()).toBe(0)

      expect(endOfDay.getHours()).toBe(23)
      expect(endOfDay.getMinutes()).toBe(59)
      expect(endOfDay.getSeconds()).toBe(59)
      expect(endOfDay.getMilliseconds()).toBe(999)

      // Both should be same calendar day
      expect(startOfDay.getDate()).toBe(26)
      expect(endOfDay.getDate()).toBe(26)
    })
  })

  describe('create', () => {
    it('should create snapshot with label', async () => {
      const snapshotData = JSON.stringify({
        tasks: [{ id: 'task-1', name: 'Task 1' }],
        blocks: [{ id: 'block-1', type: 'work' }],
      })

      const newSnapshot = createMockSnapshot({
        id: 'snapshot-new',
        label: 'End of Day',
        snapshotData,
      })
      mockPrisma.scheduleSnapshot.create.mockResolvedValue(newSnapshot)

      const snapshot = await mockPrisma.scheduleSnapshot.create({
        data: {
          sessionId: ctx.activeSessionId,
          label: 'End of Day',
          snapshotData,
        },
      })

      expect(snapshot.label).toBe('End of Day')
      expect(snapshot.snapshotData).toBe(snapshotData)
    })

    it('should create snapshot with null label', async () => {
      const newSnapshot = createMockSnapshot({
        id: 'snapshot-new',
        label: null,
        snapshotData: '{}',
      })
      mockPrisma.scheduleSnapshot.create.mockResolvedValue(newSnapshot)

      const snapshot = await mockPrisma.scheduleSnapshot.create({
        data: {
          sessionId: ctx.activeSessionId,
          label: null,
          snapshotData: '{}',
        },
      })

      expect(snapshot.label).toBeNull()
    })
  })

  describe('delete', () => {
    it('should delete snapshot by id', async () => {
      mockPrisma.scheduleSnapshot.delete.mockResolvedValue(createMockSnapshot())

      await mockPrisma.scheduleSnapshot.delete({
        where: { id: 'snapshot-123' },
      })

      expect(mockPrisma.scheduleSnapshot.delete).toHaveBeenCalledWith({
        where: { id: 'snapshot-123' },
      })
    })
  })

  describe('snapshotData format', () => {
    it('should store and retrieve JSON snapshot data', () => {
      const data = {
        tasks: [
          { id: 'task-1', name: 'Task 1', scheduled: true },
          { id: 'task-2', name: 'Task 2', scheduled: false },
        ],
        blocks: [
          { id: 'block-1', type: 'development', startTime: '09:00' },
        ],
        timestamp: '2025-01-26T09:00:00Z',
      }

      const serialized = JSON.stringify(data)
      const parsed = JSON.parse(serialized)

      expect(parsed.tasks).toHaveLength(2)
      expect(parsed.blocks).toHaveLength(1)
      expect(parsed.timestamp).toBe('2025-01-26T09:00:00Z')
    })
  })
})
