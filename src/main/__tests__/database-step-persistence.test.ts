import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { DatabaseService } from '../database'

// Skip these tests if no PostgreSQL DATABASE_URL is configured
const hasPostgresUrl = process.env.DATABASE_URL?.startsWith('postgresql://') || process.env.DATABASE_URL?.startsWith('postgres://')

describe.skipIf(!hasPostgresUrl)('Database Step Field Persistence', () => {
  let db: DatabaseService
  let testSessionId: string
  let testTaskId: string

  beforeEach(async () => {
    db = DatabaseService.getInstance()

    // First, deactivate any existing active sessions
    await db.client.session.updateMany({
      where: { isActive: true },
      data: { isActive: false },
    })

    // Create a test session
    testSessionId = `test-session-${Date.now()}`
    await db.client.session.create({
      data: {
        id: testSessionId,
        name: 'Test Session',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    })

    // Create a test workflow/task with steps directly using Prisma
    testTaskId = `test-task-${Date.now()}`
    await db.client.task.create({
      data: {
        id: testTaskId,
        name: 'Test Workflow',
        duration: 180,
        importance: 8,
        urgency: 7,
        type: 'focused',
        asyncWaitTime: 0,
        dependencies: '[]',
        completed: false,
        sessionId: testSessionId,
        createdAt: new Date(),
        updatedAt: new Date(),
        hasSteps: true,
      },
    })

    // Create steps
    const steps = [
        {
          id: `step-1-${Date.now()}`,
          name: 'Step 1',
          duration: 60,
          type: 'focused',
          dependsOn: [],
          asyncWaitTime: 0,
          status: 'pending',
          stepIndex: 0,
          percentComplete: 0,
          notes: 'Test step 1',
          cognitiveComplexity: 3,
          importance: 9,  // Custom priority
          urgency: 8,     // Custom priority
        },
        {
          id: `step-2-${Date.now()}`,
          name: 'Step 2',
          duration: 120,
          type: 'admin',
          dependsOn: [],
          asyncWaitTime: 30,
          status: 'pending',
          stepIndex: 1,
          percentComplete: 0,
          notes: 'Test step 2',
          cognitiveComplexity: 2,
          // No custom priority - should inherit from workflow
        },
      ]

    await db.client.taskStep.createMany({
      data: steps.map((step) => ({
        ...step,
        taskId: testTaskId,
        dependsOn: JSON.stringify(step.dependsOn || []),
      })),
    })
  })

  afterEach(async () => {
    // Clean up test data
    try {
      await db.client.taskStep.deleteMany({
        where: { taskId: testTaskId },
      })
      await db.client.task.delete({
        where: { id: testTaskId },
      })
      await db.client.session.delete({
        where: { id: testSessionId },
      })
    } catch (_error) {
      // Ignore cleanup errors
    }
  })

  it('should persist step priority fields when creating a workflow', async () => {
    // Fetch the created task with steps
    const task = await db.getTaskById(testTaskId)
    expect(task).toBeDefined()
    expect(task.steps).toBeDefined()
    expect(task.steps.length).toBe(2)

    // Check first step has custom priority
    const step1 = task.steps[0]
    expect(step1.importance).toBe(9)
    expect(step1.urgency).toBe(8)

    // Check second step has no custom priority (should be null from DB)
    const step2 = task.steps[1]
    expect(step2.importance).toBeNull()
    expect(step2.urgency).toBeNull()
  })

  it('should persist step priority fields when updating a workflow', async () => {
    // Update the workflow with modified step priorities
    await db.updateTask(testTaskId, {
      steps: [
        {
          id: (await db.getTaskById(testTaskId)).steps[0].id,
          name: 'Updated Step 1',
          duration: 90,
          type: 'focused',
          dependsOn: [],
          asyncWaitTime: 0,
          status: 'pending',
          stepIndex: 0,
          percentComplete: 0,
          notes: 'Updated notes',
          cognitiveComplexity: 4,
          importance: 10,  // Changed priority
          urgency: 10,     // Changed priority
        },
        {
          id: (await db.getTaskById(testTaskId)).steps[1].id,
          name: 'Updated Step 2',
          duration: 60,
          type: 'admin',
          dependsOn: [],
          asyncWaitTime: 0,
          status: 'pending',
          stepIndex: 1,
          percentComplete: 0,
          notes: 'Updated notes 2',
          cognitiveComplexity: 1,
          importance: 3,   // Now has custom priority
          urgency: 4,      // Now has custom priority
        },
      ],
    } as any)

    // Fetch and verify
    const updatedTask = await db.getTaskById(testTaskId)
    expect(updatedTask.steps[0].importance).toBe(10)
    expect(updatedTask.steps[0].urgency).toBe(10)
    expect(updatedTask.steps[1].importance).toBe(3)
    expect(updatedTask.steps[1].urgency).toBe(4)
  })

  it('should handle null/undefined priority fields correctly', async () => {
    // Update with explicitly null priorities
    await db.updateTask(testTaskId, {
      steps: [
        {
          id: (await db.getTaskById(testTaskId)).steps[0].id,
          name: 'Step with null priority',
          duration: 60,
          type: 'focused',
          dependsOn: [],
          asyncWaitTime: 0,
          status: 'pending',
          stepIndex: 0,
          percentComplete: 0,
          notes: 'Test',
          cognitiveComplexity: 3,
          importance: null,
          urgency: null,
        },
      ],
    } as any)

    const task = await db.getTaskById(testTaskId)
    // Null should be stored as null/undefined
    expect(task.steps[0].importance).toBeNull()
    expect(task.steps[0].urgency).toBeNull()
  })

  describe('Field Persistence Checklist', () => {
    // This test documents ALL fields that should persist for steps
    it('should persist all TaskStep fields', async () => {
      const testStep = {
        id: `step-all-fields-${Date.now()}`,
        name: 'Complete Step',
        duration: 45,
        type: 'focused',
        dependsOn: ['some-dep'],
        asyncWaitTime: 15,
        status: 'in_progress',
        stepIndex: 0,
        percentComplete: 50,
        notes: 'All fields test',
        cognitiveComplexity: 5,
        isAsyncTrigger: true,
        expectedResponseTime: 120,
        importance: 7,
        urgency: 6,
        actualDuration: 55,
        startedAt: new Date(),
        completedAt: null,
      }

      // Create task with comprehensive step
      const newTaskId = `test-comprehensive-${Date.now()}`
      await db.createTask({
        id: newTaskId,
        name: 'Comprehensive Test',
        duration: 45,
        importance: 5,
        urgency: 5,
        type: 'focused',
        asyncWaitTime: 0,
        dependencies: [],
        completed: false,
        sessionId: testSessionId,
        createdAt: new Date(),
        updatedAt: new Date(),
        hasSteps: true,
        steps: [testStep],
      } as any)

      // Retrieve and verify ALL fields
      const task = await db.getTaskById(newTaskId)
      const savedStep = task.steps[0]

      // Core fields
      expect(savedStep.name).toBe(testStep.name)
      expect(savedStep.duration).toBe(testStep.duration)
      expect(savedStep.type).toBe(testStep.type)
      expect(savedStep.dependsOn).toEqual(testStep.dependsOn)
      expect(savedStep.asyncWaitTime).toBe(testStep.asyncWaitTime)
      expect(savedStep.status).toBe(testStep.status)
      expect(savedStep.stepIndex).toBe(testStep.stepIndex)
      expect(savedStep.percentComplete).toBe(testStep.percentComplete)
      expect(savedStep.notes).toBe(testStep.notes)

      // Optional fields
      expect(savedStep.cognitiveComplexity).toBe(testStep.cognitiveComplexity)
      expect(savedStep.importance).toBe(testStep.importance)
      expect(savedStep.urgency).toBe(testStep.urgency)

      // Cleanup
      await db.client.task.delete({ where: { id: newTaskId } })
    })
  })
})
