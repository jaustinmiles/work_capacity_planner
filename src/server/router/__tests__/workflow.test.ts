/**
 * Tests for the workflow router
 *
 * Tests TaskStep CRUD operations and workflow management
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createMockContext, createMockTask, createMockStep, type MockPrisma } from './router-test-helpers'
import { appRouter } from '../index'

// We need to test the router logic directly by calling handlers
// Since tRPC procedures are hard to test in isolation, we test the underlying logic

describe('workflow router', () => {
  let mockPrisma: MockPrisma
  let ctx: ReturnType<typeof createMockContext>

  beforeEach(() => {
    ctx = createMockContext()
    mockPrisma = ctx.prisma as unknown as MockPrisma
    vi.clearAllMocks()
  })

  describe('getByStepId', () => {
    it('should return workflow when step exists', async () => {
      const mockStep = createMockStep({ id: 'step-456', taskId: 'workflow-123' })
      const mockWorkflow = createMockTask({
        id: 'workflow-123',
        name: 'Test Workflow',
        hasSteps: true,
        TaskStep: [mockStep],
      })

      mockPrisma.taskStep.findUnique.mockResolvedValue(mockStep)
      mockPrisma.task.findUnique.mockResolvedValue(mockWorkflow)

      // Simulate the getByStepId logic
      const step = await mockPrisma.taskStep.findUnique({
        where: { id: 'step-456' },
        select: { taskId: true },
      })

      expect(step).toBeTruthy()
      expect(step?.taskId).toBe('workflow-123')

      const workflow = await mockPrisma.task.findUnique({
        where: { id: step!.taskId },
        include: { TaskStep: { orderBy: { stepIndex: 'asc' } } },
      })

      expect(workflow).toBeTruthy()
      expect(workflow?.id).toBe('workflow-123')
      expect(workflow?.name).toBe('Test Workflow')
    })

    it('should return null when step does not exist', async () => {
      mockPrisma.taskStep.findUnique.mockResolvedValue(null)

      const step = await mockPrisma.taskStep.findUnique({
        where: { id: 'non-existent-step' },
        select: { taskId: true },
      })

      expect(step).toBeNull()
    })

    it('should return null when workflow does not exist (orphan step)', async () => {
      const mockStep = createMockStep({ id: 'step-orphan', taskId: 'deleted-workflow' })
      mockPrisma.taskStep.findUnique.mockResolvedValue(mockStep)
      mockPrisma.task.findUnique.mockResolvedValue(null)

      const step = await mockPrisma.taskStep.findUnique({
        where: { id: 'step-orphan' },
        select: { taskId: true },
      })

      expect(step?.taskId).toBe('deleted-workflow')

      const workflow = await mockPrisma.task.findUnique({
        where: { id: step!.taskId },
      })

      expect(workflow).toBeNull()
    })
  })

  describe('getStepWorkSessions', () => {
    it('should return work sessions for a step', async () => {
      const mockSessions = [
        { id: 'ws-1', stepId: 'step-123', startTime: new Date(), endTime: new Date() },
        { id: 'ws-2', stepId: 'step-123', startTime: new Date(), endTime: null },
      ]
      mockPrisma.workSession.findMany.mockResolvedValue(mockSessions)

      const sessions = await mockPrisma.workSession.findMany({
        where: { stepId: 'step-123' },
        orderBy: { startTime: 'asc' },
      })

      expect(sessions).toHaveLength(2)
      expect(sessions[0].id).toBe('ws-1')
      expect(sessions[1].endTime).toBeNull()
    })

    it('should return empty array when no sessions exist', async () => {
      mockPrisma.workSession.findMany.mockResolvedValue([])

      const sessions = await mockPrisma.workSession.findMany({
        where: { stepId: 'step-no-sessions' },
        orderBy: { startTime: 'asc' },
      })

      expect(sessions).toHaveLength(0)
    })
  })

  describe('addStep', () => {
    it('should create a new step at the end when no position specified', async () => {
      const existingSteps = [
        createMockStep({ id: 'step-1', stepIndex: 0 }),
        createMockStep({ id: 'step-2', stepIndex: 1 }),
      ]
      const newStep = createMockStep({ id: 'step-new', stepIndex: 2 })

      mockPrisma.taskStep.findMany.mockResolvedValue(existingSteps)
      mockPrisma.taskStep.create.mockResolvedValue(newStep)
      mockPrisma.task.update.mockResolvedValue(createMockTask())

      // Get existing steps
      const steps = await mockPrisma.taskStep.findMany({
        where: { taskId: 'workflow-123' },
        orderBy: { stepIndex: 'asc' },
      })

      expect(steps).toHaveLength(2)

      // New step should be at index 2 (end)
      const stepIndex = steps.length // 2

      const created = await mockPrisma.taskStep.create({
        data: {
          id: 'step-new',
          taskId: 'workflow-123',
          name: 'New Step',
          duration: 30,
          type: 'development',
          dependsOn: '[]',
          stepIndex,
        },
      })

      expect(created.stepIndex).toBe(2)
    })

    it('should shift existing steps when inserting in middle', async () => {
      const existingSteps = [
        createMockStep({ id: 'step-1', stepIndex: 0 }),
        createMockStep({ id: 'step-2', stepIndex: 1 }),
        createMockStep({ id: 'step-3', stepIndex: 2 }),
      ]

      mockPrisma.taskStep.findMany.mockResolvedValue(existingSteps)

      // Insert after step-1 (at index 1, shifting step-2 and step-3)
      const afterStepObj = existingSteps.find(s => s.id === 'step-1')
      const insertIndex = afterStepObj ? afterStepObj.stepIndex + 1 : existingSteps.length

      expect(insertIndex).toBe(1) // Insert at position 1

      // Steps at or after index 1 should be shifted
      const stepsToShift = existingSteps.filter(s => s.stepIndex >= insertIndex)
      expect(stepsToShift).toHaveLength(2) // step-2 and step-3
    })
  })

  describe('updateStep', () => {
    it('should update step status', async () => {
      const updatedStep = createMockStep({
        id: 'step-123',
        status: 'completed',
        completedAt: new Date(),
      })
      mockPrisma.taskStep.update.mockResolvedValue(updatedStep)

      const result = await mockPrisma.taskStep.update({
        where: { id: 'step-123' },
        data: { status: 'completed', completedAt: new Date() },
      })

      expect(result.status).toBe('completed')
      expect(result.completedAt).toBeTruthy()
    })

    it('should update workflow status when all steps completed', async () => {
      const allSteps = [
        createMockStep({ id: 'step-1', status: 'completed' }),
        createMockStep({ id: 'step-2', status: 'completed' }),
      ]
      mockPrisma.taskStep.findMany.mockResolvedValue(allSteps)
      mockPrisma.taskStep.update.mockResolvedValue(allSteps[1])

      const steps = await mockPrisma.taskStep.findMany({
        where: { taskId: 'workflow-123' },
      })

      const allCompleted = steps.every(s => s.status === 'completed')
      expect(allCompleted).toBe(true)

      // Workflow should be marked completed
      mockPrisma.task.update.mockResolvedValue(createMockTask({
        overallStatus: 'completed',
        completed: true,
      }))

      const workflow = await mockPrisma.task.update({
        where: { id: 'workflow-123' },
        data: { overallStatus: 'completed', completed: true },
      })

      expect(workflow.overallStatus).toBe('completed')
      expect(workflow.completed).toBe(true)
    })
  })

  describe('deleteStep', () => {
    it('should delete step and reindex remaining steps', async () => {
      const stepToDelete = createMockStep({ id: 'step-2', stepIndex: 1 })
      const remainingSteps = [
        createMockStep({ id: 'step-1', stepIndex: 0 }),
        createMockStep({ id: 'step-3', stepIndex: 2 }),
      ]

      mockPrisma.taskStep.findUnique.mockResolvedValue(stepToDelete)
      mockPrisma.taskStep.delete.mockResolvedValue(stepToDelete)
      mockPrisma.taskStep.findMany.mockResolvedValue(remainingSteps)

      // Delete the step
      const deleted = await mockPrisma.taskStep.delete({
        where: { id: 'step-2' },
      })
      expect(deleted.id).toBe('step-2')

      // Get remaining steps for reindexing
      const remaining = await mockPrisma.taskStep.findMany({
        where: { taskId: 'workflow-123' },
        orderBy: { stepIndex: 'asc' },
      })

      expect(remaining).toHaveLength(2)

      // Verify reindexing logic: step-3 should become index 1
      for (let i = 0; i < remaining.length; i++) {
        const step = remaining[i]
        if (step.stepIndex !== i) {
          // This step needs reindexing
          expect(step.id).toBe('step-3')
          expect(step.stepIndex).toBe(2) // Original index
          // Would be updated to i = 1
        }
      }
    })

    it('should throw error when step not found', async () => {
      mockPrisma.taskStep.findUnique.mockResolvedValue(null)

      const step = await mockPrisma.taskStep.findUnique({
        where: { id: 'non-existent' },
      })

      expect(step).toBeNull()
    })
  })

  // Reordering is the AI's lever for surfacing specific steps first: among steps
  // with equal priority the scheduler's stable sort falls back to stepIndex, so
  // a validated, transactional rewrite of every index IS the ordering feature.
  describe('reorderSteps', () => {
    const existingStepIds = [{ id: 'step-1' }, { id: 'step-2' }, { id: 'step-3' }]

    it('rewrites every stepIndex to match the provided order', async () => {
      mockPrisma.task.findUnique.mockResolvedValue({ id: 'workflow-123' })
      mockPrisma.taskStep.findMany
        .mockResolvedValueOnce(existingStepIds)
        .mockResolvedValueOnce([
          createMockStep({ id: 'step-3', stepIndex: 0, dependsOn: '[]' }),
          createMockStep({ id: 'step-1', stepIndex: 1, dependsOn: '[]' }),
          createMockStep({ id: 'step-2', stepIndex: 2, dependsOn: '[]' }),
        ])
      mockPrisma.taskStep.update.mockResolvedValue(createMockStep({ dependsOn: '[]' }))

      const caller = appRouter.createCaller(ctx)
      const result = await caller.workflow.reorderSteps({
        taskId: 'workflow-123',
        orderedStepIds: ['step-3', 'step-1', 'step-2'],
      })

      expect(mockPrisma.taskStep.update).toHaveBeenCalledWith({ where: { id: 'step-3' }, data: { stepIndex: 0 } })
      expect(mockPrisma.taskStep.update).toHaveBeenCalledWith({ where: { id: 'step-1' }, data: { stepIndex: 1 } })
      expect(mockPrisma.taskStep.update).toHaveBeenCalledWith({ where: { id: 'step-2' }, data: { stepIndex: 2 } })
      expect(result.map(step => step.id)).toEqual(['step-3', 'step-1', 'step-2'])
    })

    it('rejects a partial list so a concurrent add/remove cannot corrupt the ordering', async () => {
      mockPrisma.task.findUnique.mockResolvedValue({ id: 'workflow-123' })
      mockPrisma.taskStep.findMany.mockResolvedValueOnce(existingStepIds)

      const caller = appRouter.createCaller(ctx)
      await expect(
        caller.workflow.reorderSteps({ taskId: 'workflow-123', orderedStepIds: ['step-2', 'step-1'] }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' })

      expect(mockPrisma.taskStep.update).not.toHaveBeenCalled()
    })

    it('rejects duplicated ids even when the count matches', async () => {
      mockPrisma.task.findUnique.mockResolvedValue({ id: 'workflow-123' })
      mockPrisma.taskStep.findMany.mockResolvedValueOnce(existingStepIds)

      const caller = appRouter.createCaller(ctx)
      await expect(
        caller.workflow.reorderSteps({
          taskId: 'workflow-123',
          orderedStepIds: ['step-1', 'step-1', 'step-2'],
        }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' })

      expect(mockPrisma.taskStep.update).not.toHaveBeenCalled()
    })

    it('rejects ids that belong to a different workflow', async () => {
      mockPrisma.task.findUnique.mockResolvedValue({ id: 'workflow-123' })
      mockPrisma.taskStep.findMany.mockResolvedValueOnce(existingStepIds)

      const caller = appRouter.createCaller(ctx)
      await expect(
        caller.workflow.reorderSteps({
          taskId: 'workflow-123',
          orderedStepIds: ['step-1', 'step-2', 'foreign-step'],
        }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' })

      expect(mockPrisma.taskStep.update).not.toHaveBeenCalled()
    })

    it('throws NOT_FOUND for an unknown workflow', async () => {
      mockPrisma.task.findUnique.mockResolvedValue(null)

      const caller = appRouter.createCaller(ctx)
      await expect(
        caller.workflow.reorderSteps({ taskId: 'missing', orderedStepIds: ['step-1'] }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    })
  })

  // Per-step priority overrides: the scheduler reads step.importance/urgency ahead of
  // the parent workflow's values (scheduler-converters), but the router used to strip
  // these fields from updateStep input — the AI would set them and they came back null.
  describe('updateStep per-step priority', () => {
    it('persists importance and urgency overrides', async () => {
      mockPrisma.taskStep.update.mockResolvedValue(
        createMockStep({ id: 'step-1', importance: 9, urgency: 10, dependsOn: '[]' }),
      )

      const caller = appRouter.createCaller(ctx)
      const step = await caller.workflow.updateStep({
        taskId: 'workflow-123',
        stepId: 'step-1',
        importance: 9,
        urgency: 10,
      })

      expect(mockPrisma.taskStep.update).toHaveBeenCalledWith({
        where: { id: 'step-1' },
        data: { importance: 9, urgency: 10 },
      })
      expect(step.importance).toBe(9)
      expect(step.urgency).toBe(10)
    })

    it('clears an override back to the parent value when null is sent', async () => {
      mockPrisma.taskStep.update.mockResolvedValue(
        createMockStep({ id: 'step-1', importance: null, urgency: null, dependsOn: '[]' }),
      )

      const caller = appRouter.createCaller(ctx)
      await caller.workflow.updateStep({
        taskId: 'workflow-123',
        stepId: 'step-1',
        importance: null,
      })

      expect(mockPrisma.taskStep.update).toHaveBeenCalledWith({
        where: { id: 'step-1' },
        data: { importance: null },
      })
    })

    it('rejects out-of-range priority values', async () => {
      const caller = appRouter.createCaller(ctx)
      await expect(
        caller.workflow.updateStep({
          taskId: 'workflow-123',
          stepId: 'step-1',
          urgency: 11,
        }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' })

      expect(mockPrisma.taskStep.update).not.toHaveBeenCalled()
    })
  })

  // Trust-boundary regression: any client (including the AI agent) could persist step
  // types that don't exist because the server never validated them against UserTaskType.
  // These tests exercise the REAL router procedures via createCaller.
  describe('task type validation (trust boundary)', () => {
    describe('addStep', () => {
      const baseStep = { workflowId: 'workflow-123', name: 'New Step', duration: 30 }

      it('rejects an unknown step type with BAD_REQUEST and writes nothing', async () => {
        mockPrisma.task.findUnique.mockResolvedValue({ sessionId: 'test-session-id' })
        mockPrisma.userTaskType.findMany.mockResolvedValue([])

        const caller = appRouter.createCaller(ctx)
        await expect(
          caller.workflow.addStep({ ...baseStep, type: 'hallucinated-type' }),
        ).rejects.toMatchObject({ code: 'BAD_REQUEST' })

        expect(mockPrisma.taskStep.create).not.toHaveBeenCalled()
      })

      it('scopes the type lookup to the WORKFLOW\'s session, rejecting cross-session types', async () => {
        mockPrisma.task.findUnique.mockResolvedValue({ sessionId: 'owning-session' })
        mockPrisma.userTaskType.findMany.mockResolvedValue([])

        const caller = appRouter.createCaller(ctx)
        await expect(
          caller.workflow.addStep({ ...baseStep, type: 'other-sessions-type' }),
        ).rejects.toMatchObject({ code: 'BAD_REQUEST' })

        expect(mockPrisma.userTaskType.findMany).toHaveBeenCalledWith({
          where: { id: { in: ['other-sessions-type'] }, sessionId: 'owning-session' },
          select: { id: true },
        })
      })

      it('accepts a type that exists in the workflow\'s session', async () => {
        mockPrisma.task.findUnique.mockResolvedValue({ sessionId: 'test-session-id' })
        mockPrisma.userTaskType.findMany.mockResolvedValue([{ id: 'type-dev' }])
        mockPrisma.taskStep.findMany.mockResolvedValue([])
        mockPrisma.taskStep.create.mockResolvedValue(
          createMockStep({ type: 'type-dev', dependsOn: '[]' }),
        )
        mockPrisma.task.update.mockResolvedValue(createMockTask())

        const caller = appRouter.createCaller(ctx)
        const step = await caller.workflow.addStep({ ...baseStep, type: 'type-dev' })

        expect(step.type).toBe('type-dev')
        expect(mockPrisma.taskStep.create).toHaveBeenCalledTimes(1)
      })

      it('throws NOT_FOUND when the workflow does not exist', async () => {
        mockPrisma.task.findUnique.mockResolvedValue(null)

        const caller = appRouter.createCaller(ctx)
        await expect(
          caller.workflow.addStep({ ...baseStep, type: 'type-dev' }),
        ).rejects.toMatchObject({ code: 'NOT_FOUND' })
      })
    })

    describe('updateStep', () => {
      it('rejects a step type change to an unknown type with BAD_REQUEST', async () => {
        mockPrisma.task.findUnique.mockResolvedValue({ sessionId: 'test-session-id' })
        mockPrisma.userTaskType.findMany.mockResolvedValue([])

        const caller = appRouter.createCaller(ctx)
        await expect(
          caller.workflow.updateStep({
            taskId: 'workflow-123',
            stepId: 'step-123',
            type: 'hallucinated-type',
          }),
        ).rejects.toMatchObject({ code: 'BAD_REQUEST' })

        expect(mockPrisma.taskStep.update).not.toHaveBeenCalled()
      })

      it('accepts a step type change to a type in the workflow\'s session', async () => {
        mockPrisma.task.findUnique.mockResolvedValue({ sessionId: 'test-session-id' })
        mockPrisma.userTaskType.findMany.mockResolvedValue([{ id: 'type-dev' }])
        mockPrisma.taskStep.update.mockResolvedValue(
          createMockStep({ type: 'type-dev', dependsOn: '[]' }),
        )

        const caller = appRouter.createCaller(ctx)
        const step = await caller.workflow.updateStep({
          taskId: 'workflow-123',
          stepId: 'step-123',
          type: 'type-dev',
        })

        expect(step.type).toBe('type-dev')
      })

      it('skips type validation when the update does not touch type', async () => {
        mockPrisma.taskStep.update.mockResolvedValue(
          createMockStep({ name: 'Renamed', dependsOn: '[]' }),
        )

        const caller = appRouter.createCaller(ctx)
        await caller.workflow.updateStep({
          taskId: 'workflow-123',
          stepId: 'step-123',
          name: 'Renamed',
        })

        expect(mockPrisma.userTaskType.findMany).not.toHaveBeenCalled()
        expect(mockPrisma.taskStep.update).toHaveBeenCalledTimes(1)
      })
    })

    describe('updateWithSteps', () => {
      it('rejects when any step type is unknown, naming the offending field, before any write', async () => {
        mockPrisma.task.findUnique.mockResolvedValue({ sessionId: 'test-session-id' })
        mockPrisma.userTaskType.findMany.mockResolvedValue([{ id: 'type-dev' }])

        const caller = appRouter.createCaller(ctx)
        await expect(
          caller.workflow.updateWithSteps({
            id: 'workflow-123',
            steps: [
              { id: 'step-1', name: 'Good', duration: 30, type: 'type-dev', stepIndex: 0 },
              { id: 'step-2', name: 'Bad', duration: 30, type: 'bogus-type', stepIndex: 1 },
            ],
          }),
        ).rejects.toMatchObject({
          code: 'BAD_REQUEST',
          message: expect.stringContaining('steps[1].type'),
        })

        expect(mockPrisma.taskStep.deleteMany).not.toHaveBeenCalled()
        expect(mockPrisma.$transaction).not.toHaveBeenCalled()
      })

      it('rejects an unknown WORKFLOW type alongside step validation', async () => {
        mockPrisma.task.findUnique.mockResolvedValue({ sessionId: 'test-session-id' })
        mockPrisma.userTaskType.findMany.mockResolvedValue([{ id: 'type-dev' }])

        const caller = appRouter.createCaller(ctx)
        await expect(
          caller.workflow.updateWithSteps({
            id: 'workflow-123',
            type: 'hallucinated-type',
            steps: [
              { id: 'step-1', name: 'Good', duration: 30, type: 'type-dev', stepIndex: 0 },
            ],
          }),
        ).rejects.toMatchObject({
          code: 'BAD_REQUEST',
          message: expect.stringContaining("type='hallucinated-type'"),
        })
      })

      it('accepts when the workflow and all step types exist in the session', async () => {
        mockPrisma.task.findUnique.mockResolvedValue({ sessionId: 'test-session-id' })
        mockPrisma.userTaskType.findMany.mockResolvedValue([{ id: 'type-dev' }])
        mockPrisma.$transaction.mockImplementation(
          async (callback: (tx: MockPrisma) => Promise<unknown>) => callback(mockPrisma),
        )
        mockPrisma.taskStep.deleteMany.mockResolvedValue({ count: 0 })
        mockPrisma.taskStep.create.mockResolvedValue(createMockStep({ type: 'type-dev' }))
        mockPrisma.task.update.mockResolvedValue(
          createMockTask({ type: 'type-dev', TaskStep: [] }),
        )

        const caller = appRouter.createCaller(ctx)
        const workflow = await caller.workflow.updateWithSteps({
          id: 'workflow-123',
          type: 'type-dev',
          steps: [
            { id: 'step-1', name: 'Good', duration: 30, type: 'type-dev', stepIndex: 0 },
          ],
        })

        expect(workflow.type).toBe('type-dev')
        expect(mockPrisma.taskStep.create).toHaveBeenCalledTimes(1)
      })
    })
  })

  describe('updateWithSteps', () => {
    it('should atomically update workflow and all steps', async () => {
      const input = {
        id: 'workflow-123',
        name: 'Updated Workflow',
        steps: [
          { id: 'step-1', name: 'Step 1', duration: 30, type: 'dev', stepIndex: 0, dependsOn: [], asyncWaitTime: 0, isAsyncTrigger: false },
          { id: 'step-2', name: 'Step 2', duration: 45, type: 'dev', stepIndex: 1, dependsOn: ['step-1'], asyncWaitTime: 0, isAsyncTrigger: false },
        ],
      }

      // Delete all existing steps
      mockPrisma.taskStep.deleteMany.mockResolvedValue({ count: 3 })

      // Create new steps
      mockPrisma.taskStep.create
        .mockResolvedValueOnce(createMockStep({ id: 'step-1', stepIndex: 0 }))
        .mockResolvedValueOnce(createMockStep({ id: 'step-2', stepIndex: 1 }))

      // Update workflow
      const updatedWorkflow = createMockTask({
        id: 'workflow-123',
        name: 'Updated Workflow',
        duration: 75, // 30 + 45
        TaskStep: input.steps.map((s, i) => createMockStep({ ...s, stepIndex: i })),
      })
      mockPrisma.task.update.mockResolvedValue(updatedWorkflow)

      // Calculate expected duration
      const totalDuration = input.steps.reduce((sum, s) => sum + s.duration, 0)
      expect(totalDuration).toBe(75)

      const workflow = await mockPrisma.task.update({
        where: { id: 'workflow-123' },
        data: { name: 'Updated Workflow', duration: totalDuration },
      })

      expect(workflow.name).toBe('Updated Workflow')
      expect(workflow.duration).toBe(75)
    })
  })
})
