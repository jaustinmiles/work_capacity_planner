import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { DatabaseService } from '../database'

// Mock PrismaClient
vi.mock('@prisma/client', () => {
  const mockPrismaClient = {
    session: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
    },
    workPattern: {
      findUnique: vi.fn(),
    },
    workSession: {
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    stepWorkSession: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
    task: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
    taskStep: {
      update: vi.fn(),
    },
  }

  return {
    PrismaClient: vi.fn(() => mockPrismaClient),
  }
})

describe('Database - Time Tracking', () => {
  let db: DatabaseService
  let mockPrisma: any

  beforeEach(() => {
    db = DatabaseService.getInstance()
    mockPrisma = (db as any).client

    // Mock active session
    mockPrisma.session.findFirst.mockResolvedValue({ id: 'session-1' })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('getTodayAccumulated', () => {
    const testDate = '2024-01-15'
    const startOfDay = new Date(testDate)
    startOfDay.setHours(0, 0, 0, 0)
    const endOfDay = new Date(testDate)
    endOfDay.setHours(23, 59, 59, 999)

    it('should sum up regular work sessions', async () => {
      mockPrisma.workSession.findMany.mockResolvedValue([
        { type: 'focused', actualMinutes: 30, plannedMinutes: 25, Task: { sessionId: 'session-1' } },
        { type: 'admin', actualMinutes: 45, plannedMinutes: 40, Task: { sessionId: 'session-1' } },
        { type: 'focused', actualMinutes: null, plannedMinutes: 20, Task: { sessionId: 'session-1' } },
      ])

      const result = await db.getTodayAccumulated(testDate)

      expect(result).toEqual({
        focused: 50, // 30 + 20
        admin: 45,
        total: 95, // 50 + 45
      })
    })

    it('should handle empty work sessions', async () => {
      mockPrisma.workSession.findMany.mockResolvedValue([])

      const result = await db.getTodayAccumulated(testDate)

      expect(result).toEqual({
        focused: 0,
        admin: 0,
        total: 0,
      })
    })

    it('should only look at work sessions, not tasks directly', async () => {
      // The implementation only looks at workSession records
      mockPrisma.workSession.findMany.mockResolvedValue([])

      const result = await db.getTodayAccumulated(testDate)

      expect(result).toEqual({
        focused: 0,
        admin: 0,
        total: 0,
      })
    })

    it('should combine multiple work sessions', async () => {
      mockPrisma.workSession.findMany.mockResolvedValue([
        { type: 'focused', actualMinutes: 30, plannedMinutes: 25, Task: { sessionId: 'session-1' } },
        { type: 'focused', actualMinutes: 25, plannedMinutes: 20, Task: { sessionId: 'session-1' } },
        { type: 'admin', actualMinutes: 60, plannedMinutes: 50, Task: { sessionId: 'session-1' } },
      ])

      const result = await db.getTodayAccumulated(testDate)

      expect(result).toEqual({
        focused: 55, // 30 + 25
        admin: 60,
        total: 115, // 55 + 60
      })
    })

    it('should handle empty data', async () => {
      mockPrisma.workSession.findMany.mockResolvedValue([])

      const result = await db.getTodayAccumulated(testDate)

      expect(result).toEqual({
        focused: 0,
        admin: 0,
        total: 0,
      })
    })

    it('should filter by session and date correctly', async () => {
      mockPrisma.workSession.findMany.mockResolvedValue([])

      await db.getTodayAccumulated(testDate)

      // Check that workSession query used correct filters
      expect(mockPrisma.workSession.findMany).toHaveBeenCalledWith({
        where: {
          Task: {
            sessionId: 'session-1',
          },
          startTime: {
            gte: new Date(`${testDate}T00:00:00.000Z`),
            lt: new Date(`${testDate}T23:59:59.999Z`),
          },
        },
        include: {
          Task: true,
        },
      })
    })
  })

  describe('Time logging operations', () => {
    it('should create work session', async () => {
      const sessionData = {
        taskId: 'task-1',
        stepId: 'step-1',
        type: 'focused' as const,
        startTime: new Date(),
        plannedMinutes: 30,
        notes: 'Test session',
      }

      mockPrisma.workSession.create.mockResolvedValue({
        id: 'session-1',
        ...sessionData,
      })

      await db.createWorkSession(sessionData)

      expect(mockPrisma.workSession.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          taskId: sessionData.taskId,
          stepId: sessionData.stepId,
          type: sessionData.type,
          startTime: sessionData.startTime,
          plannedMinutes: sessionData.plannedMinutes,
          notes: sessionData.notes,
        }),
      })
    })

    it('should update task with actualDuration', async () => {
      const taskId = 'task-1'
      const updates = { actualDuration: 45 }

      mockPrisma.task.update.mockResolvedValue({
        id: taskId,
        ...updates,
      })

      await db.updateTask(taskId, updates)

      expect(mockPrisma.task.update).toHaveBeenCalledWith({
        where: { id: taskId },
        data: updates,
      })
    })
  })
})
