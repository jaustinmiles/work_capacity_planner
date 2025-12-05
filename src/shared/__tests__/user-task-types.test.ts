/**
 * Unit tests for user-task-types.ts validation and utility functions
 */

import { WorkBlockType, BlockConfigKind } from '../enums'
import {
  UserTaskType,
  TypeAllocation,
  BlockTypeConfig,
  CreateUserTaskTypeInput,
  getTypeColor,
  getTypeEmoji,
  getTypeName,
  getTypeById,
  getSortedTypes,
  validateTypeAllocations,
  validateTypeName,
  validateTypeColor,
  validateTypeEmoji,
  validateCreateInput,
  isSystemBlock,
  isSingleTypeBlock,
  isComboBlock,
  getTypeIdsFromConfig,
  isTypeCompatibleWithBlock,
  getTypeRatioInBlock,
  createUserTaskType,
  createSingleTypeConfig,
  createComboTypeConfig,
  createSystemBlockConfig,
  recordToUserTaskType,
  userTaskTypeToRecord,
  serializeBlockTypeConfig,
  deserializeBlockTypeConfig,
  createEmptyAccumulatedTime,
  addAccumulatedTime,
  getAccumulatedTimeForType,
  mergeAccumulatedTime,
  getBlockTypeDisplayColor,
  SYSTEM_BLOCK_COLORS,
} from '../user-task-types'

describe('user-task-types', () => {
  // Test fixtures - helper function inside describe block
  function createMockType(overrides: Partial<UserTaskType> = {}): UserTaskType {
    return {
      id: 'type-123',
      sessionId: 'session-456',
      name: 'Test Type',
      emoji: '🎯',
      color: '#FF5500',
      sortOrder: 0,
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
      ...overrides,
    }
  }

  const mockTypes: UserTaskType[] = [
    createMockType({ id: 'type-1', name: 'Coding', emoji: '💻', color: '#4A90D9', sortOrder: 1 }),
    createMockType({ id: 'type-2', name: 'Design', emoji: '🎨', color: '#9B59B6', sortOrder: 0 }),
    createMockType({ id: 'type-3', name: 'Admin', emoji: '📋', color: '#E67E22', sortOrder: 2 }),
  ]

  // Utility function tests
  describe('getTypeColor', () => {
    it('returns the color for an existing type', () => {
      expect(getTypeColor(mockTypes, 'type-1')).toBe('#4A90D9')
      expect(getTypeColor(mockTypes, 'type-2')).toBe('#9B59B6')
    })

    it('returns default gray for unknown type', () => {
      expect(getTypeColor(mockTypes, 'nonexistent')).toBe('#808080')
    })

    it('returns default gray for empty types array', () => {
      expect(getTypeColor([], 'any-id')).toBe('#808080')
    })
  })

  describe('getTypeEmoji', () => {
    it('returns the emoji for an existing type', () => {
      expect(getTypeEmoji(mockTypes, 'type-1')).toBe('💻')
      expect(getTypeEmoji(mockTypes, 'type-2')).toBe('🎨')
    })

    it('returns default pin emoji for unknown type', () => {
      expect(getTypeEmoji(mockTypes, 'nonexistent')).toBe('📌')
    })

    it('returns default emoji for empty types array', () => {
      expect(getTypeEmoji([], 'any-id')).toBe('📌')
    })
  })

  describe('getTypeName', () => {
    it('returns the name for an existing type', () => {
      expect(getTypeName(mockTypes, 'type-1')).toBe('Coding')
      expect(getTypeName(mockTypes, 'type-3')).toBe('Admin')
    })

    it('returns "Unknown" for unknown type', () => {
      expect(getTypeName(mockTypes, 'nonexistent')).toBe('Unknown')
    })

    it('returns "Unknown" for empty types array', () => {
      expect(getTypeName([], 'any-id')).toBe('Unknown')
    })
  })

  describe('getTypeById', () => {
    it('returns the type for an existing ID', () => {
      const result = getTypeById(mockTypes, 'type-1')
      expect(result).toBeDefined()
      expect(result?.name).toBe('Coding')
    })

    it('returns undefined for unknown ID', () => {
      expect(getTypeById(mockTypes, 'nonexistent')).toBeUndefined()
    })
  })

  describe('getSortedTypes', () => {
    it('sorts types by sortOrder ascending', () => {
      const sorted = getSortedTypes(mockTypes)
      expect(sorted[0].name).toBe('Design') // sortOrder: 0
      expect(sorted[1].name).toBe('Coding') // sortOrder: 1
      expect(sorted[2].name).toBe('Admin') // sortOrder: 2
    })

    it('does not mutate the original array', () => {
      const originalFirst = mockTypes[0]
      getSortedTypes(mockTypes)
      expect(mockTypes[0]).toBe(originalFirst)
    })

    it('handles empty array', () => {
      expect(getSortedTypes([])).toEqual([])
    })
  })

  // Validation function tests
  describe('validateTypeAllocations', () => {
    it('returns true for valid allocations summing to 1.0', () => {
      const allocations: TypeAllocation[] = [
        { typeId: 'type-1', ratio: 0.5 },
        { typeId: 'type-2', ratio: 0.5 },
      ]
      expect(validateTypeAllocations(allocations)).toBe(true)
    })

    it('returns true for valid allocations with 3 types', () => {
      const allocations: TypeAllocation[] = [
        { typeId: 'type-1', ratio: 0.5 },
        { typeId: 'type-2', ratio: 0.3 },
        { typeId: 'type-3', ratio: 0.2 },
      ]
      expect(validateTypeAllocations(allocations)).toBe(true)
    })

    it('returns false for single allocation', () => {
      const allocations: TypeAllocation[] = [{ typeId: 'type-1', ratio: 1.0 }]
      expect(validateTypeAllocations(allocations)).toBe(false)
    })

    it('returns false for empty allocations', () => {
      expect(validateTypeAllocations([])).toBe(false)
    })

    it('returns false when ratios do not sum to 1.0', () => {
      const allocations: TypeAllocation[] = [
        { typeId: 'type-1', ratio: 0.5 },
        { typeId: 'type-2', ratio: 0.3 },
      ]
      expect(validateTypeAllocations(allocations)).toBe(false)
    })

    it('returns false for zero ratio', () => {
      const allocations: TypeAllocation[] = [
        { typeId: 'type-1', ratio: 0 },
        { typeId: 'type-2', ratio: 1.0 },
      ]
      expect(validateTypeAllocations(allocations)).toBe(false)
    })

    it('returns false for negative ratio', () => {
      const allocations: TypeAllocation[] = [
        { typeId: 'type-1', ratio: -0.5 },
        { typeId: 'type-2', ratio: 1.5 },
      ]
      expect(validateTypeAllocations(allocations)).toBe(false)
    })

    it('returns false for ratio of exactly 1.0', () => {
      const allocations: TypeAllocation[] = [
        { typeId: 'type-1', ratio: 1.0 },
        { typeId: 'type-2', ratio: 0.0 },
      ]
      expect(validateTypeAllocations(allocations)).toBe(false)
    })

    it('returns false for duplicate type IDs', () => {
      const allocations: TypeAllocation[] = [
        { typeId: 'type-1', ratio: 0.5 },
        { typeId: 'type-1', ratio: 0.5 },
      ]
      expect(validateTypeAllocations(allocations)).toBe(false)
    })

    it('handles floating point precision (0.333... cases)', () => {
      const allocations: TypeAllocation[] = [
        { typeId: 'type-1', ratio: 0.334 },
        { typeId: 'type-2', ratio: 0.333 },
        { typeId: 'type-3', ratio: 0.333 },
      ]
      expect(validateTypeAllocations(allocations)).toBe(true)
    })
  })

  describe('validateTypeName', () => {
    it('returns valid for normal names', () => {
      expect(validateTypeName('Coding')).toEqual({ valid: true })
      expect(validateTypeName('Deep Work')).toEqual({ valid: true })
    })

    it('returns invalid for empty string', () => {
      const result = validateTypeName('')
      expect(result.valid).toBe(false)
      expect(result.error).toBe('Name cannot be empty')
    })

    it('returns invalid for whitespace-only string', () => {
      const result = validateTypeName('   ')
      expect(result.valid).toBe(false)
      expect(result.error).toBe('Name cannot be empty')
    })

    it('returns invalid for names over 50 characters', () => {
      const longName = 'A'.repeat(51)
      const result = validateTypeName(longName)
      expect(result.valid).toBe(false)
      expect(result.error).toBe('Name must be 50 characters or less')
    })

    it('returns valid for exactly 50 characters', () => {
      const exactName = 'A'.repeat(50)
      expect(validateTypeName(exactName)).toEqual({ valid: true })
    })
  })

  describe('validateTypeColor', () => {
    it('returns valid for proper hex colors', () => {
      expect(validateTypeColor('#FF5500')).toEqual({ valid: true })
      expect(validateTypeColor('#000000')).toEqual({ valid: true })
      expect(validateTypeColor('#ffffff')).toEqual({ valid: true })
      expect(validateTypeColor('#AbCdEf')).toEqual({ valid: true })
    })

    it('returns invalid for missing hash', () => {
      const result = validateTypeColor('FF5500')
      expect(result.valid).toBe(false)
      expect(result.error).toContain('valid hex color')
    })

    it('returns invalid for short hex', () => {
      const result = validateTypeColor('#FFF')
      expect(result.valid).toBe(false)
      expect(result.error).toContain('valid hex color')
    })

    it('returns invalid for invalid characters', () => {
      const result = validateTypeColor('#GGGGGG')
      expect(result.valid).toBe(false)
      expect(result.error).toContain('valid hex color')
    })

    it('returns invalid for empty string', () => {
      const result = validateTypeColor('')
      expect(result.valid).toBe(false)
    })
  })

  describe('validateTypeEmoji', () => {
    it('returns valid for single emoji', () => {
      expect(validateTypeEmoji('🎯')).toEqual({ valid: true })
      expect(validateTypeEmoji('💻')).toEqual({ valid: true })
    })

    it('returns valid for emoji with modifier (skin tone)', () => {
      expect(validateTypeEmoji('👍🏻')).toEqual({ valid: true })
    })

    it('returns invalid for empty string', () => {
      const result = validateTypeEmoji('')
      expect(result.valid).toBe(false)
      expect(result.error).toBe('Emoji cannot be empty')
    })

    it('returns invalid for string over 4 characters', () => {
      const result = validateTypeEmoji('hello')
      expect(result.valid).toBe(false)
      expect(result.error).toBe('Emoji must be a single emoji character')
    })
  })

  describe('validateCreateInput', () => {
    it('returns valid for correct input', () => {
      const input: CreateUserTaskTypeInput = {
        sessionId: 'session-123',
        name: 'Coding',
        emoji: '💻',
        color: '#4A90D9',
      }
      const result = validateCreateInput(input)
      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('collects multiple errors', () => {
      const input: CreateUserTaskTypeInput = {
        sessionId: '',
        name: '',
        emoji: '',
        color: 'invalid',
      }
      const result = validateCreateInput(input)
      expect(result.valid).toBe(false)
      expect(result.errors.length).toBeGreaterThan(0)
      expect(result.errors).toContain('Name cannot be empty')
      expect(result.errors).toContain('Session ID is required')
    })
  })

  // BlockTypeConfig utility tests
  describe('isSystemBlock', () => {
    it('returns true for system block configs', () => {
      const config: BlockTypeConfig = { kind: BlockConfigKind.System, systemType: WorkBlockType.Sleep }
      expect(isSystemBlock(config)).toBe(true)
    })

    it('returns false for single block configs', () => {
      const config: BlockTypeConfig = { kind: BlockConfigKind.Single, typeId: 'type-1' }
      expect(isSystemBlock(config)).toBe(false)
    })

    it('returns false for combo block configs', () => {
      const config: BlockTypeConfig = {
        kind: BlockConfigKind.Combo,
        allocations: [
          { typeId: 'type-1', ratio: 0.5 },
          { typeId: 'type-2', ratio: 0.5 },
        ],
      }
      expect(isSystemBlock(config)).toBe(false)
    })
  })

  describe('isSingleTypeBlock', () => {
    it('returns true for single block configs', () => {
      const config: BlockTypeConfig = { kind: BlockConfigKind.Single, typeId: 'type-1' }
      expect(isSingleTypeBlock(config)).toBe(true)
    })

    it('returns false for system and combo configs', () => {
      expect(isSingleTypeBlock({ kind: BlockConfigKind.System, systemType: WorkBlockType.Blocked })).toBe(false)
      expect(
        isSingleTypeBlock({
          kind: BlockConfigKind.Combo,
          allocations: [
            { typeId: 'a', ratio: 0.5 },
            { typeId: 'b', ratio: 0.5 },
          ],
        }),
      ).toBe(false)
    })
  })

  describe('isComboBlock', () => {
    it('returns true for combo block configs', () => {
      const config: BlockTypeConfig = {
        kind: BlockConfigKind.Combo,
        allocations: [
          { typeId: 'type-1', ratio: 0.5 },
          { typeId: 'type-2', ratio: 0.5 },
        ],
      }
      expect(isComboBlock(config)).toBe(true)
    })

    it('returns false for single and system configs', () => {
      expect(isComboBlock({ kind: BlockConfigKind.Single, typeId: 'type-1' })).toBe(false)
      expect(isComboBlock({ kind: BlockConfigKind.System, systemType: WorkBlockType.Sleep })).toBe(false)
    })
  })

  describe('getTypeIdsFromConfig', () => {
    it('returns single ID for single type config', () => {
      const config: BlockTypeConfig = { kind: BlockConfigKind.Single, typeId: 'type-1' }
      expect(getTypeIdsFromConfig(config)).toEqual(['type-1'])
    })

    it('returns all IDs for combo config', () => {
      const config: BlockTypeConfig = {
        kind: BlockConfigKind.Combo,
        allocations: [
          { typeId: 'type-1', ratio: 0.5 },
          { typeId: 'type-2', ratio: 0.5 },
        ],
      }
      expect(getTypeIdsFromConfig(config)).toEqual(['type-1', 'type-2'])
    })

    it('returns empty array for system config', () => {
      const config: BlockTypeConfig = { kind: BlockConfigKind.System, systemType: WorkBlockType.Sleep }
      expect(getTypeIdsFromConfig(config)).toEqual([])
    })
  })

  describe('isTypeCompatibleWithBlock', () => {
    it('returns true for matching single type', () => {
      const config: BlockTypeConfig = { kind: BlockConfigKind.Single, typeId: 'type-1' }
      expect(isTypeCompatibleWithBlock('type-1', config)).toBe(true)
    })

    it('returns false for non-matching single type', () => {
      const config: BlockTypeConfig = { kind: BlockConfigKind.Single, typeId: 'type-1' }
      expect(isTypeCompatibleWithBlock('type-2', config)).toBe(false)
    })

    it('returns true for type in combo allocations', () => {
      const config: BlockTypeConfig = {
        kind: BlockConfigKind.Combo,
        allocations: [
          { typeId: 'type-1', ratio: 0.5 },
          { typeId: 'type-2', ratio: 0.5 },
        ],
      }
      expect(isTypeCompatibleWithBlock('type-1', config)).toBe(true)
      expect(isTypeCompatibleWithBlock('type-2', config)).toBe(true)
    })

    it('returns false for type not in combo allocations', () => {
      const config: BlockTypeConfig = {
        kind: BlockConfigKind.Combo,
        allocations: [
          { typeId: 'type-1', ratio: 0.5 },
          { typeId: 'type-2', ratio: 0.5 },
        ],
      }
      expect(isTypeCompatibleWithBlock('type-3', config)).toBe(false)
    })

    it('returns false for system blocks', () => {
      const config: BlockTypeConfig = { kind: BlockConfigKind.System, systemType: WorkBlockType.Sleep }
      expect(isTypeCompatibleWithBlock('type-1', config)).toBe(false)
    })
  })

  describe('getTypeRatioInBlock', () => {
    it('returns 1.0 for matching single type', () => {
      const config: BlockTypeConfig = { kind: BlockConfigKind.Single, typeId: 'type-1' }
      expect(getTypeRatioInBlock('type-1', config)).toBe(1.0)
    })

    it('returns 0 for non-matching single type', () => {
      const config: BlockTypeConfig = { kind: BlockConfigKind.Single, typeId: 'type-1' }
      expect(getTypeRatioInBlock('type-2', config)).toBe(0)
    })

    it('returns correct ratio for combo type', () => {
      const config: BlockTypeConfig = {
        kind: BlockConfigKind.Combo,
        allocations: [
          { typeId: 'type-1', ratio: 0.7 },
          { typeId: 'type-2', ratio: 0.3 },
        ],
      }
      expect(getTypeRatioInBlock('type-1', config)).toBe(0.7)
      expect(getTypeRatioInBlock('type-2', config)).toBe(0.3)
    })

    it('returns 0 for type not in combo', () => {
      const config: BlockTypeConfig = {
        kind: BlockConfigKind.Combo,
        allocations: [
          { typeId: 'type-1', ratio: 0.5 },
          { typeId: 'type-2', ratio: 0.5 },
        ],
      }
      expect(getTypeRatioInBlock('type-3', config)).toBe(0)
    })

    it('returns 0 for system blocks', () => {
      const config: BlockTypeConfig = { kind: BlockConfigKind.System, systemType: WorkBlockType.Blocked }
      expect(getTypeRatioInBlock('type-1', config)).toBe(0)
    })
  })

  // Factory function tests
  describe('createUserTaskType', () => {
    it('creates a type with generated ID and timestamps', () => {
      const input: CreateUserTaskTypeInput = {
        sessionId: 'session-123',
        name: '  Coding  ',
        emoji: '💻',
        color: '#ff5500',
      }
      const result = createUserTaskType(input)

      expect(result.id).toMatch(/^type-/)
      expect(result.sessionId).toBe('session-123')
      expect(result.name).toBe('Coding') // Trimmed
      expect(result.emoji).toBe('💻')
      expect(result.color).toBe('#FF5500') // Uppercased
      expect(result.sortOrder).toBe(0)
      expect(result.createdAt).toBeInstanceOf(Date)
      expect(result.updatedAt).toBeInstanceOf(Date)
    })

    it('uses provided sortOrder', () => {
      const input: CreateUserTaskTypeInput = {
        sessionId: 'session-123',
        name: 'Test',
        emoji: '🎯',
        color: '#FF5500',
        sortOrder: 5,
      }
      const result = createUserTaskType(input)
      expect(result.sortOrder).toBe(5)
    })
  })

  describe('createSingleTypeConfig', () => {
    it('creates a single type config', () => {
      const config = createSingleTypeConfig('type-1')
      expect(config).toEqual({ kind: BlockConfigKind.Single, typeId: 'type-1' })
    })
  })

  describe('createComboTypeConfig', () => {
    it('creates a combo type config for valid allocations', () => {
      const allocations = [
        { typeId: 'type-1', ratio: 0.5 },
        { typeId: 'type-2', ratio: 0.5 },
      ]
      const config = createComboTypeConfig(allocations)
      expect(config).toEqual({ kind: BlockConfigKind.Combo, allocations })
    })

    it('throws for invalid allocations', () => {
      const invalidAllocations = [{ typeId: 'type-1', ratio: 1.0 }]
      expect(() => createComboTypeConfig(invalidAllocations)).toThrow(
        'Invalid type allocations: must have 2+ types with ratios summing to 1.0',
      )
    })
  })

  describe('createSystemBlockConfig', () => {
    it('creates a system block config for sleep', () => {
      const config = createSystemBlockConfig(WorkBlockType.Sleep)
      expect(config).toEqual({ kind: BlockConfigKind.System, systemType: WorkBlockType.Sleep })
    })

    it('creates a system block config for blocked', () => {
      const config = createSystemBlockConfig(WorkBlockType.Blocked)
      expect(config).toEqual({ kind: BlockConfigKind.System, systemType: WorkBlockType.Blocked })
    })
  })

  // Conversion function tests
  describe('recordToUserTaskType', () => {
    it('converts string dates to Date objects', () => {
      const record = {
        id: 'type-123',
        sessionId: 'session-456',
        name: 'Test',
        emoji: '🎯',
        color: '#FF5500',
        sortOrder: 0,
        createdAt: '2024-01-15T10:30:00.000Z',
        updatedAt: '2024-01-16T14:00:00.000Z',
      }
      const result = recordToUserTaskType(record)

      expect(result.createdAt).toBeInstanceOf(Date)
      expect(result.updatedAt).toBeInstanceOf(Date)
      expect(result.createdAt.toISOString()).toBe('2024-01-15T10:30:00.000Z')
      expect(result.updatedAt.toISOString()).toBe('2024-01-16T14:00:00.000Z')
    })
  })

  describe('userTaskTypeToRecord', () => {
    it('converts Date objects to ISO strings', () => {
      const type = createMockType({
        createdAt: new Date('2024-01-15T10:30:00.000Z'),
        updatedAt: new Date('2024-01-16T14:00:00.000Z'),
      })
      const result = userTaskTypeToRecord(type)

      expect(result.createdAt).toBe('2024-01-15T10:30:00.000Z')
      expect(result.updatedAt).toBe('2024-01-16T14:00:00.000Z')
    })
  })

  describe('serializeBlockTypeConfig', () => {
    it('serializes single config to JSON', () => {
      const config: BlockTypeConfig = { kind: BlockConfigKind.Single, typeId: 'type-1' }
      const json = serializeBlockTypeConfig(config)
      expect(JSON.parse(json)).toEqual(config)
    })

    it('serializes combo config to JSON', () => {
      const config: BlockTypeConfig = {
        kind: BlockConfigKind.Combo,
        allocations: [
          { typeId: 'type-1', ratio: 0.5 },
          { typeId: 'type-2', ratio: 0.5 },
        ],
      }
      const json = serializeBlockTypeConfig(config)
      expect(JSON.parse(json)).toEqual(config)
    })

    it('serializes system config to JSON', () => {
      const config: BlockTypeConfig = { kind: BlockConfigKind.System, systemType: WorkBlockType.Sleep }
      const json = serializeBlockTypeConfig(config)
      expect(JSON.parse(json)).toEqual(config)
    })
  })

  describe('deserializeBlockTypeConfig', () => {
    it('deserializes single config from JSON', () => {
      const json = '{"kind":"single","typeId":"type-1"}'
      const config = deserializeBlockTypeConfig(json)
      expect(config).toEqual({ kind: BlockConfigKind.Single, typeId: 'type-1' })
    })

    it('deserializes combo config from JSON', () => {
      const json = '{"kind":"combo","allocations":[{"typeId":"type-1","ratio":0.5},{"typeId":"type-2","ratio":0.5}]}'
      const config = deserializeBlockTypeConfig(json)
      expect(config.kind).toBe(BlockConfigKind.Combo)
      expect((config as { kind: typeof BlockConfigKind.Combo; allocations: TypeAllocation[] }).allocations).toHaveLength(
        2,
      )
    })

    it('deserializes system config from JSON', () => {
      const json = '{"kind":"system","systemType":"sleep"}'
      const config = deserializeBlockTypeConfig(json)
      expect(config).toEqual({ kind: BlockConfigKind.System, systemType: WorkBlockType.Sleep })
    })

    it('throws for invalid JSON structure', () => {
      const invalidJson = '{"kind":"invalid","foo":"bar"}'
      expect(() => deserializeBlockTypeConfig(invalidJson)).toThrow('Invalid BlockTypeConfig JSON')
    })
  })

  // Accumulated time utility tests
  describe('createEmptyAccumulatedTime', () => {
    it('returns an empty object', () => {
      expect(createEmptyAccumulatedTime()).toEqual({})
    })
  })

  describe('addAccumulatedTime', () => {
    it('adds time to new type', () => {
      const accumulated = {}
      const result = addAccumulatedTime(accumulated, 'type-1', 30)
      expect(result).toEqual({ 'type-1': 30 })
    })

    it('adds time to existing type', () => {
      const accumulated = { 'type-1': 30 }
      const result = addAccumulatedTime(accumulated, 'type-1', 15)
      expect(result).toEqual({ 'type-1': 45 })
    })

    it('does not mutate original object', () => {
      const accumulated = { 'type-1': 30 }
      addAccumulatedTime(accumulated, 'type-1', 15)
      expect(accumulated).toEqual({ 'type-1': 30 })
    })
  })

  describe('getAccumulatedTimeForType', () => {
    it('returns accumulated time for existing type', () => {
      const accumulated = { 'type-1': 30, 'type-2': 45 }
      expect(getAccumulatedTimeForType(accumulated, 'type-1')).toBe(30)
      expect(getAccumulatedTimeForType(accumulated, 'type-2')).toBe(45)
    })

    it('returns 0 for non-existent type', () => {
      const accumulated = { 'type-1': 30 }
      expect(getAccumulatedTimeForType(accumulated, 'type-999')).toBe(0)
    })

    it('returns 0 for empty accumulated', () => {
      expect(getAccumulatedTimeForType({}, 'type-1')).toBe(0)
    })
  })

  describe('mergeAccumulatedTime', () => {
    it('merges two accumulated time records', () => {
      const a = { 'type-1': 30, 'type-2': 15 }
      const b = { 'type-2': 10, 'type-3': 20 }
      const result = mergeAccumulatedTime(a, b)
      expect(result).toEqual({
        'type-1': 30,
        'type-2': 25, // 15 + 10
        'type-3': 20,
      })
    })

    it('does not mutate original objects', () => {
      const a = { 'type-1': 30 }
      const b = { 'type-1': 10 }
      mergeAccumulatedTime(a, b)
      expect(a).toEqual({ 'type-1': 30 })
      expect(b).toEqual({ 'type-1': 10 })
    })

    it('handles empty first record', () => {
      const result = mergeAccumulatedTime({}, { 'type-1': 30 })
      expect(result).toEqual({ 'type-1': 30 })
    })

    it('handles empty second record', () => {
      const result = mergeAccumulatedTime({ 'type-1': 30 }, {})
      expect(result).toEqual({ 'type-1': 30 })
    })
  })

  describe('getBlockTypeDisplayColor', () => {
    const mockUserTypes: UserTaskType[] = [
      {
        id: 'user-type-1',
        sessionId: 'session-1',
        name: 'Custom Focus',
        emoji: '🎯',
        color: '#FF5500',
        sortOrder: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]

    it('returns system color for system block types', () => {
      // Check known system block colors
      const blockedColor = getBlockTypeDisplayColor(WorkBlockType.Blocked, [])
      expect(blockedColor).toBe('red')

      const sleepColor = getBlockTypeDisplayColor(WorkBlockType.Sleep, [])
      expect(sleepColor).toBe('gray')
    })

    it('returns user-defined color for user types', () => {
      const result = getBlockTypeDisplayColor('user-type-1', mockUserTypes)
      expect(result).toBe('#FF5500')
    })

    it('returns default color for unknown block types', () => {
      const result = getBlockTypeDisplayColor('unknown-type', [])
      expect(result).toBe('arcoblue')
    })

    it('returns default color when user type has no color', () => {
      const typesWithNoColor: UserTaskType[] = [
        {
          id: 'type-no-color',
          sessionId: 'session-1',
          name: 'No Color Type',
          emoji: '📝',
          color: '',
          sortOrder: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]
      const result = getBlockTypeDisplayColor('type-no-color', typesWithNoColor)
      expect(result).toBe('arcoblue')
    })
  })
})
