import { describe, it, expect, vi, beforeEach } from 'vitest'
import { resolveTaskType } from '../task-type-utils'
import { logger } from '@/logger'

// Mock the logger
vi.mock('@/logger', () => ({
  logger: {
    ui: {
      warn: vi.fn(),
    },
  },
}))

// Mock the user task type store with a mutable type list so the
// no-types-defined failure mode is testable.
const storeState = vi.hoisted(() => ({
  types: [] as Array<{ id: string; name: string; color: string }>,
}))

vi.mock('../../../store/useUserTaskTypeStore', () => ({
  useUserTaskTypeStore: {
    getState: () => ({
      types: storeState.types,
    }),
  },
}))

describe('task-type-utils', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    storeState.types = [
      { id: 'type-1', name: 'Research', color: '#ff0000' },
      { id: 'type-2', name: 'Development', color: '#00ff00' },
      { id: 'type-3', name: 'Meeting', color: '#0000ff' },
    ]
  })

  describe('resolveTaskType', () => {
    it('should match by exact ID', () => {
      expect(resolveTaskType('type-1')).toBe('type-1')
      expect(resolveTaskType('type-2')).toBe('type-2')
      expect(resolveTaskType('type-3')).toBe('type-3')
    })

    it('should match by exact name (case-insensitive)', () => {
      expect(resolveTaskType('Research')).toBe('type-1')
      expect(resolveTaskType('Development')).toBe('type-2')
      expect(resolveTaskType('Meeting')).toBe('type-3')
    })

    it('should match by name with different case', () => {
      expect(resolveTaskType('RESEARCH')).toBe('type-1')
      expect(resolveTaskType('development')).toBe('type-2')
      expect(resolveTaskType('mEeTiNg')).toBe('type-3')
    })

    it('should prefer ID match over name match', () => {
      // If both ID and name could match, ID should win
      // This is implicit in the implementation - ID is checked first
      expect(resolveTaskType('type-1')).toBe('type-1')
    })

    // Regression: resolveTaskType used to return '' here, silently creating
    // typeless tasks the scheduler could never place — and which the server
    // now rejects. It must always resolve to a real user-defined type.
    it('falls back to the first user-defined type for undefined input', () => {
      expect(resolveTaskType(undefined)).toBe('type-1')
    })

    it('falls back to the first user-defined type for empty string input', () => {
      expect(resolveTaskType('')).toBe('type-1')
    })

    it('falls back to the first user-defined type for a non-existent type and warns', () => {
      expect(resolveTaskType('NonExistent')).toBe('type-1')
      expect(logger.ui.warn).toHaveBeenCalledTimes(1)
    })

    it('falls back to the first user-defined type for partial name matches', () => {
      // "Res" should NOT match "Research"
      expect(resolveTaskType('Res')).toBe('type-1')
      expect(resolveTaskType('Dev')).toBe('type-1')
    })

    it('does not warn when no type was requested', () => {
      resolveTaskType(undefined)
      expect(logger.ui.warn).not.toHaveBeenCalled()
    })

    it('throws when no task types exist instead of returning an empty type', () => {
      storeState.types = []
      expect(() => resolveTaskType('anything')).toThrow('No task types')
    })
  })
})
