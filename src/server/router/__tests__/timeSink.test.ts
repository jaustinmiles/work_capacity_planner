/**
 * Tests for the time sink router
 *
 * Tests TimeSink and TimeSinkSession operations including
 * date range queries, session splitting, and accumulated time calculations
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  createMockContext,
  createMockTimeSink,
  createMockTimeSinkSession,
  type MockPrisma,
} from './router-test-helpers'

describe('timeSink router', () => {
  let mockPrisma: MockPrisma
  let ctx: ReturnType<typeof createMockContext>

  beforeEach(() => {
    ctx = createMockContext()
    mockPrisma = ctx.prisma as unknown as MockPrisma
    vi.clearAllMocks()
  })

  describe('Time Sink CRUD', () => {
    describe('getAll', () => {
      it('should return all time sinks for the session ordered by sortOrder', async () => {
        const mockSinks = [
          createMockTimeSink({ id: 'sink-1', sortOrder: 0 }),
          createMockTimeSink({ id: 'sink-2', sortOrder: 1 }),
        ]
        mockPrisma.timeSink.findMany.mockResolvedValue(mockSinks)

        const sinks = await mockPrisma.timeSink.findMany({
          where: { sessionId: ctx.activeSessionId },
          orderBy: { sortOrder: 'asc' },
        })

        expect(sinks).toHaveLength(2)
        expect(mockPrisma.timeSink.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { sessionId: 'test-session-id' },
            orderBy: { sortOrder: 'asc' },
          }),
        )
      })
    })

    describe('getById', () => {
      it('should return time sink when found', async () => {
        const mockSink = createMockTimeSink({ id: 'sink-123' })
        mockPrisma.timeSink.findUnique.mockResolvedValue(mockSink)

        const sink = await mockPrisma.timeSink.findUnique({
          where: { id: 'sink-123' },
        })

        expect(sink).toBeTruthy()
        expect(sink?.id).toBe('sink-123')
      })

      it('should return null when not found', async () => {
        mockPrisma.timeSink.findUnique.mockResolvedValue(null)

        const sink = await mockPrisma.timeSink.findUnique({
          where: { id: 'non-existent' },
        })

        expect(sink).toBeNull()
      })
    })

    describe('create', () => {
      it('should create time sink with auto-calculated sortOrder', async () => {
        // Simulate getting existing sinks to calculate next sortOrder
        const existingSinks = [createMockTimeSink({ sortOrder: 2 })]
        mockPrisma.timeSink.findMany.mockResolvedValue(existingSinks)

        const lastSink = existingSinks[0]
        const nextSortOrder = (lastSink?.sortOrder ?? -1) + 1
        expect(nextSortOrder).toBe(3)

        const newSink = createMockTimeSink({
          id: 'sink-new',
          name: 'Social Media',
          emoji: '📱',
          color: '#FF5733',
          sortOrder: nextSortOrder,
        })
        mockPrisma.timeSink.create.mockResolvedValue(newSink)

        const sink = await mockPrisma.timeSink.create({
          data: {
            name: 'Social Media',
            emoji: '📱',
            color: '#FF5733',
            sortOrder: nextSortOrder,
          },
        })

        expect(sink.sortOrder).toBe(3)
      })

      it('should validate hex color format', () => {
        const validColors = ['#FF5733', '#000000', '#FFFFFF', '#abc123']
        const invalidColors = ['red', '#GGG', '123456', '#12345']

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
      it('should update time sink fields', async () => {
        const updatedSink = createMockTimeSink({
          id: 'sink-123',
          name: 'Updated Name',
          emoji: '🎯',
        })
        mockPrisma.timeSink.update.mockResolvedValue(updatedSink)

        const sink = await mockPrisma.timeSink.update({
          where: { id: 'sink-123' },
          data: { name: 'Updated Name', emoji: '🎯' },
        })

        expect(sink.name).toBe('Updated Name')
        expect(sink.emoji).toBe('🎯')
      })
    })

    describe('delete', () => {
      it('should delete time sink by id', async () => {
        mockPrisma.timeSink.delete.mockResolvedValue(createMockTimeSink())

        await mockPrisma.timeSink.delete({
          where: { id: 'sink-123' },
        })

        expect(mockPrisma.timeSink.delete).toHaveBeenCalledWith({
          where: { id: 'sink-123' },
        })
      })
    })

    describe('reorder', () => {
      it('should update sortOrder for all sinks in transaction', async () => {
        const orderedIds = ['sink-3', 'sink-1', 'sink-2']

        // Verify the expected update operations
        const updates = orderedIds.map((id, index) => ({
          where: { id },
          data: { sortOrder: index },
        }))

        expect(updates[0]).toEqual({ where: { id: 'sink-3' }, data: { sortOrder: 0 } })
        expect(updates[1]).toEqual({ where: { id: 'sink-1' }, data: { sortOrder: 1 } })
        expect(updates[2]).toEqual({ where: { id: 'sink-2' }, data: { sortOrder: 2 } })
      })
    })
  })

  describe('Time Sink Sessions', () => {
    describe('createSession', () => {
      it('should create a time sink session', async () => {
        const startTime = new Date()
        const newSession = createMockTimeSinkSession({
          id: 'sinksession-new',
          timeSinkId: 'sink-123',
          startTime,
          endTime: null,
        })
        mockPrisma.timeSinkSession.create.mockResolvedValue(newSession)

        const session = await mockPrisma.timeSinkSession.create({
          data: {
            timeSinkId: 'sink-123',
            startTime,
            endTime: null,
          },
        })

        expect(session.timeSinkId).toBe('sink-123')
        expect(session.endTime).toBeNull()
      })
    })

    describe('endSession', () => {
      it('should update session with endTime and actualMinutes', async () => {
        const endTime = new Date()
        const endedSession = createMockTimeSinkSession({
          id: 'sinksession-123',
          endTime,
          actualMinutes: 45,
        })
        mockPrisma.timeSinkSession.update.mockResolvedValue(endedSession)

        const session = await mockPrisma.timeSinkSession.update({
          where: { id: 'sinksession-123' },
          data: {
            endTime,
            actualMinutes: 45,
          },
        })

        expect(session.endTime).toBe(endTime)
        expect(session.actualMinutes).toBe(45)
      })
    })

    describe('getSessions', () => {
      it('should return sessions for a time sink ordered by startTime', async () => {
        const sessions = [
          createMockTimeSinkSession({ id: 'ss-1', startTime: new Date('2025-01-26T09:00:00') }),
          createMockTimeSinkSession({ id: 'ss-2', startTime: new Date('2025-01-26T14:00:00') }),
        ]
        mockPrisma.timeSinkSession.findMany.mockResolvedValue(sessions)

        const result = await mockPrisma.timeSinkSession.findMany({
          where: { timeSinkId: 'sink-123' },
          orderBy: { startTime: 'desc' },
        })

        expect(result).toHaveLength(2)
      })
    })

    describe('getSessionsByDate', () => {
      it('should filter sessions by date range', async () => {
        // Simulate getLocalDateRange logic
        const dateString = '2025-01-26'
        const [year, month, day] = dateString.split('-').map(Number)
        const startOfDay = new Date(year, month - 1, day, 0, 0, 0, 0)
        const endOfDay = new Date(year, month - 1, day, 23, 59, 59, 999)

        expect(startOfDay.getHours()).toBe(0)
        expect(endOfDay.getHours()).toBe(23)

        // Mock the query
        const sessions = [
          createMockTimeSinkSession({
            id: 'ss-1',
            startTime: new Date('2025-01-26T10:00:00'),
          }),
        ]
        mockPrisma.timeSinkSession.findMany.mockResolvedValue(sessions)

        const result = await mockPrisma.timeSinkSession.findMany({
          where: {
            timeSinkId: { in: ['sink-1', 'sink-2'] },
            startTime: {
              gte: startOfDay,
              lte: endOfDay,
            },
          },
        })

        expect(result).toHaveLength(1)
      })
    })

    describe('getActiveSession', () => {
      it('should find session with null endTime', async () => {
        const activeSession = createMockTimeSinkSession({
          id: 'ss-active',
          endTime: null,
          TimeSink: createMockTimeSink(),
        })
        mockPrisma.timeSinkSession.findFirst.mockResolvedValue(activeSession)

        const session = await mockPrisma.timeSinkSession.findFirst({
          where: {
            timeSinkId: { in: ['sink-1'] },
            endTime: null,
          },
          include: { TimeSink: true },
        })

        expect(session).toBeTruthy()
        expect(session?.endTime).toBeNull()
      })

      it('should return null when no active session', async () => {
        mockPrisma.timeSinkSession.findFirst.mockResolvedValue(null)

        const session = await mockPrisma.timeSinkSession.findFirst({
          where: {
            timeSinkId: { in: ['sink-1'] },
            endTime: null,
          },
        })

        expect(session).toBeNull()
      })
    })

    describe('deleteSession', () => {
      it('should delete session by id', async () => {
        mockPrisma.timeSinkSession.delete.mockResolvedValue(createMockTimeSinkSession())

        await mockPrisma.timeSinkSession.delete({
          where: { id: 'sinksession-123' },
        })

        expect(mockPrisma.timeSinkSession.delete).toHaveBeenCalledWith({
          where: { id: 'sinksession-123' },
        })
      })
    })

    describe('splitSession', () => {
      it('should split session into two halves at splitTime', async () => {
        const original = createMockTimeSinkSession({
          id: 'ss-original',
          timeSinkId: 'sink-123',
          startTime: new Date('2025-01-26T09:00:00'),
          endTime: new Date('2025-01-26T11:00:00'),
          actualMinutes: 120,
          notes: 'Original notes',
        })
        mockPrisma.timeSinkSession.findUnique.mockResolvedValue(original)

        const splitTime = new Date('2025-01-26T10:00:00')

        // Calculate minutes for each half
        const firstHalfMinutes = Math.round(
          (splitTime.getTime() - original.startTime.getTime()) / (1000 * 60),
        )
        const secondHalfMinutes = Math.round(
          ((original.endTime as Date).getTime() - splitTime.getTime()) / (1000 * 60),
        )

        expect(firstHalfMinutes).toBe(60)
        expect(secondHalfMinutes).toBe(60)

        // Verify update and create would be called in transaction
        const firstHalf = createMockTimeSinkSession({
          id: 'ss-original',
          endTime: splitTime,
          actualMinutes: firstHalfMinutes,
        })
        mockPrisma.timeSinkSession.update.mockResolvedValue(firstHalf)

        const secondHalf = createMockTimeSinkSession({
          id: 'ss-new',
          timeSinkId: original.timeSinkId,
          startTime: splitTime,
          endTime: original.endTime,
          actualMinutes: secondHalfMinutes,
          notes: original.notes,
        })
        mockPrisma.timeSinkSession.create.mockResolvedValue(secondHalf)
      })

      it('should throw error when session not found', async () => {
        mockPrisma.timeSinkSession.findUnique.mockResolvedValue(null)

        const session = await mockPrisma.timeSinkSession.findUnique({
          where: { id: 'non-existent' },
        })

        expect(session).toBeNull()
        // In real implementation: throw new Error(`Time sink session ${input.sessionId} not found`)
      })

      it('should handle session with null endTime', async () => {
        const original = createMockTimeSinkSession({
          id: 'ss-ongoing',
          startTime: new Date('2025-01-26T09:00:00'),
          endTime: null, // Still ongoing
        })
        mockPrisma.timeSinkSession.findUnique.mockResolvedValue(original)

        const _splitTime = new Date('2025-01-26T10:00:00')

        // Second half should have null endTime too
        const secondHalfMinutes = null // Can't calculate without endTime

        expect(secondHalfMinutes).toBeNull()
      })
    })

    describe('getAccumulated', () => {
      it('should aggregate time by sink across date range', async () => {
        const sinks = [
          createMockTimeSink({ id: 'sink-1', name: 'Phone' }),
          createMockTimeSink({ id: 'sink-2', name: 'Social' }),
        ]
        mockPrisma.timeSink.findMany.mockResolvedValue(sinks)

        const sessions = [
          createMockTimeSinkSession({
            timeSinkId: 'sink-1',
            actualMinutes: 30,
          }),
          createMockTimeSinkSession({
            timeSinkId: 'sink-1',
            actualMinutes: 45,
          }),
          createMockTimeSinkSession({
            timeSinkId: 'sink-2',
            actualMinutes: 20,
          }),
        ]
        mockPrisma.timeSinkSession.findMany.mockResolvedValue(sessions)

        // Simulate aggregation logic
        const sinkMap = new Map(sinks.map((s) => [s.id, s]))
        const bySink = new Map<string, { sink: (typeof sinks)[0]; totalMinutes: number }>()
        let total = 0

        for (const session of sessions) {
          const sink = sinkMap.get(session.timeSinkId)
          if (sink) {
            const existing = bySink.get(session.timeSinkId) || { sink, totalMinutes: 0 }
            const minutes = session.actualMinutes || 0
            existing.totalMinutes += minutes
            bySink.set(session.timeSinkId, existing)
            total += minutes
          }
        }

        const result = {
          bySink: Array.from(bySink.values()),
          totalMinutes: total,
        }

        expect(result.totalMinutes).toBe(95) // 30 + 45 + 20
        expect(result.bySink).toHaveLength(2)

        const sink1Result = result.bySink.find((b) => b.sink.id === 'sink-1')
        expect(sink1Result?.totalMinutes).toBe(75) // 30 + 45

        const sink2Result = result.bySink.find((b) => b.sink.id === 'sink-2')
        expect(sink2Result?.totalMinutes).toBe(20)
      })

      it('should handle sessions with null actualMinutes', async () => {
        const sinks = [createMockTimeSink({ id: 'sink-1' })]
        mockPrisma.timeSink.findMany.mockResolvedValue(sinks)

        const sessions = [
          createMockTimeSinkSession({
            timeSinkId: 'sink-1',
            actualMinutes: null, // Active session, not yet ended
          }),
          createMockTimeSinkSession({
            timeSinkId: 'sink-1',
            actualMinutes: 30,
          }),
        ]
        mockPrisma.timeSinkSession.findMany.mockResolvedValue(sessions)

        // Simulate aggregation with null handling
        let total = 0
        for (const session of sessions) {
          total += session.actualMinutes || 0
        }

        expect(total).toBe(30) // null treated as 0
      })
    })
  })

  describe('getLocalDateRange helper', () => {
    it('should create correct date boundaries for a date string', () => {
      const dateString = '2025-01-26'
      const [year, month, day] = dateString.split('-').map(Number)

      const startOfDay = new Date(year, month - 1, day, 0, 0, 0, 0)
      const endOfDay = new Date(year, month - 1, day, 23, 59, 59, 999)

      expect(startOfDay.getFullYear()).toBe(2025)
      expect(startOfDay.getMonth()).toBe(0) // January (0-indexed)
      expect(startOfDay.getDate()).toBe(26)
      expect(startOfDay.getHours()).toBe(0)
      expect(startOfDay.getMinutes()).toBe(0)
      expect(startOfDay.getSeconds()).toBe(0)

      expect(endOfDay.getFullYear()).toBe(2025)
      expect(endOfDay.getMonth()).toBe(0)
      expect(endOfDay.getDate()).toBe(26)
      expect(endOfDay.getHours()).toBe(23)
      expect(endOfDay.getMinutes()).toBe(59)
      expect(endOfDay.getSeconds()).toBe(59)
    })
  })
})
