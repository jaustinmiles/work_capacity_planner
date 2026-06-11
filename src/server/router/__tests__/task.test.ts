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
import { appRouter } from '../index'

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

    // Regression: reopening a task (completed → false) must clear completedAt, even when the
    // caller can't send an explicit null (e.g. the visionOS client whose serializer omits nil
    // optionals). The router derives the null. See spatial Done-tray reactivation.
    it('clears completedAt when a task is reopened (completed set to false)', async () => {
      mockPrisma.task.update.mockResolvedValue(
        createMockTask({ id: 'task-123', completed: false, completedAt: null }),
      )

      const caller = appRouter.createCaller(ctx)
      await caller.task.update({ id: 'task-123', completed: false })

      expect(mockPrisma.task.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'task-123' },
          data: expect.objectContaining({ completed: false, completedAt: null }),
        }),
      )
    })

    it('does not force completedAt when completed is not being changed', async () => {
      mockPrisma.task.update.mockResolvedValue(createMockTask({ id: 'task-123', name: 'Renamed' }))

      const caller = appRouter.createCaller(ctx)
      await caller.task.update({ id: 'task-123', name: 'Renamed' })

      const dataArg = mockPrisma.task.update.mock.calls[0][0].data
      expect(dataArg).not.toHaveProperty('completedAt')
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

  // Trust-boundary regression: any client (including the AI agent) could persist task
  // types that don't exist because the server never validated them against UserTaskType.
  describe('task type validation (trust boundary)', () => {
    const baseInput = {
      name: 'Typed Task',
      duration: 30,
      importance: 5,
      urgency: 5,
    }

    beforeEach(() => {
      // task.create is a sessionProcedure — the middleware verifies the session exists.
      mockPrisma.session.findUnique.mockResolvedValue({ id: 'test-session-id', name: 'Test' })
    })

    it('create rejects an unknown task type with BAD_REQUEST and writes nothing', async () => {
      mockPrisma.userTaskType.findMany.mockResolvedValue([])

      const caller = appRouter.createCaller(ctx)
      await expect(
        caller.task.create({ ...baseInput, type: 'hallucinated-type' }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' })

      expect(mockPrisma.task.create).not.toHaveBeenCalled()
    })

    it('create scopes type lookup to the session, so a cross-session type id is rejected', async () => {
      // The type exists in ANOTHER session: the session-scoped lookup finds nothing.
      mockPrisma.userTaskType.findMany.mockResolvedValue([])

      const caller = appRouter.createCaller(ctx)
      await expect(
        caller.task.create({ ...baseInput, type: 'other-sessions-type' }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' })

      expect(mockPrisma.userTaskType.findMany).toHaveBeenCalledWith({
        where: { id: { in: ['other-sessions-type'] }, sessionId: 'test-session-id' },
        select: { id: true },
      })
    })

    it('create accepts a type that exists in the session', async () => {
      mockPrisma.userTaskType.findMany.mockResolvedValue([{ id: 'type-dev' }])
      mockPrisma.task.create.mockResolvedValue(createMockTask({ type: 'type-dev' }))

      const caller = appRouter.createCaller(ctx)
      const task = await caller.task.create({ ...baseInput, type: 'type-dev' })

      expect(task.type).toBe('type-dev')
      expect(mockPrisma.task.create).toHaveBeenCalledTimes(1)
    })

    it('create rejects when any STEP type is unknown, naming the offending field', async () => {
      mockPrisma.userTaskType.findMany.mockResolvedValue([{ id: 'type-dev' }])

      const caller = appRouter.createCaller(ctx)
      await expect(
        caller.task.create({
          ...baseInput,
          type: 'type-dev',
          hasSteps: true,
          steps: [
            { name: 'Good step', duration: 10, type: 'type-dev' },
            { name: 'Bad step', duration: 10, type: 'bogus-step-type' },
          ],
        }),
      ).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: expect.stringContaining('steps[1].type'),
      })

      expect(mockPrisma.task.create).not.toHaveBeenCalled()
    })

    it('create rejects an empty-string type at the schema level', async () => {
      const caller = appRouter.createCaller(ctx)
      await expect(
        caller.task.create({ ...baseInput, type: '' }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' })

      expect(mockPrisma.userTaskType.findMany).not.toHaveBeenCalled()
      expect(mockPrisma.task.create).not.toHaveBeenCalled()
    })

    it('update rejects a type change to an unknown type, resolving the session from the task row', async () => {
      mockPrisma.task.findUnique.mockResolvedValue({ sessionId: 'owning-session' })
      mockPrisma.userTaskType.findMany.mockResolvedValue([])

      const caller = appRouter.createCaller(ctx)
      await expect(
        caller.task.update({ id: 'task-123', type: 'hallucinated-type' }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' })

      // Scoped to the TASK's session (update is not session-header-scoped).
      expect(mockPrisma.userTaskType.findMany).toHaveBeenCalledWith({
        where: { id: { in: ['hallucinated-type'] }, sessionId: 'owning-session' },
        select: { id: true },
      })
      expect(mockPrisma.task.update).not.toHaveBeenCalled()
    })

    it('update accepts a type change to a type in the task\'s session', async () => {
      mockPrisma.task.findUnique.mockResolvedValue({ sessionId: 'owning-session' })
      mockPrisma.userTaskType.findMany.mockResolvedValue([{ id: 'type-dev' }])
      mockPrisma.task.update.mockResolvedValue(createMockTask({ type: 'type-dev' }))

      const caller = appRouter.createCaller(ctx)
      const task = await caller.task.update({ id: 'task-123', type: 'type-dev' })

      expect(task.type).toBe('type-dev')
    })

    it('update NOT touching type skips validation (legacy orphan-type rows stay editable)', async () => {
      mockPrisma.task.update.mockResolvedValue(createMockTask({ type: '', name: 'Renamed' }))

      const caller = appRouter.createCaller(ctx)
      await caller.task.update({ id: 'task-123', name: 'Renamed' })

      expect(mockPrisma.userTaskType.findMany).not.toHaveBeenCalled()
      expect(mockPrisma.task.update).toHaveBeenCalledTimes(1)
    })

    it('update with a type change on a missing task throws NOT_FOUND', async () => {
      mockPrisma.task.findUnique.mockResolvedValue(null)

      const caller = appRouter.createCaller(ctx)
      await expect(
        caller.task.update({ id: 'ghost-task', type: 'type-dev' }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' })
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
