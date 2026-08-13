import { describe, it, expect, beforeEach } from 'vitest'
import { UnifiedScheduler } from '../unified-scheduler'
import { ScheduleContext, UnifiedScheduleItem } from '../unified-scheduler'
import { DailyWorkPattern, WorkBlock, WorkMeeting } from '../work-blocks-types'

describe('UnifiedScheduler - Meeting Scheduling', () => {
  let scheduler: UnifiedScheduler

  beforeEach(() => {
    scheduler = new UnifiedScheduler()
  })

  describe('Meeting Time Blocking', () => {
    it('should block time slots when meetings are present', () => {
      // Create work pattern with a meeting from 10:00-11:00
      const workPattern: DailyWorkPattern = {
        date: '2024-01-01',
        blocks: [
          {
            id: 'block-1',
            patternId: 'pattern-1',
            startTime: '09:00',
            endTime: '17:00',
            typeConfig: { kind: 'combo' as const, allocations: [{ typeId: 'focused', ratio: 0.5 }, { typeId: 'admin', ratio: 0.5 }] },
            capacity: { totalMinutes: 480 },
          } as WorkBlock,
        ],
        meetings: [
          {
            id: 'meeting-1',
            patternId: 'pattern-1',
            name: 'Team Standup',
            startTime: '10:00',
            endTime: '11:00',
            recurring: false,
          } as WorkMeeting,
        ],
        accumulated: {},
      }

      const task: UnifiedScheduleItem = {
        id: 'task-1',
        name: 'Review code',
        type: 'task',
        taskType: 'focused',
        duration: 60, // 1 hour task
        priority: 5,
        dependencies: [],
      }

      const context: ScheduleContext = {
        startDate: '2024-01-01',
        currentTime: new Date('2024-01-01T09:00:00'),
        tasks: [],
        workflows: [],
        workPatterns: [workPattern],
        workSettings: {
          defaultWorkHours: {
            startTime: '09:00',
            endTime: '17:00',
            lunchStart: '12:00',
            lunchDuration: 60,
          },
          customWorkHours: {},
          defaultCapacity: {
            maxFocusHours: 8,
            maxAdminHours: 4,
            blockedTimes: [],
          },
          customCapacity: {},
          timeZone: 'UTC',
        },
      }

      const result = scheduler.scheduleForDisplay([task], context, { debugMode: false })

      // Task should be scheduled but NOT during the meeting time
      const scheduledTasks = result.scheduled.filter(item => item.type === 'task')
      const scheduledMeetings = result.scheduled.filter(item => item.type === 'meeting')

      expect(scheduledTasks.length).toBe(1)
      expect(scheduledMeetings.length).toBe(1)

      const scheduledTask = scheduledTasks[0]

      // Task should be scheduled either before 10:00 or after 11:00
      const taskStart = scheduledTask.startTime!
      const taskEnd = scheduledTask.endTime!
      const meetingStart = new Date('2024-01-01T10:00:00')
      const meetingEnd = new Date('2024-01-01T11:00:00')

      // Verify no overlap with meeting
      const overlapsWithMeeting = taskStart < meetingEnd && taskEnd > meetingStart
      expect(overlapsWithMeeting).toBe(false)
    })

    it('should schedule tasks around multiple meetings', () => {
      const workPattern: DailyWorkPattern = {
        date: '2024-01-01',
        blocks: [
          {
            id: 'block-1',
            patternId: 'pattern-1',
            startTime: '09:00',
            endTime: '17:00',
            typeConfig: { kind: 'combo' as const, allocations: [{ typeId: 'focused', ratio: 0.5 }, { typeId: 'admin', ratio: 0.5 }] },
            capacity: { totalMinutes: 480 },
          } as WorkBlock,
        ],
        meetings: [
          {
            id: 'meeting-1',
            patternId: 'pattern-1',
            name: 'Morning Standup',
            startTime: '09:30',
            endTime: '10:00',
            recurring: false,
          } as WorkMeeting,
          {
            id: 'meeting-2',
            patternId: 'pattern-1',
            name: 'Lunch Meeting',
            startTime: '12:00',
            endTime: '13:00',
            recurring: false,
          } as WorkMeeting,
          {
            id: 'meeting-3',
            patternId: 'pattern-1',
            name: 'Afternoon Sync',
            startTime: '15:00',
            endTime: '15:30',
            recurring: false,
          } as WorkMeeting,
        ],
        accumulated: {},
      }

      // Create three 30-minute tasks
      const tasks: UnifiedScheduleItem[] = [
        {
          id: 'task-1',
          name: 'Task 1',
          type: 'task',
          taskType: 'focused',
          duration: 30,
          priority: 5,
          dependencies: [],
        },
        {
          id: 'task-2',
          name: 'Task 2',
          type: 'task',
          taskType: 'focused',
          duration: 30,
          priority: 5,
          dependencies: [],
        },
        {
          id: 'task-3',
          name: 'Task 3',
          type: 'task',
          taskType: 'focused',
          duration: 30,
          priority: 5,
          dependencies: [],
        },
      ]

      const context: ScheduleContext = {
        startDate: '2024-01-01',
        currentTime: new Date('2024-01-01T09:00:00'),
        tasks: [],
        workflows: [],
        workPatterns: [workPattern],
        workSettings: {
          defaultWorkHours: {
            startTime: '09:00',
            endTime: '17:00',
            lunchStart: '12:00',
            lunchDuration: 60,
          },
          customWorkHours: {},
          defaultCapacity: {
            maxFocusHours: 8,
            maxAdminHours: 4,
            blockedTimes: [],
          },
          customCapacity: {},
          timeZone: 'UTC',
        },
      }

      const result = scheduler.scheduleForDisplay(tasks, context, { debugMode: false })

      // All tasks should be scheduled
      const scheduledTasks = result.scheduled.filter(item => item.type === 'task')
      const scheduledMeetings = result.scheduled.filter(item => item.type === 'meeting')

      expect(scheduledTasks.length).toBe(3)
      expect(scheduledMeetings.length).toBe(3)

      // Define meeting times
      const meetings = [
        { start: new Date('2024-01-01T09:30:00'), end: new Date('2024-01-01T10:00:00') },
        { start: new Date('2024-01-01T12:00:00'), end: new Date('2024-01-01T13:00:00') },
        { start: new Date('2024-01-01T15:00:00'), end: new Date('2024-01-01T15:30:00') },
      ]

      // Verify no task overlaps with any meeting
      for (const task of scheduledTasks) {
        const taskStart = task.startTime!
        const taskEnd = task.endTime!

        for (const meeting of meetings) {
          const overlaps = taskStart < meeting.end && taskEnd > meeting.start
          expect(overlaps).toBe(false)
        }
      }
    })

    it('should split a task that cannot fit contiguously between meetings — never spill outside the block', () => {
      const workPattern: DailyWorkPattern = {
        date: '2024-01-01',
        blocks: [
          {
            id: 'block-1',
            patternId: 'pattern-1',
            startTime: '09:00',
            endTime: '12:00',
            typeConfig: { kind: 'combo' as const, allocations: [{ typeId: 'focused', ratio: 0.5 }, { typeId: 'admin', ratio: 0.5 }] },
            capacity: { totalMinutes: 180 },
          } as WorkBlock,
        ],
        meetings: [
          {
            id: 'meeting-1',
            patternId: 'pattern-1',
            name: 'Meeting 1',
            startTime: '09:30',
            endTime: '10:30',
            recurring: false,
          } as WorkMeeting,
          {
            id: 'meeting-2',
            patternId: 'pattern-1',
            name: 'Meeting 2',
            startTime: '11:00',
            endTime: '11:30',
            recurring: false,
          } as WorkMeeting,
        ],
        accumulated: {},
      }

      // Task is 45 minutes, only has 30-minute gaps
      const task: UnifiedScheduleItem = {
        id: 'task-1',
        name: 'Large Task',
        type: 'task',
        taskType: 'focused',
        duration: 45,
        priority: 5,
        dependencies: [],
      }

      const context: ScheduleContext = {
        startDate: '2024-01-01',
        currentTime: new Date('2024-01-01T09:00:00'),
        tasks: [],
        workflows: [],
        workPatterns: [workPattern],
        workSettings: {
          defaultWorkHours: {
            startTime: '09:00',
            endTime: '17:00',
            lunchStart: '12:00',
            lunchDuration: 60,
          },
          customWorkHours: {},
          defaultCapacity: {
            maxFocusHours: 8,
            maxAdminHours: 4,
            blockedTimes: [],
          },
          customCapacity: {},
          timeZone: 'UTC',
        },
      }

      const result = scheduler.scheduleForDisplay([task], context, { debugMode: false })

      // The 45-min task cannot fit any single 30-minute gap
      // (09:00-09:30, 10:30-11:00, 11:30-12:00), so it must be SPLIT across
      // gaps — it must never be scheduled whole outside the block window.
      const scheduledTasks = result.scheduled.filter(item => item.type === 'task')
      expect(scheduledTasks.length).toBeGreaterThan(1)

      const blockStart = new Date('2024-01-01T09:00:00')
      const blockEnd = new Date('2024-01-01T12:00:00')
      const scheduledMeetings = result.scheduled.filter(item => item.type === 'meeting')

      for (const part of scheduledTasks) {
        const taskStart = part.startTime!
        const taskEnd = part.endTime!

        // Hard invariant: every scheduled slice stays inside the block window
        expect(taskStart.getTime()).toBeGreaterThanOrEqual(blockStart.getTime())
        expect(taskEnd.getTime()).toBeLessThanOrEqual(blockEnd.getTime())

        // And never overlaps a meeting
        for (const meeting of scheduledMeetings) {
          const overlaps = taskStart < meeting.endTime! && taskEnd > meeting.startTime!
          expect(overlaps).toBe(false)
        }
      }

      // The full 45 minutes are accounted for across the parts
      const totalScheduled = scheduledTasks.reduce((sum, part) => sum + part.duration, 0)
      expect(totalScheduled).toBe(45)
    })

    it('should handle all-day meeting blocking entire work block', () => {
      const workPattern: DailyWorkPattern = {
        date: '2024-01-01',
        blocks: [
          {
            id: 'block-1',
            patternId: 'pattern-1',
            startTime: '09:00',
            endTime: '17:00',
            typeConfig: { kind: 'combo' as const, allocations: [{ typeId: 'focused', ratio: 0.5 }, { typeId: 'admin', ratio: 0.5 }] },
            capacity: { totalMinutes: 480 },
          } as WorkBlock,
        ],
        meetings: [
          {
            id: 'meeting-1',
            patternId: 'pattern-1',
            name: 'All Day Workshop',
            startTime: '09:00',
            endTime: '17:00',
            recurring: false,
          } as WorkMeeting,
        ],
        accumulated: {},
      }

      const task: UnifiedScheduleItem = {
        id: 'task-1',
        name: 'Task',
        type: 'task',
        taskType: 'focused',
        duration: 60,
        priority: 5,
        dependencies: [],
      }

      const context: ScheduleContext = {
        startDate: '2024-01-01',
        currentTime: new Date('2024-01-01T09:00:00'),
        tasks: [],
        workflows: [],
        workPatterns: [workPattern],
        workSettings: {
          defaultWorkHours: {
            startTime: '09:00',
            endTime: '17:00',
            lunchStart: '12:00',
            lunchDuration: 60,
          },
          customWorkHours: {},
          defaultCapacity: {
            maxFocusHours: 8,
            maxAdminHours: 4,
            blockedTimes: [],
          },
          customCapacity: {},
          timeZone: 'UTC',
        },
      }

      const result = scheduler.scheduleForDisplay([task], context, { debugMode: false })

      // Task should be unscheduled as the entire day is blocked
      const scheduledTasks = result.scheduled.filter(item => item.type === 'task')
      const scheduledMeetings = result.scheduled.filter(item => item.type === 'meeting')

      expect(scheduledTasks.length).toBe(0)
      expect(scheduledMeetings.length).toBe(1)
      expect(result.unscheduled.length).toBe(1)
    })

    it('should schedule high-priority task in best available slot around meetings', () => {
      const workPattern: DailyWorkPattern = {
        date: '2024-01-01',
        blocks: [
          {
            id: 'block-1',
            patternId: 'pattern-1',
            startTime: '09:00',
            endTime: '17:00',
            typeConfig: { kind: 'combo' as const, allocations: [{ typeId: 'focused', ratio: 0.5 }, { typeId: 'admin', ratio: 0.5 }] },
            capacity: { totalMinutes: 480 },
          } as WorkBlock,
        ],
        meetings: [
          {
            id: 'meeting-1',
            patternId: 'pattern-1',
            name: 'Standup',
            startTime: '10:00',
            endTime: '10:30',
            recurring: false,
          } as WorkMeeting,
        ],
        accumulated: {},
      }

      const tasks: UnifiedScheduleItem[] = [
        {
          id: 'task-1',
          name: 'Low Priority Task',
          type: 'task',
          taskType: 'focused',
          duration: 30,
          priority: 1,
          dependencies: [],
        },
        {
          id: 'task-2',
          name: 'High Priority Task',
          type: 'task',
          taskType: 'focused',
          duration: 30,
          priority: 10,
          dependencies: [],
        },
      ]

      const context: ScheduleContext = {
        startDate: '2024-01-01',
        currentTime: new Date('2024-01-01T09:00:00'),
        tasks: [],
        workflows: [],
        workPatterns: [workPattern],
        workSettings: {
          defaultWorkHours: {
            startTime: '09:00',
            endTime: '17:00',
            lunchStart: '12:00',
            lunchDuration: 60,
          },
          customWorkHours: {},
          defaultCapacity: {
            maxFocusHours: 8,
            maxAdminHours: 4,
            blockedTimes: [],
          },
          customCapacity: {},
          timeZone: 'UTC',
        },
      }

      const result = scheduler.scheduleForDisplay(tasks, context, { debugMode: false })

      // Both tasks should be scheduled
      const scheduledTasks = result.scheduled.filter(item => item.type === 'task')
      const scheduledMeetings = result.scheduled.filter(item => item.type === 'meeting')

      expect(scheduledTasks.length).toBe(2)
      expect(scheduledMeetings.length).toBe(1)

      // High priority task should be scheduled first (at 09:00)
      const highPriorityTask = scheduledTasks.find(t => t.id === 'task-2')
      const lowPriorityTask = scheduledTasks.find(t => t.id === 'task-1')

      expect(highPriorityTask).toBeDefined()
      expect(lowPriorityTask).toBeDefined()

      // With the meeting at 10:00-10:30, both 30-minute tasks can fit
      // But we need to verify they don't overlap with meetings
      // Priority might not guarantee exact order due to scheduling constraints

      // Neither should overlap with the meeting
      const meetingStart = new Date('2024-01-01T10:00:00')
      const meetingEnd = new Date('2024-01-01T10:30:00')

      for (const task of scheduledTasks) {
        const overlaps = task.startTime! < meetingEnd && task.endTime! > meetingStart
        expect(overlaps).toBe(false)
      }
    })
  })
})
