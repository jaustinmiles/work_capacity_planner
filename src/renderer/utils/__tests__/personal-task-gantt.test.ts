import { describe, it, expect } from 'vitest'
import { scheduleItemsWithBlocksAndDebug } from '../flexible-scheduler'
import { Task } from '@shared/types'
import { TaskType, TaskCategory } from '@shared/enums'
import { DailyWorkPattern } from '@shared/work-blocks-types'

describe('Personal Task Gantt Chart Display', () => {
  it('should schedule personal tasks in personal blocks', () => {
    const personalTask: Task = {
      id: 'personal-1',
      name: 'Task Management App',
      type: TaskType.Focused,
      category: TaskCategory.Personal, // Using enum value 'personal'
      importance: 50,
      urgency: 50,
      duration: 60,
      dependencies: [],
      sessionId: 'test-session',
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    const workTask: Task = {
      id: 'work-1',
      name: 'Work Project',
      type: TaskType.Focused,
      category: TaskCategory.Work,
      importance: 50,
      urgency: 50,
      duration: 60,
      dependencies: [],
      sessionId: 'test-session',
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    const today = new Date()
    today.setHours(9, 0, 0, 0)

    const patterns: DailyWorkPattern[] = [{
      date: today.toISOString().split('T')[0],
      blocks: [
        {
          id: 'personal-block',
          startTime: '09:00',
          endTime: '10:00',
          type: 'personal',
          capacity: { focusMinutes: 0, adminMinutes: 0, personalMinutes: 60 },
        },
        {
          id: 'work-block',
          startTime: '10:00',
          endTime: '12:00',
          type: 'focus',
          capacity: { focusMinutes: 120, adminMinutes: 0 },
        }
      ],
      meetings: [],
      accumulated: { focusMinutes: 0, adminMinutes: 0 },,
    }]

    const result = scheduleItemsWithBlocksAndDebug([personalTask, workTask], [], patterns, today)

    // Personal task should be scheduled in personal block
    const scheduledPersonal = result.scheduledItems.find(item => item.id === 'personal-1')
    expect(scheduledPersonal).toBeDefined()
    expect(scheduledPersonal?.startTime.getHours()).toBe(9)

    // Work task should be scheduled in work block
    const scheduledWork = result.scheduledItems.find(item => item.id === 'work-1')
    expect(scheduledWork).toBeDefined()
    expect(scheduledWork?.startTime.getHours()).toBe(10)

    // Personal task should not be in unscheduled items
    const unscheduledPersonal = result.debugInfo.unscheduledItems.find(item => item.id === 'personal-1')
    expect(unscheduledPersonal).toBeUndefined()
  })

  it('should handle Personal enum value (capital P) correctly', () => {
    // This tests the actual bug - category might be 'Personal' instead of 'personal'
    const personalTaskCapitalP: Task = {
      id: 'personal-2',
      name: 'Task Management App',
      type: TaskType.Focused,
      category: 'Personal' as any, // Simulating what might be stored
      importance: 50,
      urgency: 50,
      duration: 60,
      dependencies: [],
      sessionId: 'test-session',
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    const today = new Date()
    today.setHours(9, 0, 0, 0)

    const patterns: DailyWorkPattern[] = [{
      date: today.toISOString().split('T')[0],
      blocks: [
        {
          id: 'personal-block',
          startTime: '09:00',
          endTime: '10:00',
          type: 'personal',
          capacity: { focusMinutes: 0, adminMinutes: 0, personalMinutes: 60 },
        },
      ],
      meetings: [],
      accumulated: { focusMinutes: 0, adminMinutes: 0 },,
    }]

    const result = scheduleItemsWithBlocksAndDebug([personalTaskCapitalP], [], patterns, today)

    // Task should still be scheduled (after fix)
    const scheduled = result.scheduledItems.find(item => item.id === 'personal-2')
    expect(scheduled).toBeDefined()
  })
})