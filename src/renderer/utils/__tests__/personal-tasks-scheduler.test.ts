import { describe, it, expect } from 'vitest'
import { scheduleItemsWithBlocksAndDebug } from '../flexible-scheduler'
import { Task } from '@shared/types'
import { SequencedTask } from '@shared/sequencing-types'
import { DailyWorkPattern } from '@shared/work-blocks-types'

describe('Personal Tasks Scheduling', () => {
  it('should respect task categories when scheduling', () => {
    const personalTask: Task = {
      id: 'task-1',
      name: 'Personal Task',
      duration: 60,
      importance: 5,
      urgency: 5,
      type: 'focused',
      category: 'personal',
      asyncWaitTime: 0,
      dependencies: [],
      completed: false,
      sessionId: 'test-session',
      createdAt: new Date(),
      updatedAt: new Date(),
      hasSteps: false,
      overallStatus: 'not_started',
      criticalPathDuration: 60,
      worstCaseDuration: 60,
    }

    const workTask: Task = {
      id: 'task-2',
      name: 'Work Task',
      duration: 60,
      importance: 5,
      urgency: 5,
      type: 'focused',
      category: 'work',
      asyncWaitTime: 0,
      dependencies: [],
      completed: false,
      sessionId: 'test-session',
      createdAt: new Date(),
      updatedAt: new Date(),
      hasSteps: false,
      overallStatus: 'not_started',
      criticalPathDuration: 60,
      worstCaseDuration: 60,
    }

    // Use tomorrow's date so all blocks are available
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    tomorrow.setHours(6, 0, 0, 0) // Start at 6 AM
    const dateStr = tomorrow.toISOString().split('T')[0]
    
    const patterns: DailyWorkPattern[] = [
      {
        date: dateStr,
        blocks: [
          {
            id: 'block-1',
            startTime: '09:00',
            endTime: '12:00',
            type: 'focused',
          },
          {
            id: 'block-2',
            startTime: '13:00',
            endTime: '15:00',
            type: 'personal',
          },
        ],
        meetings: [],
        accumulated: { focusMinutes: 0, adminMinutes: 0 },
      },
    ]

    const { scheduledItems } = scheduleItemsWithBlocksAndDebug(
      [personalTask, workTask],
      [],
      patterns,
      tomorrow
    )

    // Personal task should be scheduled in the personal block (13:00-15:00)
    const personalScheduled = scheduledItems.find(item => item.id === 'task-1')
    expect(personalScheduled).toBeDefined()
    if (personalScheduled) {
      expect(personalScheduled.startTime.getHours()).toBe(13)
    }

    // Work task should be scheduled in the focused block (09:00-12:00)
    const workScheduled = scheduledItems.find(item => item.id === 'task-2')
    expect(workScheduled).toBeDefined()
    if (workScheduled) {
      const hour = workScheduled.startTime.getHours()
      expect(hour).toBeGreaterThanOrEqual(9)
      expect(hour).toBeLessThan(12)
    }
  })

  it('should not schedule personal tasks in work blocks', () => {
    const personalTask: Task = {
      id: 'task-1',
      name: 'Personal Task',
      duration: 60,
      importance: 5,
      urgency: 5,
      type: 'focused',
      category: 'personal',
      asyncWaitTime: 0,
      dependencies: [],
      completed: false,
      sessionId: 'test-session',
      createdAt: new Date(),
      updatedAt: new Date(),
      hasSteps: false,
      overallStatus: 'not_started',
      criticalPathDuration: 60,
      worstCaseDuration: 60,
    }

    const startDate = new Date('2025-08-20T08:00:00') // Use future date to avoid current time issues
    const patterns: DailyWorkPattern[] = [
      {
        date: '2025-08-20',
        blocks: [
          {
            id: 'block-1',
            startTime: '09:00',
            endTime: '17:00',
            type: 'focused', // Only work block
          },
        ],
        meetings: [],
        accumulated: { focusMinutes: 0, adminMinutes: 0 },
      },
    ]

    const { scheduledItems, debugInfo } = scheduleItemsWithBlocksAndDebug(
      [personalTask],
      [],
      patterns,
      startDate
    )

    // Personal task should NOT be scheduled
    expect(scheduledItems.length).toBe(0)
    expect(debugInfo.unscheduledItems.length).toBe(1)
    expect(debugInfo.unscheduledItems[0].name).toBe('Personal Task')
  })

  it('should not schedule work tasks in personal blocks', () => {
    const workTask: Task = {
      id: 'task-1',
      name: 'Work Task',
      duration: 60,
      importance: 5,
      urgency: 5,
      type: 'focused',
      category: 'work',
      asyncWaitTime: 0,
      dependencies: [],
      completed: false,
      sessionId: 'test-session',
      createdAt: new Date(),
      updatedAt: new Date(),
      hasSteps: false,
      overallStatus: 'not_started',
      criticalPathDuration: 60,
      worstCaseDuration: 60,
    }

    const startDate = new Date('2025-08-20T08:00:00') // Use future date to avoid current time issues
    const patterns: DailyWorkPattern[] = [
      {
        date: '2025-08-20',
        blocks: [
          {
            id: 'block-1',
            startTime: '09:00',
            endTime: '17:00',
            type: 'personal', // Only personal block
          },
        ],
        meetings: [],
        accumulated: { focusMinutes: 0, adminMinutes: 0 },
      },
    ]

    const { scheduledItems, debugInfo } = scheduleItemsWithBlocksAndDebug(
      [workTask],
      [],
      patterns,
      startDate
    )

    // Work task should NOT be scheduled
    expect(scheduledItems.length).toBe(0)
    expect(debugInfo.unscheduledItems.length).toBe(1)
    expect(debugInfo.unscheduledItems[0].name).toBe('Work Task')
  })
})