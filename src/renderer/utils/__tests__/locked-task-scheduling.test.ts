import { describe, it, expect } from 'vitest'
import { scheduleItemsWithBlocksAndDebug } from '../flexible-scheduler'
import { Task } from '@shared/types'
import { DailyWorkPattern } from '@shared/work-blocks-types'

describe.skip('Locked Task Scheduling', () => {
  const baseTask: Task = {
    id: '1',
    name: 'Regular Task',
    duration: 60,
    importance: 5,
    urgency: 5,
    type: 'focused',
    asyncWaitTime: 0,
    dependencies: [],
    completed: false,
    sessionId: 'test',
    createdAt: new Date(),
    updatedAt: new Date(),
    hasSteps: false,
    overallStatus: 'not_started',
    criticalPathDuration: 60,
    worstCaseDuration: 60,
  }

  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  tomorrow.setHours(0, 0, 0, 0)
  const tomorrowStr = tomorrow.toISOString().split('T')[0]

  const pattern: DailyWorkPattern = {
    id: 'pattern-1',
    date: tomorrowStr,
    isTemplate: false,
    sessionId: 'test',
    blocks: [
      {
        id: 'block-1',
        patternId: 'pattern-1',
        startTime: '09:00',
        endTime: '12:00',
        type: 'focused',
        capacity: {
          focusMinutes: 180,
          adminMinutes: 0,
        },
      },
      {
        id: 'block-2',
        patternId: 'pattern-1',
        startTime: '13:00',
        endTime: '17:00',
        type: 'admin',
        capacity: {
          focusMinutes: 0,
          adminMinutes: 240,
        },
      },
    ],
    meetings: [],
  }

  it('should schedule locked tasks at their exact time', () => {
    const lockedStartTime = new Date(tomorrow)
    lockedStartTime.setHours(14, 30, 0, 0) // 2:30 PM

    const lockedTask: Task = {
      ...baseTask,
      id: 'locked-1',
      name: 'Important Meeting',
      type: 'admin',
      isLocked: true,
      lockedStartTime,
    }

    const { scheduledItems } = scheduleItemsWithBlocksAndDebug(
      [lockedTask],
      [],
      [pattern],
      tomorrow,
    )

    const scheduledLocked = scheduledItems.find(item => item.id === 'locked-1')
    expect(scheduledLocked).toBeDefined()
    expect(scheduledLocked?.startTime.getTime()).toBe(lockedStartTime.getTime())
    expect(scheduledLocked?.name).toContain('🔒')
  })

  it('should prioritize locked tasks over regular tasks', () => {
    const lockedStartTime = new Date(tomorrow)
    lockedStartTime.setHours(10, 0, 0, 0) // 10:00 AM

    const lockedTask: Task = {
      ...baseTask,
      id: 'locked-1',
      name: 'Locked Task',
      importance: 1, // Low priority
      urgency: 1,
      isLocked: true,
      lockedStartTime,
    }

    const highPriorityTask: Task = {
      ...baseTask,
      id: 'high-priority',
      name: 'High Priority Task',
      importance: 10, // High priority
      urgency: 10,
    }

    const { scheduledItems } = scheduleItemsWithBlocksAndDebug(
      [highPriorityTask, lockedTask],
      [],
      [pattern],
      tomorrow,
    )

    const scheduledLocked = scheduledItems.find(item => item.id === 'locked-1')
    const scheduledHigh = scheduledItems.find(item => item.id === 'high-priority')

    expect(scheduledLocked).toBeDefined()
    expect(scheduledHigh).toBeDefined()

    // Locked task should be at its exact time
    expect(scheduledLocked?.startTime.getTime()).toBe(lockedStartTime.getTime())

    // High priority task should be scheduled around the locked task
    if (scheduledHigh && scheduledLocked) {
      const highEndsBeforeLocked = scheduledHigh.endTime <= scheduledLocked.startTime
      const highStartsAfterLocked = scheduledHigh.startTime >= scheduledLocked.endTime
      expect(highEndsBeforeLocked || highStartsAfterLocked).toBe(true)
    }
  })

  it('should warn when locked tasks conflict', () => {
    const lockedTime = new Date(tomorrow)
    lockedTime.setHours(10, 0, 0, 0) // 10:00 AM

    const lockedTask1: Task = {
      ...baseTask,
      id: 'locked-1',
      name: 'First Meeting',
      duration: 90,
      isLocked: true,
      lockedStartTime: lockedTime,
    }

    const lockedTask2: Task = {
      ...baseTask,
      id: 'locked-2',
      name: 'Second Meeting',
      duration: 60,
      isLocked: true,
      lockedStartTime: new Date(lockedTime.getTime() + 30 * 60000), // 30 minutes later
    }

    const { scheduledItems, debugInfo } = scheduleItemsWithBlocksAndDebug(
      [lockedTask1, lockedTask2],
      [],
      [pattern],
      tomorrow,
    )

    // First locked task should be scheduled
    const scheduled1 = scheduledItems.find(item => item.id === 'locked-1')
    expect(scheduled1).toBeDefined()

    // Second locked task should conflict
    const scheduled2 = scheduledItems.find(item => item.id === 'locked-2')
    expect(scheduled2).toBeUndefined()

    // Should have a warning about the conflict
    const conflictWarning = debugInfo.warnings.find(w =>
      w.includes('Second Meeting') && w.includes('conflicts'),
    )
    expect(conflictWarning).toBeDefined()
  })

  it('should skip locked tasks with past start times', () => {
    const pastTime = new Date()
    pastTime.setDate(pastTime.getDate() - 1) // Yesterday

    const pastLockedTask: Task = {
      ...baseTask,
      id: 'past-locked',
      name: 'Past Meeting',
      isLocked: true,
      lockedStartTime: pastTime,
    }

    const { scheduledItems, debugInfo } = scheduleItemsWithBlocksAndDebug(
      [pastLockedTask],
      [],
      [pattern],
      tomorrow,
    )

    // Should not be scheduled
    const scheduledPast = scheduledItems.find(item => item.id === 'past-locked')
    expect(scheduledPast).toBeUndefined()

    // Should have a warning about past time
    const pastWarning = debugInfo.warnings.find(w =>
      w.includes('Past Meeting') && w.includes('past'),
    )
    expect(pastWarning).toBeDefined()
  })

  it.skip('should handle multiple locked tasks on different days', () => {
    // Create consistent dates without timezone issues
    const year = tomorrow.getFullYear()
    const month = tomorrow.getMonth()
    const day = tomorrow.getDate()

    const day1 = new Date(year, month, day, 0, 0, 0, 0)
    const day2 = new Date(year, month, day + 1, 0, 0, 0, 0)

    const day1Str = day1.toISOString().split('T')[0]
    const day2Str = day2.toISOString().split('T')[0]

    const patterns: DailyWorkPattern[] = [
      { ...pattern, date: day1Str },
      { ...pattern, id: 'pattern-2', date: day2Str, blocks: pattern.blocks.map(b => ({ ...b, patternId: 'pattern-2' })) },
    ]

    const locked1Time = new Date(year, month, day, 10, 0, 0, 0)
    const locked2Time = new Date(year, month, day + 1, 14, 0, 0, 0)

    const lockedTask1: Task = {
      ...baseTask,
      id: 'locked-day1',
      name: 'Day 1 Meeting',
      isLocked: true,
      lockedStartTime: locked1Time,
    }

    const lockedTask2: Task = {
      ...baseTask,
      id: 'locked-day2',
      name: 'Day 2 Meeting',
      type: 'admin',
      isLocked: true,
      lockedStartTime: locked2Time,
    }

    const { scheduledItems, debugInfo } = scheduleItemsWithBlocksAndDebug(
      [lockedTask1, lockedTask2],
      [],
      patterns,
      day1,
    )

    const scheduled1 = scheduledItems.find(item => item.id === 'locked-day1')
    const scheduled2 = scheduledItems.find(item => item.id === 'locked-day2')

    expect(scheduled1).toBeDefined()
    expect(scheduled2).toBeDefined()

    // Debug output if test fails
    if (scheduled2 && scheduled2.startTime.getTime() !== locked2Time.getTime()) {
      console.log('Expected time:', locked2Time.toISOString())
      console.log('Actual time:', scheduled2.startTime.toISOString())
      console.log('Warnings:', debugInfo.warnings)
    }

    expect(scheduled1?.startTime.getTime()).toBe(locked1Time.getTime())
    expect(scheduled2?.startTime.getTime()).toBe(locked2Time.getTime())
  })

  it('should schedule regular tasks around locked tasks', () => {
    const lockedTime = new Date(tomorrow)
    lockedTime.setHours(10, 0, 0, 0) // 10:00 AM - 11:00 AM

    const lockedTask: Task = {
      ...baseTask,
      id: 'locked',
      name: 'Team Meeting',
      duration: 60,
      isLocked: true,
      lockedStartTime: lockedTime,
    }

    const beforeTask: Task = {
      ...baseTask,
      id: 'before',
      name: 'Morning Work',
      duration: 60,
    }

    const afterTask: Task = {
      ...baseTask,
      id: 'after',
      name: 'Afternoon Work',
      duration: 60,
      type: 'admin', // Change to admin to use afternoon capacity
    }

    const { scheduledItems } = scheduleItemsWithBlocksAndDebug(
      [lockedTask, beforeTask, afterTask],
      [],
      [pattern],
      tomorrow,
    )

    const scheduledLocked = scheduledItems.find(item => item.id === 'locked')
    const scheduledBefore = scheduledItems.find(item => item.id === 'before')
    const scheduledAfter = scheduledItems.find(item => item.id === 'after')

    expect(scheduledLocked).toBeDefined()
    expect(scheduledBefore).toBeDefined()
    expect(scheduledAfter).toBeDefined()

    // Locked task at exact time
    expect(scheduledLocked?.startTime.getTime()).toBe(lockedTime.getTime())

    // Other tasks should not overlap with locked task
    if (scheduledBefore && scheduledLocked) {
      const beforeOverlaps = !(
        scheduledBefore.endTime <= scheduledLocked.startTime ||
        scheduledBefore.startTime >= scheduledLocked.endTime
      )
      expect(beforeOverlaps).toBe(false)
    }

    if (scheduledAfter && scheduledLocked) {
      const afterOverlaps = !(
        scheduledAfter.endTime <= scheduledLocked.startTime ||
        scheduledAfter.startTime >= scheduledLocked.endTime
      )
      expect(afterOverlaps).toBe(false)
    }
  })
})
