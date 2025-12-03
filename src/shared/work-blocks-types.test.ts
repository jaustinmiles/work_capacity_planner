import { describe, it, expect } from 'vitest'
import {
  WorkBlock,
  DailyWorkPattern,
  WorkMeeting,
  getCurrentBlock,
  getNextBlock,
  isTaskTypeCompatibleWithBlock,
} from './work-blocks-types'
import { UnifiedWorkSession } from './unified-work-session-types'
import { BlockTypeConfig, SystemBlockType } from './user-task-types'

describe('work-blocks-types', () => {
  describe('BlockTypeConfig', () => {
    it('should support single type blocks', () => {
      const typeConfig: BlockTypeConfig = {
        kind: 'single',
        typeId: 'focused',
      }
      expect(typeConfig.kind).toBe('single')
      expect(typeConfig.typeId).toBe('focused')
    })

    it('should support combo blocks with allocations', () => {
      const typeConfig: BlockTypeConfig = {
        kind: 'combo',
        allocations: [
          { typeId: 'focused', ratio: 0.7 },
          { typeId: 'admin', ratio: 0.3 },
        ],
      }
      expect(typeConfig.kind).toBe('combo')
      expect(typeConfig.allocations).toHaveLength(2)
      expect(typeConfig.allocations[0].ratio + typeConfig.allocations[1].ratio).toBe(1)
    })

    it('should support system blocks', () => {
      const typeConfig: BlockTypeConfig = {
        kind: 'system',
        systemType: SystemBlockType.Blocked,
      }
      expect(typeConfig.kind).toBe('system')
      expect(typeConfig.systemType).toBe('blocked')
    })
  })

  describe('getCurrentBlock', () => {
    const blocks: WorkBlock[] = [
      {
        id: '1',
        startTime: '09:00',
        endTime: '12:00',
        typeConfig: { kind: 'single', typeId: 'focused' },
        capacity: { totalMinutes: 180 },
      },
      {
        id: '2',
        startTime: '13:00',
        endTime: '17:00',
        typeConfig: { kind: 'single', typeId: 'admin' },
        capacity: { totalMinutes: 240 },
      },
      {
        id: '3',
        startTime: '18:00',
        endTime: '20:00',
        typeConfig: { kind: 'single', typeId: 'personal' },
        capacity: { totalMinutes: 120 },
      },
    ]

    it('should find current block when time is within a block', () => {
      const time = new Date('2025-01-15T10:30:00')
      const block = getCurrentBlock(blocks, time)

      expect(block).toBeDefined()
      expect(block?.id).toBe('1')
    })

    it('should find afternoon block', () => {
      const time = new Date('2025-01-15T14:30:00')
      const block = getCurrentBlock(blocks, time)

      expect(block).toBeDefined()
      expect(block?.id).toBe('2')
    })

    it('should return null when time is between blocks', () => {
      const time = new Date('2025-01-15T12:30:00')
      const block = getCurrentBlock(blocks, time)

      expect(block).toBeNull()
    })

    it('should return null when time is before all blocks', () => {
      const time = new Date('2025-01-15T08:00:00')
      const block = getCurrentBlock(blocks, time)

      expect(block).toBeNull()
    })

    it('should return null when time is after all blocks', () => {
      const time = new Date('2025-01-15T21:00:00')
      const block = getCurrentBlock(blocks, time)

      expect(block).toBeNull()
    })

    it('should handle block boundary (start time)', () => {
      const time = new Date('2025-01-15T09:00:00')
      const block = getCurrentBlock(blocks, time)

      expect(block).toBeDefined()
      expect(block?.id).toBe('1')
    })

    it('should handle block boundary (end time)', () => {
      const time = new Date('2025-01-15T12:00:00')
      const block = getCurrentBlock(blocks, time)

      // End time is exclusive
      expect(block).toBeNull()
    })

    it('should use current time when not provided', () => {
      const block = getCurrentBlock(blocks)
      // Result depends on actual current time
      expect(block === null || block.id !== undefined).toBe(true)
    })

    it('should handle empty blocks array', () => {
      const block = getCurrentBlock([])
      expect(block).toBeNull()
    })
  })

  describe('getNextBlock', () => {
    const blocks: WorkBlock[] = [
      {
        id: '1',
        startTime: '09:00',
        endTime: '12:00',
        typeConfig: { kind: 'single', typeId: 'focused' },
        capacity: { totalMinutes: 180 },
      },
      {
        id: '2',
        startTime: '13:00',
        endTime: '17:00',
        typeConfig: { kind: 'single', typeId: 'admin' },
        capacity: { totalMinutes: 240 },
      },
      {
        id: '3',
        startTime: '18:00',
        endTime: '20:00',
        typeConfig: { kind: 'single', typeId: 'personal' },
        capacity: { totalMinutes: 120 },
      },
    ]

    it('should find next block when time is before all blocks', () => {
      const time = new Date('2025-01-15T08:00:00')
      const block = getNextBlock(blocks, time)

      expect(block).toBeDefined()
      expect(block?.id).toBe('1')
    })

    it('should find next block when time is between blocks', () => {
      const time = new Date('2025-01-15T12:30:00')
      const block = getNextBlock(blocks, time)

      expect(block).toBeDefined()
      expect(block?.id).toBe('2')
    })

    it('should find next block when time is during a block', () => {
      const time = new Date('2025-01-15T10:00:00')
      const block = getNextBlock(blocks, time)

      expect(block).toBeDefined()
      expect(block?.id).toBe('2')
    })

    it('should return null when time is after all blocks', () => {
      const time = new Date('2025-01-15T21:00:00')
      const block = getNextBlock(blocks, time)

      expect(block).toBeNull()
    })

    it('should return null when time is during last block', () => {
      const time = new Date('2025-01-15T19:00:00')
      const block = getNextBlock(blocks, time)

      expect(block).toBeNull()
    })

    it('should handle exact start time', () => {
      const time = new Date('2025-01-15T13:00:00')
      const block = getNextBlock(blocks, time)

      expect(block).toBeDefined()
      expect(block?.id).toBe('3')
    })

    it('should use current time when not provided', () => {
      const block = getNextBlock(blocks)
      // Result depends on actual current time
      expect(block === null || block.id !== undefined).toBe(true)
    })

    it('should handle empty blocks array', () => {
      const block = getNextBlock([])
      expect(block).toBeNull()
    })
  })

  describe('isTaskTypeCompatibleWithBlock', () => {
    it('should return true for matching single type block', () => {
      const block: WorkBlock = {
        id: '1',
        startTime: '09:00',
        endTime: '12:00',
        typeConfig: { kind: 'single', typeId: 'focused' },
        capacity: { totalMinutes: 180 },
      }
      expect(isTaskTypeCompatibleWithBlock(block, 'focused')).toBe(true)
    })

    it('should return false for non-matching single type block', () => {
      const block: WorkBlock = {
        id: '1',
        startTime: '09:00',
        endTime: '12:00',
        typeConfig: { kind: 'single', typeId: 'focused' },
        capacity: { totalMinutes: 180 },
      }
      expect(isTaskTypeCompatibleWithBlock(block, 'admin')).toBe(false)
    })

    it('should return true for combo block with matching allocation', () => {
      const block: WorkBlock = {
        id: '1',
        startTime: '09:00',
        endTime: '12:00',
        typeConfig: {
          kind: 'combo',
          allocations: [
            { typeId: 'focused', ratio: 0.7 },
            { typeId: 'admin', ratio: 0.3 },
          ],
        },
        capacity: { totalMinutes: 180 },
      }
      expect(isTaskTypeCompatibleWithBlock(block, 'focused')).toBe(true)
      expect(isTaskTypeCompatibleWithBlock(block, 'admin')).toBe(true)
    })

    it('should return false for combo block without matching allocation', () => {
      const block: WorkBlock = {
        id: '1',
        startTime: '09:00',
        endTime: '12:00',
        typeConfig: {
          kind: 'combo',
          allocations: [
            { typeId: 'focused', ratio: 0.7 },
            { typeId: 'admin', ratio: 0.3 },
          ],
        },
        capacity: { totalMinutes: 180 },
      }
      expect(isTaskTypeCompatibleWithBlock(block, 'personal')).toBe(false)
    })

    it('should return false for system blocks', () => {
      const block: WorkBlock = {
        id: '1',
        startTime: '22:00',
        endTime: '06:00',
        typeConfig: { kind: 'system', systemType: SystemBlockType.Sleep },
        capacity: { totalMinutes: 480 },
      }
      expect(isTaskTypeCompatibleWithBlock(block, 'focused')).toBe(false)
    })
  })

  describe('Type definitions', () => {
    it('should create valid WorkBlock with typeConfig', () => {
      const block: WorkBlock = {
        id: 'test-block',
        startTime: '09:00',
        endTime: '11:00',
        typeConfig: { kind: 'single', typeId: 'focused' },
        capacity: { totalMinutes: 120 },
      }

      expect(block.id).toBe('test-block')
      expect(block.typeConfig.kind).toBe('single')
    })

    it('should create valid DailyWorkPattern', () => {
      const pattern: DailyWorkPattern = {
        date: '2025-01-15',
        blocks: [],
        meetings: [],
      }

      expect(pattern.date).toBe('2025-01-15')
      expect(pattern.blocks).toEqual([])
    })

    it('should create valid WorkMeeting', () => {
      const meeting: WorkMeeting = {
        id: 'meeting-1',
        name: 'Daily Standup',
        startTime: '10:00',
        endTime: '10:30',
        type: 'meeting',
        recurring: 'daily',
      }

      expect(meeting.type).toBe('meeting')
      expect(meeting.recurring).toBe('daily')
    })

    it('should create valid UnifiedWorkSession', () => {
      const session: UnifiedWorkSession = {
        id: 'session-1',
        taskId: 'task-1',
        startTime: new Date(),
        type: 'focused', // User-defined type ID
        plannedMinutes: 60,
      }

      expect(session.taskId).toBe('task-1')
      expect(session.actualMinutes).toBeUndefined()
    })
  })
})
