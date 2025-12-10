/**
 * Tests for amendment validation and retry logic
 */

import { describe, it, expect, vi } from 'vitest'
import { parseAIResponse, validateWithRetry, transformAmendments, createUserErrorReport } from '../amendment-validator'
import type { ValidationLoopResult } from '../amendment-validator'
import { AmendmentType, WorkPatternOperation, WorkSessionOperation, WorkBlockType } from '../enums'
import type { RawTimeLog, RawDeadlineChange, RawWorkPatternModification, RawWorkSessionEdit } from '../amendment-types'

describe('amendment-validator', () => {
  describe('parseAIResponse', () => {
    it('should parse pure JSON response', () => {
      const response = JSON.stringify([
        {
          type: AmendmentType.TaskCreation,
          name: 'Test Task',
          duration: 60,
        },
      ])

      const result = parseAIResponse(response)
      expect(result.amendments).toBeDefined()
      expect(Array.isArray(result.amendments)).toBe(true)
    })

    it('should extract JSON from text with surrounding content', () => {
      const response = `Here are the amendments you requested:

[
  {
    "type": "task_creation",
    "name": "Test Task",
    "duration": 60
  }
]

Hope this helps!`

      const result = parseAIResponse(response)
      expect(result.amendments).toBeDefined()
      expect(Array.isArray(result.amendments)).toBe(true)
      expect(result.rawText).toBeDefined()
      expect(result.rawText).toContain('Hope this helps')
    })

    it('should extract JSON from code block', () => {
      const response = `Here are the amendments:

\`\`\`json
[
  {
    "type": "task_creation",
    "name": "Test Task",
    "duration": 60
  }
]
\`\`\`

Let me know if you need changes.`

      const result = parseAIResponse(response)
      expect(result.amendments).toBeDefined()
      expect(Array.isArray(result.amendments)).toBe(true)
    })

    it('should return null for non-JSON response', () => {
      const response = 'This is just plain text with no JSON'

      const result = parseAIResponse(response)
      expect(result.amendments).toBeNull()
    })

    it('should handle malformed JSON gracefully', () => {
      const response = '[{"type": "task_creation", "name": "Test", invalid json}'

      const result = parseAIResponse(response)
      expect(result.amendments).toBeNull()
    })

    it('should extract JSON from code block with surrounding text', () => {
      const response = `Here's what I created for you:

\`\`\`json
[{"type": "task_creation", "name": "Test Task", "duration": 60}]
\`\`\`

Let me know if you need anything else!`

      const result = parseAIResponse(response)
      expect(result.amendments).toBeDefined()
      expect(Array.isArray(result.amendments)).toBe(true)
      expect(result.rawText).toContain('Let me know if you need anything else')
    })

    it('should handle malformed JSON in code block gracefully', () => {
      const response = `Here's the data:

\`\`\`json
[{"type": "task_creation", broken json here}]
\`\`\`

Done!`

      const result = parseAIResponse(response)
      // Should fall through to null since the JSON in code block is invalid
      expect(result.amendments).toBeNull()
    })

    it('should handle code block without language specifier', () => {
      const response = `\`\`\`
[{"type": "task_creation", "name": "Task", "duration": 30}]
\`\`\``

      const result = parseAIResponse(response)
      expect(result.amendments).toBeDefined()
      expect(Array.isArray(result.amendments)).toBe(true)
    })
  })

  describe('validateWithRetry', () => {
    it('should succeed on first attempt with valid amendments', async () => {
      const mockGenerate = vi.fn().mockResolvedValue(
        JSON.stringify([
          {
            type: AmendmentType.TaskCreation,
            name: 'Test Task',
            duration: 60,
          },
        ]),
      )

      const result = await validateWithRetry(mockGenerate, { maxAttempts: 5 })

      expect(result.success).toBe(true)
      expect(result.amendments).toBeDefined()
      expect(result.amendments).toHaveLength(1)
      expect(result.attempts).toBe(1)
      expect(mockGenerate).toHaveBeenCalledTimes(1)
    })

    it('should retry on validation failure and succeed', async () => {
      const mockGenerate = vi
        .fn()
        .mockResolvedValueOnce(
          JSON.stringify([
            {
              type: AmendmentType.TaskCreation,
              name: '', // Invalid: empty name
              duration: 60,
            },
          ]),
        )
        .mockResolvedValueOnce(
          JSON.stringify([
            {
              type: AmendmentType.TaskCreation,
              name: 'Fixed Task',
              duration: 60,
            },
          ]),
        )

      const onRetry = vi.fn()
      const result = await validateWithRetry(mockGenerate, {
        maxAttempts: 5,
        onRetry,
      })

      expect(result.success).toBe(true)
      expect(result.attempts).toBe(2)
      expect(mockGenerate).toHaveBeenCalledTimes(2)
      expect(onRetry).toHaveBeenCalledTimes(1)
    })

    it('should fail after max attempts exhausted', async () => {
      const mockGenerate = vi.fn().mockResolvedValue(
        JSON.stringify([
          {
            type: 'invalid_type',
            name: 'Test',
          },
        ]),
      )

      const result = await validateWithRetry(mockGenerate, { maxAttempts: 3 })

      expect(result.success).toBe(false)
      expect(result.attempts).toBe(3)
      expect(result.errors).toBeDefined()
      expect(mockGenerate).toHaveBeenCalledTimes(3)
    })

    it('should handle parse errors and retry', async () => {
      const mockGenerate = vi
        .fn()
        .mockResolvedValueOnce('Not valid JSON at all')
        .mockResolvedValueOnce(
          JSON.stringify([
            {
              type: AmendmentType.TaskCreation,
              name: 'Valid Task',
              duration: 60,
            },
          ]),
        )

      const result = await validateWithRetry(mockGenerate, { maxAttempts: 5 })

      expect(result.success).toBe(true)
      expect(result.attempts).toBe(2)
    })

    it('should provide retry feedback on subsequent attempts', async () => {
      const mockGenerate = vi
        .fn()
        .mockResolvedValueOnce('invalid')
        .mockResolvedValueOnce('still invalid')

      await validateWithRetry(mockGenerate, { maxAttempts: 2 })

      // Second call should include retry feedback
      expect(mockGenerate).toHaveBeenCalledTimes(2)
      expect(mockGenerate.mock.calls[1]?.[0]).toBeDefined()
      expect(mockGenerate.mock.calls[1]?.[0]).toContain('Failed to parse JSON')
    })

    it('should handle thrown exceptions during generation', async () => {
      const mockGenerate = vi
        .fn()
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce(
          JSON.stringify([
            {
              type: AmendmentType.TaskCreation,
              name: 'Valid Task',
              duration: 60,
            },
          ]),
        )

      const onRetry = vi.fn()
      const result = await validateWithRetry(mockGenerate, {
        maxAttempts: 3,
        onRetry,
      })

      expect(result.success).toBe(true)
      expect(result.attempts).toBe(2)
      expect(onRetry).toHaveBeenCalledTimes(1)
      expect(onRetry.mock.calls[0]?.[1]).toContain('Network error')
    })

    it('should call onValidationError when all attempts exhausted', async () => {
      const mockGenerate = vi.fn().mockResolvedValue('invalid json always')

      const onValidationError = vi.fn()
      const result = await validateWithRetry(mockGenerate, {
        maxAttempts: 2,
        onValidationError,
      })

      expect(result.success).toBe(false)
      expect(onValidationError).toHaveBeenCalledTimes(1)
      expect(onValidationError.mock.calls[0]?.[0]).toContain('Failed to parse JSON')
    })

    it('should call onRetry when validation fails (not just parse errors)', async () => {
      const mockGenerate = vi
        .fn()
        .mockResolvedValueOnce(
          JSON.stringify([
            {
              type: AmendmentType.TaskCreation,
              name: '', // Invalid empty name
              duration: 60,
            },
          ]),
        )
        .mockResolvedValueOnce('still failing')
        .mockResolvedValueOnce('third attempt')

      const onRetry = vi.fn()
      await validateWithRetry(mockGenerate, {
        maxAttempts: 3, // Need 3 attempts to get 2 onRetry calls
        onRetry,
      })

      expect(onRetry).toHaveBeenCalledTimes(2)
      // First retry should have validation error message
      expect(onRetry.mock.calls[0]?.[1]).toContain('VALIDATION ERRORS')
    })

    it('should handle multiple consecutive exceptions gracefully', async () => {
      const mockGenerate = vi
        .fn()
        .mockRejectedValueOnce(new Error('First error'))
        .mockRejectedValueOnce(new Error('Second error'))
        .mockRejectedValueOnce(new Error('Third error'))

      const result = await validateWithRetry(mockGenerate, { maxAttempts: 3 })

      expect(result.success).toBe(false)
      expect(result.attempts).toBe(3)
      expect(result.errors).toContain('Third error')
    })
  })

  describe('transformAmendments', () => {
    it('should transform RawTimeLog date strings to Date objects', () => {
      const rawTimeLog: RawTimeLog = {
        type: AmendmentType.TimeLog,
        target: { type: 'task' as any, name: 'Test Task', confidence: 1.0 },
        duration: 60,
        date: '2025-01-15',
        startTime: '2025-01-15T09:00:00Z',
        endTime: '2025-01-15T10:00:00Z',
      }

      const transformed = transformAmendments([rawTimeLog])
      expect(transformed).toHaveLength(1)

      const result = transformed[0] as any
      expect(result.type).toBe(AmendmentType.TimeLog)
      expect(result.date).toBeInstanceOf(Date)
      expect(result.startTime).toBeInstanceOf(Date)
      expect(result.endTime).toBeInstanceOf(Date)
    })

    it('should transform RawDeadlineChange date strings to Date objects', () => {
      const rawDeadlineChange: RawDeadlineChange = {
        type: AmendmentType.DeadlineChange,
        target: { type: 'task' as any, name: 'Test Task', confidence: 1.0 },
        newDeadline: '2025-02-28T17:00:00Z',
      }

      const transformed = transformAmendments([rawDeadlineChange])
      expect(transformed).toHaveLength(1)

      const result = transformed[0] as any
      expect(result.type).toBe(AmendmentType.DeadlineChange)
      expect(result.newDeadline).toBeInstanceOf(Date)
    })

    it('should transform RawWorkPatternModification date strings to Date objects', () => {
      const rawWorkPattern: RawWorkPatternModification = {
        type: AmendmentType.WorkPatternModification,
        date: '2025-01-20',
        operation: WorkPatternOperation.AddBlock,
        blockData: {
          startTime: '2025-01-20T09:00:00Z',
          endTime: '2025-01-20T12:00:00Z',
          type: WorkBlockType.Focused,
        },
      }

      const transformed = transformAmendments([rawWorkPattern])
      expect(transformed).toHaveLength(1)

      const result = transformed[0] as any
      expect(result.type).toBe(AmendmentType.WorkPatternModification)
      expect(result.date).toBeInstanceOf(Date)
      expect(result.blockData.startTime).toBeInstanceOf(Date)
      expect(result.blockData.endTime).toBeInstanceOf(Date)
    })

    it('should transform RawWorkSessionEdit date strings to Date objects', () => {
      const rawWorkSession: RawWorkSessionEdit = {
        type: AmendmentType.WorkSessionEdit,
        operation: WorkSessionOperation.Create,
        taskId: 'task-123',
        startTime: '2025-01-20T14:00:00Z',
        endTime: '2025-01-20T15:30:00Z',
        actualMinutes: 90,
      }

      const transformed = transformAmendments([rawWorkSession])
      expect(transformed).toHaveLength(1)

      const result = transformed[0] as any
      expect(result.type).toBe(AmendmentType.WorkSessionEdit)
      expect(result.startTime).toBeInstanceOf(Date)
      expect(result.endTime).toBeInstanceOf(Date)
    })

    it('should pass through amendments without date fields unchanged', () => {
      const taskCreation = {
        type: AmendmentType.TaskCreation,
        name: 'New Task',
        duration: 60,
        taskType: 'focused',
      }

      const transformed = transformAmendments([taskCreation as any])
      expect(transformed).toHaveLength(1)
      expect(transformed[0]).toEqual(taskCreation)
    })

    it('should handle undefined optional date fields gracefully', () => {
      const rawTimeLog: RawTimeLog = {
        type: AmendmentType.TimeLog,
        target: { type: 'task' as any, name: 'Test Task', confidence: 1.0 },
        duration: 60,
        // No date, startTime, or endTime
      }

      const transformed = transformAmendments([rawTimeLog])
      expect(transformed).toHaveLength(1)

      const result = transformed[0] as any
      expect(result.date).toBeUndefined()
      expect(result.startTime).toBeUndefined()
      expect(result.endTime).toBeUndefined()
    })

    it('should handle invalid date strings gracefully', () => {
      const rawTimeLog: RawTimeLog = {
        type: AmendmentType.TimeLog,
        target: { type: 'task' as any, name: 'Test Task', confidence: 1.0 },
        duration: 60,
        date: 'not-a-valid-date',
      }

      const transformed = transformAmendments([rawTimeLog])
      expect(transformed).toHaveLength(1)

      const result = transformed[0] as any
      // Invalid dates should be undefined or handled gracefully
      expect(result.date).toBeUndefined()
    })

    it('should transform multiple amendments of different types', () => {
      const rawAmendments = [
        {
          type: AmendmentType.TaskCreation,
          name: 'Task 1',
          duration: 30,
        },
        {
          type: AmendmentType.TimeLog,
          target: { type: 'task' as any, name: 'Task 2', confidence: 1.0 },
          duration: 60,
          date: '2025-01-15',
        },
        {
          type: AmendmentType.DeadlineChange,
          target: { type: 'task' as any, name: 'Task 3', confidence: 1.0 },
          newDeadline: '2025-03-01T12:00:00Z',
        },
      ]

      const transformed = transformAmendments(rawAmendments as any)
      expect(transformed).toHaveLength(3)

      // First one should be unchanged
      expect(transformed[0]).toEqual(rawAmendments[0])

      // Second one should have transformed date
      expect((transformed[1] as any).date).toBeInstanceOf(Date)

      // Third one should have transformed deadline
      expect((transformed[2] as any).newDeadline).toBeInstanceOf(Date)
    })
  })

  describe('createUserErrorReport', () => {
    it('should generate basic report with attempt count', () => {
      const result: ValidationLoopResult = {
        success: false,
        attempts: 3,
        validationResults: [],
      }

      const report = createUserErrorReport(result)
      expect(report).toContain('Failed to generate valid amendments after 3 attempts')
    })

    it('should handle empty validation results', () => {
      const result: ValidationLoopResult = {
        success: false,
        attempts: 5,
        validationResults: [],
      }

      const report = createUserErrorReport(result)
      expect(report).toContain('after 5 attempts')
      // Should not throw and should return a basic report
      expect(typeof report).toBe('string')
    })

    it('should format errors grouped by path', () => {
      const result: ValidationLoopResult = {
        success: false,
        attempts: 2,
        validationResults: [
          {
            valid: false,
            errors: [
              { path: 'amendments.0.name', message: 'Name is required' },
              { path: 'amendments.0.duration', message: 'Duration must be positive' },
              { path: 'amendments.1.type', message: 'Invalid amendment type' },
            ],
          },
        ],
      }

      const report = createUserErrorReport(result)
      expect(report).toContain('The following issues were found')
      expect(report).toContain('amendments.0')
      expect(report).toContain('Name is required')
      expect(report).toContain('Duration must be positive')
      expect(report).toContain('amendments.1')
      expect(report).toContain('Invalid amendment type')
    })

    it('should use only the last validation result', () => {
      const result: ValidationLoopResult = {
        success: false,
        attempts: 3,
        validationResults: [
          {
            valid: false,
            errors: [{ path: 'amendments.0.name', message: 'First attempt error' }],
          },
          {
            valid: false,
            errors: [{ path: 'amendments.0.name', message: 'Second attempt error' }],
          },
          {
            valid: false,
            errors: [{ path: 'amendments.0.name', message: 'Final attempt error' }],
          },
        ],
      }

      const report = createUserErrorReport(result)
      expect(report).toContain('Final attempt error')
      expect(report).not.toContain('First attempt error')
      expect(report).not.toContain('Second attempt error')
    })

    it('should handle validation result with no errors array', () => {
      const result: ValidationLoopResult = {
        success: false,
        attempts: 1,
        validationResults: [
          {
            valid: false,
            errors: [],
          },
        ],
      }

      const report = createUserErrorReport(result)
      expect(report).toContain('after 1 attempts')
      // Should not contain "issues were found" since errors array is empty
      expect(report).not.toContain('The following issues were found')
    })

    it('should group multiple errors under same path', () => {
      const result: ValidationLoopResult = {
        success: false,
        attempts: 1,
        validationResults: [
          {
            valid: false,
            errors: [
              { path: 'amendments.0.name', message: 'Name too short' },
              { path: 'amendments.0.name', message: 'Name contains invalid characters' },
              { path: 'amendments.0.duration', message: 'Duration required' },
            ],
          },
        ],
      }

      const report = createUserErrorReport(result)
      // Both name errors should be grouped under amendments.0
      expect(report).toContain('amendments.0')
      expect(report).toContain('Name too short')
      expect(report).toContain('Name contains invalid characters')
      expect(report).toContain('Duration required')
    })

    it('should handle deeply nested paths by grouping on first two segments', () => {
      const result: ValidationLoopResult = {
        success: false,
        attempts: 1,
        validationResults: [
          {
            valid: false,
            errors: [
              { path: 'amendments.0.target.name', message: 'Target name invalid' },
              { path: 'amendments.0.target.confidence', message: 'Confidence out of range' },
            ],
          },
        ],
      }

      const report = createUserErrorReport(result)
      // Both should be grouped under "amendments.0" (first two path segments)
      expect(report).toContain('amendments.0')
      expect(report).toContain('Target name invalid')
      expect(report).toContain('Confidence out of range')
    })
  })
})
