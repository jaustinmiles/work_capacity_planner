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
      findFirst: vi.fn(),
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
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    taskStep: {
      update: vi.fn(),
      findMany: vi.fn(),
    },
  }

  return {
    PrismaClient: vi.fn(() => mockPrismaClient),
  }
})

describe('Database - Time Tracking', () => {
  let db: DatabaseService
  let mockPrisma: ReturnType<typeof vi.fn>

  beforeEach(() => {
    db = DatabaseService.getInstance()
    mockPrisma = (db as unknown as { client: ReturnType<typeof vi.fn> }).client

    // Mock active session
    mockPrisma.session.findFirst.mockResolvedValue({ id: 'session-1' })

    // Mock no active work sessions by default (for single session enforcement)
    mockPrisma.workSession.findFirst.mockResolvedValue(null)
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
        {
          id: 'ws1',
          taskId: 'task1',
          type: 'focused',
          actualMinutes: 30,
          plannedMinutes: 25,
          Task: { type: 'focused', sessionId: 'session-1', TaskStep: [] },
        },
        {
          id: 'ws2',
          taskId: 'task2',
          type: 'admin',
          actualMinutes: 45,
          plannedMinutes: 40,
          Task: { type: 'admin', sessionId: 'session-1', TaskStep: [] },
        },
        {
          id: 'ws3',
          taskId: 'task3',
          type: 'focused',
          actualMinutes: null,
          plannedMinutes: 20,
          Task: { type: 'focused', sessionId: 'session-1', TaskStep: [] },
        }, // Active session - should not count
      ])
      mockPrisma.taskStep.findMany.mockResolvedValue([])

      const result = await db.getTodayAccumulated(testDate)

      expect(result).toEqual({
        focused: 30, // Only 30 (actualMinutes), not plannedMinutes
        admin: 45,
        personal: 0,
        total: 75, // 30 + 45
      })
    })

    it('should handle empty work sessions', async () => {
      mockPrisma.workSession.findMany.mockResolvedValue([])
      mockPrisma.taskStep.findMany.mockResolvedValue([])

      const result = await db.getTodayAccumulated(testDate)

      expect(result).toEqual({
        focused: 0,
        admin: 0,
        personal: 0,
        total: 0,
      })
    })

    it('should only look at work sessions, not tasks directly', async () => {
      // The implementation only looks at workSession records
      mockPrisma.workSession.findMany.mockResolvedValue([])
      mockPrisma.taskStep.findMany.mockResolvedValue([])

      const result = await db.getTodayAccumulated(testDate)

      expect(result).toEqual({
        focused: 0,
        admin: 0,
        personal: 0,
        total: 0,
      })
    })

    it('should combine multiple work sessions', async () => {
      mockPrisma.workSession.findMany.mockResolvedValue([
        {
          id: 'ws1',
          taskId: 'task1',
          type: 'focused',
          actualMinutes: 30,
          plannedMinutes: 25,
          Task: { type: 'focused', sessionId: 'session-1', TaskStep: [] },
        },
        {
          id: 'ws2',
          taskId: 'task2',
          type: 'focused',
          actualMinutes: 25,
          plannedMinutes: 20,
          Task: { type: 'focused', sessionId: 'session-1', TaskStep: [] },
        },
        {
          id: 'ws3',
          taskId: 'task3',
          type: 'admin',
          actualMinutes: 60,
          plannedMinutes: 50,
          Task: { type: 'admin', sessionId: 'session-1', TaskStep: [] },
        },
      ])
      mockPrisma.taskStep.findMany.mockResolvedValue([])

      const result = await db.getTodayAccumulated(testDate)

      expect(result).toEqual({
        focused: 55, // 30 + 25
        admin: 60,
        personal: 0,
        total: 115, // 55 + 60
      })
    })

    it('should handle empty data', async () => {
      mockPrisma.workSession.findMany.mockResolvedValue([])
      mockPrisma.taskStep.findMany.mockResolvedValue([])

      const result = await db.getTodayAccumulated(testDate)

      expect(result).toEqual({
        focused: 0,
        admin: 0,
        personal: 0,
        total: 0,
      })
    })

    it('should filter by session and date correctly', async () => {
      mockPrisma.workSession.findMany.mockResolvedValue([])
      mockPrisma.taskStep.findMany.mockResolvedValue([])

      await db.getTodayAccumulated(testDate)

      // Check that workSession query used correct filters
      expect(mockPrisma.workSession.findMany).toHaveBeenCalledWith({
        where: {
          startTime: {
            gte: expect.any(Date),
            lte: expect.any(Date),
          },
        },
        include: {
          Task: {
            include: {
              TaskStep: true,
            },
          },
        },
      })
    })
  })

  describe('Time logging operations', () => {
    it('should create work session', async () => {
      const sessionData = {
        taskId: 'task-1',
        stepId: 'step-1',
        startTime: new Date(),
        plannedMinutes: 30,
        notes: 'Test session',
      }

      // Mock task lookup for deriving type
      mockPrisma.task.findUnique.mockResolvedValue({
        id: 'task-1',
        type: 'focused',
        TaskStep: [{
          id: 'step-1',
          type: 'focused',
        }],
      })

      mockPrisma.workSession.create.mockResolvedValue({
        id: 'session-1',
        ...sessionData,
        type: 'focused', // Derived from task
      })

      await db.createWorkSession(sessionData)

      expect(mockPrisma.workSession.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          taskId: sessionData.taskId,
          stepId: sessionData.stepId,
          type: 'focused', // Derived from task
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
        data: expect.objectContaining({
          actualDuration: 45,
          updatedAt: expect.any(Date),
        }),
        include: {
          TaskStep: {
            orderBy: { stepIndex: 'asc' },
          },
        },
      })
    })
  })
})
