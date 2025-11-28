/**
 * Tests for amendment validation and retry logic
 */

import { describe, it, expect, vi } from 'vitest'
import { parseAIResponse, validateWithRetry, transformAmendments } from '../amendment-validator'
import { AmendmentType, TaskType, WorkPatternOperation, WorkSessionOperation, WorkBlockType } from '../enums'
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
        taskType: TaskType.Focused,
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
})
