import { describe, it, expect } from 'vitest'
import { isTimeLoggable } from '../types'

describe('types', () => {
  describe('isTimeLoggable', () => {
    it('should return true for valid TimeLoggable object', () => {
      const entity = {
        id: 'task-1',
        name: 'Test Task',
        duration: 60,
        type: 'task',
      }

      expect(isTimeLoggable(entity)).toBe(true)
    })

    it('should return true with extra properties', () => {
      const entity = {
        id: 'task-2',
        name: 'Extended Task',
        duration: 120,
        type: 'workflow',
        extra: 'property',
        priority: 5,
      }

      expect(isTimeLoggable(entity)).toBe(true)
    })

    it('should return false for null', () => {
      expect(isTimeLoggable(null)).toBe(false)
    })

    it('should return false for undefined', () => {
      expect(isTimeLoggable(undefined)).toBe(false)
    })

    it('should return false for primitive values', () => {
      expect(isTimeLoggable('string')).toBe(false)
      expect(isTimeLoggable(123)).toBe(false)
      expect(isTimeLoggable(true)).toBe(false)
    })

    it('should return false for empty object', () => {
      expect(isTimeLoggable({})).toBe(false)
    })

    it('should return false for missing id', () => {
      const entity = {
        name: 'Test',
        duration: 60,
        type: 'task',
      }

      expect(isTimeLoggable(entity)).toBe(false)
    })

    it('should return false for missing name', () => {
      const entity = {
        id: 'task-1',
        duration: 60,
        type: 'task',
      }

      expect(isTimeLoggable(entity)).toBe(false)
    })

    it('should return false for missing duration', () => {
      const entity = {
        id: 'task-1',
        name: 'Test',
        type: 'task',
      }

      expect(isTimeLoggable(entity)).toBe(false)
    })

    it('should return false for missing type', () => {
      const entity = {
        id: 'task-1',
        name: 'Test',
        duration: 60,
      }

      expect(isTimeLoggable(entity)).toBe(false)
    })

    it('should return false for non-string id', () => {
      const entity = {
        id: 123,
        name: 'Test',
        duration: 60,
        type: 'task',
      }

      expect(isTimeLoggable(entity)).toBe(false)
    })

    it('should return false for non-string name', () => {
      const entity = {
        id: 'task-1',
        name: ['Test'],
        duration: 60,
        type: 'task',
      }

      expect(isTimeLoggable(entity)).toBe(false)
    })

    it('should return false for non-number duration', () => {
      const entity = {
        id: 'task-1',
        name: 'Test',
        duration: '60',
        type: 'task',
      }

      expect(isTimeLoggable(entity)).toBe(false)
    })

    it('should return false for non-string type', () => {
      const entity = {
        id: 'task-1',
        name: 'Test',
        duration: 60,
        type: { kind: 'task' },
      }

      expect(isTimeLoggable(entity)).toBe(false)
    })

    it('should return false for array', () => {
      expect(isTimeLoggable([1, 2, 3])).toBe(false)
    })

    it('should return false for object with null id', () => {
      const entity = {
        id: null,
        name: 'Test',
        duration: 60,
        type: 'task',
      }
      expect(isTimeLoggable(entity)).toBe(false)
    })

    it('should return false for object with undefined name', () => {
      const entity = {
        id: 'task-1',
        name: undefined,
        duration: 60,
        type: 'task',
      }
      expect(isTimeLoggable(entity)).toBe(false)
    })

    it('should return true with zero duration', () => {
      const entity = {
        id: 'task-1',
        name: 'Zero Duration Task',
        duration: 0,
        type: 'task',
      }
      expect(isTimeLoggable(entity)).toBe(true)
    })

    it('should return true with negative duration', () => {
      // Type guard only checks type, not validity
      const entity = {
        id: 'task-1',
        name: 'Negative Task',
        duration: -10,
        type: 'task',
      }
      expect(isTimeLoggable(entity)).toBe(true)
    })
  })
})
