/**
 * Tests for amendment validation and retry logic
 */

import { describe, it, expect, vi } from 'vitest'
import { parseAIResponse, validateWithRetry } from '../amendment-validator'
import { AmendmentType } from '../enums'

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
})
