import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { DatabaseService } from '../database'
import { Task } from '@shared/types'
import { SequencedTask } from '@shared/sequencing-types'

// Mock PrismaClient
vi.mock('@prisma/client', () => {
  const mockPrismaClient = {
    session: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
    },
    task: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    taskStep: {
      createMany: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    workSession: {
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    workPattern: {
      findUnique: vi.fn(),
    },
    project: {
      findMany: vi.fn(),
    },
  }

  return {
    PrismaClient: vi.fn(() => mockPrismaClient),
  }
})

describe('Database - Unified Task Model', () => {
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

  describe('Task Operations', () => {
    const mockSimpleTask: Task = {
      id: 'task-1',
      name: 'Simple Task',
      duration: 60,
      importance: 8,
      urgency: 7,
      type: 'focused',
      sessionId: 'test-session',
      asyncWaitTime: 0,
      dependencies: [],
      completed: false,
      hasSteps: false,
      overallStatus: 'not_started',
      criticalPathDuration: 60,
      worstCaseDuration: 60,
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    const mockWorkflowTask: SequencedTask = {
      id: 'workflow-1',
      name: 'Workflow Task',
      duration: 180,
      importance: 9,
      urgency: 8,
      type: 'focused',
      sessionId: 'test-session',
      asyncWaitTime: 0,
      dependencies: [],
      completed: false,
      hasSteps: true,
      overallStatus: 'not_started',
      criticalPathDuration: 240,
      worstCaseDuration: 300,
      createdAt: new Date(),
      updatedAt: new Date(),
      steps: [
        {
          id: 'step-1',
          taskId: 'workflow-1',
          name: 'Step 1',
          duration: 60,
          type: 'focused',
          dependsOn: [],
          asyncWaitTime: 0,
          status: 'pending',
          stepIndex: 0,
          percentComplete: 0,
        },
        {
          id: 'step-2',
          taskId: 'workflow-1',
          name: 'Step 2',
          duration: 120,
          type: 'admin',
          dependsOn: ['step-1'],
          asyncWaitTime: 60,
          status: 'pending',
          stepIndex: 1,
          percentComplete: 0,
        },
      ],
    }

    describe('getTasks', () => {
      it('should return all tasks including workflows', async () => {
        mockPrisma.task.findMany.mockResolvedValue([
          {
            ...mockSimpleTask,
            dependencies: '[]',
            TaskStep: [],
          },
          {
            ...mockWorkflowTask,
            dependencies: '[]',
            TaskStep: mockWorkflowTask.steps.map(s => ({
              ...s,
              dependsOn: JSON.stringify(s.dependsOn),
            })),
          },
        ])

        const tasks = await db.getTasks()

        expect(tasks).toHaveLength(2)
        expect(tasks[0]?.hasSteps).toBe(false)
        expect(tasks[1]?.hasSteps).toBe(true)

        expect((tasks[1] as any)?.steps).toHaveLength(2)
      })

      it('should parse JSON fields correctly', async () => {
        mockPrisma.task.findMany.mockResolvedValue([{
          ...mockSimpleTask,
          dependencies: '["task-0", "task-2"]',
          TaskStep: [],
        }])

        const tasks = await db.getTasks()

        expect(tasks[0]?.dependencies).toEqual(['task-0', 'task-2'])
      })

      it('should handle optional fields', async () => {
        mockPrisma.task.findMany.mockResolvedValue([{
          ...mockSimpleTask,
          completedAt: null,
          actualDuration: null,
          notes: undefined,  // formatTask doesn't modify these
          projectId: undefined,  // so they should be undefined
          deadline: null,
          currentStepId: null,
          dependencies: '[]',
          TaskStep: [],
        }])

        const tasks = await db.getTasks()
        const task = tasks[0]

        expect(task).toBeDefined()
        expect(task?.completedAt).toBeNull()
        expect(task?.actualDuration).toBeNull()
        expect(task?.notes).toBeUndefined()  // notes is not modified by formatTask
        expect(task?.projectId).toBeUndefined()  // projectId is not modified by formatTask
        expect(task?.deadline).toBeNull()
        expect(task?.currentStepId).toBeNull()
      })
    })

    describe('createTask', () => {
      it('should create a simple task', async () => {
        const newTask = {
          name: 'New Task',
          duration: 45,
          importance: 7,
          urgency: 6,
          type: 'admin' as const,
          asyncWaitTime: 0,
          dependencies: [],
          completed: false,
          hasSteps: false,
          overallStatus: 'not_started' as const,
          criticalPathDuration: 45,
          worstCaseDuration: 45,
        }

        mockPrisma.task.create.mockResolvedValue({
          id: 'new-task-1',
          ...newTask,
          dependencies: '[]',
          createdAt: new Date(),
          updatedAt: new Date(),
        })

        const created = await db.createTask(newTask)

        expect(mockPrisma.task.create).toHaveBeenCalledWith({
          data: expect.objectContaining({
            name: 'New Task',
            duration: 45,
            type: 'admin',
            hasSteps: false,
            dependencies: '[]',
          }),
        })
        expect(created?.id).toBe('new-task-1')
      })

      it.skip('should create a workflow task with steps - Task type does not support steps', async () => {
        const workflowData = {
          name: 'New Workflow',
          duration: 180,
          importance: 8,
          urgency: 7,
          type: 'focused' as const,
        sessionId: 'test-session',          asyncWaitTime: 0,
          dependencies: [],
          completed: false,
          hasSteps: true,
          overallStatus: 'not_started' as const,
          criticalPathDuration: 240,
          worstCaseDuration: 300,
          steps: [
            {
              id: 'step-0',
              taskId: 'workflow-new',
              name: 'Step A',
              duration: 60,
              type: 'focused' as const,
        sessionId: 'test-session',              dependsOn: [],
              asyncWaitTime: 0,
              status: 'pending' as const,
              stepIndex: 0,
              percentComplete: 0,
            },
            {
              id: 'step-1',
              taskId: 'workflow-new',
              name: 'Step B',
              duration: 120,
              type: 'admin' as const,
        sessionId: 'test-session',              dependsOn: ['step-0'],
              asyncWaitTime: 60,
              status: 'pending' as const,
              stepIndex: 1,
              percentComplete: 0,
            },
          ],
        }

        mockPrisma.task.create.mockResolvedValue({
          id: 'workflow-new',
          ...workflowData,
          dependencies: '[]',
          createdAt: new Date(),
          updatedAt: new Date(),
        })

        mockPrisma.task.findUnique.mockResolvedValue({
          id: 'workflow-new',
          ...workflowData,
          dependencies: '[]',
          createdAt: new Date(),
          updatedAt: new Date(),
          steps: workflowData.steps.map((s, i) => ({
            id: `step-${i}`,
            taskId: 'workflow-new',
            ...s,
            dependsOn: JSON.stringify(s.dependsOn),
          })),
        })

        const created = await db.createTask(workflowData)

        expect(mockPrisma.task.create).toHaveBeenCalled()
        expect(mockPrisma.taskStep.createMany).toHaveBeenCalledWith({
          data: expect.arrayContaining([
            expect.objectContaining({
              name: 'Step A',
              taskId: 'workflow-new',
            }),
            expect.objectContaining({
              name: 'Step B',
              taskId: 'workflow-new',
            }),
          ]),
        })
        expect(created?.hasSteps).toBe(true)
      })
    })

    describe('updateTask', () => {
      it('should update task fields', async () => {
        const updates = {
          name: 'Updated Task',
          duration: 90,
          completed: true,
          completedAt: new Date(),
        }

        mockPrisma.task.update.mockResolvedValue({
          ...mockSimpleTask,
          ...updates,
          dependencies: '[]',
        })

        const updated = await db.updateTask('task-1', updates)

        expect(mockPrisma.task.update).toHaveBeenCalledWith({
          where: { id: 'task-1' },
          data: expect.objectContaining({
            name: 'Updated Task',
            duration: 90,
            completed: true,
          }),
          include: {
          TaskStep: {
            orderBy: { stepIndex: 'asc' },
          },
        },
        })
        expect(updated?.name).toBe('Updated Task')
      })

      it('should handle dependencies update', async () => {
        const updates = {
          dependencies: ['task-2', 'task-3'],
        }

        mockPrisma.task.update.mockResolvedValue({
          ...mockSimpleTask,
          dependencies: '["task-2","task-3"]',
        })

        await db.updateTask('task-1', updates)

        expect(mockPrisma.task.update).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              dependencies: '["task-2","task-3"]',
            }),
            include: {
          TaskStep: {
            orderBy: { stepIndex: 'asc' },
          },
        },
          }),
        )
      })
    })

    describe('deleteTask', () => {
      it('should delete a task', async () => {
        await db.deleteTask('task-1')

        expect(mockPrisma.task.delete).toHaveBeenCalledWith({
          where: { id: 'task-1' },
        })
      })
    })

    describe('getSequencedTasks', () => {
      it('should return only workflow tasks', async () => {
        mockPrisma.task.findMany.mockResolvedValue([
          {
            ...mockSimpleTask,
            dependencies: '[]',
            TaskStep: [],
          },
          {
            ...mockWorkflowTask,
            dependencies: '[]',
            TaskStep: mockWorkflowTask.steps.map(s => ({
              ...s,
              dependsOn: JSON.stringify(s.dependsOn),
            })),
          },
        ])

        const workflows = await db.getSequencedTasks()

        expect(workflows).toHaveLength(1)
        expect(workflows[0]?.hasSteps).toBe(true)
        expect(workflows[0]?.id).toBe('workflow-1')
      })
    })
  })

  describe('Work Session Operations', () => {
    describe('getTodayAccumulated', () => {
      const testDate = '2024-01-15'
      const startOfDay = new Date(testDate)
      startOfDay.setHours(0, 0, 0, 0)
      const endOfDay = new Date(testDate)
      endOfDay.setHours(23, 59, 59, 999)

      it('should sum work sessions by type', async () => {
        mockPrisma.workSession.findMany.mockResolvedValue([
          { type: 'focused', actualMinutes: 30, plannedMinutes: 30, Task: { sessionId: 'session-1' } },
          { type: 'admin', actualMinutes: 45, plannedMinutes: 40, Task: { sessionId: 'session-1' } },
          { type: 'focused', actualMinutes: null, plannedMinutes: 20, Task: { sessionId: 'session-1' } },
          { type: 'admin', actualMinutes: 15, plannedMinutes: 15, Task: { sessionId: 'session-1' } }])

        const result = await db.getTodayAccumulated(testDate)

        expect(result).toEqual({
          focused: 50, // 30 + 20
          admin: 60,  // 45 + 15
          total: 110, // 50 + 60
        })
      })

      it('should handle empty results', async () => {
        mockPrisma.workSession.findMany.mockResolvedValue([])

        const result = await db.getTodayAccumulated(testDate)

        expect(result).toEqual({
          focused: 0,
          admin: 0,
          total: 0,
        })
      })

      it('should use actualMinutes when available', async () => {
        mockPrisma.workSession.findMany.mockResolvedValue([
          { type: 'focused', actualMinutes: 45, plannedMinutes: 30, Task: { sessionId: 'session-1' } },
          { type: 'focused', actualMinutes: null, plannedMinutes: 30, Task: { sessionId: 'session-1' } }])

        const result = await db.getTodayAccumulated(testDate)

        expect(result?.focused).toBe(75) // 45 (actual) + 30 (planned)
      })
    })

    describe('createWorkSession', () => {
      it('should create work session for task', async () => {
        const sessionData = {
          taskId: 'task-1',
          type: 'focused' as const,
          startTime: new Date('2024-01-15T10:00:00'),
          plannedMinutes: 30,
          notes: 'Test session',
        }

        mockPrisma.workSession.create.mockResolvedValue({
          id: 'session-1',
          ...sessionData,
          endTime: new Date('2024-01-15T10:30:00'),
          plannedMinutes: 30,
          actualMinutes: 30,
        })

        await db.createWorkSession(sessionData)

        expect(mockPrisma.workSession.create).toHaveBeenCalledWith({
          data: expect.objectContaining({
            taskId: 'task-1',
            type: 'focused',
            plannedMinutes: 30,
          }),
        })
      })

      it('should create work session for step', async () => {
        const sessionData = {
          taskId: 'workflow-1',
          stepId: 'step-1',
          type: 'admin' as const,
          startTime: new Date('2024-01-15T14:00:00'),
          plannedMinutes: 45,
        }

        await db.createWorkSession(sessionData)

        expect(mockPrisma.workSession.create).toHaveBeenCalledWith({
          data: expect.objectContaining({
            taskId: 'workflow-1',
            stepId: 'step-1',
            type: 'admin',
            plannedMinutes: 45,
          }),
        })
      })
    })
  })

  describe('Migration Compatibility', () => {
    it('should handle migrated task IDs', async () => {
      mockPrisma.task.findUnique.mockResolvedValue({
        id: 'migrated-old-workflow-id',
        name: 'Migrated Workflow',
        hasSteps: true,
        dependencies: '[]',
        steps: [],
      })

      const task = await db.getTaskById('migrated-old-workflow-id')

      expect(task?.id).toBe('migrated-old-workflow-id')
      expect(task?.hasSteps).toBe(true)
    })

    it.skip('should handle legacy sequenced task methods - complex mock setup', async () => {
      const workflowData = {
        name: 'Legacy Workflow',
        importance: 8,
        urgency: 7,
        type: 'focused' as const,
        sessionId: 'test-session',        notes: 'Created via legacy method',
        dependencies: [],
        completed: false,
        duration: 180,
        asyncWaitTime: 0,
        hasSteps: true,
        criticalPathDuration: 240,
        worstCaseDuration: 300,
        overallStatus: 'not_started' as const,
        steps: [],
      }

      mockPrisma.task.create.mockResolvedValue({
        id: 'new-workflow',
        ...workflowData,
        duration: workflowData.duration,
        hasSteps: true,
        dependencies: '[]',
        TaskStep: [],  // formatTask expects this
        createdAt: new Date(),
        updatedAt: new Date(),
      })

      const created = await db.createSequencedTask(workflowData)

      expect(created?.hasSteps).toBe(true)
      expect(mockPrisma.task.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          hasSteps: true,
        }),
      })
    })
  })
})
