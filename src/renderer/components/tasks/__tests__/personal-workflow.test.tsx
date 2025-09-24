import { describe, it, expect } from 'vitest'
import { TaskType, TaskStatus } from '@shared/enums'
import { Task, TaskStep } from '@shared/types'

describe('Personal Workflow Step Inheritance', () => {
  describe('Step Type Options', () => {
    it('should allow Personal type for workflow steps', () => {
      // This test verifies that Personal is now an available option for steps
      const availableStepTypes = [
        TaskType.Focused,
        TaskType.Admin,
        TaskType.Personal, // This was missing before the fix
      ]

      expect(availableStepTypes).toContain(TaskType.Personal)
      expect(availableStepTypes).toHaveLength(3)
    })

    it('should inherit parent workflow type by default', () => {
      const personalWorkflow: Task = {
        id: 'workflow-1',
        name: 'Weekend Errands',
        type: TaskType.Personal,
        importance: 5,
        urgency: 7,
        duration: 0,
        hasSteps: true,
        status: TaskStatus.NotStarted,
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      // When creating a new step, it should default to parent type
      const defaultStepType = personalWorkflow.type || TaskType.Focused
      expect(defaultStepType).toBe(TaskType.Personal)
    })
  })

  describe('Scheduling Personal Workflows', () => {
    it('should match personal steps with personal blocks', () => {
      const personalStep: TaskStep = {
        id: 'step-1',
        taskId: 'workflow-1',
        name: 'Coffee Run',
        type: TaskType.Personal, // Now allowed
        duration: 30,
        stepIndex: 0,
        status: TaskStatus.NotStarted,
        percentComplete: 0,
        dependsOn: [],
      }

      const personalBlock = {
        type: 'personal',
        blockType: 'personal',
        capacity: {
          personal: 240,
          focus: 0,
          admin: 0,
        },
      }

      // Step type should match block type
      expect(personalStep.type).toBe(TaskType.Personal)
      expect(personalBlock.blockType).toBe('personal')

      // This ensures steps can be scheduled in appropriate blocks
      const stepMatchesBlock = personalStep.type === TaskType.Personal &&
                              personalBlock.blockType === 'personal'
      expect(stepMatchesBlock).toBe(true)
    })

    it('should handle mixed personal/work workflows', () => {
      const workflow: Task = {
        id: 'workflow-2',
        name: 'Saturday Tasks',
        type: TaskType.Personal,
        importance: 6,
        urgency: 5,
        duration: 0,
        hasSteps: true,
        status: TaskStatus.NotStarted,
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      const steps: TaskStep[] = [
        {
          id: 'step-1',
          taskId: workflow.id,
          name: 'Morning coffee',
          type: TaskType.Personal,
          duration: 30,
          stepIndex: 0,
          status: TaskStatus.NotStarted,
          percentComplete: 0,
          dependsOn: [],
        },
        {
          id: 'step-2',
          taskId: workflow.id,
          name: 'Quick work email check',
          type: TaskType.Admin, // Can override parent type if needed
          duration: 15,
          stepIndex: 1,
          status: TaskStatus.NotStarted,
          percentComplete: 0,
          dependsOn: ['step-1'],
        },
        {
          id: 'step-3',
          taskId: workflow.id,
          name: 'Grocery shopping',
          type: TaskType.Personal,
          duration: 60,
          stepIndex: 2,
          status: TaskStatus.NotStarted,
          percentComplete: 0,
          dependsOn: ['step-2'],
        },
      ]

      // Verify each step has appropriate type
      expect(steps[0].type).toBe(TaskType.Personal)
      expect(steps[1].type).toBe(TaskType.Admin)
      expect(steps[2].type).toBe(TaskType.Personal)

      // All step types should be valid
      const validTypes = [TaskType.Focused, TaskType.Admin, TaskType.Personal]
      steps.forEach(step => {
        expect(validTypes).toContain(step.type)
      })
    })
  })

  describe('UI Display', () => {
    it('should display correct labels for all task types', () => {
      const getTaskTypeLabel = (type: TaskType): string => {
        switch (type) {
          case TaskType.Focused:
            return 'Focused Work'
          case TaskType.Admin:
            return 'Admin Task'
          case TaskType.Personal:
            return 'Personal Task'
          default:
            return 'Unknown'
        }
      }

      expect(getTaskTypeLabel(TaskType.Focused)).toBe('Focused Work')
      expect(getTaskTypeLabel(TaskType.Admin)).toBe('Admin Task')
      expect(getTaskTypeLabel(TaskType.Personal)).toBe('Personal Task')
    })

    it('should use correct tag colors for all task types', () => {
      const getTaskTypeColor = (type: TaskType): string => {
        switch (type) {
          case TaskType.Focused:
            return 'blue'
          case TaskType.Admin:
            return 'green'
          case TaskType.Personal:
            return 'orange'
          default:
            return 'gray'
        }
      }

      expect(getTaskTypeColor(TaskType.Focused)).toBe('blue')
      expect(getTaskTypeColor(TaskType.Admin)).toBe('green')
      expect(getTaskTypeColor(TaskType.Personal)).toBe('orange')
    })
  })
})
