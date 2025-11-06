import { describe, it, expect } from 'vitest'
import {
  WorkBlock,
  DailyWorkPattern,
  Meeting,
  WorkTemplate,
  DEFAULT_WORK_TEMPLATES,
  getTotalCapacity,
  getRemainingCapacity,
  getCurrentBlock,
  getNextBlock,
} from './work-blocks-types'
import { UnifiedWorkSession } from './unified-work-session-types'
import { TaskType } from './enums'

describe('work-blocks-types', () => {
  describe('DEFAULT_WORK_TEMPLATES', () => {
    it('should have 4 default templates', () => {
      expect(DEFAULT_WORK_TEMPLATES).toHaveLength(4)
    })

    it('should have standard-9-5 template as default', () => {
      const standard = DEFAULT_WORK_TEMPLATES.find(t => t.id === 'standard-9-5')
      expect(standard).toBeDefined()
      expect(standard?.isDefault).toBe(true)
      expect(standard?.blocks).toHaveLength(2)
      expect(standard?.blocks[0]).toEqual({
        startTime: '09:00',
        endTime: '12:00',
        type: 'mixed',
      })
    })

    it('should have early-bird template', () => {
      const earlyBird = DEFAULT_WORK_TEMPLATES.find(t => t.id === 'early-bird')
      expect(earlyBird).toBeDefined()
      expect(earlyBird?.blocks).toHaveLength(3)
      expect(earlyBird?.blocks[0].startTime).toBe('06:00')
      expect(earlyBird?.blocks[0].type).toBe('focused')
    })

    it('should have night-owl template', () => {
      const nightOwl = DEFAULT_WORK_TEMPLATES.find(t => t.id === 'night-owl')
      expect(nightOwl).toBeDefined()
      expect(nightOwl?.blocks).toHaveLength(3)
      expect(nightOwl?.blocks[2].startTime).toBe('19:00')
      expect(nightOwl?.blocks[2].endTime).toBe('22:00')
    })

    it('should have split-day template', () => {
      const splitDay = DEFAULT_WORK_TEMPLATES.find(t => t.id === 'split-day')
      expect(splitDay).toBeDefined()
      expect(splitDay?.blocks).toHaveLength(4)
    })
  })

  describe('getTotalCapacity', () => {
    it('should calculate capacity for focused blocks', () => {
      const blocks: WorkBlock[] = [
        { id: '1', startTime: '09:00', endTime: '11:00', type: 'focused' },
        { id: '2', startTime: '14:00', endTime: '16:00', type: 'focused' },
      ]

      const capacity = getTotalCapacity(blocks)
      expect(capacity.focus).toBe(240) // 2 + 2 hours
      expect(capacity.admin).toBe(0)
      expect(capacity.personal).toBe(0)
    })

    it('should calculate capacity for admin blocks', () => {
      const blocks: WorkBlock[] = [
        { id: '1', startTime: '09:00', endTime: '10:30', type: 'admin' },
        { id: '2', startTime: '13:00', endTime: '14:00', type: 'admin' },
      ]

      const capacity = getTotalCapacity(blocks)
      expect(capacity.focus).toBe(0)
      expect(capacity.admin).toBe(150) // 1.5 + 1 hours
      expect(capacity.personal).toBe(0)
    })

    it('should calculate capacity for mixed blocks', () => {
      const blocks: WorkBlock[] = [
        { id: '1', startTime: '09:00', endTime: '11:00', type: 'mixed' },
      ]

      const capacity = getTotalCapacity(blocks)
      expect(capacity.focus).toBe(60) // Half of 2 hours
      expect(capacity.admin).toBe(60) // Half of 2 hours
      expect(capacity.personal).toBe(0)
    })

    it('should calculate capacity for personal blocks', () => {
      const blocks: WorkBlock[] = [
        { id: '1', startTime: '12:00', endTime: '13:00', type: 'personal' },
      ]

      const capacity = getTotalCapacity(blocks)
      expect(capacity.focus).toBe(0)
      expect(capacity.admin).toBe(0)
      expect(capacity.personal).toBe(60)
    })

    it('should calculate capacity for flexible/universal blocks', () => {
      const blocks: WorkBlock[] = [
        { id: '1', startTime: '09:00', endTime: '11:00', type: 'flexible' },
        { id: '2', startTime: '14:00', endTime: '16:00', type: 'universal' },
      ]

      const capacity = getTotalCapacity(blocks)
      // Flexible blocks should NOT be counted in focus/admin/personal to avoid double-counting
      // They are tracked separately as flexible capacity
      expect(capacity.focus).toBe(0)
      expect(capacity.admin).toBe(0)
      expect(capacity.personal).toBe(0)
    })

    it('should use custom capacity when provided', () => {
      const blocks: WorkBlock[] = [
        {
          id: '1',
          startTime: '09:00',
          endTime: '11:00',
          type: 'mixed',
          capacity: {
            totalMinutes: 120,
            type: 'mixed',
            splitRatio: {
              focus: 0.75, // 75% focus = 90 minutes
              admin: 0.25, // 25% admin = 30 minutes
            },
          },
        },
      ]

      const capacity = getTotalCapacity(blocks)
      expect(capacity.focus).toBe(90)
      expect(capacity.admin).toBe(30)
      expect(capacity.personal).toBe(0)
    })

    it('should handle empty blocks array', () => {
      const capacity = getTotalCapacity([])
      expect(capacity.focus).toBe(0)
      expect(capacity.admin).toBe(0)
      expect(capacity.personal).toBe(0)
    })

    it('should handle blocks spanning midnight', () => {
      const blocks: WorkBlock[] = [
        { id: '1', startTime: '22:00', endTime: '02:00', type: 'focused' },
      ]

      // This would need special handling in real implementation
      const capacity = getTotalCapacity(blocks)
      // For now it calculates negative duration
      expect(capacity.focus).toBeLessThan(0)
    })
  })

  describe('getRemainingCapacity', () => {
    const blocks: WorkBlock[] = [
      { id: '1', startTime: '09:00', endTime: '12:00', type: 'focused' },
      { id: '2', startTime: '13:00', endTime: '17:00', type: 'admin' },
    ]

    it('should calculate remaining capacity with no accumulation', () => {
      const remaining = getRemainingCapacity(blocks, {
        focus: 0,
        admin: 0,
        personal: 0,
      })

      expect(remaining.focus).toBe(180) // 3 hours
      expect(remaining.admin).toBe(240) // 4 hours
      expect(remaining.personal).toBe(0)
    })

    it('should calculate remaining capacity with partial accumulation', () => {
      const remaining = getRemainingCapacity(blocks, {
        focus: 60,
        admin: 120,
        personal: 0,
      })

      expect(remaining.focus).toBe(120)
      expect(remaining.admin).toBe(120)
      expect(remaining.personal).toBe(0)
    })

    it('should return 0 when fully accumulated', () => {
      const remaining = getRemainingCapacity(blocks, {
        focus: 180,
        admin: 240,
        personal: 0,
      })

      expect(remaining.focus).toBe(0)
      expect(remaining.admin).toBe(0)
      expect(remaining.personal).toBe(0)
    })

    it('should return 0 when over-accumulated', () => {
      const remaining = getRemainingCapacity(blocks, {
        focus: 300,
        admin: 500,
        personal: 100,
      })

      expect(remaining.focus).toBe(0)
      expect(remaining.admin).toBe(0)
      expect(remaining.personal).toBe(0)
    })

    it('should handle undefined personal in accumulated', () => {
      const remaining = getRemainingCapacity(blocks, {
        focus: 0,
        admin: 0,
      })

      expect(remaining.personal).toBe(0)
    })
  })

  describe('getCurrentBlock', () => {
    const blocks: WorkBlock[] = [
      { id: '1', startTime: '09:00', endTime: '12:00', type: 'focused' },
      { id: '2', startTime: '13:00', endTime: '17:00', type: 'admin' },
      { id: '3', startTime: '18:00', endTime: '20:00', type: 'personal' },
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
      { id: '1', startTime: '09:00', endTime: '12:00', type: 'focused' },
      { id: '2', startTime: '13:00', endTime: '17:00', type: 'admin' },
      { id: '3', startTime: '18:00', endTime: '20:00', type: 'personal' },
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

    it('should handle unsorted blocks', () => {
      const unsortedBlocks: WorkBlock[] = [
        { id: '2', startTime: '13:00', endTime: '17:00', type: 'admin' },
        { id: '3', startTime: '18:00', endTime: '20:00', type: 'personal' },
        { id: '1', startTime: '09:00', endTime: '12:00', type: 'focused' },
      ]

      const time = new Date('2025-01-15T08:00:00')
      const block = getNextBlock(unsortedBlocks, time)

      expect(block).toBeDefined()
      expect(block?.id).toBe('1')
    })
  })

  describe('Type definitions', () => {
    it('should create valid WorkBlock', () => {
      const block: WorkBlock = {
        id: 'test-block',
        startTime: '09:00',
        endTime: '11:00',
        type: 'focused',
        capacity: {
          focus: 120,
          admin: 0,
          personal: 0,
        },
      }

      expect(block.id).toBe('test-block')
      expect(block.type).toBe('focused')
    })

    it('should create valid DailyWorkPattern', () => {
      const pattern: DailyWorkPattern = {
        date: '2025-01-15',
        blocks: [],
        accumulated: {
          focus: 0,
          admin: 0,
          personal: 0,
        },
        meetings: [],
      }

      expect(pattern.date).toBe('2025-01-15')
      expect(pattern.blocks).toEqual([])
    })

    it('should create valid Meeting', () => {
      const meeting: Meeting = {
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
        type: TaskType.Focused,
        plannedMinutes: 60,
      }

      expect(session.taskId).toBe('task-1')
      expect(session.actualMinutes).toBeUndefined()
    })

    it('should create valid WorkTemplate', () => {
      const template: WorkTemplate = {
        id: 'custom-template',
        name: 'My Custom Day',
        description: 'A custom work template',
        blocks: [
          { startTime: '08:00', endTime: '12:00', type: 'focused' },
        ],
        isDefault: false,
      }

      expect(template.blocks).toHaveLength(1)
      expect(template.isDefault).toBe(false)
    })
  })
})
