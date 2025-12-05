import { describe, it, expect } from 'vitest'
import { validateConvertedItems } from '../scheduler-converters'
import { UnifiedScheduleItem } from '../unified-scheduler'

// Helper to create a valid item
function createValidItem(overrides: Partial<UnifiedScheduleItem> = {}): UnifiedScheduleItem {
  return {
    id: 'item-1',
    name: 'Test Item',
    duration: 60,
    type: 'task',
    taskType: 'focus',
    importance: 5,
    urgency: 5,
    cognitiveComplexity: 3,
    dependencies: [],
    deadline: null,
    isLocked: false,
    lockedStartTime: null,
    sourceId: 'task-1',
    sourceType: 'task',
    ...overrides,
  }
}

describe('scheduler-converters', () => {
  describe('validateConvertedItems', () => {
    it('should pass for valid items', () => {
      const items = [createValidItem()]
      expect(() => validateConvertedItems(items)).not.toThrow()
    })

    it('should pass for empty array', () => {
      expect(() => validateConvertedItems([])).not.toThrow()
    })

    it('should throw for duplicate IDs', () => {
      const items = [
        createValidItem({ id: 'same-id' }),
        createValidItem({ id: 'same-id' }),
      ]
      expect(() => validateConvertedItems(items)).toThrow('Duplicate item ID detected: same-id')
    })

    it('should throw for missing ID', () => {
      const items = [createValidItem({ id: '' })]
      expect(() => validateConvertedItems(items)).toThrow('Item missing required ID')
    })

    it('should throw for missing name', () => {
      const items = [createValidItem({ name: '' })]
      expect(() => validateConvertedItems(items)).toThrow('missing required name')
    })

    it('should throw for null duration', () => {
      const items = [createValidItem({ duration: null as any })]
      expect(() => validateConvertedItems(items)).toThrow('invalid duration')
    })

    it('should throw for negative duration', () => {
      const items = [createValidItem({ duration: -10 })]
      expect(() => validateConvertedItems(items)).toThrow('invalid duration')
    })

    it('should throw for missing type', () => {
      const items = [createValidItem({ type: '' as any })]
      expect(() => validateConvertedItems(items)).toThrow('missing required type')
    })

    it('should throw for importance out of range (low)', () => {
      const items = [createValidItem({ importance: 0 })]
      expect(() => validateConvertedItems(items)).toThrow('invalid importance')
    })

    it('should throw for importance out of range (high)', () => {
      const items = [createValidItem({ importance: 11 })]
      expect(() => validateConvertedItems(items)).toThrow('invalid importance')
    })

    it('should throw for urgency out of range (low)', () => {
      const items = [createValidItem({ urgency: 0 })]
      expect(() => validateConvertedItems(items)).toThrow('invalid urgency')
    })

    it('should throw for urgency out of range (high)', () => {
      const items = [createValidItem({ urgency: 11 })]
      expect(() => validateConvertedItems(items)).toThrow('invalid urgency')
    })

    it('should throw for cognitive complexity out of range (low)', () => {
      const items = [createValidItem({ cognitiveComplexity: 0 })]
      expect(() => validateConvertedItems(items)).toThrow('invalid cognitive complexity')
    })

    it('should throw for cognitive complexity out of range (high)', () => {
      const items = [createValidItem({ cognitiveComplexity: 6 })]
      expect(() => validateConvertedItems(items)).toThrow('invalid cognitive complexity')
    })

    it('should allow null importance', () => {
      const items = [createValidItem({ importance: null })]
      expect(() => validateConvertedItems(items)).not.toThrow()
    })

    it('should allow null urgency', () => {
      const items = [createValidItem({ urgency: null })]
      expect(() => validateConvertedItems(items)).not.toThrow()
    })

    it('should allow null cognitiveComplexity', () => {
      const items = [createValidItem({ cognitiveComplexity: null })]
      expect(() => validateConvertedItems(items)).not.toThrow()
    })

    it('should validate multiple items', () => {
      const items = [
        createValidItem({ id: 'item-1' }),
        createValidItem({ id: 'item-2' }),
        createValidItem({ id: 'item-3' }),
      ]
      expect(() => validateConvertedItems(items)).not.toThrow()
    })
  })
})
