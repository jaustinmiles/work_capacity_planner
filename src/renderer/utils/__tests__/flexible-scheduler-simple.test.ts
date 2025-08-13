import { describe, it, expect } from 'vitest'
import { scheduleItemsWithBlocks } from '../flexible-scheduler'
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

  it('should schedule a simple task', () => {
    const task = createTask()
    const pattern = createPattern('2025-08-15')
    
    const result = scheduleItemsWithBlocks([task], [], [pattern])
    
    expect(result.length).toBeGreaterThan(0)
    expect(result[0].name).toBe('Test Task')
  })

  it('should handle empty inputs', () => {
    const result = scheduleItemsWithBlocks([], [], [])
    expect(result).toEqual([])
  })

  it('should handle patterns with meetings', () => {
    const pattern: DailyWorkPattern = {
      date: '2025-08-15',
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
      type: 'admin' 
    })
    
    const pattern: DailyWorkPattern = {
      date: '2025-08-15',
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