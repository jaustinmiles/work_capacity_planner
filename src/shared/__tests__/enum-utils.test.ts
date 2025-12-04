/**
 * Tests for enum utility functions
 */

import { describe, it, expect } from 'vitest'
import { assertNever, isValidEnumValue, parseEnum } from '../enum-utils'
import { UserTaskTypeKind, StepStatus, AmendmentType } from '../enums'

describe('enum-utils', () => {
  describe('isValidEnumValue', () => {
    it('should return true for valid UserTaskTypeKind values', () => {
      expect(isValidEnumValue(UserTaskTypeKind, 'system')).toBe(true)
      expect(isValidEnumValue(UserTaskTypeKind, 'user')).toBe(true)
    })

    it('should return false for invalid UserTaskTypeKind values', () => {
      expect(isValidEnumValue(UserTaskTypeKind, 'invalid')).toBe(false)
      expect(isValidEnumValue(UserTaskTypeKind, '')).toBe(false)
      expect(isValidEnumValue(UserTaskTypeKind, 'SYSTEM')).toBe(false) // case sensitive
      expect(isValidEnumValue(UserTaskTypeKind, 'admin')).toBe(false)
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
      expect(parseEnum(UserTaskTypeKind, 'system', UserTaskTypeKind.User)).toBe(UserTaskTypeKind.System)
      expect(parseEnum(UserTaskTypeKind, 'user', UserTaskTypeKind.System)).toBe(UserTaskTypeKind.User)
      expect(parseEnum(StepStatus, 'completed', StepStatus.Pending)).toBe(StepStatus.Completed)
    })

    it('should return the fallback if value is invalid', () => {
      expect(parseEnum(UserTaskTypeKind, 'invalid', UserTaskTypeKind.User)).toBe(UserTaskTypeKind.User)
      expect(parseEnum(UserTaskTypeKind, '', UserTaskTypeKind.System)).toBe(UserTaskTypeKind.System)
      expect(parseEnum(StepStatus, 'unknown', StepStatus.Pending)).toBe(StepStatus.Pending)
    })

    it('should return fallback for case-sensitive mismatches', () => {
      expect(parseEnum(UserTaskTypeKind, 'SYSTEM', UserTaskTypeKind.User)).toBe(UserTaskTypeKind.User)
      expect(parseEnum(UserTaskTypeKind, 'System', UserTaskTypeKind.User)).toBe(UserTaskTypeKind.User)
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
    function getTypeKindLabel(kind: UserTaskTypeKind): string {
      switch (kind) {
        case UserTaskTypeKind.System:
          return 'System Type'
        case UserTaskTypeKind.User:
          return 'User-Defined Type'
        default:
          return assertNever(kind)
      }
    }

    it('should handle all UserTaskTypeKind values', () => {
      expect(getTypeKindLabel(UserTaskTypeKind.System)).toBe('System Type')
      expect(getTypeKindLabel(UserTaskTypeKind.User)).toBe('User-Defined Type')
    })
  })
})
