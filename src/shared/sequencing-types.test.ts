import { describe, it, expect } from 'vitest'
import {
  createWorkflowTask,
  exampleSequencedTask,
  ConditionalBranch,
  WorkflowExecution,
  SequencedTask,
} from './sequencing-types'
import { TaskType, TaskStatus, StepStatus } from './enums'

describe('sequencing-types', () => {
  describe('createWorkflowTask', () => {
    it('should create a workflow task with basic properties', () => {
      const result = createWorkflowTask({
        name: 'Test Workflow',
        importance: 7,
        urgency: 6,
        type: TaskType.Focused,
        steps: [
          {
            name: 'Step 1',
            duration: 30,
            type: TaskType.Focused,
            dependsOn: [],
            asyncWaitTime: 0,
            status: StepStatus.Pending,
            percentComplete: 0,
          },
        ],
        sessionId: 'test-session',
      })

      expect(result.name).toBe('Test Workflow')
      expect(result.importance).toBe(7)
      expect(result.urgency).toBe(6)
      expect(result.type).toBe(TaskType.Focused)
      expect(result.hasSteps).toBe(true)
      expect(result.sessionId).toBe('test-session')
    })

    it('should calculate total duration from steps', () => {
      const result = createWorkflowTask({
        name: 'Test Workflow',
        importance: 5,
        urgency: 5,
        type: TaskType.Admin,
        steps: [
          { name: 'Step 1', duration: 30, type: TaskType.Focused },
          { name: 'Step 2', duration: 45, type: TaskType.Admin },
          { name: 'Step 3', duration: 15, type: TaskType.Focused },
        ],
        sessionId: 'test-session',
      })

      expect(result.duration).toBe(90) // 30 + 45 + 15
    })

    it('should assign step IDs and indices', () => {
      const result = createWorkflowTask({
        name: 'Test Workflow',
        importance: 5,
        urgency: 5,
        type: TaskType.Focused,
        steps: [
          { name: 'First', duration: 20, type: TaskType.Focused },
          { name: 'Second', duration: 30, type: TaskType.Admin },
        ],
        sessionId: 'test-session',
      })

      expect(result.steps[0].id).toBe('step-0')
      expect(result.steps[0].stepIndex).toBe(0)
      expect(result.steps[1].id).toBe('step-1')
      expect(result.steps[1].stepIndex).toBe(1)
    })

    it('should preserve step dependencies', () => {
      const result = createWorkflowTask({
        name: 'Test Workflow',
        importance: 5,
        urgency: 5,
        type: TaskType.Focused,
        steps: [
          { name: 'Step 1', duration: 20, type: TaskType.Focused, dependsOn: [] },
          { name: 'Step 2', duration: 30, type: TaskType.Admin, dependsOn: ['step-0'] },
          { name: 'Step 3', duration: 25, type: TaskType.Focused, dependsOn: ['step-0', 'step-1'] },
        ],
        sessionId: 'test-session',
      })

      expect(result.steps[1].dependsOn).toEqual(['step-0'])
      expect(result.steps[2].dependsOn).toEqual(['step-0', 'step-1'])
    })

    it('should set default values for optional step properties', () => {
      const result = createWorkflowTask({
        name: 'Test Workflow',
        importance: 5,
        urgency: 5,
        type: TaskType.Focused,
        steps: [
          { name: 'Step 1', duration: 30, type: TaskType.Focused },
        ],
        sessionId: 'test-session',
      })

      const step = result.steps[0]
      expect(step.status).toBe(StepStatus.Pending)
      expect(step.percentComplete).toBe(0)
      expect(step.dependsOn).toEqual([])
    })

    it('should calculate critical path duration', () => {
      const result = createWorkflowTask({
        name: 'Test Workflow',
        importance: 5,
        urgency: 5,
        type: TaskType.Focused,
        steps: [
          { name: 'Step 1', duration: 30, type: TaskType.Focused, asyncWaitTime: 10 },
          { name: 'Step 2', duration: 40, type: TaskType.Admin, asyncWaitTime: 20 },
        ],
        sessionId: 'test-session',
      })

      // Simplified calculation: sum of all durations and async wait times
      expect(result.criticalPathDuration).toBe(100) // 30 + 10 + 40 + 20
    })

    it('should calculate worst case duration', () => {
      const result = createWorkflowTask({
        name: 'Test Workflow',
        importance: 5,
        urgency: 5,
        type: TaskType.Focused,
        steps: [
          { name: 'Step 1', duration: 20, type: TaskType.Focused, asyncWaitTime: 0 },
          { name: 'Step 2', duration: 40, type: TaskType.Admin, asyncWaitTime: 0 },
        ],
        sessionId: 'test-session',
      })

      // Simplified calculation: 1.5x the critical path
      expect(result.worstCaseDuration).toBe(90) // (20 + 40) * 1.5
    })

    it('should include notes when provided', () => {
      const result = createWorkflowTask({
        name: 'Test Workflow',
        importance: 5,
        urgency: 5,
        type: TaskType.Focused,
        steps: [],
        notes: 'This is a test note',
        sessionId: 'test-session',
      })

      expect(result.notes).toBe('This is a test note')
    })

    it('should set workflow-specific defaults', () => {
      const result = createWorkflowTask({
        name: 'Test Workflow',
        importance: 5,
        urgency: 5,
        type: TaskType.Focused,
        steps: [],
        sessionId: 'test-session',
      })

      expect(result.hasSteps).toBe(true)
      expect(result.overallStatus).toBe(TaskStatus.NotStarted)
      expect(result.completed).toBe(false)
      expect(result.dependencies).toEqual([])
      expect(result.asyncWaitTime).toBe(0)
    })

    it('should handle empty steps array', () => {
      const result = createWorkflowTask({
        name: 'Empty Workflow',
        importance: 5,
        urgency: 5,
        type: TaskType.Focused,
        steps: [],
        sessionId: 'test-session',
      })

      expect(result.steps).toEqual([])
      expect(result.duration).toBe(0)
      expect(result.criticalPathDuration).toBe(0)
      expect(result.worstCaseDuration).toBe(0)
    })
  })

  describe('exampleSequencedTask', () => {
    it('should have correct basic properties', () => {
      expect(exampleSequencedTask.id).toBe('task-123')
      expect(exampleSequencedTask.name).toBe('Feature Implementation with CI/CD and Code Review')
      expect(exampleSequencedTask.duration).toBe(365)
      expect(exampleSequencedTask.importance).toBe(8)
      expect(exampleSequencedTask.urgency).toBe(7)
      expect(exampleSequencedTask.type).toBe(TaskType.Focused)
    })

    it('should have workflow-specific properties', () => {
      expect(exampleSequencedTask.hasSteps).toBe(true)
      expect(exampleSequencedTask.overallStatus).toBe(TaskStatus.NotStarted)
      expect(exampleSequencedTask.criticalPathDuration).toBe(425)
      expect(exampleSequencedTask.worstCaseDuration).toBe(1200)
    })

    it('should have 5 steps', () => {
      expect(exampleSequencedTask.steps).toHaveLength(5)
    })

    it('should have correct step structure', () => {
      const firstStep = exampleSequencedTask.steps[0]
      expect(firstStep.id).toBe('step-1')
      expect(firstStep.taskId).toBe('task-123')
      expect(firstStep.name).toBe('Data Mining')
      expect(firstStep.duration).toBe(120)
      expect(firstStep.type).toBe(TaskType.Focused)
      expect(firstStep.dependsOn).toEqual([])
      expect(firstStep.asyncWaitTime).toBe(0)
      expect(firstStep.status).toBe(StepStatus.Pending)
      expect(firstStep.stepIndex).toBe(0)
      expect(firstStep.percentComplete).toBe(0)
    })

    it('should have correct dependencies between steps', () => {
      expect(exampleSequencedTask.steps[0].dependsOn).toEqual([])
      expect(exampleSequencedTask.steps[1].dependsOn).toEqual(['step-1'])
      expect(exampleSequencedTask.steps[2].dependsOn).toEqual(['step-2'])
      expect(exampleSequencedTask.steps[3].dependsOn).toEqual(['step-3'])
      expect(exampleSequencedTask.steps[4].dependsOn).toEqual(['step-4'])
    })

    it('should have steps with async wait time', () => {
      const workflowStep = exampleSequencedTask.steps[2]
      expect(workflowStep.name).toBe('Workflow Running')
      expect(workflowStep.asyncWaitTime).toBe(60)

      const clStep = exampleSequencedTask.steps[4]
      expect(clStep.name).toBe('CL Process (Submit for Review)')
      expect(clStep.asyncWaitTime).toBe(480)
    })

    it('should have mixed task types in steps', () => {
      const types = exampleSequencedTask.steps.map(s => s.type)
      expect(types).toContain(TaskType.Focused)
      expect(types).toContain(TaskType.Admin)
    })
  })

  describe('Type definitions', () => {
    it('should create valid ConditionalBranch', () => {
      const branch: ConditionalBranch = {
        id: 'branch-1',
        condition: 'If tests fail',
        probability: 0.3,
        additionalSteps: [
          {
            id: 'fix-step',
            taskId: 'task-1',
            name: 'Fix failing tests',
            duration: 45,
            type: TaskType.Focused,
            dependsOn: [],
            asyncWaitTime: 0,
            status: StepStatus.Pending,
            stepIndex: 0,
            percentComplete: 0,
          },
        ],
        repeatFromStepId: 'step-2',
      }

      expect(branch.condition).toBe('If tests fail')
      expect(branch.probability).toBe(0.3)
      expect(branch.additionalSteps).toHaveLength(1)
      expect(branch.repeatFromStepId).toBe('step-2')
    })

    it('should create valid WorkflowExecution', () => {
      const execution: WorkflowExecution = {
        taskId: 'task-123',
        executionId: 'exec-456',
        startedAt: new Date('2025-01-15T10:00:00'),
        completedAt: new Date('2025-01-15T12:00:00'),
        executedSteps: [
          {
            stepId: 'step-1',
            startedAt: new Date('2025-01-15T10:00:00'),
            completedAt: new Date('2025-01-15T10:30:00'),
            actualDuration: 30,
            branchesTaken: ['branch-1'],
          },
        ],
        currentStepId: 'step-2',
        isWaitingForAsync: true,
        waitingSince: new Date('2025-01-15T11:00:00'),
      }

      expect(execution.taskId).toBe('task-123')
      expect(execution.executionId).toBe('exec-456')
      expect(execution.isWaitingForAsync).toBe(true)
      expect(execution.executedSteps).toHaveLength(1)
    })

    it('should create valid SequencedTask type', () => {
      const sequencedTask: SequencedTask = {
        id: 'seq-task-1',
        name: 'Sequenced Task',
        duration: 100,
        importance: 7,
        urgency: 6,
        type: TaskType.Focused,
        asyncWaitTime: 0,
        dependencies: [],
        completed: false,
        sessionId: 'session-1',
        hasSteps: true,
        overallStatus: TaskStatus.NotStarted,
        criticalPathDuration: 100,
        worstCaseDuration: 150,
        createdAt: new Date(),
        updatedAt: new Date(),
        steps: [
          {
            id: 'step-1',
            taskId: 'seq-task-1',
            name: 'First Step',
            duration: 100,
            type: TaskType.Focused,
            dependsOn: [],
            asyncWaitTime: 0,
            status: StepStatus.Pending,
            stepIndex: 0,
            percentComplete: 0,
          },
        ],
      }

      expect(sequencedTask.hasSteps).toBe(true)
      expect(sequencedTask.steps).toHaveLength(1)
    })
  })
})
