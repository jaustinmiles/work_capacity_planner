import { describe, it, expect } from 'vitest'
import { createMockTask, createMockSequencedTask } from './test-utils'
import { TaskStatus, StepStatus } from './enums'

describe('test-utils', () => {
  describe('createMockTask', () => {
    it('should create a default task with all required fields', () => {
      const task = createMockTask()

      expect(task).toMatchObject({
        id: 'task-1',
        name: 'Test Task',
        duration: 60,
        importance: 5,
        urgency: 5,
        type: 'focused',
        asyncWaitTime: 0,
        dependencies: [],
        completed: false,
        sessionId: 'session-1',
        hasSteps: false,
        overallStatus: 'not_started',
        criticalPathDuration: 60,
        worstCaseDuration: 60,
      })

      expect(task.createdAt).toBeInstanceOf(Date)
      expect(task.updatedAt).toBeInstanceOf(Date)
    })

    it('should override default values with provided overrides', () => {
      const customDate = new Date('2025-01-01')
      const task = createMockTask({
        id: 'custom-id',
        name: 'Custom Task',
        duration: 120,
        importance: 8,
        urgency: 9,
        type: 'admin',
        completed: true,
        createdAt: customDate,
      })

      expect(task.id).toBe('custom-id')
      expect(task.name).toBe('Custom Task')
      expect(task.duration).toBe(120)
      expect(task.importance).toBe(8)
      expect(task.urgency).toBe(9)
      expect(task.type).toBe('admin')
      expect(task.completed).toBe(true)
      expect(task.createdAt).toBe(customDate)

      // Defaults should still be present
      expect(task.asyncWaitTime).toBe(0)
      expect(task.dependencies).toEqual([])
      expect(task.sessionId).toBe('session-1')
    })

    it('should allow partial overrides', () => {
      const task = createMockTask({ name: 'Partial Override' })

      expect(task.name).toBe('Partial Override')
      expect(task.id).toBe('task-1') // Default
      expect(task.duration).toBe(60) // Default
    })

    it('should handle all task types', () => {
      const focusedTask = createMockTask({ type: 'focused' })
      const adminTask = createMockTask({ type: 'admin' })
      const breakTask = createMockTask({ type: 'break' })

      expect(focusedTask.type).toBe('focused')
      expect(adminTask.type).toBe('admin')
      expect(breakTask.type).toBe('break')
    })

    it('should handle all task statuses', () => {
      const notStarted = createMockTask({ overallStatus: TaskStatus.NotStarted })
      const inProgress = createMockTask({ overallStatus: TaskStatus.InProgress })
      const completed = createMockTask({ overallStatus: TaskStatus.Completed })

      expect(notStarted.overallStatus).toBe('not_started')
      expect(inProgress.overallStatus).toBe('in_progress')
      expect(completed.overallStatus).toBe('completed')
    })

    it('should handle dependencies', () => {
      const task = createMockTask({
        dependencies: ['dep-1', 'dep-2', 'dep-3'],
      })

      expect(task.dependencies).toHaveLength(3)
      expect(task.dependencies).toEqual(['dep-1', 'dep-2', 'dep-3'])
    })

    it('should handle async wait time', () => {
      const task = createMockTask({
        asyncWaitTime: 30,
        duration: 60,
        criticalPathDuration: 90,
        worstCaseDuration: 120,
      })

      expect(task.asyncWaitTime).toBe(30)
      expect(task.criticalPathDuration).toBe(90)
      expect(task.worstCaseDuration).toBe(120)
    })

    it('should handle notes and additional fields', () => {
      const task = createMockTask({
        notes: 'Test notes',
        deadline: new Date('2025-12-31'),
      })

      expect(task.notes).toBe('Test notes')
      expect(task.deadline).toEqual(new Date('2025-12-31'))
    })
  })

  describe('createMockSequencedTask', () => {
    it('should create a default workflow with steps', () => {
      const workflow = createMockSequencedTask()

      expect(workflow).toMatchObject({
        id: 'workflow-1',
        name: 'Test Workflow',
        duration: 60, // Sum of step durations
        importance: 7,
        urgency: 6,
        type: 'focused',
        asyncWaitTime: 0,
        dependencies: [],
        completed: false,
        sessionId: 'session-1',
        hasSteps: true,
        overallStatus: 'not_started',
        criticalPathDuration: 60,
        worstCaseDuration: 90, // 60 * 1.5
      })

      expect(workflow.steps).toHaveLength(2)
      expect(workflow.createdAt).toBeInstanceOf(Date)
      expect(workflow.updatedAt).toBeInstanceOf(Date)
    })

    it('should create default steps when not provided', () => {
      const workflow = createMockSequencedTask()

      expect(workflow.steps).toHaveLength(2)

      const [step1, step2] = workflow.steps!

      expect(step1).toMatchObject({
        id: 'step-1',
        taskId: 'task-1', // Default task ID, not workflow ID
        name: 'Step 1',
        duration: 30,
        type: 'focused',
        dependsOn: [],
        asyncWaitTime: 0,
        status: 'pending',
        stepIndex: 0,
        percentComplete: 0,
      })

      expect(step2).toMatchObject({
        id: 'step-2',
        taskId: 'task-1', // Default task ID, not workflow ID
        name: 'Step 2',
        duration: 30,
        type: 'admin',
        dependsOn: ['step-1'],
        asyncWaitTime: 0,
        status: 'pending',
        stepIndex: 1,
        percentComplete: 0,
      })
    })

    it('should use custom steps when provided', () => {
      const customSteps = [
        {
          id: 'custom-step-1',
          taskId: 'workflow-2',
          name: 'Custom Step',
          duration: 45,
          type: 'focused' as const,
          dependsOn: [],
          asyncWaitTime: 15,
          status: StepStatus.InProgress,
          stepIndex: 0,
          percentComplete: 50,
        },
      ]

      const workflow = createMockSequencedTask({
        id: 'workflow-2',
        steps: customSteps,
      })

      expect(workflow.steps).toHaveLength(1)
      expect(workflow.steps![0]).toMatchObject(customSteps[0])
      expect(workflow.duration).toBe(45)
      expect(workflow.criticalPathDuration).toBe(60) // 45 + 15
      expect(workflow.worstCaseDuration).toBe(90) // 60 * 1.5
    })

    it('should calculate durations based on steps', () => {
      const steps = [
        {
          id: 'step-a',
          taskId: 'workflow-3',
          name: 'Step A',
          duration: 20,
          type: 'focused' as const,
          dependsOn: [],
          asyncWaitTime: 10,
          status: StepStatus.Pending,
          stepIndex: 0,
          percentComplete: 0,
        },
        {
          id: 'step-b',
          taskId: 'workflow-3',
          name: 'Step B',
          duration: 40,
          type: 'admin' as const,
          dependsOn: ['step-a'],
          asyncWaitTime: 20,
          status: StepStatus.Pending,
          stepIndex: 1,
          percentComplete: 0,
        },
        {
          id: 'step-c',
          taskId: 'workflow-3',
          name: 'Step C',
          duration: 15,
          type: 'break' as const,
          dependsOn: ['step-b'],
          asyncWaitTime: 5,
          status: StepStatus.Pending,
          stepIndex: 2,
          percentComplete: 0,
        },
      ]

      const workflow = createMockSequencedTask({
        id: 'workflow-3',
        steps,
      })

      expect(workflow.duration).toBe(75) // 20 + 40 + 15
      expect(workflow.criticalPathDuration).toBe(110) // 20 + 10 + 40 + 20 + 15 + 5
      expect(workflow.worstCaseDuration).toBe(165) // 110 * 1.5
    })

    it('should handle overrides properly', () => {
      const customDate = new Date('2025-06-01')
      const workflow = createMockSequencedTask({
        id: 'custom-workflow',
        name: 'Custom Workflow',
        importance: 10,
        urgency: 10,
        completed: true,
        notes: 'Custom notes',
        createdAt: customDate,
      })

      expect(workflow.id).toBe('custom-workflow')
      expect(workflow.name).toBe('Custom Workflow')
      expect(workflow.importance).toBe(10)
      expect(workflow.urgency).toBe(10)
      expect(workflow.completed).toBe(true)
      expect(workflow.notes).toBe('Custom notes')
      expect(workflow.createdAt).toBe(customDate)

      // Should still have default steps
      expect(workflow.steps).toHaveLength(2)
      expect(workflow.hasSteps).toBe(true)
    })

    it('should update step taskIds to match workflow id', () => {
      const workflow = createMockSequencedTask({
        id: 'my-workflow-id',
      })

      workflow.steps!.forEach(step => {
        expect(step.taskId).toBe('my-workflow-id')
      })
    })

    it('should handle empty steps array', () => {
      const workflow = createMockSequencedTask({
        steps: [],
      })

      expect(workflow.steps).toHaveLength(0)
      expect(workflow.duration).toBe(0)
      expect(workflow.criticalPathDuration).toBe(0)
      expect(workflow.worstCaseDuration).toBe(0)
    })

    it('should handle workflows with deadlines', () => {
      const deadline = new Date('2025-12-25')
      const workflow = createMockSequencedTask({
        deadline,
      })

      expect(workflow.deadline).toBe(deadline)
    })

    it('should preserve step dependencies', () => {
      const steps = [
        {
          id: 'parallel-1',
          taskId: 'workflow-4',
          name: 'Parallel Step 1',
          duration: 30,
          type: 'focused' as const,
          dependsOn: [],
          asyncWaitTime: 0,
          status: StepStatus.Pending,
          stepIndex: 0,
          percentComplete: 0,
        },
        {
          id: 'parallel-2',
          taskId: 'workflow-4',
          name: 'Parallel Step 2',
          duration: 30,
          type: 'admin' as const,
          dependsOn: [],
          asyncWaitTime: 0,
          status: StepStatus.Pending,
          stepIndex: 1,
          percentComplete: 0,
        },
        {
          id: 'dependent',
          taskId: 'workflow-4',
          name: 'Dependent Step',
          duration: 20,
          type: 'focused' as const,
          dependsOn: ['parallel-1', 'parallel-2'],
          asyncWaitTime: 0,
          status: StepStatus.Pending,
          stepIndex: 2,
          percentComplete: 0,
        },
      ]

      const workflow = createMockSequencedTask({
        id: 'workflow-4',
        steps,
      })

      expect(workflow.steps![2].dependsOn).toEqual(['parallel-1', 'parallel-2'])
    })

    it('should handle step status variations', () => {
      const steps = [
        {
          id: 'completed-step',
          taskId: 'workflow-5',
          name: 'Completed Step',
          duration: 30,
          type: 'focused' as const,
          dependsOn: [],
          asyncWaitTime: 0,
          status: StepStatus.Completed,
          stepIndex: 0,
          percentComplete: 100,
        },
        {
          id: 'in-progress-step',
          taskId: 'workflow-5',
          name: 'In Progress Step',
          duration: 30,
          type: 'admin' as const,
          dependsOn: ['completed-step'],
          asyncWaitTime: 0,
          status: StepStatus.InProgress,
          stepIndex: 1,
          percentComplete: 50,
        },
        {
          id: 'pending-step',
          taskId: 'workflow-5',
          name: 'Pending Step',
          duration: 30,
          type: 'break' as const,
          dependsOn: ['in-progress-step'],
          asyncWaitTime: 0,
          status: StepStatus.Pending,
          stepIndex: 2,
          percentComplete: 0,
        },
      ]

      const workflow = createMockSequencedTask({
        id: 'workflow-5',
        steps,
        overallStatus: TaskStatus.InProgress,
      })

      expect(workflow.steps![0].status).toBe('completed')
      expect(workflow.steps![0].percentComplete).toBe(100)
      expect(workflow.steps![1].status).toBe('in_progress')
      expect(workflow.steps![1].percentComplete).toBe(50)
      expect(workflow.steps![2].status).toBe('pending')
      expect(workflow.steps![2].percentComplete).toBe(0)
      expect(workflow.overallStatus).toBe('in_progress')
    })
  })
})
