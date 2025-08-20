import { describe, it, expect } from 'vitest'
import { scheduleItemsWithBlocksAndDebug } from '../flexible-scheduler'
import { Task } from '@shared/types'
import { TaskType } from '@shared/enums'
import { DailyWorkPattern } from '@shared/work-blocks-types'

describe('Task Splitting', () => {
  it('should split a long task across multiple blocks when enabled', () => {
    const longTask: Task = {
      id: 'long-task-1',
      name: 'Six Hour Task',
      duration: 360, // 6 hours
      importance: 7,
      urgency: 7,
      type: TaskType.Focused,
      asyncWaitTime: 0,
      dependencies: [],
      completed: false,
      sessionId: 'test-session',
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    const testDate = new Date('2025-12-01T06:00:00')
    const dateStr = '2025-12-01'

    // Create pattern with multiple 2-hour blocks
    const patterns: DailyWorkPattern[] = [
      {
        date: dateStr,
        blocks: [
          {
            id: 'block-1',
            startTime: '09:00',
            endTime: '11:00', // 2 hours
            type: 'focus',
            capacity: { focusMinutes: 120, adminMinutes: 0, personalMinutes: 0 },
          },
          {
            id: 'block-2',
            startTime: '13:00',
            endTime: '15:00', // 2 hours
            type: 'focus',
            capacity: { focusMinutes: 120, adminMinutes: 0, personalMinutes: 0 },
          },
          {
            id: 'block-3',
            startTime: '15:30',
            endTime: '17:30', // 2 hours
            type: 'focus',
            capacity: { focusMinutes: 120, adminMinutes: 0, personalMinutes: 0 },
          },
        ],
        meetings: [],
        accumulated: { focusMinutes: 0, adminMinutes: 0, personalMinutes: 0 },
      },
    ]

    // Schedule with splitting enabled
    const result = scheduleItemsWithBlocksAndDebug(
      [longTask],
      [],
      patterns,
      testDate,
      { allowTaskSplitting: true, minimumSplitDuration: 30 }
    )

    // Debug output
    console.log('Scheduled items:', result.scheduledItems.map(item => ({
      name: item.name,
      duration: item.duration,
      start: item.startTime.toISOString(),
    })))
    console.log('Unscheduled:', result.debugInfo.unscheduledItems)
    
    // Should have scheduled all 3 parts
    expect(result.scheduledItems.length).toBe(3)
    
    // Check that parts are labeled correctly
    const part1 = result.scheduledItems.find(item => item.name.includes('(1/3)'))
    const part2 = result.scheduledItems.find(item => item.name.includes('(2/3)'))
    const part3 = result.scheduledItems.find(item => item.name.includes('(3/3)'))
    
    expect(part1).toBeDefined()
    expect(part2).toBeDefined()
    expect(part3).toBeDefined()
    
    // Check durations
    expect(part1?.duration).toBe(120) // 2 hours
    expect(part2?.duration).toBe(120) // 2 hours
    expect(part3?.duration).toBe(120) // 2 hours
    
    // Check split metadata
    expect(part1?.isSplit).toBe(true)
    expect(part1?.splitPart).toBe(1)
    expect(part1?.splitTotal).toBe(3)
    
    // Check they all have the same original task ID
    expect(part1?.originalTaskId).toBe('long-task-1')
    expect(part2?.originalTaskId).toBe('long-task-1')
    expect(part3?.originalTaskId).toBe('long-task-1')
  })

  it('should not split tasks when splitting is disabled', () => {
    const longTask: Task = {
      id: 'long-task-2',
      name: 'Six Hour Task',
      duration: 360, // 6 hours
      importance: 7,
      urgency: 7,
      type: TaskType.Focused,
      asyncWaitTime: 0,
      dependencies: [],
      completed: false,
      sessionId: 'test-session',
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    const testDate = new Date('2025-12-01T06:00:00')
    const dateStr = '2025-12-01'

    // Same pattern with 2-hour blocks
    const patterns: DailyWorkPattern[] = [
      {
        date: dateStr,
        blocks: [
          {
            id: 'block-1',
            startTime: '09:00',
            endTime: '11:00',
            type: 'focus',
            capacity: { focusMinutes: 120, adminMinutes: 0, personalMinutes: 0 },
          },
        ],
        meetings: [],
        accumulated: { focusMinutes: 0, adminMinutes: 0, personalMinutes: 0 },
      },
    ]

    // Schedule with splitting disabled (default)
    const result = scheduleItemsWithBlocksAndDebug(
      [longTask],
      [],
      patterns,
      testDate,
      { allowTaskSplitting: false }
    )

    // Should not schedule the task since it doesn't fit in any single block
    expect(result.scheduledItems.length).toBe(0)
    expect(result.debugInfo.unscheduledItems.length).toBe(1)
    expect(result.debugInfo.unscheduledItems[0].name).toBe('Six Hour Task')
  })

  it('should respect minimum split duration', () => {
    const task: Task = {
      id: 'task-3',
      name: 'Task with Small Remainder',
      duration: 140, // 2 hours 20 minutes
      importance: 5,
      urgency: 5,
      type: TaskType.Focused,
      asyncWaitTime: 0,
      dependencies: [],
      completed: false,
      sessionId: 'test-session',
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    const testDate = new Date('2025-12-01T06:00:00')
    const patterns: DailyWorkPattern[] = [
      {
        date: '2025-12-01',
        blocks: [
          {
            id: 'block-1',
            startTime: '09:00',
            endTime: '11:00', // 2 hours
            type: 'focus',
            capacity: { focusMinutes: 120, adminMinutes: 0, personalMinutes: 0 },
          },
          {
            id: 'block-2',
            startTime: '13:00',
            endTime: '13:15', // Only 15 minutes
            type: 'focus',
            capacity: { focusMinutes: 15, adminMinutes: 0, personalMinutes: 0 },
          },
        ],
        meetings: [],
        accumulated: { focusMinutes: 0, adminMinutes: 0, personalMinutes: 0 },
      },
      {
        date: '2025-12-02',
        blocks: [
          {
            id: 'block-3',
            startTime: '09:00',
            endTime: '10:00', // 1 hour
            type: 'focus',
            capacity: { focusMinutes: 60, adminMinutes: 0, personalMinutes: 0 },
          },
        ],
        meetings: [],
        accumulated: { focusMinutes: 0, adminMinutes: 0, personalMinutes: 0 },
      },
    ]

    // Schedule with 30-minute minimum split
    const result = scheduleItemsWithBlocksAndDebug(
      [task],
      [],
      patterns,
      testDate,
      { allowTaskSplitting: true, minimumSplitDuration: 30 }
    )

    // Should schedule in block 1 (2 hours) and skip block 2 (too small), use block 3 next day
    expect(result.scheduledItems.length).toBe(2)
    
    const part1 = result.scheduledItems[0]
    const part2 = result.scheduledItems[1]
    
    expect(part1.duration).toBe(120) // First block: 2 hours
    expect(part2.duration).toBe(20) // Remainder: 20 minutes in next day's block
    
    // Check that small block was skipped
    expect(part2.startTime.getDate()).toBe(2) // Should be on the 2nd, not in the 15-min block
  })

  it('should only split personal tasks in personal blocks', () => {
    const personalTask: Task = {
      id: 'personal-task-1',
      name: 'Long Personal Task',
      duration: 180, // 3 hours
      importance: 5,
      urgency: 5,
      type: TaskType.Personal,
      asyncWaitTime: 0,
      dependencies: [],
      completed: false,
      sessionId: 'test-session',
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    const testDate = new Date('2025-12-01T06:00:00')
    const patterns: DailyWorkPattern[] = [
      {
        date: '2025-12-01',
        blocks: [
          {
            id: 'work-block',
            startTime: '09:00',
            endTime: '11:00',
            type: 'focus', // Work block - should be skipped
            capacity: { focusMinutes: 120, adminMinutes: 0, personalMinutes: 0 },
          },
          {
            id: 'personal-block-1',
            startTime: '12:00',
            endTime: '13:30', // 1.5 hours
            type: 'personal',
            capacity: { focusMinutes: 0, adminMinutes: 0, personalMinutes: 90 },
          },
          {
            id: 'personal-block-2',
            startTime: '17:00',
            endTime: '18:30', // 1.5 hours
            type: 'personal',
            capacity: { focusMinutes: 0, adminMinutes: 0, personalMinutes: 90 },
          },
        ],
        meetings: [],
        accumulated: { focusMinutes: 0, adminMinutes: 0, personalMinutes: 0 },
      },
    ]

    const result = scheduleItemsWithBlocksAndDebug(
      [personalTask],
      [],
      patterns,
      testDate,
      { allowTaskSplitting: true, minimumSplitDuration: 30 }
    )

    // Should split across the two personal blocks only
    expect(result.scheduledItems.length).toBe(2)
    
    const part1 = result.scheduledItems[0]
    const part2 = result.scheduledItems[1]
    
    expect(part1.duration).toBe(90) // 1.5 hours
    expect(part2.duration).toBe(90) // 1.5 hours
    
    // Verify they're in personal blocks (12:00 and 17:00)
    expect(part1.startTime.getHours()).toBe(12)
    expect(part2.startTime.getHours()).toBe(17)
  })
})