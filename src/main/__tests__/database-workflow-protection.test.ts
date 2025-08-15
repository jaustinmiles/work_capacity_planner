import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { PrismaClient } from '@prisma/client'
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

describe('Database - Workflow Protection Tests', () => {
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

  describe('Critical: Workflow Formatting', () => {
    it('MUST return workflows with steps array when calling getSequencedTasks', async () => {
      // This test protects against the critical bug where workflows were returned without steps
      const mockWorkflow = {
        id: 'workflow-1',
        name: 'Critical Workflow',
        hasSteps: true,
        duration: 180,
        criticalPathDuration: 240,
        worstCaseDuration: 300,
        overallStatus: 'not_started',
        dependencies: '[]',
        type: 'focused',
        importance: 8,
        urgency: 7,
        sessionId: 'test-session',
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
          {
            id: 'step-2',
            taskId: 'workflow-1',
            name: 'Step 2',
            duration: 120,
            type: 'admin',
            dependsOn: '["step-1"]',
            asyncWaitTime: 60,
            status: 'pending',
            stepIndex: 1,
            percentComplete: 0,
          },
        ],
      }

      mockPrisma.task.findMany.mockResolvedValue([mockWorkflow])

      const sequencedTasks = await db.getSequencedTasks()

      // Critical assertions - these MUST pass or workflows break
      expect(sequencedTasks).toHaveLength(1)
      expect(sequencedTasks[0].steps).toBeDefined()
      expect(sequencedTasks[0].steps).toHaveLength(2)
      expect(sequencedTasks[0].totalDuration).toBe(180)
      expect(sequencedTasks[0].steps[0].name).toBe('Step 1')
      expect(sequencedTasks[0].steps[1].name).toBe('Step 2')
      expect(sequencedTasks[0].steps[1].dependsOn).toEqual(['step-1'])
    })

    it('MUST include steps when calling getTasks for workflows', async () => {
      const mockWorkflowTask = {
        id: 'task-workflow-1',
        name: 'Workflow as Task',
        hasSteps: true,
        duration: 90,
        TaskStep: [
          {
            id: 'step-a',
            taskId: 'task-workflow-1',
            name: 'Step A',
            duration: 45,
            type: 'focused',
            dependsOn: '[]',
            asyncWaitTime: 0,
            status: 'pending',
            stepIndex: 0,
            percentComplete: 0,
          },
          {
            id: 'step-b',
            taskId: 'task-workflow-1',
            name: 'Step B',
            duration: 45,
            type: 'admin',
            dependsOn: '["step-a"]',
            asyncWaitTime: 0,
            status: 'pending',
            stepIndex: 1,
            percentComplete: 0,
          },
        ],
        dependencies: '[]',
        type: 'focused',
        sessionId: 'test-session',
      }

      mockPrisma.task.findMany.mockResolvedValue([mockWorkflowTask])

      const tasks = await db.getTasks()

      // Critical: getTasks must include steps for workflows
      expect(tasks).toHaveLength(1)
      expect(tasks[0].hasSteps).toBe(true)
      expect(tasks[0].steps).toBeDefined()
      expect(tasks[0].steps).toHaveLength(2)
      expect(tasks[0].steps![0].name).toBe('Step A')
      expect(tasks[0].steps![1].name).toBe('Step B')
    })

    it('MUST properly separate workflows from regular tasks', async () => {
      const mockData = [
        {
          id: 'regular-task',
          name: 'Regular Task',
          hasSteps: false,
          duration: 60,
          dependencies: '[]',
          type: 'focused',
          sessionId: 'test-session',
        },
        {
          id: 'workflow-task',
          name: 'Workflow Task',
          hasSteps: true,
          duration: 120,
          TaskStep: [
            {
              id: 'step-1',
              taskId: 'workflow-task',
              name: 'Workflow Step',
              duration: 120,
              type: 'focused',
              dependsOn: '[]',
              asyncWaitTime: 0,
              status: 'pending',
              stepIndex: 0,
              percentComplete: 0,
            },
          ],
          dependencies: '[]',
          type: 'focused',
          sessionId: 'test-session',
        },
      ]

      mockPrisma.task.findMany.mockResolvedValue(mockData)

      const sequencedTasks = await db.getSequencedTasks()

      // Only workflows should be returned
      expect(sequencedTasks).toHaveLength(1)
      expect(sequencedTasks[0].id).toBe('workflow-task')
      expect(sequencedTasks[0].steps).toHaveLength(1)
    })

    it('MUST handle async wait times in workflow steps', async () => {
      const mockWorkflow = {
        id: 'async-workflow',
        name: 'Async Workflow',
        hasSteps: true,
        duration: 90,
        asyncWaitTime: 1440, // 24 hours total wait
        TaskStep: [
          {
            id: 'async-step-1',
            taskId: 'async-workflow',
            name: 'Submit for review',
            duration: 30,
            type: 'focused',
            dependsOn: '[]',
            asyncWaitTime: 1440, // 24 hour wait
            status: 'pending',
            stepIndex: 0,
            percentComplete: 0,
          },
          {
            id: 'async-step-2',
            taskId: 'async-workflow',
            name: 'Process feedback',
            duration: 60,
            type: 'focused',
            dependsOn: '["async-step-1"]',
            asyncWaitTime: 0,
            status: 'pending',
            stepIndex: 1,
            percentComplete: 0,
          },
        ],
        dependencies: '[]',
        type: 'focused',
        sessionId: 'test-session',
      }

      mockPrisma.task.findMany.mockResolvedValue([mockWorkflow])

      const sequencedTasks = await db.getSequencedTasks()

      expect(sequencedTasks[0].steps[0].asyncWaitTime).toBe(1440)
      expect(sequencedTasks[0].asyncWaitTime).toBe(1440)
    })
  })

  describe('Critical: Workflow Creation', () => {
    it('MUST create workflow with steps when using createSequencedTask', async () => {
      const workflowData = {
        name: 'New Workflow',
        duration: 150,
        importance: 7,
        urgency: 6,
        type: 'focused' as const,
        dependencies: [],
        steps: [
          {
            name: 'Step 1',
            duration: 50,
            type: 'focused' as const,
            dependsOn: [],
            asyncWaitTime: 0,
          },
          {
            name: 'Step 2',
            duration: 100,
            type: 'admin' as const,
            dependsOn: ['step-1'],
            asyncWaitTime: 30,
          },
        ],
      }

      const createdTask = {
        id: 'created-workflow',
        ...workflowData,
        hasSteps: true,
        sessionId: 'test-session',
        dependencies: '[]',
        overallStatus: 'not_started',
        criticalPathDuration: 150,
        worstCaseDuration: 150,
      }

      mockPrisma.task.create.mockResolvedValue(createdTask)
      mockPrisma.taskStep.createMany.mockResolvedValue({ count: 2 })
      mockPrisma.task.findUnique.mockResolvedValue({
        ...createdTask,
        TaskStep: [
          {
            id: 'created-step-1',
            taskId: 'created-workflow',
            name: 'Step 1',
            duration: 50,
            type: 'focused',
            dependsOn: '[]',
            asyncWaitTime: 0,
            status: 'pending',
            stepIndex: 0,
            percentComplete: 0,
          },
          {
            id: 'created-step-2',
            taskId: 'created-workflow',
            name: 'Step 2',
            duration: 100,
            type: 'admin',
            dependsOn: '["step-1"]',
            asyncWaitTime: 30,
            status: 'pending',
            stepIndex: 1,
            percentComplete: 0,
          },
        ],
      })

      const result = await db.createSequencedTask(workflowData)

      // Must return SequencedTask format with steps
      expect(result.steps).toBeDefined()
      expect(result.steps).toHaveLength(2)
      expect(result.totalDuration).toBe(150)
      expect(result.steps[0].name).toBe('Step 1')
      expect(result.steps[1].name).toBe('Step 2')
    })
  })

  describe('Critical: Workflow Updates', () => {
    it('MUST preserve steps when updating workflow', async () => {
      const existingWorkflow = {
        id: 'update-workflow',
        name: 'Updated Workflow',
        hasSteps: true,
        duration: 200,
        TaskStep: [
          {
            id: 'keep-step',
            taskId: 'update-workflow',
            name: 'Preserved Step',
            duration: 200,
            type: 'focused',
            dependsOn: '[]',
            asyncWaitTime: 0,
            status: 'pending',
            stepIndex: 0,
            percentComplete: 50,
          },
        ],
        dependencies: '[]',
        type: 'focused',
        sessionId: 'test-session',
      }

      mockPrisma.task.update.mockResolvedValue(existingWorkflow)

      const result = await db.updateSequencedTask('update-workflow', {
        name: 'Updated Workflow Name',
      })

      // Must return SequencedTask format with preserved steps
      expect(result.steps).toBeDefined()
      expect(result.steps).toHaveLength(1)
      expect(result.steps[0].name).toBe('Preserved Step')
      expect(result.steps[0].percentComplete).toBe(50)
    })
  })

  describe('Critical: Backwards Compatibility', () => {
    it('MUST handle both Task and SequencedTask interfaces transparently', async () => {
      // This ensures the unified model doesn't break existing UI code
      const mockWorkflow = {
        id: 'compat-workflow',
        name: 'Compatibility Test',
        hasSteps: true,
        duration: 100,
        criticalPathDuration: 100,
        worstCaseDuration: 100,
        overallStatus: 'not_started',
        TaskStep: [
          {
            id: 'compat-step',
            taskId: 'compat-workflow',
            name: 'Compatible Step',
            duration: 100,
            type: 'focused',
            dependsOn: '[]',
            asyncWaitTime: 0,
            status: 'pending',
            stepIndex: 0,
            percentComplete: 0,
          },
        ],
        dependencies: '[]',
        type: 'focused',
        sessionId: 'test-session',
      }

      mockPrisma.task.findMany.mockResolvedValue([mockWorkflow])

      // Test via getSequencedTasks (UI expects this)
      const sequencedTasks = await db.getSequencedTasks()
      expect(sequencedTasks[0].steps).toBeDefined()
      expect(sequencedTasks[0].totalDuration).toBeDefined()

      // Test via getTasks (also should work)
      const tasks = await db.getTasks()
      const workflow = tasks.find(t => t.hasSteps)
      expect(workflow?.steps).toBeDefined()
    })
  })
})
