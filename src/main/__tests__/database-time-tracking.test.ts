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
      mockPrisma.workPattern.findUnique.mockResolvedValue({
        sessions: [
          { type: 'focused', actualMinutes: 30, plannedMinutes: 25 },
          { type: 'admin', actualMinutes: 45, plannedMinutes: 40 },
          { type: 'focused', actualMinutes: null, plannedMinutes: 20 }],
      })
      mockPrisma.stepWorkSession.findMany.mockResolvedValue([])
      mockPrisma.task.findMany.mockResolvedValue([])

      const result = await db.getTodayAccumulated(testDate)

      expect(result).toEqual({
        focused: 50, // 30 + 20
        admin: 45,
      })
    })

    it('should sum up step work sessions', async () => {
      mockPrisma.workPattern.findUnique.mockResolvedValue({ sessions: [] })
      mockPrisma.stepWorkSession.findMany.mockResolvedValue([
        { duration: 25, taskStep: { type: 'focused' } },
        { duration: 35, taskStep: { type: 'admin' } },
        { duration: 15, taskStep: { type: 'focused' } }])
      mockPrisma.task.findMany.mockResolvedValue([])

      const result = await db.getTodayAccumulated(testDate)

      expect(result).toEqual({
        focused: 40, // 25 + 15
        admin: 35,
      })
    })

    it('should sum up task time logs', async () => {
      mockPrisma.workPattern.findUnique.mockResolvedValue({ sessions: [] })
      mockPrisma.stepWorkSession.findMany.mockResolvedValue([])
      mockPrisma.task.findMany.mockResolvedValue([
        { type: 'focused', actualDuration: 60 },
        { type: 'admin', actualDuration: 30 },
        { type: 'focused', actualDuration: 45 }])

      const result = await db.getTodayAccumulated(testDate)

      expect(result).toEqual({
        focused: 105, // 60 + 45
        admin: 30,
      })
    })

    it('should combine all sources of time tracking', async () => {
      mockPrisma.workPattern.findUnique.mockResolvedValue({
        sessions: [
          { type: 'focused', actualMinutes: 30, plannedMinutes: 25 }],
      })
      mockPrisma.stepWorkSession.findMany.mockResolvedValue([
        { duration: 25, taskStep: { type: 'focused' } }])
      mockPrisma.task.findMany.mockResolvedValue([
        { type: 'focused', actualDuration: 60 }])

      const result = await db.getTodayAccumulated(testDate)

      expect(result).toEqual({
        focused: 115, // 30 + 25 + 60
        admin: 0,
      })
    })

    it('should handle empty data', async () => {
      mockPrisma.workPattern.findUnique.mockResolvedValue(null)
      mockPrisma.stepWorkSession.findMany.mockResolvedValue([])
      mockPrisma.task.findMany.mockResolvedValue([])

      const result = await db.getTodayAccumulated(testDate)

      expect(result).toEqual({
        focused: 0,
        admin: 0,
      })
    })

    it('should filter by session and date correctly', async () => {
      mockPrisma.workPattern.findUnique.mockResolvedValue({ sessions: [] })
      mockPrisma.stepWorkSession.findMany.mockResolvedValue([])
      mockPrisma.task.findMany.mockResolvedValue([])

      await db.getTodayAccumulated(testDate)

      // Check that queries used correct filters
      expect(mockPrisma.stepWorkSession.findMany).toHaveBeenCalledWith({
        where: {
          startTime: {
            gte: startOfDay,
            lte: endOfDay,
          },
          taskStep: {
            task: {
            },
          },
        },
        include: {
          taskStep: true,
        },
      })

      expect(mockPrisma.task.findMany).toHaveBeenCalledWith({
        where: {
          actualDuration: { gt: 0 },
          updatedAt: {
            gte: startOfDay,
            lte: endOfDay,
          },
        },
      })
    })
  })

  describe('Time logging operations', () => {
    it('should create step work session', async () => {
      const sessionData = {
        taskStepId: 'step-1',
        startTime: new Date(),
        duration: 30,
        notes: 'Test session',
      }

      mockPrisma.stepWorkSession.create.mockResolvedValue({
        id: 'session-1',
        ...sessionData,
      })

      await db.createStepWorkSession(sessionData)

      expect(mockPrisma.stepWorkSession.create).toHaveBeenCalledWith({
        data: sessionData,
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
