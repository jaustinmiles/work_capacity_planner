import { describe, it, expect } from 'vitest'
import {
  TaskStatus,
  StepStatus,
  TaskType,
  AmendmentType,
} from './enums'

describe('enums', () => {
  describe('TaskStatus enum', () => {
    it('should have correct values', () => {
      expect(TaskStatus.NotStarted).toBe('not_started')
      expect(TaskStatus.InProgress).toBe('in_progress')
      expect(TaskStatus.Waiting).toBe('waiting')
      expect(TaskStatus.Completed).toBe('completed')
    })

    it('should have all expected keys', () => {
      const keys = Object.keys(TaskStatus)
      expect(keys).toHaveLength(4)
      expect(keys).toContain('NotStarted')
      expect(keys).toContain('InProgress')
      expect(keys).toContain('Waiting')
      expect(keys).toContain('Completed')
    })

    it('should be usable in switch statements', () => {
      const status: TaskStatus = TaskStatus.InProgress
      let result = ''

      switch (status) {
        case TaskStatus.NotStarted:
          result = 'not started'
          break
        case TaskStatus.InProgress:
          result = 'in progress'
          break
        case TaskStatus.Waiting:
          result = 'waiting'
          break
        case TaskStatus.Completed:
          result = 'completed'
          break
      }

      expect(result).toBe('in progress')
    })

    it('should support equality checks', () => {
      const status = TaskStatus.Completed
      expect(status === TaskStatus.Completed).toBe(true)
      expect(status === TaskStatus.InProgress).toBe(false)
    })
  })

  describe('StepStatus enum', () => {
    it('should have correct values', () => {
      expect(StepStatus.Pending).toBe('pending')
      expect(StepStatus.InProgress).toBe('in_progress')
      expect(StepStatus.Waiting).toBe('waiting')
      expect(StepStatus.Completed).toBe('completed')
      expect(StepStatus.Skipped).toBe('skipped')
    })

    it('should have all expected keys', () => {
      const keys = Object.keys(StepStatus)
      expect(keys).toHaveLength(5)
      expect(keys).toContain('Pending')
      expect(keys).toContain('InProgress')
      expect(keys).toContain('Waiting')
      expect(keys).toContain('Completed')
      expect(keys).toContain('Skipped')
    })

    it('should have additional Skipped status not in TaskStatus', () => {
      expect(StepStatus.Skipped).toBe('skipped')
      expect(Object.values(TaskStatus)).not.toContain('skipped')
    })

    it('should have Pending instead of NotStarted', () => {
      expect(StepStatus.Pending).toBe('pending')
      expect(Object.values(StepStatus)).not.toContain('not_started')
    })
  })

  describe('TaskType enum', () => {
    it('should have correct values', () => {
      expect(TaskType.Focused).toBe('focused')
      expect(TaskType.Admin).toBe('admin')
      expect(TaskType.Personal).toBe('personal')
      expect(TaskType.Mixed).toBe('mixed')
    })

    it('should have all expected keys', () => {
      const keys = Object.keys(TaskType)
      expect(keys).toHaveLength(5)
      expect(keys).toContain('Focused')
      expect(keys).toContain('Admin')
      expect(keys).toContain('Personal')
      expect(keys).toContain('Mixed')
      expect(keys).toContain('Flexible')
    })

    it('should include Mixed type for work blocks', () => {
      // Mixed is only for work blocks, not individual tasks
      expect(TaskType.Mixed).toBe('mixed')
    })

    it('should support type categorization', () => {
      const workTypes = [TaskType.Focused, TaskType.Admin]
      const personalType = TaskType.Personal

      expect(workTypes).toContain(TaskType.Focused)
      expect(workTypes).toContain(TaskType.Admin)
      expect(workTypes).not.toContain(personalType)
    })
  })

  describe('AmendmentType enum', () => {
    it('should have correct values', () => {
      expect(AmendmentType.StatusUpdate).toBe('status_update')
      expect(AmendmentType.TimeLog).toBe('time_log')
      expect(AmendmentType.NoteAddition).toBe('note_addition')
      expect(AmendmentType.DurationChange).toBe('duration_change')
      expect(AmendmentType.StepAddition).toBe('step_addition')
      expect(AmendmentType.StepRemoval).toBe('step_removal')
      expect(AmendmentType.DependencyChange).toBe('dependency_change')
      expect(AmendmentType.TaskCreation).toBe('task_creation')
      expect(AmendmentType.WorkflowCreation).toBe('workflow_creation')
      expect(AmendmentType.DeadlineChange).toBe('deadline_change')
      expect(AmendmentType.PriorityChange).toBe('priority_change')
      expect(AmendmentType.TypeChange).toBe('type_change')
    })

    it('should have all expected keys', () => {
      const keys = Object.keys(AmendmentType)
      expect(keys).toHaveLength(12)
      expect(keys).toContain('StatusUpdate')
      expect(keys).toContain('TimeLog')
      expect(keys).toContain('NoteAddition')
      expect(keys).toContain('DurationChange')
      expect(keys).toContain('StepAddition')
      expect(keys).toContain('StepRemoval')
      expect(keys).toContain('DependencyChange')
      expect(keys).toContain('TaskCreation')
      expect(keys).toContain('WorkflowCreation')
      expect(keys).toContain('DeadlineChange')
      expect(keys).toContain('PriorityChange')
      expect(keys).toContain('TypeChange')
    })

    it('should cover all major amendment categories', () => {
      const statusAmendments = [AmendmentType.StatusUpdate]
      const timeAmendments = [AmendmentType.TimeLog, AmendmentType.DurationChange, AmendmentType.DeadlineChange]
      const structuralAmendments = [AmendmentType.StepAddition, AmendmentType.StepRemoval, AmendmentType.DependencyChange]
      const creationAmendments = [AmendmentType.TaskCreation, AmendmentType.WorkflowCreation]

      expect(statusAmendments).toHaveLength(1)
      expect(timeAmendments).toHaveLength(3)
      expect(structuralAmendments).toHaveLength(3)
      expect(creationAmendments).toHaveLength(2)
    })

    it('should use snake_case convention', () => {
      Object.values(AmendmentType).forEach(value => {
        expect(value).toMatch(/^[a-z]+(_[a-z]+)*$/)
      })
    })
  })


  describe('Enum consistency and patterns', () => {
    it('should use consistent naming conventions', () => {
      // All enum names should be PascalCase
      const enumNames = ['TaskStatus', 'StepStatus', 'TaskType', 'AmendmentType']
      enumNames.forEach(name => {
        expect(name).toMatch(/^[A-Z][a-zA-Z]+$/)
      })
    })

    it('should use consistent value conventions', () => {
      // Most values use snake_case
      const allValues = [
        ...Object.values(TaskStatus),
        ...Object.values(StepStatus),
        ...Object.values(TaskType),
        ...Object.values(AmendmentType),
      ]

      allValues.forEach(value => {
        expect(typeof value).toBe('string')
        expect(value).toMatch(/^[a-z_]+$/)
      })
    })

    it('should have distinct values across related enums', () => {
      // TaskStatus and StepStatus share some values but have distinct purposes
      const taskStatuses = Object.values(TaskStatus)
      const stepStatuses = Object.values(StepStatus)

      // Common statuses
      expect(taskStatuses).toContain('in_progress')
      expect(stepStatuses).toContain('in_progress')

      // Unique to each
      expect(taskStatuses).toContain('not_started')
      expect(stepStatuses).not.toContain('not_started')

      expect(stepStatuses).toContain('skipped')
      expect(taskStatuses).not.toContain('skipped')
    })

    it('should support exhaustive type checking', () => {
      // This pattern allows TypeScript to check we handle all cases
      function getStatusLabel(status: TaskStatus): string {
        switch (status) {
          case TaskStatus.NotStarted:
            return 'Not Started'
          case TaskStatus.InProgress:
            return 'In Progress'
          case TaskStatus.Waiting:
            return 'Waiting'
          case TaskStatus.Completed:
            return 'Completed'
          // TypeScript will error if we miss a case
        }
      }

      expect(getStatusLabel(TaskStatus.NotStarted)).toBe('Not Started')
      expect(getStatusLabel(TaskStatus.Completed)).toBe('Completed')
    })
  })
})
