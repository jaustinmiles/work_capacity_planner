import { describe, it, expect } from 'vitest'
import {
  getTotalCapacityByType,
  getRemainingCapacityByType,
  getBlockCapacityForType,
  createSingleTypeBlock,
  createComboBlock,
  createSystemBlock,
  WorkBlock,
} from '../work-blocks-types'
import { BlockConfigKind, WorkBlockType } from '../enums'
import { UserTaskType } from '../user-task-types'

// Helper to create test user task types
function createTestUserTypes(): UserTaskType[] {
  return [
    {
      id: 'type-focus',
      sessionId: 'session-1',
      name: 'Focus Work',
      emoji: '🎯',
      color: '#FF5733',
      sortOrder: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'type-admin',
      sessionId: 'session-1',
      name: 'Admin',
      emoji: '📋',
      color: '#3366FF',
      sortOrder: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ]
}

describe('work-blocks-types', () => {
  describe('createSingleTypeBlock', () => {
    it('should create a single-type work block', () => {
      const block = createSingleTypeBlock('block-1', '09:00', '12:00', 'type-focus')

      expect(block.id).toBe('block-1')
      expect(block.startTime).toBe('09:00')
      expect(block.endTime).toBe('12:00')
      expect(block.typeConfig.kind).toBe(BlockConfigKind.Single)
      if (block.typeConfig.kind === BlockConfigKind.Single) {
        expect(block.typeConfig.typeId).toBe('type-focus')
      }
    })
  })

  describe('createComboBlock', () => {
    it('should create a combo work block with allocations', () => {
      const allocations = [
        { typeId: 'type-focus', ratio: 0.6 },
        { typeId: 'type-admin', ratio: 0.4 },
      ]
      const block = createComboBlock('block-1', '09:00', '12:00', allocations)

      expect(block.id).toBe('block-1')
      expect(block.typeConfig.kind).toBe(BlockConfigKind.Combo)
      if (block.typeConfig.kind === BlockConfigKind.Combo) {
        expect(block.typeConfig.allocations).toHaveLength(2)
        expect(block.typeConfig.allocations[0].ratio).toBe(0.6)
      }
    })
  })

  describe('createSystemBlock', () => {
    it('should create a blocked system block', () => {
      const block = createSystemBlock('block-1', '12:00', '13:00', WorkBlockType.Blocked)

      expect(block.id).toBe('block-1')
      expect(block.typeConfig.kind).toBe(BlockConfigKind.System)
      if (block.typeConfig.kind === BlockConfigKind.System) {
        expect(block.typeConfig.systemType).toBe(WorkBlockType.Blocked)
      }
    })

    it('should create a sleep system block', () => {
      const block = createSystemBlock('block-1', '22:00', '06:00', WorkBlockType.Sleep)

      expect(block.typeConfig.kind).toBe(BlockConfigKind.System)
      if (block.typeConfig.kind === BlockConfigKind.System) {
        expect(block.typeConfig.systemType).toBe(WorkBlockType.Sleep)
      }
    })
  })

  describe('getTotalCapacityByType', () => {
    const userTypes = createTestUserTypes()

    it('should calculate capacity for single-type blocks', () => {
      const blocks: WorkBlock[] = [
        createSingleTypeBlock('block-1', '09:00', '12:00', 'type-focus'), // 180 min
        createSingleTypeBlock('block-2', '14:00', '16:00', 'type-admin'), // 120 min
      ]

      const capacity = getTotalCapacityByType(blocks, userTypes)

      expect(capacity['type-focus']).toBe(180)
      expect(capacity['type-admin']).toBe(120)
    })

    it('should calculate capacity for combo blocks', () => {
      const blocks: WorkBlock[] = [
        createComboBlock('block-1', '09:00', '11:00', [
          { typeId: 'type-focus', ratio: 0.6 },
          { typeId: 'type-admin', ratio: 0.4 },
        ]), // 120 min total
      ]

      const capacity = getTotalCapacityByType(blocks, userTypes)

      expect(capacity['type-focus']).toBe(72)  // 120 * 0.6
      expect(capacity['type-admin']).toBe(48)  // 120 * 0.4
    })

    it('should ignore system blocks', () => {
      const blocks: WorkBlock[] = [
        createSingleTypeBlock('block-1', '09:00', '12:00', 'type-focus'),
        createSystemBlock('block-2', '12:00', '13:00', WorkBlockType.Blocked),
      ]

      const capacity = getTotalCapacityByType(blocks, userTypes)

      expect(capacity['type-focus']).toBe(180)
      expect(Object.keys(capacity)).toHaveLength(1)
    })

    it('should accumulate capacity across multiple blocks of same type', () => {
      const blocks: WorkBlock[] = [
        createSingleTypeBlock('block-1', '09:00', '10:00', 'type-focus'), // 60 min
        createSingleTypeBlock('block-2', '14:00', '15:00', 'type-focus'), // 60 min
      ]

      const capacity = getTotalCapacityByType(blocks, userTypes)

      expect(capacity['type-focus']).toBe(120)
    })

    it('should handle empty blocks array', () => {
      const capacity = getTotalCapacityByType([], userTypes)

      expect(Object.keys(capacity)).toHaveLength(0)
    })
  })

  describe('getRemainingCapacityByType', () => {
    const userTypes = createTestUserTypes()

    it('should calculate remaining capacity', () => {
      const blocks: WorkBlock[] = [
        createSingleTypeBlock('block-1', '09:00', '12:00', 'type-focus'), // 180 min
      ]
      const accumulated = { 'type-focus': 60 }

      const remaining = getRemainingCapacityByType(blocks, accumulated, userTypes)

      expect(remaining['type-focus']).toBe(120)
    })

    it('should return 0 when accumulated exceeds total', () => {
      const blocks: WorkBlock[] = [
        createSingleTypeBlock('block-1', '09:00', '10:00', 'type-focus'), // 60 min
      ]
      const accumulated = { 'type-focus': 90 }

      const remaining = getRemainingCapacityByType(blocks, accumulated, userTypes)

      expect(remaining['type-focus']).toBe(0)
    })

    it('should return full capacity when nothing accumulated', () => {
      const blocks: WorkBlock[] = [
        createSingleTypeBlock('block-1', '09:00', '10:00', 'type-focus'),
      ]
      const accumulated = {}

      const remaining = getRemainingCapacityByType(blocks, accumulated, userTypes)

      expect(remaining['type-focus']).toBe(60)
    })
  })

  describe('getBlockCapacityForType', () => {
    it('should return full capacity for matching single-type block', () => {
      const block = createSingleTypeBlock('block-1', '09:00', '11:00', 'type-focus')

      const capacity = getBlockCapacityForType(block, 'type-focus')

      expect(capacity).toBe(120)
    })

    it('should return 0 for non-matching single-type block', () => {
      const block = createSingleTypeBlock('block-1', '09:00', '11:00', 'type-focus')

      const capacity = getBlockCapacityForType(block, 'type-admin')

      expect(capacity).toBe(0)
    })

    it('should return proportional capacity for combo block', () => {
      const block = createComboBlock('block-1', '09:00', '11:00', [
        { typeId: 'type-focus', ratio: 0.7 },
        { typeId: 'type-admin', ratio: 0.3 },
      ])

      expect(getBlockCapacityForType(block, 'type-focus')).toBe(84) // 120 * 0.7
      expect(getBlockCapacityForType(block, 'type-admin')).toBe(36) // 120 * 0.3
    })

    it('should return 0 for system blocks', () => {
      const block = createSystemBlock('block-1', '12:00', '13:00', WorkBlockType.Blocked)

      const capacity = getBlockCapacityForType(block, 'type-focus')

      expect(capacity).toBe(0)
    })
  })
})
