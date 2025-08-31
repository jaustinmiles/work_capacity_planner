import { describe, it, expect } from 'vitest'
import { applyAmendment } from './amendment-applicator'
import { Amendment, AmendmentType, DeadlineChange, PriorityChange, TypeChange, StepRemoval } from './amendment-types'
import { Task, SequencedTask } from './types'
import { TaskType } from './enums'

describe('amendment-applicator', () => {
  const mockTask: Task = {
    id: 'task-1',
    name: 'Test Task',
    duration: 60,
    importance: 5,
    urgency: 5,
    type: TaskType.Focused,
    completed: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  const mockWorkflow: SequencedTask = {
    id: 'workflow-1',
    name: 'Test Workflow',
    steps: [
      {
        id: 'step-1',
        name: 'Step 1',
        duration: 30,
        type: TaskType.Focused,
        status: 'pending',
      },
      {
        id: 'step-2',
        name: 'Step 2',
        duration: 45,
        type: TaskType.Admin,
        status: 'pending',
        dependencies: ['step-1'],
      },
    ],
    overallStatus: 'pending',
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  describe('DeadlineChange', () => {
    it('should apply deadline change to a task', () => {
      const amendment: DeadlineChange = {
        type: AmendmentType.DeadlineChange,
        targetTaskId: 'task-1',
        targetName: 'Test Task',
        newDeadline: new Date('2025-08-30T23:00:00'),
      }

      const result = applyAmendment(amendment, [mockTask], [])

      expect(result.success).toBe(true)
      expect(result.updatedTasks).toHaveLength(1)
      expect(result.updatedTasks![0].deadline).toEqual(new Date('2025-08-30T23:00:00'))
    })

    it('should handle deadline change for non-existent task', () => {
      const amendment: DeadlineChange = {
        type: AmendmentType.DeadlineChange,
        targetTaskId: 'non-existent',
        targetName: 'Non-existent Task',
        newDeadline: new Date('2025-08-30T23:00:00'),
      }

      const result = applyAmendment(amendment, [mockTask], [])

      expect(result.success).toBe(false)
      expect(result.error).toContain('not found')
    })
  })

  describe('PriorityChange', () => {
    it('should apply priority change to a task', () => {
      const amendment: PriorityChange = {
        type: AmendmentType.PriorityChange,
        targetTaskId: 'task-1',
        targetName: 'Test Task',
        newImportance: 8,
        newUrgency: 7,
      }

      const result = applyAmendment(amendment, [mockTask], [])

      expect(result.success).toBe(true)
      expect(result.updatedTasks).toHaveLength(1)
      expect(result.updatedTasks![0].importance).toBe(8)
      expect(result.updatedTasks![0].urgency).toBe(7)
    })

    it('should apply priority change to a workflow step', () => {
      const amendment: PriorityChange = {
        type: AmendmentType.PriorityChange,
        targetWorkflowId: 'workflow-1',
        targetStepId: 'step-1',
        targetName: 'Step 1',
        newImportance: 9,
        newUrgency: 6,
      }

      const result = applyAmendment(amendment, [], [mockWorkflow])

      expect(result.success).toBe(true)
      expect(result.updatedWorkflows).toHaveLength(1)
      const updatedStep = result.updatedWorkflows![0].steps?.find(s => s.id === 'step-1')
      expect(updatedStep?.importance).toBe(9)
      expect(updatedStep?.urgency).toBe(6)
    })
  })

  describe('TypeChange', () => {
    it('should apply type change to a task', () => {
      const amendment: TypeChange = {
        type: AmendmentType.TypeChange,
        targetTaskId: 'task-1',
        targetName: 'Test Task',
        newType: TaskType.Personal,
      }

      const result = applyAmendment(amendment, [mockTask], [])

      expect(result.success).toBe(true)
      expect(result.updatedTasks).toHaveLength(1)
      expect(result.updatedTasks![0].type).toBe(TaskType.Personal)
    })

    it('should apply type change to a workflow step', () => {
      const amendment: TypeChange = {
        type: AmendmentType.TypeChange,
        targetWorkflowId: 'workflow-1',
        targetStepId: 'step-2',
        targetName: 'Step 2',
        newType: TaskType.Personal,
      }

      const result = applyAmendment(amendment, [], [mockWorkflow])

      expect(result.success).toBe(true)
      expect(result.updatedWorkflows).toHaveLength(1)
      const updatedStep = result.updatedWorkflows![0].steps?.find(s => s.id === 'step-2')
      expect(updatedStep?.type).toBe(TaskType.Personal)
    })
  })

  describe('StepRemoval', () => {
    it('should remove a step from a workflow', () => {
      const amendment: StepRemoval = {
        type: AmendmentType.StepRemoval,
        targetWorkflowId: 'workflow-1',
        targetStepId: 'step-2',
        targetName: 'Step 2',
      }

      const result = applyAmendment(amendment, [], [mockWorkflow])

      expect(result.success).toBe(true)
      expect(result.updatedWorkflows).toHaveLength(1)
      expect(result.updatedWorkflows![0].steps).toHaveLength(1)
      expect(result.updatedWorkflows![0].steps?.find(s => s.id === 'step-2')).toBeUndefined()
    })

    it('should handle removal of non-existent step', () => {
      const amendment: StepRemoval = {
        type: AmendmentType.StepRemoval,
        targetWorkflowId: 'workflow-1',
        targetStepId: 'non-existent',
        targetName: 'Non-existent Step',
      }

      const result = applyAmendment(amendment, [], [mockWorkflow])

      expect(result.success).toBe(false)
      expect(result.error).toContain('not found')
    })
  })

  describe('DependencyChange', () => {
    it('should update dependencies for a workflow step', () => {
      const amendment = {
        type: AmendmentType.DependencyChange,
        targetWorkflowId: 'workflow-1',
        targetStepId: 'step-2',
        targetName: 'Step 2',
        dependencies: [],
      }

      const result = applyAmendment(amendment, [], [mockWorkflow])

      expect(result.success).toBe(true)
      expect(result.updatedWorkflows).toHaveLength(1)
      const updatedStep = result.updatedWorkflows![0].steps?.find(s => s.id === 'step-2')
      expect(updatedStep?.dependencies).toEqual([])
    })

    it('should add new dependencies to a step', () => {
      const workflowWithoutDeps = {
        ...mockWorkflow,
        steps: mockWorkflow.steps?.map(s => ({ ...s, dependencies: undefined })),
      }

      const amendment = {
        type: AmendmentType.DependencyChange,
        targetWorkflowId: 'workflow-1',
        targetStepId: 'step-2',
        targetName: 'Step 2',
        dependencies: ['step-1'],
      }

      const result = applyAmendment(amendment, [], [workflowWithoutDeps])

      expect(result.success).toBe(true)
      const updatedStep = result.updatedWorkflows![0].steps?.find(s => s.id === 'step-2')
      expect(updatedStep?.dependencies).toEqual(['step-1'])
    })
  })

  describe('StepDurationChange', () => {
    it('should update duration for a workflow step', () => {
      const amendment = {
        type: AmendmentType.StepDurationChange,
        targetWorkflowId: 'workflow-1',
        targetStepId: 'step-1',
        targetName: 'Step 1',
        newDuration: 90,
      }

      const result = applyAmendment(amendment, [], [mockWorkflow])

      expect(result.success).toBe(true)
      expect(result.updatedWorkflows).toHaveLength(1)
      const updatedStep = result.updatedWorkflows![0].steps?.find(s => s.id === 'step-1')
      expect(updatedStep?.duration).toBe(90)
    })
  })

  describe('StepNoteChange', () => {
    it('should update notes for a workflow step', () => {
      const amendment = {
        type: AmendmentType.StepNoteChange,
        targetWorkflowId: 'workflow-1',
        targetStepId: 'step-1',
        targetName: 'Step 1',
        newNote: 'This is a new note',
      }

      const result = applyAmendment(amendment, [], [mockWorkflow])

      expect(result.success).toBe(true)
      expect(result.updatedWorkflows).toHaveLength(1)
      const updatedStep = result.updatedWorkflows![0].steps?.find(s => s.id === 'step-1')
      expect(updatedStep?.notes).toBe('This is a new note')
    })
  })

  describe('Multiple amendments', () => {
    it('should apply multiple amendments to different tasks', () => {
      const task2: Task = {
        ...mockTask,
        id: 'task-2',
        name: 'Task 2',
      }

      const amendments: Amendment[] = [
        {
          type: AmendmentType.DeadlineChange,
          targetTaskId: 'task-1',
          targetName: 'Test Task',
          newDeadline: new Date('2025-08-30T23:00:00'),
        },
        {
          type: AmendmentType.PriorityChange,
          targetTaskId: 'task-2',
          targetName: 'Task 2',
          newImportance: 10,
          newUrgency: 10,
        },
      ]

      let tasks = [mockTask, task2]
      let workflows: SequencedTask[] = []

      for (const amendment of amendments) {
        const result = applyAmendment(amendment, tasks, workflows)
        if (result.success) {
          if (result.updatedTasks) tasks = result.updatedTasks
          if (result.updatedWorkflows) workflows = result.updatedWorkflows
        }
      }

      expect(tasks[0].deadline).toEqual(new Date('2025-08-30T23:00:00'))
      expect(tasks[1].importance).toBe(10)
      expect(tasks[1].urgency).toBe(10)
    })
  })

  describe('Error handling', () => {
    it('should handle unsupported amendment type gracefully', () => {
      const unsupportedAmendment = {
        type: 'UnsupportedType' as any,
        targetTaskId: 'task-1',
      }

      const result = applyAmendment(unsupportedAmendment, [mockTask], [])

      expect(result.success).toBe(false)
      expect(result.error).toContain('Unsupported amendment type')
    })

    it('should handle missing target IDs', () => {
      const amendmentWithoutTarget = {
        type: AmendmentType.DeadlineChange,
        targetName: 'Test Task',
        newDeadline: new Date(),
      } as DeadlineChange

      const result = applyAmendment(amendmentWithoutTarget, [mockTask], [])

      expect(result.success).toBe(false)
    })
  })
})
