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

    it('should work for workflows with steps', async () => {
      const mockWorkflow = {
        id: 'workflow-1',
        name: 'Test Workflow',
        hasSteps: true,
        duration: 120,
        criticalPathDuration: 120,
        worstCaseDuration: 150,
        overallStatus: 'in_progress',
        dependencies: '[]',
        type: 'focused',
        importance: 7,
        urgency: 6,
        asyncWaitTime: 0,
        completed: false,
        sessionId: 'test-session',
        createdAt: new Date(),
        updatedAt: new Date(),
        archived: true,
        TaskStep: [
          {
            id: 'step-1',
            taskId: 'workflow-1',
            name: 'Step 1',
            duration: 60,
            type: 'focused',
            dependsOn: '[]',
            asyncWaitTime: 0,
            status: 'completed',
            stepIndex: 0,
            percentComplete: 100,
          },
          {
            id: 'step-2',
            taskId: 'workflow-1',
            name: 'Step 2',
            duration: 60,
            type: 'focused',
            dependsOn: '["step-1"]',
            asyncWaitTime: 0,
            status: 'in_progress',
            stepIndex: 1,
            percentComplete: 50,
          },
        ],
      }

      const unarchivedWorkflow = { ...mockWorkflow, archived: false }
      mockPrisma.task.update.mockResolvedValue(unarchivedWorkflow)

      const result = await db.unarchiveTask('workflow-1')

      expect(result.archived).toBe(false)
      expect(result.hasSteps).toBe(true)
      expect(result.steps).toHaveLength(2)
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

  describe('archiveTask - preserves task properties', () => {
    it('should preserve all task properties when archiving', async () => {
      const mockTask = {
        id: 'task-1',
        name: 'Important Task',
        hasSteps: false,
        duration: 120,
        criticalPathDuration: 120,
        worstCaseDuration: 150,
        overallStatus: 'in_progress',
        dependencies: '["other-task"]',
        type: 'focused',
        importance: 9,
        urgency: 8,
        asyncWaitTime: 30,
        completed: false,
        sessionId: 'test-session',
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-02'),
        archived: false,
        notes: 'Important notes',
        deadline: new Date('2024-02-01'),
        cognitiveComplexity: 5,
        TaskStep: [],
      }

      const archivedTask = { ...mockTask, archived: true }
      mockPrisma.task.update.mockResolvedValue(archivedTask)

      const result = await db.archiveTask('task-1')

      // Verify all properties are preserved
      expect(result.name).toBe('Important Task')
      expect(result.importance).toBe(9)
      expect(result.urgency).toBe(8)
      expect(result.duration).toBe(120)
      expect(result.dependencies).toEqual(['other-task']) // Parsed from JSON string
      expect(result.asyncWaitTime).toBe(30)
      expect(result.cognitiveComplexity).toBe(5)
      expect(result.archived).toBe(true)
    })

    it('should handle archiving completed tasks', async () => {
      const mockCompletedTask = {
        id: 'completed-task',
        name: 'Done Task',
        hasSteps: false,
        duration: 60,
        criticalPathDuration: 60,
        worstCaseDuration: 60,
        overallStatus: 'completed',
        dependencies: '[]',
        type: 'focused',
        importance: 5,
        urgency: 5,
        asyncWaitTime: 0,
        completed: true,
        sessionId: 'test-session',
        createdAt: new Date(),
        updatedAt: new Date(),
        archived: false,
        TaskStep: [],
      }

      const archivedTask = { ...mockCompletedTask, archived: true }
      mockPrisma.task.update.mockResolvedValue(archivedTask)

      const result = await db.archiveTask('completed-task')

      expect(result.archived).toBe(true)
      expect(result.completed).toBe(true)
      expect(result.overallStatus).toBe('completed')
    })
  })

  describe('unarchiveTask - preserves task properties', () => {
    it('should preserve all task properties when unarchiving', async () => {
      const mockTask = {
        id: 'task-1',
        name: 'Restored Task',
        hasSteps: false,
        duration: 90,
        criticalPathDuration: 90,
        worstCaseDuration: 120,
        overallStatus: 'in_progress',
        dependencies: '["dep-1", "dep-2"]',
        type: 'admin',
        importance: 7,
        urgency: 6,
        asyncWaitTime: 15,
        completed: false,
        sessionId: 'test-session',
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-02'),
        archived: true,
        notes: 'Task notes',
        cognitiveComplexity: 4,
        TaskStep: [],
      }

      const unarchivedTask = { ...mockTask, archived: false }
      mockPrisma.task.update.mockResolvedValue(unarchivedTask)

      const result = await db.unarchiveTask('task-1')

      // Verify all properties are preserved
      expect(result.name).toBe('Restored Task')
      expect(result.importance).toBe(7)
      expect(result.urgency).toBe(6)
      expect(result.duration).toBe(90)
      expect(result.type).toBe('admin')
      expect(result.cognitiveComplexity).toBe(4)
      expect(result.archived).toBe(false)
    })
  })

  describe('archive/unarchive workflow with dependencies', () => {
    it('should handle workflows with complex step dependencies', async () => {
      const mockWorkflow = {
        id: 'workflow-complex',
        name: 'Complex Workflow',
        hasSteps: true,
        duration: 180,
        criticalPathDuration: 180,
        worstCaseDuration: 240,
        overallStatus: 'not_started',
        dependencies: '[]',
        type: 'focused',
        importance: 8,
        urgency: 7,
        asyncWaitTime: 0,
        completed: false,
        sessionId: 'test-session',
        createdAt: new Date(),
        updatedAt: new Date(),
        archived: false,
        TaskStep: [
          {
            id: 'step-1',
            taskId: 'workflow-complex',
            name: 'Initial Step',
            duration: 60,
            type: 'focused',
            dependsOn: '[]',
            asyncWaitTime: 0,
            status: 'pending',
            stepIndex: 0,
            percentComplete: 0,
          },
          {
            id: 'step-2',
            taskId: 'workflow-complex',
            name: 'Dependent Step',
            duration: 60,
            type: 'focused',
            dependsOn: '["step-1"]',
            asyncWaitTime: 0,
            status: 'pending',
            stepIndex: 1,
            percentComplete: 0,
          },
          {
            id: 'step-3',
            taskId: 'workflow-complex',
            name: 'Final Step',
            duration: 60,
            type: 'focused',
            dependsOn: '["step-1", "step-2"]',
            asyncWaitTime: 0,
            status: 'pending',
            stepIndex: 2,
            percentComplete: 0,
          },
        ],
      }

      const archivedWorkflow = { ...mockWorkflow, archived: true }
      mockPrisma.task.update.mockResolvedValue(archivedWorkflow)

      const result = await db.archiveTask('workflow-complex')

      expect(result.archived).toBe(true)
      expect(result.hasSteps).toBe(true)
      expect(result.TaskStep).toHaveLength(3)
      // Verify step dependencies are preserved
      expect(result.TaskStep?.[2].dependsOn).toBe('["step-1", "step-2"]')
    })
  })

  describe('edge cases', () => {
    it('should handle archiving a task that is already archived', async () => {
      const mockTask = {
        id: 'already-archived',
        name: 'Already Archived Task',
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

      mockPrisma.task.update.mockResolvedValue(mockTask)

      const result = await db.archiveTask('already-archived')

      expect(result.archived).toBe(true)
    })

    it('should handle unarchiving a task that is not archived', async () => {
      const mockTask = {
        id: 'not-archived',
        name: 'Not Archived Task',
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

      mockPrisma.task.update.mockResolvedValue(mockTask)

      const result = await db.unarchiveTask('not-archived')

      expect(result.archived).toBe(false)
    })

    it('should handle tasks with different task types', async () => {
      const personalTask = {
        id: 'personal-task',
        name: 'Personal Task',
        hasSteps: false,
        duration: 30,
        criticalPathDuration: 30,
        worstCaseDuration: 30,
        overallStatus: 'not_started',
        dependencies: '[]',
        type: 'personal',
        importance: 3,
        urgency: 2,
        asyncWaitTime: 0,
        completed: false,
        sessionId: 'test-session',
        createdAt: new Date(),
        updatedAt: new Date(),
        archived: false,
        TaskStep: [],
      }

      const archivedTask = { ...personalTask, archived: true }
      mockPrisma.task.update.mockResolvedValue(archivedTask)

      const result = await db.archiveTask('personal-task')

      expect(result.archived).toBe(true)
      expect(result.type).toBe('personal')
    })
  })
})
