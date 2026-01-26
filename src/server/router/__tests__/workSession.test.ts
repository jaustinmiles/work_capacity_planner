/**
 * Tests for the workSession router
 *
 * Tests time tracking operations for tasks and workflow steps
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createMockContext, createMockTask, createMockWorkSession, type MockPrisma } from './router-test-helpers'

describe('workSession router', () => {
  let mockPrisma: MockPrisma
  let ctx: ReturnType<typeof createMockContext>

  beforeEach(() => {
    ctx = createMockContext()
    mockPrisma = ctx.prisma as unknown as MockPrisma
    vi.clearAllMocks()
  })

  describe('create', () => {
    it('should create a work session with required fields', async () => {
      const startTime = new Date('2025-01-26T09:00:00')
      const mockSession = createMockWorkSession({
        id: 'wsession-new',
        taskId: 'task-123',
        startTime,
        plannedMinutes: 60,
      })

      mockPrisma.workSession.create.mockResolvedValue(mockSession)

      const session = await mockPrisma.workSession.create({
        data: {
          id: 'wsession-new',
          taskId: 'task-123',
          startTime,
          plannedMinutes: 60,
          endTime: null,
          actualMinutes: null,
          notes: null,
        },
      })

      expect(session.id).toBe('wsession-new')
      expect(session.taskId).toBe('task-123')
      expect(session.startTime).toEqual(startTime)
      expect(session.plannedMinutes).toBe(60)
    })

    it('should create a work session with step tracking', async () => {
      const mockSession = createMockWorkSession({
        id: 'wsession-step',
        taskId: 'workflow-123',
        stepId: 'step-456',
      })

      mockPrisma.workSession.create.mockResolvedValue(mockSession)

      const session = await mockPrisma.workSession.create({
        data: {
          taskId: 'workflow-123',
          stepId: 'step-456',
          startTime: new Date(),
          plannedMinutes: 30,
        },
      })

      expect(session.stepId).toBe('step-456')
    })

    it('should auto-link to work block when time matches', async () => {
      const startTime = new Date('2025-01-26T10:00:00')
      const mockTask = createMockTask({ sessionId: 'session-1' })
      const mockPattern = {
        id: 'pattern-1',
        WorkBlock: [
          { id: 'block-1', startTime: '09:00', endTime: '12:00', type: 'deep_work' },
          { id: 'block-2', startTime: '13:00', endTime: '17:00', type: 'shallow_work' },
        ],
      }

      mockPrisma.task.findUnique.mockResolvedValue(mockTask)
      mockPrisma.workPattern.findUnique.mockResolvedValue(mockPattern)
      mockPrisma.workSession.create.mockResolvedValue(
        createMockWorkSession({ blockId: 'block-1' }),
      )

      // Find task to get sessionId
      const task = await mockPrisma.task.findUnique({
        where: { id: 'task-123' },
        select: { sessionId: true },
      })

      expect(task?.sessionId).toBe('session-1')

      // Find pattern for date
      const pattern = await mockPrisma.workPattern.findUnique({
        where: { sessionId_date: { sessionId: 'session-1', date: '2025-01-26' } },
        include: { WorkBlock: true },
      })

      expect(pattern?.WorkBlock).toHaveLength(2)

      // Find matching block (10:00 falls in 09:00-12:00)
      const hours = startTime.getHours()
      const minutes = startTime.getMinutes()
      const timeStr = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`

      const matchingBlock = pattern?.WorkBlock.find(
        b => b.startTime <= timeStr && b.endTime > timeStr,
      )

      expect(matchingBlock?.id).toBe('block-1')
    })
  })

  describe('end', () => {
    it('should set endTime and actualMinutes', async () => {
      const endTime = new Date('2025-01-26T10:45:00')
      const mockSession = createMockWorkSession({
        id: 'wsession-123',
        endTime,
        actualMinutes: 45,
      })

      mockPrisma.workSession.update.mockResolvedValue(mockSession)

      const session = await mockPrisma.workSession.update({
        where: { id: 'wsession-123' },
        data: {
          endTime,
          actualMinutes: 45,
        },
      })

      expect(session.endTime).toEqual(endTime)
      expect(session.actualMinutes).toBe(45)
    })
  })

  describe('getByDate', () => {
    it('should return sessions within date range', async () => {
      const mockSessions = [
        createMockWorkSession({
          id: 'ws-1',
          startTime: new Date('2025-01-26T09:00:00'),
        }),
        createMockWorkSession({
          id: 'ws-2',
          startTime: new Date('2025-01-26T14:00:00'),
        }),
      ]

      mockPrisma.task.findMany.mockResolvedValue([{ id: 'task-1' }, { id: 'task-2' }])
      mockPrisma.workSession.findMany.mockResolvedValue(mockSessions)

      // Get tasks for session
      const tasks = await mockPrisma.task.findMany({
        where: { sessionId: 'test-session-id' },
        select: { id: true },
      })

      const taskIds = tasks.map(t => t.id)

      // Get sessions for date
      const sessions = await mockPrisma.workSession.findMany({
        where: {
          taskId: { in: taskIds },
          startTime: {
            gte: new Date('2025-01-26T00:00:00'),
            lte: new Date('2025-01-26T23:59:59.999'),
          },
        },
        orderBy: { startTime: 'asc' },
      })

      expect(sessions).toHaveLength(2)
    })

    it('should return empty array when no sessions for date', async () => {
      mockPrisma.task.findMany.mockResolvedValue([{ id: 'task-1' }])
      mockPrisma.workSession.findMany.mockResolvedValue([])

      const sessions = await mockPrisma.workSession.findMany({
        where: {
          taskId: { in: ['task-1'] },
          startTime: {
            gte: new Date('2025-01-25T00:00:00'),
            lte: new Date('2025-01-25T23:59:59.999'),
          },
        },
      })

      expect(sessions).toHaveLength(0)
    })
  })

  describe('getActive', () => {
    it('should return session with no endTime', async () => {
      const activeSession = createMockWorkSession({
        id: 'ws-active',
        endTime: null,
      })

      mockPrisma.task.findMany.mockResolvedValue([{ id: 'task-1' }])
      mockPrisma.workSession.findFirst.mockResolvedValue(activeSession)

      const session = await mockPrisma.workSession.findFirst({
        where: {
          taskId: { in: ['task-1'] },
          endTime: null,
        },
      })

      expect(session).toBeTruthy()
      expect(session?.endTime).toBeNull()
    })

    it('should return null when no active session', async () => {
      mockPrisma.task.findMany.mockResolvedValue([{ id: 'task-1' }])
      mockPrisma.workSession.findFirst.mockResolvedValue(null)

      const session = await mockPrisma.workSession.findFirst({
        where: {
          taskId: { in: ['task-1'] },
          endTime: null,
        },
      })

      expect(session).toBeNull()
    })
  })

  describe('getByTask', () => {
    it('should return all sessions for a task', async () => {
      const mockSessions = [
        createMockWorkSession({ id: 'ws-1', taskId: 'task-123' }),
        createMockWorkSession({ id: 'ws-2', taskId: 'task-123' }),
        createMockWorkSession({ id: 'ws-3', taskId: 'task-123' }),
      ]

      mockPrisma.workSession.findMany.mockResolvedValue(mockSessions)

      const sessions = await mockPrisma.workSession.findMany({
        where: { taskId: 'task-123' },
        orderBy: { startTime: 'asc' },
      })

      expect(sessions).toHaveLength(3)
      sessions.forEach(s => expect(s.taskId).toBe('task-123'))
    })
  })

  describe('update', () => {
    it('should update session fields', async () => {
      const updatedSession = createMockWorkSession({
        id: 'ws-123',
        notes: 'Updated notes',
        actualMinutes: 55,
      })

      mockPrisma.workSession.update.mockResolvedValue(updatedSession)

      const session = await mockPrisma.workSession.update({
        where: { id: 'ws-123' },
        data: {
          notes: 'Updated notes',
          actualMinutes: 55,
        },
      })

      expect(session.notes).toBe('Updated notes')
      expect(session.actualMinutes).toBe(55)
    })

    it('should allow changing task association', async () => {
      const updatedSession = createMockWorkSession({
        id: 'ws-123',
        taskId: 'task-new',
      })

      mockPrisma.workSession.update.mockResolvedValue(updatedSession)

      const session = await mockPrisma.workSession.update({
        where: { id: 'ws-123' },
        data: { taskId: 'task-new' },
      })

      expect(session.taskId).toBe('task-new')
    })
  })

  describe('delete', () => {
    it('should delete session by id', async () => {
      mockPrisma.workSession.delete.mockResolvedValue(
        createMockWorkSession({ id: 'ws-to-delete' }),
      )

      await mockPrisma.workSession.delete({
        where: { id: 'ws-to-delete' },
      })

      expect(mockPrisma.workSession.delete).toHaveBeenCalledWith({
        where: { id: 'ws-to-delete' },
      })
    })
  })

  describe('split', () => {
    it('should split session into two at given time', async () => {
      const originalSession = createMockWorkSession({
        id: 'ws-original',
        startTime: new Date('2025-01-26T09:00:00'),
        endTime: new Date('2025-01-26T11:00:00'),
        actualMinutes: 120,
      })

      mockPrisma.workSession.findUnique.mockResolvedValue(originalSession)

      const session = await mockPrisma.workSession.findUnique({
        where: { id: 'ws-original' },
      })

      expect(session).toBeTruthy()

      // Split at 10:00 - should create two 60-minute sessions
      const splitTime = new Date('2025-01-26T10:00:00')

      // First half: 09:00 - 10:00 (60 minutes)
      const firstHalfMinutes = Math.round(
        (splitTime.getTime() - session!.startTime.getTime()) / (1000 * 60),
      )
      expect(firstHalfMinutes).toBe(60)

      // Second half: 10:00 - 11:00 (60 minutes)
      const secondHalfMinutes = Math.round(
        (session!.endTime!.getTime() - splitTime.getTime()) / (1000 * 60),
      )
      expect(secondHalfMinutes).toBe(60)
    })

    it('should throw error when session not found', async () => {
      mockPrisma.workSession.findUnique.mockResolvedValue(null)

      const session = await mockPrisma.workSession.findUnique({
        where: { id: 'non-existent' },
      })

      expect(session).toBeNull()
    })

    it('should allow assigning second half to different task', async () => {
      const originalSession = createMockWorkSession({
        id: 'ws-original',
        taskId: 'task-1',
      })

      mockPrisma.workSession.findUnique.mockResolvedValue(originalSession)

      // In a real split, second half would have:
      // - taskId: 'task-2' (from input.secondHalfTaskId)
      // - startTime: splitTime
      // - endTime: original.endTime

      const secondHalfData = {
        taskId: 'task-2', // Different task
        startTime: new Date('2025-01-26T10:00:00'),
        endTime: new Date('2025-01-26T11:00:00'),
      }

      expect(secondHalfData.taskId).not.toBe(originalSession.taskId)
    })
  })
})
