import { describe, it, expect } from 'vitest'
import { scheduleItemsWithBlocksAndDebug } from '../flexible-scheduler'
import { Task } from '@shared/types'
import { TaskType } from '@shared/enums'
import { DailyWorkPattern } from '@shared/work-blocks-types'

describe('Personal Task Gantt Chart Display', () => {
  it('should schedule personal tasks in personal blocks', () => {
    const personalTask: Task = {
      id: 'personal-1',
      name: 'Task Management App',
      type: TaskType.Personal,
      importance: 50,
      urgency: 50,
      duration: 60,
      asyncWaitTime: 0,
      dependencies: [],
      completed: false,
      sessionId: 'test-session',
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    const workTask: Task = {
      id: 'work-1',
      name: 'Work Project',
      type: TaskType.Focused,
      importance: 50,
      urgency: 50,
      duration: 60,
      asyncWaitTime: 0,
      dependencies: [],
      completed: false,
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
          capacity: { focusMinutes: 120, adminMinutes: 0, personalMinutes: 0 },
        },
      ],
      meetings: [],
      accumulated: { focusMinutes: 0, adminMinutes: 0, personalMinutes: 0 },
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

  it('should not schedule personal tasks in non-personal blocks', () => {
    const personalTask: Task = {
      id: 'personal-2',
      name: 'Personal Task',
      type: TaskType.Personal,
      importance: 50,
      urgency: 50,
      duration: 60,
      asyncWaitTime: 0,
      dependencies: [],
      completed: false,
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
          id: 'work-block',
          startTime: '09:00',
          endTime: '11:00',
          type: 'focus',
          capacity: { focusMinutes: 120, adminMinutes: 0, personalMinutes: 0 },
        },
      ],
      meetings: [],
      accumulated: { focusMinutes: 0, adminMinutes: 0, personalMinutes: 0 },
    }]

    const result = scheduleItemsWithBlocksAndDebug([personalTask], [], patterns, today)

    // Personal task should NOT be scheduled in work block
    const scheduled = result.scheduledItems.find(item => item.id === 'personal-2')
    expect(scheduled).toBeUndefined()

    // Personal task should be in unscheduled items
    const unscheduled = result.debugInfo.unscheduledItems.find(item => item.id === 'personal-2')
    expect(unscheduled).toBeDefined()
  })
})
