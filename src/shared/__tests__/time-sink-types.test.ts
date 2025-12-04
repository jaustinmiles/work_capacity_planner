/**
 * Unit tests for time-sink-types.ts validation and utility functions
 */

import {
  TimeSink,
  TimeSinkSession,
  CreateTimeSinkInput,
  getSinkColor,
  getSinkEmoji,
  getSinkName,
  getSinkById,
  getSortedSinks,
  isSessionActive,
  calculateSessionDuration,
  validateSinkName,
  validateSinkColor,
  validateSinkEmoji,
  validateCreateSinkInput,
  createTimeSink,
  createTimeSinkSession,
  startTimeSinkSession,
  recordToTimeSink,
  timeSinkToRecord,
  recordToTimeSinkSession,
  timeSinkSessionToRecord,
  createEmptyAccumulatedSinkTime,
  addAccumulatedSinkTime,
  getAccumulatedTimeForSink,
  mergeAccumulatedSinkTime,
  calculateTotalSinkTime,
  SUGGESTED_TIME_SINKS,
} from '../time-sink-types'

describe('time-sink-types', () => {
  // Test fixtures - helper function inside describe block
  function createMockSink(overrides: Partial<TimeSink> = {}): TimeSink {
    return {
      id: 'sink-123',
      sessionId: 'session-456',
      name: 'Phone calls',
      emoji: '📞',
      color: '#9B59B6',
      sortOrder: 0,
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
      ...overrides,
    }
  }

  function createMockSession(overrides: Partial<TimeSinkSession> = {}): TimeSinkSession {
    return {
      id: 'sinksess-123',
      timeSinkId: 'sink-123',
      startTime: new Date('2024-01-15T10:00:00.000Z'),
      createdAt: new Date('2024-01-15T10:00:00.000Z'),
      ...overrides,
    }
  }

  const mockSinks: TimeSink[] = [
    createMockSink({ id: 'sink-1', name: 'Phone calls', emoji: '📞', color: '#9B59B6', sortOrder: 1 }),
    createMockSink({ id: 'sink-2', name: 'Social media', emoji: '📱', color: '#3498DB', sortOrder: 0 }),
    createMockSink({ id: 'sink-3', name: 'Coffee break', emoji: '☕', color: '#8B4513', sortOrder: 2 }),
  ]

  // Utility function tests
  describe('getSinkColor', () => {
    it('returns the color for an existing sink', () => {
      expect(getSinkColor(mockSinks, 'sink-1')).toBe('#9B59B6')
      expect(getSinkColor(mockSinks, 'sink-2')).toBe('#3498DB')
    })

    it('returns default gray for unknown sink', () => {
      expect(getSinkColor(mockSinks, 'nonexistent')).toBe('#808080')
    })

    it('returns default gray for empty sinks array', () => {
      expect(getSinkColor([], 'any-id')).toBe('#808080')
    })
  })

  describe('getSinkEmoji', () => {
    it('returns the emoji for an existing sink', () => {
      expect(getSinkEmoji(mockSinks, 'sink-1')).toBe('📞')
      expect(getSinkEmoji(mockSinks, 'sink-2')).toBe('📱')
    })

    it('returns default timer emoji for unknown sink', () => {
      expect(getSinkEmoji(mockSinks, 'nonexistent')).toBe('⏱️')
    })

    it('returns default emoji for empty sinks array', () => {
      expect(getSinkEmoji([], 'any-id')).toBe('⏱️')
    })
  })

  describe('getSinkName', () => {
    it('returns the name for an existing sink', () => {
      expect(getSinkName(mockSinks, 'sink-1')).toBe('Phone calls')
      expect(getSinkName(mockSinks, 'sink-3')).toBe('Coffee break')
    })

    it('returns "Unknown" for unknown sink', () => {
      expect(getSinkName(mockSinks, 'nonexistent')).toBe('Unknown')
    })

    it('returns "Unknown" for empty sinks array', () => {
      expect(getSinkName([], 'any-id')).toBe('Unknown')
    })
  })

  describe('getSinkById', () => {
    it('returns the sink for an existing ID', () => {
      const result = getSinkById(mockSinks, 'sink-1')
      expect(result).toBeDefined()
      expect(result?.name).toBe('Phone calls')
    })

    it('returns undefined for unknown ID', () => {
      expect(getSinkById(mockSinks, 'nonexistent')).toBeUndefined()
    })
  })

  describe('getSortedSinks', () => {
    it('sorts sinks by sortOrder ascending', () => {
      const sorted = getSortedSinks(mockSinks)
      expect(sorted[0].name).toBe('Social media') // sortOrder: 0
      expect(sorted[1].name).toBe('Phone calls') // sortOrder: 1
      expect(sorted[2].name).toBe('Coffee break') // sortOrder: 2
    })

    it('does not mutate the original array', () => {
      const originalFirst = mockSinks[0]
      getSortedSinks(mockSinks)
      expect(mockSinks[0]).toBe(originalFirst)
    })

    it('handles empty array', () => {
      expect(getSortedSinks([])).toEqual([])
    })
  })

  describe('isSessionActive', () => {
    it('returns true for session without endTime', () => {
      const session = createMockSession({ endTime: undefined })
      expect(isSessionActive(session)).toBe(true)
    })

    it('returns false for session with endTime', () => {
      const session = createMockSession({ endTime: new Date('2024-01-15T10:30:00.000Z') })
      expect(isSessionActive(session)).toBe(false)
    })
  })

  describe('calculateSessionDuration', () => {
    it('returns actualMinutes if available', () => {
      const session = createMockSession({
        endTime: new Date('2024-01-15T10:30:00.000Z'),
        actualMinutes: 25,
      })
      expect(calculateSessionDuration(session)).toBe(25)
    })

    it('calculates duration from start and end times', () => {
      const session = createMockSession({
        startTime: new Date('2024-01-15T10:00:00.000Z'),
        endTime: new Date('2024-01-15T10:45:00.000Z'),
      })
      expect(calculateSessionDuration(session)).toBe(45)
    })
  })

  // Validation function tests
  describe('validateSinkName', () => {
    it('returns valid for normal names', () => {
      expect(validateSinkName('Phone calls')).toEqual({ valid: true })
      expect(validateSinkName('Coffee break')).toEqual({ valid: true })
    })

    it('returns invalid for empty string', () => {
      const result = validateSinkName('')
      expect(result.valid).toBe(false)
      expect(result.error).toBe('Name cannot be empty')
    })

    it('returns invalid for whitespace-only string', () => {
      const result = validateSinkName('   ')
      expect(result.valid).toBe(false)
      expect(result.error).toBe('Name cannot be empty')
    })

    it('returns invalid for names over 100 characters', () => {
      const longName = 'A'.repeat(101)
      const result = validateSinkName(longName)
      expect(result.valid).toBe(false)
      expect(result.error).toBe('Name must be 100 characters or less')
    })

    it('returns valid for exactly 100 characters', () => {
      const exactName = 'A'.repeat(100)
      expect(validateSinkName(exactName)).toEqual({ valid: true })
    })
  })

  describe('validateSinkColor', () => {
    it('returns valid for proper hex colors', () => {
      expect(validateSinkColor('#FF5500')).toEqual({ valid: true })
      expect(validateSinkColor('#000000')).toEqual({ valid: true })
      expect(validateSinkColor('#ffffff')).toEqual({ valid: true })
      expect(validateSinkColor('#AbCdEf')).toEqual({ valid: true })
    })

    it('returns invalid for missing hash', () => {
      const result = validateSinkColor('FF5500')
      expect(result.valid).toBe(false)
      expect(result.error).toContain('valid hex color')
    })

    it('returns invalid for short hex', () => {
      const result = validateSinkColor('#FFF')
      expect(result.valid).toBe(false)
      expect(result.error).toContain('valid hex color')
    })

    it('returns invalid for invalid characters', () => {
      const result = validateSinkColor('#GGGGGG')
      expect(result.valid).toBe(false)
      expect(result.error).toContain('valid hex color')
    })

    it('returns invalid for empty string', () => {
      const result = validateSinkColor('')
      expect(result.valid).toBe(false)
    })
  })

  describe('validateSinkEmoji', () => {
    it('returns valid for single emoji', () => {
      expect(validateSinkEmoji('📞')).toEqual({ valid: true })
      expect(validateSinkEmoji('☕')).toEqual({ valid: true })
    })

    it('returns valid for emoji with modifier (skin tone)', () => {
      expect(validateSinkEmoji('👍🏻')).toEqual({ valid: true })
    })

    it('returns invalid for empty string', () => {
      const result = validateSinkEmoji('')
      expect(result.valid).toBe(false)
      expect(result.error).toBe('Emoji cannot be empty')
    })

    it('returns invalid for string over 4 characters', () => {
      const result = validateSinkEmoji('hello')
      expect(result.valid).toBe(false)
      expect(result.error).toBe('Emoji must be a single emoji character')
    })
  })

  describe('validateCreateSinkInput', () => {
    it('returns valid for correct input', () => {
      const input: CreateTimeSinkInput = {
        sessionId: 'session-123',
        name: 'Phone calls',
        emoji: '📞',
        color: '#9B59B6',
      }
      const result = validateCreateSinkInput(input)
      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('collects multiple errors', () => {
      const input: CreateTimeSinkInput = {
        sessionId: '',
        name: '',
        emoji: '',
        color: 'invalid',
      }
      const result = validateCreateSinkInput(input)
      expect(result.valid).toBe(false)
      expect(result.errors.length).toBeGreaterThan(0)
      expect(result.errors).toContain('Name cannot be empty')
      expect(result.errors).toContain('Session ID is required')
    })
  })

  // Factory function tests
  describe('createTimeSink', () => {
    it('creates a sink with generated ID and timestamps', () => {
      const input: CreateTimeSinkInput = {
        sessionId: 'session-123',
        name: '  Phone calls  ',
        emoji: '📞',
        color: '#9b59b6',
      }
      const result = createTimeSink(input)

      expect(result.id).toMatch(/^sink-/)
      expect(result.sessionId).toBe('session-123')
      expect(result.name).toBe('Phone calls') // Trimmed
      expect(result.emoji).toBe('📞')
      expect(result.color).toBe('#9B59B6') // Uppercased
      expect(result.sortOrder).toBe(0)
      expect(result.createdAt).toBeInstanceOf(Date)
      expect(result.updatedAt).toBeInstanceOf(Date)
    })

    it('uses provided sortOrder', () => {
      const input: CreateTimeSinkInput = {
        sessionId: 'session-123',
        name: 'Test',
        emoji: '⏱️',
        color: '#FF5500',
        sortOrder: 5,
      }
      const result = createTimeSink(input)
      expect(result.sortOrder).toBe(5)
    })

    it('includes optional typeId when provided', () => {
      const input: CreateTimeSinkInput = {
        sessionId: 'session-123',
        name: 'Test',
        emoji: '⏱️',
        color: '#FF5500',
        typeId: 'type-123',
      }
      const result = createTimeSink(input)
      expect(result.typeId).toBe('type-123')
    })
  })

  describe('createTimeSinkSession', () => {
    it('creates a session with generated ID', () => {
      const result = createTimeSinkSession({
        timeSinkId: 'sink-123',
        startTime: new Date('2024-01-15T10:00:00.000Z'),
      })

      expect(result.id).toMatch(/^sinksess-/)
      expect(result.timeSinkId).toBe('sink-123')
      expect(result.startTime).toEqual(new Date('2024-01-15T10:00:00.000Z'))
      expect(result.endTime).toBeUndefined()
      expect(result.actualMinutes).toBeUndefined()
      expect(result.createdAt).toBeInstanceOf(Date)
    })

    it('includes optional fields when provided', () => {
      const result = createTimeSinkSession({
        timeSinkId: 'sink-123',
        startTime: new Date('2024-01-15T10:00:00.000Z'),
        endTime: new Date('2024-01-15T10:30:00.000Z'),
        actualMinutes: 30,
        notes: 'Called mom',
      })

      expect(result.endTime).toEqual(new Date('2024-01-15T10:30:00.000Z'))
      expect(result.actualMinutes).toBe(30)
      expect(result.notes).toBe('Called mom')
    })
  })

  describe('startTimeSinkSession', () => {
    it('creates an active session starting now', () => {
      const result = startTimeSinkSession('sink-123')

      expect(result.id).toMatch(/^sinksess-/)
      expect(result.timeSinkId).toBe('sink-123')
      expect(result.startTime).toBeInstanceOf(Date)
      expect(result.endTime).toBeUndefined()
      expect(result.notes).toBeUndefined()
    })

    it('includes notes when provided', () => {
      const result = startTimeSinkSession('sink-123', 'Initial note')
      expect(result.notes).toBe('Initial note')
    })
  })

  // Conversion function tests
  describe('recordToTimeSink', () => {
    it('converts string dates to Date objects', () => {
      const record = {
        id: 'sink-123',
        sessionId: 'session-456',
        name: 'Phone calls',
        emoji: '📞',
        color: '#9B59B6',
        typeId: null,
        sortOrder: 0,
        createdAt: '2024-01-15T10:30:00.000Z',
        updatedAt: '2024-01-16T14:00:00.000Z',
      }
      const result = recordToTimeSink(record)

      expect(result.createdAt).toBeInstanceOf(Date)
      expect(result.updatedAt).toBeInstanceOf(Date)
      expect(result.createdAt.toISOString()).toBe('2024-01-15T10:30:00.000Z')
      expect(result.updatedAt.toISOString()).toBe('2024-01-16T14:00:00.000Z')
      expect(result.typeId).toBeUndefined()
    })

    it('preserves typeId when present', () => {
      const record = {
        id: 'sink-123',
        sessionId: 'session-456',
        name: 'Phone calls',
        emoji: '📞',
        color: '#9B59B6',
        typeId: 'type-123',
        sortOrder: 0,
        createdAt: '2024-01-15T10:30:00.000Z',
        updatedAt: '2024-01-16T14:00:00.000Z',
      }
      const result = recordToTimeSink(record)
      expect(result.typeId).toBe('type-123')
    })
  })

  describe('timeSinkToRecord', () => {
    it('converts Date objects to ISO strings', () => {
      const sink = createMockSink({
        createdAt: new Date('2024-01-15T10:30:00.000Z'),
        updatedAt: new Date('2024-01-16T14:00:00.000Z'),
      })
      const result = timeSinkToRecord(sink)

      expect(result.createdAt).toBe('2024-01-15T10:30:00.000Z')
      expect(result.updatedAt).toBe('2024-01-16T14:00:00.000Z')
      expect(result.typeId).toBeNull()
    })
  })

  describe('recordToTimeSinkSession', () => {
    it('converts string dates to Date objects', () => {
      const record = {
        id: 'sinksess-123',
        timeSinkId: 'sink-123',
        startTime: '2024-01-15T10:00:00.000Z',
        endTime: '2024-01-15T10:30:00.000Z',
        actualMinutes: 30,
        notes: 'Test note',
        createdAt: '2024-01-15T10:00:00.000Z',
      }
      const result = recordToTimeSinkSession(record)

      expect(result.startTime).toBeInstanceOf(Date)
      expect(result.endTime).toBeInstanceOf(Date)
      expect(result.createdAt).toBeInstanceOf(Date)
      expect(result.actualMinutes).toBe(30)
      expect(result.notes).toBe('Test note')
    })

    it('handles null values correctly', () => {
      const record = {
        id: 'sinksess-123',
        timeSinkId: 'sink-123',
        startTime: '2024-01-15T10:00:00.000Z',
        endTime: null,
        actualMinutes: null,
        notes: null,
        createdAt: '2024-01-15T10:00:00.000Z',
      }
      const result = recordToTimeSinkSession(record)

      expect(result.endTime).toBeUndefined()
      expect(result.actualMinutes).toBeUndefined()
      expect(result.notes).toBeUndefined()
    })
  })

  describe('timeSinkSessionToRecord', () => {
    it('converts Date objects to ISO strings', () => {
      const session = createMockSession({
        startTime: new Date('2024-01-15T10:00:00.000Z'),
        endTime: new Date('2024-01-15T10:30:00.000Z'),
        actualMinutes: 30,
        notes: 'Test',
      })
      const result = timeSinkSessionToRecord(session)

      expect(result.startTime).toBe('2024-01-15T10:00:00.000Z')
      expect(result.endTime).toBe('2024-01-15T10:30:00.000Z')
      expect(result.actualMinutes).toBe(30)
      expect(result.notes).toBe('Test')
    })

    it('handles undefined values correctly', () => {
      const session = createMockSession({
        endTime: undefined,
        actualMinutes: undefined,
        notes: undefined,
      })
      const result = timeSinkSessionToRecord(session)

      expect(result.endTime).toBeNull()
      expect(result.actualMinutes).toBeNull()
      expect(result.notes).toBeNull()
    })
  })

  // Accumulated time utility tests
  describe('createEmptyAccumulatedSinkTime', () => {
    it('returns an empty object', () => {
      expect(createEmptyAccumulatedSinkTime()).toEqual({})
    })
  })

  describe('addAccumulatedSinkTime', () => {
    it('adds time to new sink', () => {
      const accumulated = {}
      const result = addAccumulatedSinkTime(accumulated, 'sink-1', 30)
      expect(result).toEqual({ 'sink-1': 30 })
    })

    it('adds time to existing sink', () => {
      const accumulated = { 'sink-1': 30 }
      const result = addAccumulatedSinkTime(accumulated, 'sink-1', 15)
      expect(result).toEqual({ 'sink-1': 45 })
    })

    it('does not mutate original object', () => {
      const accumulated = { 'sink-1': 30 }
      addAccumulatedSinkTime(accumulated, 'sink-1', 15)
      expect(accumulated).toEqual({ 'sink-1': 30 })
    })
  })

  describe('getAccumulatedTimeForSink', () => {
    it('returns accumulated time for existing sink', () => {
      const accumulated = { 'sink-1': 30, 'sink-2': 45 }
      expect(getAccumulatedTimeForSink(accumulated, 'sink-1')).toBe(30)
      expect(getAccumulatedTimeForSink(accumulated, 'sink-2')).toBe(45)
    })

    it('returns 0 for non-existent sink', () => {
      const accumulated = { 'sink-1': 30 }
      expect(getAccumulatedTimeForSink(accumulated, 'sink-999')).toBe(0)
    })

    it('returns 0 for empty accumulated', () => {
      expect(getAccumulatedTimeForSink({}, 'sink-1')).toBe(0)
    })
  })

  describe('mergeAccumulatedSinkTime', () => {
    it('merges two accumulated time records', () => {
      const a = { 'sink-1': 30, 'sink-2': 15 }
      const b = { 'sink-2': 10, 'sink-3': 20 }
      const result = mergeAccumulatedSinkTime(a, b)
      expect(result).toEqual({
        'sink-1': 30,
        'sink-2': 25, // 15 + 10
        'sink-3': 20,
      })
    })

    it('does not mutate original objects', () => {
      const a = { 'sink-1': 30 }
      const b = { 'sink-1': 10 }
      mergeAccumulatedSinkTime(a, b)
      expect(a).toEqual({ 'sink-1': 30 })
      expect(b).toEqual({ 'sink-1': 10 })
    })

    it('handles empty first record', () => {
      const result = mergeAccumulatedSinkTime({}, { 'sink-1': 30 })
      expect(result).toEqual({ 'sink-1': 30 })
    })

    it('handles empty second record', () => {
      const result = mergeAccumulatedSinkTime({ 'sink-1': 30 }, {})
      expect(result).toEqual({ 'sink-1': 30 })
    })
  })

  describe('calculateTotalSinkTime', () => {
    it('sums all accumulated time', () => {
      const accumulated = { 'sink-1': 30, 'sink-2': 15, 'sink-3': 45 }
      expect(calculateTotalSinkTime(accumulated)).toBe(90)
    })

    it('returns 0 for empty record', () => {
      expect(calculateTotalSinkTime({})).toBe(0)
    })
  })

  // SUGGESTED_TIME_SINKS tests
  describe('SUGGESTED_TIME_SINKS', () => {
    it('contains at least 5 suggestions', () => {
      expect(SUGGESTED_TIME_SINKS.length).toBeGreaterThanOrEqual(5)
    })

    it('all suggestions have required fields', () => {
      SUGGESTED_TIME_SINKS.forEach((suggestion) => {
        expect(suggestion.name).toBeTruthy()
        expect(suggestion.emoji).toBeTruthy()
        expect(suggestion.color).toMatch(/^#[0-9A-Fa-f]{6}$/)
      })
    })

    it('contains common time sink categories', () => {
      const names = SUGGESTED_TIME_SINKS.map((s) => s.name.toLowerCase())
      expect(names.some((n) => n.includes('phone') || n.includes('call'))).toBe(true)
      expect(names.some((n) => n.includes('break') || n.includes('coffee'))).toBe(true)
    })
  })
})
