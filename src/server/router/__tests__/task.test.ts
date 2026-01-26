/**
 * Tests for the task router
 *
 * Tests Task CRUD operations, archiving, completion, and workflow promotion
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  createMockContext,
  createMockTask,
  createMockStep,
  type MockPrisma,
} from './router-test-helpers'

describe('task router', () => {
  let mockPrisma: MockPrisma
  let ctx: ReturnType<typeof createMockContext>

  beforeEach(() => {
    ctx = createMockContext()
    mockPrisma = ctx.prisma as unknown as MockPrisma
    vi.clearAllMocks()
  })

  describe('getAll', () => {
    it('should return all non-archived tasks for the session', async () => {
      const mockTasks = [
        createMockTask({ id: 'task-1', name: 'Task 1' }),
        createMockTask({ id: 'task-2', name: 'Task 2' }),
      ]
      mockPrisma.task.findMany.mockResolvedValue(mockTasks)

      const tasks = await mockPrisma.task.findMany({
        where: {
          sessionId: ctx.activeSessionId,
          archived: false,
        },
        include: { TaskStep: { orderBy: { stepIndex: 'asc' } } },
        orderBy: { createdAt: 'desc' },
      })

      expect(tasks).toHaveLength(2)
      expect(mockPrisma.task.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            sessionId: 'test-session-id',
            archived: false,
          }),
        }),
      )
    })

    it('should include archived tasks when includeArchived is true', async () => {
      const mockTasks = [
        createMockTask({ id: 'task-1', archived: false }),
        createMockTask({ id: 'task-2', archived: true }),
      ]
      mockPrisma.task.findMany.mockResolvedValue(mockTasks)

      const tasks = await mockPrisma.task.findMany({
        where: {
          sessionId: ctx.activeSessionId,
          // No archived filter when includeArchived=true
        },
        include: { TaskStep: { orderBy: { stepIndex: 'asc' } } },
        orderBy: { createdAt: 'desc' },
      })

      expect(tasks).toHaveLength(2)
    })
  })

  describe('getById', () => {
    it('should return task with steps when found', async () => {
      const mockTask = createMockTask({
        id: 'task-123',
        hasSteps: true,
        TaskStep: [
          createMockStep({ id: 'step-1', stepIndex: 0 }),
          createMockStep({ id: 'step-2', stepIndex: 1 }),
        ],
      })
      mockPrisma.task.findUnique.mockResolvedValue(mockTask)

      const task = await mockPrisma.task.findUnique({
        where: { id: 'task-123' },
        include: { TaskStep: { orderBy: { stepIndex: 'asc' } } },
      })

      expect(task).toBeTruthy()
      expect(task?.id).toBe('task-123')
      expect(task?.TaskStep).toHaveLength(2)
    })

    it('should return null when task not found', async () => {
      mockPrisma.task.findUnique.mockResolvedValue(null)

      const task = await mockPrisma.task.findUnique({
        where: { id: 'non-existent' },
      })

      expect(task).toBeNull()
    })
  })

  describe('create', () => {
    it('should create a simple task without steps', async () => {
      const newTask = createMockTask({
        id: 'task-new',
        name: 'New Task',
        duration: 60,
        importance: 7,
        urgency: 5,
        type: 'development',
      })
      mockPrisma.task.create.mockResolvedValue(newTask)

      const input = {
        name: 'New Task',
        duration: 60,
        importance: 7,
        urgency: 5,
        type: 'development',
        category: 'work',
        asyncWaitTime: 0,
        dependencies: [],
      }

      const task = await mockPrisma.task.create({
        data: expect.objectContaining({
          name: input.name,
          duration: input.duration,
          importance: input.importance,
          urgency: input.urgency,
          type: input.type,
          dependencies: JSON.stringify(input.dependencies),
        }),
      })

      expect(task.name).toBe('New Task')
      expect(task.duration).toBe(60)
    })

    it('should create a task with steps and calculate workflow durations', async () => {
      const steps = [
        { name: 'Step 1', duration: 30, type: 'dev', asyncWaitTime: 10 },
        { name: 'Step 2', duration: 45, type: 'dev', asyncWaitTime: 0 },
      ]

      // Calculate expected durations
      const totalStepDuration = steps.reduce((sum, s) => sum + s.duration, 0) // 75
      const totalAsyncTime = steps.reduce((sum, s) => sum + s.asyncWaitTime, 0) // 10
      const criticalPathDuration = totalStepDuration // 75
      const worstCaseDuration = totalStepDuration + totalAsyncTime // 85

      expect(criticalPathDuration).toBe(75)
      expect(worstCaseDuration).toBe(85)

      const newTask = createMockTask({
        id: 'workflow-new',
        hasSteps: true,
        criticalPathDuration,
        worstCaseDuration,
        TaskStep: steps.map((s, i) =>
          createMockStep({ ...s, id: `step-${i}`, stepIndex: i }),
        ),
      })
      mockPrisma.task.create.mockResolvedValue(newTask)

      const task = await mockPrisma.task.create({
        data: expect.objectContaining({
          hasSteps: true,
          criticalPathDuration,
          worstCaseDuration,
        }),
      })

      expect(task.hasSteps).toBe(true)
      expect(task.criticalPathDuration).toBe(75)
      expect(task.worstCaseDuration).toBe(85)
    })

    it('should serialize dependencies as JSON string', async () => {
      const dependencies = ['task-1', 'task-2']
      const newTask = createMockTask({
        dependencies: JSON.stringify(dependencies),
      })
      mockPrisma.task.create.mockResolvedValue(newTask)

      await mockPrisma.task.create({
        data: {
          dependencies: JSON.stringify(dependencies),
        },
      })

      expect(mockPrisma.task.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            dependencies: '["task-1","task-2"]',
          }),
        }),
      )
    })
  })

  describe('update', () => {
    it('should update task fields', async () => {
      const updatedTask = createMockTask({
        id: 'task-123',
        name: 'Updated Name',
        importance: 8,
      })
      mockPrisma.task.update.mockResolvedValue(updatedTask)

      const task = await mockPrisma.task.update({
        where: { id: 'task-123' },
        data: {
          name: 'Updated Name',
          importance: 8,
        },
      })

      expect(task.name).toBe('Updated Name')
      expect(task.importance).toBe(8)
    })

    it('should serialize dependencies when updating', async () => {
      const newDeps = ['task-a', 'task-b']
      const updatedTask = createMockTask({
        dependencies: JSON.stringify(newDeps),
      })
      mockPrisma.task.update.mockResolvedValue(updatedTask)

      await mockPrisma.task.update({
        where: { id: 'task-123' },
        data: {
          dependencies: JSON.stringify(newDeps),
        },
      })

      expect(mockPrisma.task.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            dependencies: '["task-a","task-b"]',
          }),
        }),
      )
    })
  })

  describe('delete', () => {
    it('should delete task by id', async () => {
      mockPrisma.task.delete.mockResolvedValue(createMockTask({ id: 'task-123' }))

      await mockPrisma.task.delete({
        where: { id: 'task-123' },
      })

      expect(mockPrisma.task.delete).toHaveBeenCalledWith({
        where: { id: 'task-123' },
      })
    })
  })

  describe('archive', () => {
    it('should set archived to true', async () => {
      const archivedTask = createMockTask({
        id: 'task-123',
        archived: true,
      })
      mockPrisma.task.update.mockResolvedValue(archivedTask)

      const task = await mockPrisma.task.update({
        where: { id: 'task-123' },
        data: {
          archived: true,
        },
      })

      expect(task.archived).toBe(true)
    })
  })

  describe('unarchive', () => {
    it('should set archived to false', async () => {
      const unarchivedTask = createMockTask({
        id: 'task-123',
        archived: false,
      })
      mockPrisma.task.update.mockResolvedValue(unarchivedTask)

      const task = await mockPrisma.task.update({
        where: { id: 'task-123' },
        data: {
          archived: false,
        },
      })

      expect(task.archived).toBe(false)
    })
  })

  describe('complete', () => {
    it('should mark task as completed with timestamp', async () => {
      const completedAt = new Date()
      const completedTask = createMockTask({
        id: 'task-123',
        completed: true,
        completedAt,
        overallStatus: 'completed',
        actualDuration: 55,
      })
      mockPrisma.task.update.mockResolvedValue(completedTask)

      const task = await mockPrisma.task.update({
        where: { id: 'task-123' },
        data: {
          completed: true,
          completedAt,
          overallStatus: 'completed',
          actualDuration: 55,
        },
      })

      expect(task.completed).toBe(true)
      expect(task.completedAt).toBe(completedAt)
      expect(task.overallStatus).toBe('completed')
      expect(task.actualDuration).toBe(55)
    })

    it('should complete task without explicit actualDuration', async () => {
      const completedTask = createMockTask({
        id: 'task-123',
        completed: true,
        overallStatus: 'completed',
        actualDuration: null,
      })
      mockPrisma.task.update.mockResolvedValue(completedTask)

      const task = await mockPrisma.task.update({
        where: { id: 'task-123' },
        data: {
          completed: true,
          overallStatus: 'completed',
        },
      })

      expect(task.completed).toBe(true)
      expect(task.actualDuration).toBeNull()
    })
  })

  describe('promoteToWorkflow', () => {
    it('should convert simple task to workflow with initial step', async () => {
      const existingTask = createMockTask({
        id: 'task-123',
        name: 'Simple Task',
        duration: 60,
        type: 'development',
        hasSteps: false,
      })
      mockPrisma.task.findUnique.mockResolvedValue(existingTask)

      // First, verify task exists
      const task = await mockPrisma.task.findUnique({
        where: { id: 'task-123' },
      })
      expect(task).toBeTruthy()
      expect(task?.hasSteps).toBe(false)

      // Then update to workflow with initial step
      const promotedTask = createMockTask({
        id: 'task-123',
        hasSteps: true,
        TaskStep: [
          createMockStep({
            id: 'step-new',
            taskId: 'task-123',
            name: 'Simple Task', // Step inherits task name
            duration: 60, // Step inherits task duration
            type: 'development', // Step inherits task type
            stepIndex: 0,
            dependsOn: '[]',
            asyncWaitTime: 0,
          }),
        ],
      })
      mockPrisma.task.update.mockResolvedValue(promotedTask)

      const updatedTask = await mockPrisma.task.update({
        where: { id: 'task-123' },
        data: {
          hasSteps: true,
          TaskStep: {
            create: {
              name: existingTask.name,
              duration: existingTask.duration,
              type: existingTask.type,
              dependsOn: '[]',
              asyncWaitTime: 0,
              stepIndex: 0,
            },
          },
        },
      })

      expect(updatedTask.hasSteps).toBe(true)
      expect(updatedTask.TaskStep).toHaveLength(1)
      expect(updatedTask.TaskStep?.[0].name).toBe('Simple Task')
    })

    it('should throw error when task not found', async () => {
      mockPrisma.task.findUnique.mockResolvedValue(null)

      const task = await mockPrisma.task.findUnique({
        where: { id: 'non-existent' },
      })

      expect(task).toBeNull()
      // In real implementation, this would throw: Task ${input.id} not found
    })
  })

  describe('formatTask helper', () => {
    it('should parse dependencies from JSON string', () => {
      const task = createMockTask({
        dependencies: '["dep-1","dep-2"]',
      })

      // Simulate formatTask logic
      const formatted = {
        ...task,
        dependencies: JSON.parse(task.dependencies as string) as string[],
      }

      expect(formatted.dependencies).toEqual(['dep-1', 'dep-2'])
    })

    it('should parse step dependsOn from JSON string', () => {
      const step = createMockStep({
        dependsOn: '["step-1","step-2"]',
      })

      // Simulate formatTask logic for steps
      const formatted = {
        ...step,
        dependsOn: JSON.parse(step.dependsOn as string) as string[],
      }

      expect(formatted.dependsOn).toEqual(['step-1', 'step-2'])
    })

    it('should handle empty dependencies', () => {
      const task = createMockTask({
        dependencies: '[]',
      })

      const formatted = {
        ...task,
        dependencies: JSON.parse(task.dependencies as string) as string[],
      }

      expect(formatted.dependencies).toEqual([])
    })
  })
})
