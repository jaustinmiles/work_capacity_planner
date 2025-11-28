/**
 * Tests for enum utility functions
 */

import { describe, it, expect } from 'vitest'
import { assertNever, isValidEnumValue, parseEnum } from '../enum-utils'
import { TaskType, StepStatus, AmendmentType } from '../enums'

describe('enum-utils', () => {
  describe('isValidEnumValue', () => {
    it('should return true for valid TaskType values', () => {
      expect(isValidEnumValue(TaskType, 'focused')).toBe(true)
      expect(isValidEnumValue(TaskType, 'admin')).toBe(true)
      expect(isValidEnumValue(TaskType, 'personal')).toBe(true)
      expect(isValidEnumValue(TaskType, 'mixed')).toBe(true)
      expect(isValidEnumValue(TaskType, 'flexible')).toBe(true)
    })

    it('should return false for invalid TaskType values', () => {
      expect(isValidEnumValue(TaskType, 'invalid')).toBe(false)
      expect(isValidEnumValue(TaskType, '')).toBe(false)
      expect(isValidEnumValue(TaskType, 'FOCUSED')).toBe(false) // case sensitive
    })

    it('should return true for valid StepStatus values', () => {
      expect(isValidEnumValue(StepStatus, 'pending')).toBe(true)
      expect(isValidEnumValue(StepStatus, 'in_progress')).toBe(true)
      expect(isValidEnumValue(StepStatus, 'completed')).toBe(true)
      expect(isValidEnumValue(StepStatus, 'skipped')).toBe(true)
    })

    it('should return false for invalid StepStatus values', () => {
      expect(isValidEnumValue(StepStatus, 'running')).toBe(false)
      expect(isValidEnumValue(StepStatus, 'done')).toBe(false)
    })

    it('should return true for valid AmendmentType values', () => {
      expect(isValidEnumValue(AmendmentType, 'status_update')).toBe(true)
      expect(isValidEnumValue(AmendmentType, 'task_creation')).toBe(true)
      expect(isValidEnumValue(AmendmentType, 'workflow_creation')).toBe(true)
    })

    it('should return false for invalid AmendmentType values', () => {
      expect(isValidEnumValue(AmendmentType, 'StatusUpdate')).toBe(false) // wrong format
      expect(isValidEnumValue(AmendmentType, 'unknown')).toBe(false)
    })
  })

  describe('parseEnum', () => {
    it('should return the value if it is a valid enum value', () => {
      expect(parseEnum(TaskType, 'focused', TaskType.Admin)).toBe(TaskType.Focused)
      expect(parseEnum(TaskType, 'admin', TaskType.Focused)).toBe(TaskType.Admin)
      expect(parseEnum(StepStatus, 'completed', StepStatus.Pending)).toBe(StepStatus.Completed)
    })

    it('should return the fallback if value is invalid', () => {
      expect(parseEnum(TaskType, 'invalid', TaskType.Admin)).toBe(TaskType.Admin)
      expect(parseEnum(TaskType, '', TaskType.Focused)).toBe(TaskType.Focused)
      expect(parseEnum(StepStatus, 'unknown', StepStatus.Pending)).toBe(StepStatus.Pending)
    })

    it('should return fallback for case-sensitive mismatches', () => {
      expect(parseEnum(TaskType, 'FOCUSED', TaskType.Admin)).toBe(TaskType.Admin)
      expect(parseEnum(TaskType, 'Focused', TaskType.Admin)).toBe(TaskType.Admin)
    })
  })

  describe('assertNever', () => {
    it('should throw an error with the unexpected value', () => {
      const unexpectedValue = 'unexpected' as never
      expect(() => assertNever(unexpectedValue)).toThrow('Unexpected value: unexpected')
    })

    it('should handle object values in error message', () => {
      const unexpectedObject = { type: 'unknown', data: 123 } as never
      expect(() => assertNever(unexpectedObject)).toThrow('Unexpected value:')
      // Should contain JSON representation
      expect(() => assertNever(unexpectedObject)).toThrow('"type"')
    })

    it('should handle null and undefined', () => {
      expect(() => assertNever(null as never)).toThrow('Unexpected value: null')
      expect(() => assertNever(undefined as never)).toThrow('Unexpected value: undefined')
    })

    it('should handle number values', () => {
      expect(() => assertNever(42 as never)).toThrow('Unexpected value: 42')
    })
  })

  describe('exhaustive switch pattern with assertNever', () => {
    // This test demonstrates the pattern for exhaustive switch statements
    function getTaskTypeLabel(type: TaskType): string {
      switch (type) {
        case TaskType.Focused:
          return 'Deep Work'
        case TaskType.Admin:
          return 'Administrative'
        case TaskType.Personal:
          return 'Personal'
        case TaskType.Mixed:
          return 'Mixed'
        case TaskType.Flexible:
          return 'Flexible'
        default:
          return assertNever(type)
      }
    }

    it('should handle all TaskType values', () => {
      expect(getTaskTypeLabel(TaskType.Focused)).toBe('Deep Work')
      expect(getTaskTypeLabel(TaskType.Admin)).toBe('Administrative')
      expect(getTaskTypeLabel(TaskType.Personal)).toBe('Personal')
      expect(getTaskTypeLabel(TaskType.Mixed)).toBe('Mixed')
      expect(getTaskTypeLabel(TaskType.Flexible)).toBe('Flexible')
    })
  })
})
