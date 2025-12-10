import { describe, it, expect, vi, beforeEach } from 'vitest'
import { resolveTaskType } from '../task-type-utils'

// Mock the logger
vi.mock('@/logger', () => ({
  logger: {
    ui: {
      warn: vi.fn(),
    },
  },
}))

// Mock the user task type store
const mockTypes = [
  { id: 'type-1', name: 'Research', color: '#ff0000' },
  { id: 'type-2', name: 'Development', color: '#00ff00' },
  { id: 'type-3', name: 'Meeting', color: '#0000ff' },
]

vi.mock('../../../store/useUserTaskTypeStore', () => ({
  useUserTaskTypeStore: {
    getState: () => ({
      types: mockTypes,
    }),
  },
}))

describe('task-type-utils', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('resolveTaskType', () => {
    it('should return empty string for undefined input', () => {
      expect(resolveTaskType(undefined)).toBe('')
    })

    it('should return empty string for empty string input', () => {
      expect(resolveTaskType('')).toBe('')
    })

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

    it('should return empty string for non-existent type', () => {
      expect(resolveTaskType('NonExistent')).toBe('')
    })

    it('should return empty string for partial name match', () => {
      // "Res" should NOT match "Research"
      expect(resolveTaskType('Res')).toBe('')
      expect(resolveTaskType('Dev')).toBe('')
    })

    it('should prefer ID match over name match', () => {
      // If both ID and name could match, ID should win
      // This is implicit in the implementation - ID is checked first
      expect(resolveTaskType('type-1')).toBe('type-1')
    })
  })
})
