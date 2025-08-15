import { describe, it, expect } from 'vitest'
import { scheduleItemsWithBlocks, scheduleItemsWithBlocksAndDebug } from '../flexible-scheduler'
import { Task } from '@shared/types'
import { DailyWorkPattern } from '@shared/work-blocks-types'

describe('Flexible Scheduler - Simple Tests', () => {
  const createTask = (overrides: Partial<Task> = {}): Task => ({
    id: 'task-1',
    name: 'Test Task',
    duration: 60,
    importance: 5,
    urgency: 5,
    type: 'focused',
    sessionId: 'test-session',
    asyncWaitTime: 0,
    dependencies: [],
    completed: false,
    hasSteps: false,
    overallStatus: 'not_started',
    criticalPathDuration: 60,
    worstCaseDuration: 60,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  })

  const createPattern = (date: string): DailyWorkPattern => ({
    date,
    blocks: [
      {
        id: 'block-1',
        startTime: '09:00',
        endTime: '12:00',
        type: 'focused',
      },
    ],
    meetings: [],
  })
  
  // Helper to get a future date for testing
  const getFutureDate = (daysAhead: number = 1): string => {
    const date = new Date()
    date.setDate(date.getDate() + daysAhead)
    return date.toISOString().split('T')[0]
  }

  it('should schedule a simple task', () => {
    const task = createTask()
    const futureDate = getFutureDate()
    const pattern = createPattern(futureDate)

    // Use the debug version to understand what's happening
    const { scheduledItems, debugInfo } = scheduleItemsWithBlocksAndDebug([task], [], [pattern])

    // Log debug info if test fails
    if (scheduledItems.length === 0) {
      console.log('Unscheduled items:', debugInfo.unscheduledItems)
      console.log('Block utilization:', debugInfo.blockUtilization)
      console.log('Warnings:', debugInfo.warnings)
    }

    expect(scheduledItems.length).toBeGreaterThan(0)
    expect(scheduledItems[0].name).toBe('Test Task')
  })

  it('should handle empty inputs', () => {
    const result = scheduleItemsWithBlocks([], [], [])
    expect(result).toEqual([])
  })

  it('should handle patterns with meetings', () => {
    const futureDate = getFutureDate()
    const pattern: DailyWorkPattern = {
      date: futureDate,
      blocks: [],
      meetings: [
        {
          id: 'meeting-1',
          title: 'Team Standup',
          startTime: '10:00',
          endTime: '10:30',
        },
      ],
    }

    // Just verify it doesn't crash with meetings
    const result = scheduleItemsWithBlocks([], [], [pattern])
    expect(Array.isArray(result)).toBe(true)
  })

  it('should handle admin tasks', () => {
    const adminTask = createTask({
      id: 'admin-1',
      name: 'Admin Work',
      type: 'admin',
    })

    const futureDate = getFutureDate()
    const pattern: DailyWorkPattern = {
      date: futureDate,
      blocks: [
        {
          id: 'block-1',
          startTime: '14:00',
          endTime: '16:00',
          type: 'mixed',
          capacity: {
            focusMinutes: 60,
            adminMinutes: 60,
          },
        },
      ],
      meetings: [],
    }

    const result = scheduleItemsWithBlocks([adminTask], [], [pattern])

    const adminItems = result.filter(item => item.type === 'task' && item.name === 'Admin Work')
    expect(adminItems.length).toBe(1)
  })
})
