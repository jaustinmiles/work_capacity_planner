import { describe, it, expect } from 'vitest'
import { findStepByName, findStepIndexByName } from '../step-utils'
import type { TaskStep } from '@shared/types'

describe('step-utils', () => {
  // Sample steps for testing
  const mockSteps: TaskStep[] = [
    {
      id: 'step-1',
      taskId: 'workflow-1',
      name: 'Research topic',
      duration: 30,
      type: 'research',
      dependsOn: [],
      asyncWaitTime: 0,
      status: 'pending',
      stepIndex: 0,
      percentComplete: 0,
    },
    {
      id: 'step-2',
      taskId: 'workflow-1',
      name: 'Write draft',
      duration: 60,
      type: 'writing',
      dependsOn: ['step-1'],
      asyncWaitTime: 0,
      status: 'pending',
      stepIndex: 1,
      percentComplete: 0,
    },
    {
      id: 'step-3',
      taskId: 'workflow-1',
      name: 'Review and edit',
      duration: 20,
      type: 'review',
      dependsOn: ['step-2'],
      asyncWaitTime: 0,
      status: 'pending',
      stepIndex: 2,
      percentComplete: 0,
    },
  ]

  describe('findStepByName', () => {
    it('should find step by exact name', () => {
      const result = findStepByName(mockSteps, 'Research topic')
      expect(result).toBeDefined()
      expect(result?.id).toBe('step-1')
      expect(result?.name).toBe('Research topic')
    })

    it('should find step case-insensitively', () => {
      const result = findStepByName(mockSteps, 'RESEARCH TOPIC')
      expect(result).toBeDefined()
      expect(result?.id).toBe('step-1')
    })

    it('should find step with mixed case', () => {
      const result = findStepByName(mockSteps, 'ReSeArCh ToPiC')
      expect(result).toBeDefined()
      expect(result?.id).toBe('step-1')
    })

    it('should find step with trimmed whitespace', () => {
      const result = findStepByName(mockSteps, '  Research topic  ')
      expect(result).toBeDefined()
      expect(result?.id).toBe('step-1')
    })

    it('should NOT find step by partial name (exact match only)', () => {
      // "Research" should NOT match "Research topic"
      expect(findStepByName(mockSteps, 'Research')).toBeUndefined()
      expect(findStepByName(mockSteps, 'topic')).toBeUndefined()
      expect(findStepByName(mockSteps, 'Write')).toBeUndefined()
    })

    it('should return undefined for non-existent step', () => {
      expect(findStepByName(mockSteps, 'Non-existent step')).toBeUndefined()
    })

    it('should return undefined for empty string', () => {
      expect(findStepByName(mockSteps, '')).toBeUndefined()
    })

    it('should return undefined for whitespace-only string', () => {
      expect(findStepByName(mockSteps, '   ')).toBeUndefined()
    })

    it('should handle empty steps array', () => {
      expect(findStepByName([], 'Research topic')).toBeUndefined()
    })
  })

  describe('findStepIndexByName', () => {
    it('should find step index by exact name', () => {
      expect(findStepIndexByName(mockSteps, 'Research topic')).toBe(0)
      expect(findStepIndexByName(mockSteps, 'Write draft')).toBe(1)
      expect(findStepIndexByName(mockSteps, 'Review and edit')).toBe(2)
    })

    it('should find step index case-insensitively', () => {
      expect(findStepIndexByName(mockSteps, 'WRITE DRAFT')).toBe(1)
      expect(findStepIndexByName(mockSteps, 'review and edit')).toBe(2)
    })

    it('should find step index with trimmed whitespace', () => {
      expect(findStepIndexByName(mockSteps, '  Write draft  ')).toBe(1)
    })

    it('should NOT find step index by partial name (exact match only)', () => {
      expect(findStepIndexByName(mockSteps, 'Write')).toBe(-1)
      expect(findStepIndexByName(mockSteps, 'draft')).toBe(-1)
      expect(findStepIndexByName(mockSteps, 'Review')).toBe(-1)
    })

    it('should return -1 for non-existent step', () => {
      expect(findStepIndexByName(mockSteps, 'Non-existent')).toBe(-1)
    })

    it('should return -1 for empty string', () => {
      expect(findStepIndexByName(mockSteps, '')).toBe(-1)
    })

    it('should handle empty steps array', () => {
      expect(findStepIndexByName([], 'Research topic')).toBe(-1)
    })
  })
})
