/**
 * Tests for schema validation
 */

import { describe, it, expect } from 'vitest'
import { validateAmendment, validateAmendments, formatValidationErrors } from '../schema-generator'
import { AmendmentType, EntityType, TaskStatus, TaskType, WorkPatternOperation, WorkSessionOperation, DeadlineType } from '../enums'

describe('schema-generator', () => {
  describe('validateAmendment', () => {
    it('should validate a valid StatusUpdate amendment', () => {
      const amendment = {
        type: AmendmentType.StatusUpdate,
        target: {
          type: EntityType.Task,
          name: 'Test Task',
          confidence: 1.0,
        },
        newStatus: TaskStatus.InProgress,
      }

      const result = validateAmendment(amendment)
      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('should reject amendment with invalid type', () => {
      const amendment = {
        type: 'invalid_type',
        target: {
          type: EntityType.Task,
          name: 'Test Task',
          confidence: 1.0,
        },
      }

      const result = validateAmendment(amendment)
      expect(result.valid).toBe(false)
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0]?.path).toBe('type')
    })

    it('should validate TaskCreation with all required fields', () => {
      const amendment = {
        type: AmendmentType.TaskCreation,
        name: 'New Task',
        duration: 60,
        importance: 7,
        urgency: 8,
        taskType: TaskType.Focused,
      }

      const result = validateAmendment(amendment)
      expect(result.valid).toBe(true)
    })

    it('should reject TaskCreation with invalid importance', () => {
      const amendment = {
        type: AmendmentType.TaskCreation,
        name: 'New Task',
        duration: 60,
        importance: 15, // Invalid: must be 1-10
      }

      const result = validateAmendment(amendment)
      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.path === 'importance')).toBe(true)
    })

    it('should validate WorkflowCreation with steps', () => {
      const amendment = {
        type: AmendmentType.WorkflowCreation,
        name: 'Test Workflow',
        steps: [
          {
            name: 'Step 1',
            duration: 30,
            type: TaskType.Focused,
          },
          {
            name: 'Step 2',
            duration: 45,
            type: TaskType.Admin,
            dependsOn: ['Step 1'],
          },
        ],
      }

      const result = validateAmendment(amendment)
      expect(result.valid).toBe(true)
    })

    it('should detect duplicate step names in WorkflowCreation', () => {
      const amendment = {
        type: AmendmentType.WorkflowCreation,
        name: 'Test Workflow',
        steps: [
          {
            name: 'Step 1',
            duration: 30,
            type: TaskType.Focused,
          },
          {
            name: 'Step 1', // Duplicate!
            duration: 45,
            type: TaskType.Admin,
          },
        ],
      }

      const result = validateAmendment(amendment)
      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.message.includes('Duplicate step name'))).toBe(true)
    })

    it('should warn about circular dependencies', () => {
      const amendment = {
        type: AmendmentType.WorkflowCreation,
        name: 'Test Workflow',
        steps: [
          {
            name: 'Step 1',
            duration: 30,
            type: TaskType.Focused,
            dependsOn: ['Step 2'],
          },
          {
            name: 'Step 2',
            duration: 45,
            type: TaskType.Admin,
            dependsOn: ['Step 1'],
          },
        ],
      }

      const result = validateAmendment(amendment)
      expect(result.warnings).toBeDefined()
      expect(result.warnings?.some(w => w.includes('circular'))).toBe(true)
    })

    it('should validate WorkPatternModification', () => {
      const amendment = {
        type: AmendmentType.WorkPatternModification,
        date: new Date('2025-11-23'),
        operation: WorkPatternOperation.AddBlock,
      }

      const result = validateAmendment(amendment)
      expect(result.valid).toBe(true)
    })

    it('should validate WorkSessionEdit', () => {
      const amendment = {
        type: AmendmentType.WorkSessionEdit,
        operation: WorkSessionOperation.Create,
        taskId: 'task-123',
        actualMinutes: 30,
      }

      const result = validateAmendment(amendment)
      expect(result.valid).toBe(true)
    })

    it('should validate ArchiveToggle', () => {
      const amendment = {
        type: AmendmentType.ArchiveToggle,
        target: {
          type: EntityType.Task,
          name: 'Old Task',
          confidence: 1.0,
        },
        archive: true,
      }

      const result = validateAmendment(amendment)
      expect(result.valid).toBe(true)
    })

    it('should validate TimeLog', () => {
      const amendment = {
        type: AmendmentType.TimeLog,
        target: {
          type: EntityType.Task,
          name: 'My Task',
          confidence: 0.95,
        },
        duration: 45,
      }

      const result = validateAmendment(amendment)
      expect(result.valid).toBe(true)
    })

    it('should reject TimeLog with negative duration', () => {
      const amendment = {
        type: AmendmentType.TimeLog,
        target: {
          type: EntityType.Task,
          name: 'My Task',
          confidence: 0.95,
        },
        duration: -30, // Invalid
      }

      const result = validateAmendment(amendment)
      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.path === 'duration')).toBe(true)
    })

    it('should validate NoteAddition', () => {
      const amendment = {
        type: AmendmentType.NoteAddition,
        target: {
          type: EntityType.Task,
          name: 'Task with notes',
          confidence: 1.0,
        },
        note: 'This is an important note',
        append: true,
      }

      const result = validateAmendment(amendment)
      expect(result.valid).toBe(true)
    })

    it('should reject NoteAddition with empty note', () => {
      const amendment = {
        type: AmendmentType.NoteAddition,
        target: {
          type: EntityType.Task,
          name: 'Task',
          confidence: 1.0,
        },
        note: '', // Invalid: empty
        append: true,
      }

      const result = validateAmendment(amendment)
      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.path === 'note')).toBe(true)
    })

    it('should validate DurationChange', () => {
      const amendment = {
        type: AmendmentType.DurationChange,
        target: {
          type: EntityType.Task,
          name: 'Task',
          confidence: 1.0,
        },
        newDuration: 120,
      }

      const result = validateAmendment(amendment)
      expect(result.valid).toBe(true)
    })

    it('should validate StepAddition', () => {
      const amendment = {
        type: AmendmentType.StepAddition,
        workflowTarget: {
          type: EntityType.Workflow,
          name: 'My Workflow',
          confidence: 1.0,
        },
        stepName: 'New Step',
        duration: 30,
        stepType: TaskType.Focused,
      }

      const result = validateAmendment(amendment)
      expect(result.valid).toBe(true)
    })

    it('should validate StepRemoval', () => {
      const amendment = {
        type: AmendmentType.StepRemoval,
        workflowTarget: {
          type: EntityType.Workflow,
          name: 'My Workflow',
          confidence: 1.0,
        },
        stepName: 'Obsolete Step',
      }

      const result = validateAmendment(amendment)
      expect(result.valid).toBe(true)
    })

    it('should validate DependencyChange', () => {
      const amendment = {
        type: AmendmentType.DependencyChange,
        target: {
          type: EntityType.Task,
          name: 'Dependent Task',
          confidence: 1.0,
        },
        stepName: 'Step 2',
        addDependencies: ['Step 1'],
      }

      const result = validateAmendment(amendment)
      expect(result.valid).toBe(true)
    })

    it('should validate DeadlineChange', () => {
      const amendment = {
        type: AmendmentType.DeadlineChange,
        target: {
          type: EntityType.Task,
          name: 'Deadline Task',
          confidence: 1.0,
        },
        newDeadline: new Date('2025-12-31'),
        deadlineType: DeadlineType.Hard,
      }

      const result = validateAmendment(amendment)
      expect(result.valid).toBe(true)
    })

    it('should reject DeadlineChange without deadline', () => {
      const amendment = {
        type: AmendmentType.DeadlineChange,
        target: {
          type: EntityType.Task,
          name: 'Task',
          confidence: 1.0,
        },
        // Missing newDeadline
      }

      const result = validateAmendment(amendment)
      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.path === 'newDeadline')).toBe(true)
    })

    it('should validate PriorityChange', () => {
      const amendment = {
        type: AmendmentType.PriorityChange,
        target: {
          type: EntityType.Task,
          name: 'Priority Task',
          confidence: 1.0,
        },
        importance: 8,
        urgency: 9,
      }

      const result = validateAmendment(amendment)
      expect(result.valid).toBe(true)
    })

    it('should reject PriorityChange with out-of-range values', () => {
      const amendment = {
        type: AmendmentType.PriorityChange,
        target: {
          type: EntityType.Task,
          name: 'Task',
          confidence: 1.0,
        },
        importance: 15, // Invalid: must be 1-10
      }

      const result = validateAmendment(amendment)
      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.path === 'importance')).toBe(true)
    })

    it('should validate TypeChange', () => {
      const amendment = {
        type: AmendmentType.TypeChange,
        target: {
          type: EntityType.Task,
          name: 'Type Task',
          confidence: 1.0,
        },
        newType: TaskType.Admin,
      }

      const result = validateAmendment(amendment)
      expect(result.valid).toBe(true)
    })

    it('should validate QueryResponse', () => {
      const amendment = {
        type: AmendmentType.QueryResponse,
        query: 'What are my top priorities?',
        response: 'Your top priorities are...',
      }

      const result = validateAmendment(amendment)
      expect(result.valid).toBe(true)
    })

    it('should reject QueryResponse without response', () => {
      const amendment = {
        type: AmendmentType.QueryResponse,
        query: 'What tasks are due?',
        // Missing response
      }

      const result = validateAmendment(amendment)
      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.path === 'response')).toBe(true)
    })

    it('should reject amendment if not an object', () => {
      const result = validateAmendment('not an object')
      expect(result.valid).toBe(false)
      expect(result.errors[0]?.message).toContain('must be an object')
    })
  })

  describe('validateAmendments', () => {
    it('should validate array of valid amendments', () => {
      const amendments = [
        {
          type: AmendmentType.TaskCreation,
          name: 'Task 1',
          duration: 60,
        },
        {
          type: AmendmentType.TaskCreation,
          name: 'Task 2',
          duration: 45,
        },
      ]

      const result = validateAmendments(amendments)
      expect(result.valid).toBe(true)
    })

    it('should reject non-array input', () => {
      const result = validateAmendments({ not: 'an array' })
      expect(result.valid).toBe(false)
      expect(result.errors[0]?.message).toContain('must be an array')
    })

    it('should collect errors from multiple invalid amendments', () => {
      const amendments = [
        {
          type: AmendmentType.TaskCreation,
          name: '', // Invalid: empty name
          duration: 60,
        },
        {
          type: AmendmentType.TaskCreation,
          name: 'Valid Task',
          duration: -5, // Invalid: negative duration
        },
      ]

      const result = validateAmendments(amendments)
      expect(result.valid).toBe(false)
      expect(result.errors.length).toBeGreaterThan(0)
      expect(result.errors.some(e => e.path.includes('[0]'))).toBe(true)
      expect(result.errors.some(e => e.path.includes('[1]'))).toBe(true)
    })
  })

  describe('formatValidationErrors', () => {
    it('should return success message for valid result', () => {
      const result = { valid: true, errors: [] }
      const formatted = formatValidationErrors(result)
      expect(formatted).toContain('valid')
    })

    it('should format error messages with paths', () => {
      const result = {
        valid: false,
        errors: [
          {
            path: 'amendments[0].name',
            message: 'Name must be non-empty',
          },
          {
            path: 'amendments[1].duration',
            message: 'Duration must be positive',
            expected: 'number > 0',
            received: '-5',
          },
        ],
      }

      const formatted = formatValidationErrors(result)
      expect(formatted).toContain('amendments[0].name')
      expect(formatted).toContain('Name must be non-empty')
      expect(formatted).toContain('expected: number > 0')
      expect(formatted).toContain('received: -5')
    })
  })
})
