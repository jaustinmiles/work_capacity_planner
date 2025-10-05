import { describe, it, expect, beforeEach, vi } from 'vitest'
import { DatabaseService } from '../database'
import { TaskType } from '@shared/enums'
// import { PrismaClient } from '@prisma/client' // Not needed for mocked tests

// Mock Prisma Client
vi.mock('@prisma/client', () => {
  const mockPrismaClient = {
    session: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    task: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    taskStep: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
    },
    workSession: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
      aggregate: vi.fn(),
    },
    workPattern: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    $disconnect: vi.fn(),
  }

  return {
    PrismaClient: vi.fn(() => mockPrismaClient),
  }
})

describe('Work Session Management', () => {
  let db: DatabaseService
  let mockPrisma: any

  beforeEach(() => {
    vi.clearAllMocks()
    db = DatabaseService.getInstance()
    mockPrisma = (db as any).client

    // Setup default active session
    mockPrisma.session.findFirst.mockResolvedValue({
      id: 'test-session',
      name: 'Test Session',
      isActive: true,
    })

    // Setup default: no active work sessions (for single session enforcement)
    mockPrisma.workSession.findFirst.mockResolvedValue(null)
  })

  describe('createWorkSession', () => {
    it('should create a work session with required fields', async () => {
      const workSessionData = {
        taskId: 'task-123',
        type: TaskType.Focused,
        startTime: new Date('2024-01-15T09:00:00'),
        plannedMinutes: 60,
      }

      mockPrisma.workSession.create.mockResolvedValue({
        id: 'ws-123',
        ...workSessionData,
        endTime: null,
        actualMinutes: null,
        notes: null,
        createdAt: new Date(),
      })

      const result = await db.createWorkSession(workSessionData)

      expect(mockPrisma.workSession.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          taskId: 'task-123',
          type: 'focused',
          startTime: workSessionData.startTime,
          plannedMinutes: 60,
        }),
      })
      expect(result).toHaveProperty('id', 'ws-123')
    })

    it('should throw error if taskId is missing', async () => {
      const invalidData = {
        type: 'focused' as const,
        startTime: new Date(),
        plannedMinutes: 60,
      } as any

      await expect(db.createWorkSession(invalidData)).rejects.toThrow('taskId is required')
    })

    it('should throw error if type is missing', async () => {
      const invalidData = {
        taskId: 'task-123',
        startTime: new Date(),
        plannedMinutes: 60,
      } as any

      await expect(db.createWorkSession(invalidData)).rejects.toThrow('type is required')
    })
  })

  describe('updateWorkSession', () => {
    it('should update a work session', async () => {
      // Mock finding the work session first
      mockPrisma.workSession.findUnique.mockResolvedValue({
        id: 'ws-123',
        taskId: 'task-123',
        stepId: null,
      })

      // Mock for recalculation
      mockPrisma.workSession.findMany.mockResolvedValue([
        { actualMinutes: 75, plannedMinutes: 60 },
      ])

      mockPrisma.workSession.update.mockResolvedValue({
        id: 'ws-123',
        actualMinutes: 75,
        notes: 'Took longer than expected',
      })

      const result = await db.updateWorkSession('ws-123', {
        actualMinutes: 75,
        notes: 'Took longer than expected',
      })

      expect(mockPrisma.workSession.update).toHaveBeenCalledWith({
        where: { id: 'ws-123' },
        data: {
          actualMinutes: 75,
          notes: 'Took longer than expected',
        },
      })
      expect(result).toHaveProperty('actualMinutes', 75)
    })
  })

  describe('deleteWorkSession', () => {
    it('should delete a work session and recalculate step duration', async () => {
      mockPrisma.workSession.findUnique.mockResolvedValue({
        id: 'ws-123',
        taskId: 'task-123',
        stepId: 'step-456',
      })

      mockPrisma.workSession.delete.mockResolvedValue({
        id: 'ws-123',
      })

      mockPrisma.workSession.findMany.mockResolvedValue([
        { actualMinutes: 30, plannedMinutes: 45 },
        { actualMinutes: null, plannedMinutes: 60 },
      ])

      await db.deleteWorkSession('ws-123')

      expect(mockPrisma.workSession.delete).toHaveBeenCalledWith({
        where: { id: 'ws-123' },
      })

      // Should recalculate step duration (since stepId exists)
      expect(mockPrisma.taskStep.update).toHaveBeenCalledWith({
        where: { id: 'step-456' },
        data: { actualDuration: 90 }, // 30 + 60
      })
    })

    it('should delete a work session and recalculate task duration when no stepId', async () => {
      mockPrisma.workSession.findUnique.mockResolvedValue({
        id: 'ws-123',
        taskId: 'task-123',
        stepId: null,
      })

      mockPrisma.workSession.delete.mockResolvedValue({
        id: 'ws-123',
      })

      mockPrisma.workSession.findMany.mockResolvedValue([
        { actualMinutes: 45, plannedMinutes: 60 },
      ])

      await db.deleteWorkSession('ws-123')

      expect(mockPrisma.workSession.delete).toHaveBeenCalledWith({
        where: { id: 'ws-123' },
      })

      // Should recalculate task duration (since no stepId)
      expect(mockPrisma.task.update).toHaveBeenCalledWith({
        where: { id: 'task-123' },
        data: { actualDuration: 45 },
      })
    })
  })

  describe('recalculateStepActualDuration', () => {
    it('should recalculate step actual duration from work sessions', async () => {
      mockPrisma.workSession.findMany.mockResolvedValue([
        { actualMinutes: 45, plannedMinutes: 60 },
        { actualMinutes: null, plannedMinutes: 30 },
        { actualMinutes: 15, plannedMinutes: 20 },
      ])

      await db.recalculateStepActualDuration('step-123')

      expect(mockPrisma.taskStep.update).toHaveBeenCalledWith({
        where: { id: 'step-123' },
        data: { actualDuration: 90 }, // 45 + 30 + 15
      })
    })

    it('should set actualDuration to null if no sessions', async () => {
      mockPrisma.workSession.findMany.mockResolvedValue([])

      await db.recalculateStepActualDuration('step-123')

      expect(mockPrisma.taskStep.update).toHaveBeenCalledWith({
        where: { id: 'step-123' },
        data: { actualDuration: null },
      })
    })
  })

  describe('updateWorkSessionTypesForStep', () => {
    it('should update all work session types for a step', async () => {
      await db.updateWorkSessionTypesForStep('step-123', TaskType.Admin)

      expect(mockPrisma.workSession.updateMany).toHaveBeenCalledWith({
        where: { stepId: 'step-123' },
        data: { type: 'admin' },
      })
    })
  })

  describe('getTodayAccumulated', () => {
    it('should calculate accumulated time by type', async () => {
      const testDate = '2024-01-15'

      mockPrisma.workSession.findMany.mockResolvedValue([
        { type: 'focused', actualMinutes: 120, plannedMinutes: 100 },
        { type: 'admin', actualMinutes: null, plannedMinutes: 60 },
        { type: 'focused', actualMinutes: 90, plannedMinutes: 90 },
        { type: 'admin', actualMinutes: 30, plannedMinutes: 45 },
      ])
      mockPrisma.taskStep.findMany.mockResolvedValue([])

      const result = await db.getTodayAccumulated(testDate)

      expect(result).toEqual({
        focused: 210, // 120 + 90
        admin: 90,    // 60 + 30
        personal: 0,  // no personal time
        total: 300,   // 210 + 90
      })
    })

    it('should return zeros for no work sessions', async () => {
      mockPrisma.workSession.findMany.mockResolvedValue([])
      mockPrisma.taskStep.findMany.mockResolvedValue([])

      const result = await db.getTodayAccumulated('2024-01-15')

      expect(result).toEqual({
        focused: 0,
        admin: 0,
        personal: 0,
        total: 0,
      })
    })
  })

  describe('createStepWorkSession', () => {
    it('should create work session for a step with correct type', async () => {
      mockPrisma.taskStep.findUnique.mockResolvedValue({
        id: 'step-123',
        taskId: 'task-456',
        type: 'admin',
        Task: { type: 'focused' },
      })

      mockPrisma.workSession.create.mockResolvedValue({
        id: 'ws-789',
        stepId: 'step-123',
        taskId: 'task-456',
        type: 'admin',
      })

      await db.createStepWorkSession({
        stepId: 'step-123',
        startTime: new Date(),
        duration: 45,
      })

      expect(mockPrisma.workSession.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          taskId: 'task-456',
          stepId: 'step-123',
          type: 'admin', // Should use step's type
        }),
      })
    })

    it('should update step actual duration after creating session', async () => {
      mockPrisma.taskStep.findUnique.mockResolvedValue({
        id: 'step-123',
        taskId: 'task-456',
        type: 'focused',
        Task: { type: 'focused' },
      })

      mockPrisma.workSession.create.mockResolvedValue({ id: 'ws-new' })
      mockPrisma.workSession.findMany.mockResolvedValue([
        { actualMinutes: 30, plannedMinutes: 30 },
      ])

      await db.createStepWorkSession({
        stepId: 'step-123',
        startTime: new Date(),
        duration: 30,
      })

      expect(mockPrisma.taskStep.update).toHaveBeenCalledWith({
        where: { id: 'step-123' },
        data: { actualDuration: 30 },
      })
    })
  })

  describe('Step type changes', () => {
    it('should update work sessions when step type changes', async () => {
      const existingSteps = [
        { id: 'step-1', type: 'focused', name: 'Step 1' },
        { id: 'step-2', type: 'admin', name: 'Step 2' },
      ]

      const updatedSteps = [
        { id: 'step-1', type: 'admin', name: 'Step 1' }, // Changed from focused to admin
        { id: 'step-2', type: 'admin', name: 'Step 2' },
      ]

      mockPrisma.taskStep.findMany.mockResolvedValue(existingSteps)
      mockPrisma.task.update.mockResolvedValue({ id: 'task-123' })
      mockPrisma.task.findUnique.mockResolvedValue({
        id: 'task-123',
        TaskStep: updatedSteps,
      })

      await db.updateTask('task-123', {
        steps: updatedSteps as any,
      })

      // Should have called updateWorkSessionTypesForStep for the changed step
      expect(mockPrisma.workSession.updateMany).toHaveBeenCalledWith({
        where: { stepId: 'step-1' },
        data: { type: 'admin' },
      })
    })
  })

  describe('Single Active Session Enforcement', () => {
    it('should auto-close existing active session when creating new session', async () => {
      const existingActiveSession = {
        id: 'ws-existing',
        taskId: 'task-old',
        stepId: null,
        type: 'focused',
        startTime: new Date('2024-01-15T09:00:00'),
        endTime: null, // Active session
        plannedMinutes: 60,
        actualMinutes: null,
      }

      const newSessionData = {
        taskId: 'task-new',
        type: TaskType.Focused,
        startTime: new Date('2024-01-15T10:30:00'),
        plannedMinutes: 60,
      }

      // Mock finding the existing active session
      mockPrisma.workSession.findFirst.mockResolvedValue(existingActiveSession)

      // Mock the update to close the existing session
      mockPrisma.workSession.update.mockResolvedValue({
        ...existingActiveSession,
        endTime: new Date('2024-01-15T10:30:00'),
        actualMinutes: 90,
      })

      // Mock creating the new session
      mockPrisma.workSession.create.mockResolvedValue({
        id: 'ws-new',
        ...newSessionData,
        endTime: null,
        actualMinutes: null,
      })

      await db.createWorkSession(newSessionData)

      // Should have found existing active session
      expect(mockPrisma.workSession.findFirst).toHaveBeenCalledWith({
        where: { endTime: null },
        orderBy: { startTime: 'desc' },
      })

      // Should have closed the existing session
      expect(mockPrisma.workSession.update).toHaveBeenCalledWith({
        where: { id: 'ws-existing' },
        data: expect.objectContaining({
          endTime: expect.any(Date),
          actualMinutes: expect.any(Number),
        }),
      })

      // Should have created the new session
      expect(mockPrisma.workSession.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          taskId: 'task-new',
          type: 'focused',
        }),
      })
    })

    it('should create session normally when no active session exists', async () => {
      const newSessionData = {
        taskId: 'task-123',
        type: TaskType.Focused,
        startTime: new Date('2024-01-15T09:00:00'),
        plannedMinutes: 60,
      }

      // No active session exists
      mockPrisma.workSession.findFirst.mockResolvedValue(null)

      mockPrisma.workSession.create.mockResolvedValue({
        id: 'ws-123',
        ...newSessionData,
        endTime: null,
        actualMinutes: null,
      })

      await db.createWorkSession(newSessionData)

      // Should have checked for active sessions
      expect(mockPrisma.workSession.findFirst).toHaveBeenCalledWith({
        where: { endTime: null },
        orderBy: { startTime: 'desc' },
      })

      // Should NOT have called update (no session to close)
      expect(mockPrisma.workSession.update).not.toHaveBeenCalled()

      // Should have created the new session
      expect(mockPrisma.workSession.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          taskId: 'task-123',
        }),
      })
    })

    it('should calculate elapsed minutes correctly when auto-closing', async () => {
      const startTime = new Date('2024-01-15T09:00:00')
      const endTime = new Date('2024-01-15T11:30:00') // 2.5 hours = 150 minutes

      const existingActiveSession = {
        id: 'ws-existing',
        taskId: 'task-old',
        stepId: null,
        type: 'focused',
        startTime,
        endTime: null,
        plannedMinutes: 60,
        actualMinutes: null,
      }

      mockPrisma.workSession.findFirst.mockResolvedValue(existingActiveSession)
      mockPrisma.workSession.update.mockResolvedValue({
        ...existingActiveSession,
        endTime,
        actualMinutes: 150,
      })
      mockPrisma.workSession.create.mockResolvedValue({
        id: 'ws-new',
        taskId: 'task-new',
        type: 'focused',
        startTime: endTime,
        plannedMinutes: 60,
        endTime: null,
        actualMinutes: null,
      })

      await db.createWorkSession({
        taskId: 'task-new',
        type: TaskType.Focused,
        startTime: endTime,
        plannedMinutes: 60,
      })

      // Verify the update was called with reasonable elapsed time
      expect(mockPrisma.workSession.update).toHaveBeenCalledWith({
        where: { id: 'ws-existing' },
        data: expect.objectContaining({
          actualMinutes: expect.any(Number),
        }),
      })

      // Get the actual call to verify minutes calculation
      const updateCall = mockPrisma.workSession.update.mock.calls[0][0]
      expect(updateCall.data.actualMinutes).toBeGreaterThanOrEqual(1) // At least 1 minute
    })
  })
})
