import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { DatabaseService } from '../database'

// Mock PrismaClient
vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn().mockImplementation(() => ({
    $connect: vi.fn(),
    $disconnect: vi.fn(),
    session: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      findUnique: vi.fn(),
    },
    task: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    taskStep: {
      findMany: vi.fn(),
      createMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  })),
}))

describe('Database - Archive/Unarchive Tests', () => {
  let db: DatabaseService
  let mockPrisma: any

  beforeEach(() => {
    db = DatabaseService.getInstance()
    mockPrisma = (db as any).client

    // Setup default active session
    mockPrisma.session.findFirst.mockResolvedValue({
      id: 'test-session',
      name: 'Test Session',
      isActive: true,
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('archiveTask', () => {
    it('should set archived flag to true', async () => {
      const mockTask = {
        id: 'task-1',
        name: 'Test Task',
        hasSteps: false,
        duration: 60,
        criticalPathDuration: 60,
        worstCaseDuration: 60,
        overallStatus: 'not_started',
        dependencies: '[]',
        type: 'focused',
        importance: 5,
        urgency: 5,
        asyncWaitTime: 0,
        completed: false,
        sessionId: 'test-session',
        createdAt: new Date(),
        updatedAt: new Date(),
        archived: false,
        TaskStep: [],
      }

      const archivedTask = { ...mockTask, archived: true }
      mockPrisma.task.update.mockResolvedValue(archivedTask)

      const result = await db.archiveTask('task-1')

      expect(mockPrisma.task.update).toHaveBeenCalledWith({
        where: { id: 'task-1' },
        data: { archived: true },
        include: {
          TaskStep: {
            orderBy: { stepIndex: 'asc' },
          },
        },
      })
      expect(result.archived).toBe(true)
    })

    it('should work for workflows with steps', async () => {
      const mockWorkflow = {
        id: 'workflow-1',
        name: 'Test Workflow',
        hasSteps: true,
        duration: 120,
        criticalPathDuration: 120,
        worstCaseDuration: 150,
        overallStatus: 'not_started',
        dependencies: '[]',
        type: 'focused',
        importance: 7,
        urgency: 6,
        asyncWaitTime: 0,
        completed: false,
        sessionId: 'test-session',
        createdAt: new Date(),
        updatedAt: new Date(),
        archived: false,
        TaskStep: [
          {
            id: 'step-1',
            taskId: 'workflow-1',
            name: 'Step 1',
            duration: 60,
            type: 'focused',
            dependsOn: '[]',
            asyncWaitTime: 0,
            status: 'pending',
            stepIndex: 0,
            percentComplete: 0,
          },
        ],
      }

      const archivedWorkflow = { ...mockWorkflow, archived: true }
      mockPrisma.task.update.mockResolvedValue(archivedWorkflow)

      const result = await db.archiveTask('workflow-1')

      expect(result.archived).toBe(true)
      expect(result.hasSteps).toBe(true)
    })
  })

  describe('unarchiveTask', () => {
    it('should set archived flag to false', async () => {
      const mockTask = {
        id: 'task-1',
        name: 'Test Task',
        hasSteps: false,
        duration: 60,
        criticalPathDuration: 60,
        worstCaseDuration: 60,
        overallStatus: 'not_started',
        dependencies: '[]',
        type: 'focused',
        importance: 5,
        urgency: 5,
        asyncWaitTime: 0,
        completed: false,
        sessionId: 'test-session',
        createdAt: new Date(),
        updatedAt: new Date(),
        archived: true,
        TaskStep: [],
      }

      const unarchivedTask = { ...mockTask, archived: false }
      mockPrisma.task.update.mockResolvedValue(unarchivedTask)

      const result = await db.unarchiveTask('task-1')

      expect(mockPrisma.task.update).toHaveBeenCalledWith({
        where: { id: 'task-1' },
        data: { archived: false },
        include: {
          TaskStep: {
            orderBy: { stepIndex: 'asc' },
          },
        },
      })
      expect(result.archived).toBe(false)
    })
  })

  describe('getTasks with includeArchived', () => {
    it('should exclude archived tasks by default', async () => {
      mockPrisma.task.findMany.mockResolvedValue([])

      await db.getTasks()

      expect(mockPrisma.task.findMany).toHaveBeenCalledWith({
        where: {
          sessionId: 'test-session',
          archived: false,
        },
        include: {
          TaskStep: true,
        },
        orderBy: { createdAt: 'desc' },
      })
    })

    it('should include archived tasks when includeArchived=true', async () => {
      mockPrisma.task.findMany.mockResolvedValue([])

      await db.getTasks(true)

      expect(mockPrisma.task.findMany).toHaveBeenCalledWith({
        where: {
          sessionId: 'test-session',
        },
        include: {
          TaskStep: true,
        },
        orderBy: { createdAt: 'desc' },
      })
    })

    it('should return both archived and non-archived tasks when includeArchived=true', async () => {
      const mockTasks = [
        {
          id: 'task-1',
          name: 'Active Task',
          archived: false,
          hasSteps: false,
          duration: 60,
          criticalPathDuration: 60,
          worstCaseDuration: 60,
          overallStatus: 'not_started',
          dependencies: '[]',
          type: 'focused',
          importance: 5,
          urgency: 5,
          asyncWaitTime: 0,
          completed: false,
          sessionId: 'test-session',
          createdAt: new Date(),
          updatedAt: new Date(),
          TaskStep: [],
        },
        {
          id: 'task-2',
          name: 'Archived Task',
          archived: true,
          hasSteps: false,
          duration: 60,
          criticalPathDuration: 60,
          worstCaseDuration: 60,
          overallStatus: 'not_started',
          dependencies: '[]',
          type: 'focused',
          importance: 5,
          urgency: 5,
          asyncWaitTime: 0,
          completed: false,
          sessionId: 'test-session',
          createdAt: new Date(),
          updatedAt: new Date(),
          TaskStep: [],
        },
      ]

      mockPrisma.task.findMany.mockResolvedValue(mockTasks)

      const result = await db.getTasks(true)

      expect(result).toHaveLength(2)
      expect(result[0].archived).toBe(false)
      expect(result[1].archived).toBe(true)
    })
  })
})
