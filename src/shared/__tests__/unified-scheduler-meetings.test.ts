import { describe, it, expect, beforeEach } from 'vitest'
import { UnifiedScheduler } from '../unified-scheduler'
import { ScheduleContext, UnifiedScheduleItem } from '../unified-scheduler'
import { DailyWorkPattern, WorkBlock, WorkMeeting } from '../work-blocks-types'
import { TaskType } from '../enums'

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
            type: 'flexible',
            capacity: {
              focusMinutes: 480,
              adminMinutes: 480,
            },
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
        accumulated: { focusMinutes: 0, adminMinutes: 0 },
      }

      const task: UnifiedScheduleItem = {
        id: 'task-1',
        name: 'Review code',
        type: 'task',
        taskType: TaskType.Focused,
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
            type: 'flexible',
            capacity: {
              focusMinutes: 480,
              adminMinutes: 480,
            },
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
        accumulated: { focusMinutes: 0, adminMinutes: 0 },
      }

      // Create three 30-minute tasks
      const tasks: UnifiedScheduleItem[] = [
        {
          id: 'task-1',
          name: 'Task 1',
          type: 'task',
          taskType: TaskType.Focused,
          duration: 30,
          priority: 5,
          dependencies: [],
        },
        {
          id: 'task-2',
          name: 'Task 2',
          type: 'task',
          taskType: TaskType.Focused,
          duration: 30,
          priority: 5,
          dependencies: [],
        },
        {
          id: 'task-3',
          name: 'Task 3',
          type: 'task',
          taskType: TaskType.Focused,
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

    it('should handle task that cannot fit between meetings', () => {
      const workPattern: DailyWorkPattern = {
        date: '2024-01-01',
        blocks: [
          {
            id: 'block-1',
            patternId: 'pattern-1',
            startTime: '09:00',
            endTime: '12:00',
            type: 'flexible',
            capacity: {
              focusMinutes: 180,
              adminMinutes: 180,
            },
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
        accumulated: { focusMinutes: 0, adminMinutes: 0 },
      }

      // Task is 45 minutes, only has 30-minute gaps
      const task: UnifiedScheduleItem = {
        id: 'task-1',
        name: 'Large Task',
        type: 'task',
        taskType: TaskType.Focused,
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

      // Task should either be unscheduled or scheduled in a different time
      // It cannot fit in the 30-minute gaps
      const scheduledTasks = result.scheduled.filter(item => item.type === 'task')

      if (scheduledTasks.length > 0) {
        const scheduledTask = scheduledTasks[0]
        const taskStart = scheduledTask.startTime!
        const taskEnd = scheduledTask.endTime!

        // Should not overlap with meetings
        const meeting1Start = new Date('2024-01-01T09:30:00')
        const meeting1End = new Date('2024-01-01T10:30:00')
        const meeting2Start = new Date('2024-01-01T11:00:00')
        const meeting2End = new Date('2024-01-01T11:30:00')

        const overlapsWithMeeting1 = taskStart < meeting1End && taskEnd > meeting1Start
        const overlapsWithMeeting2 = taskStart < meeting2End && taskEnd > meeting2Start

        expect(overlapsWithMeeting1).toBe(false)
        expect(overlapsWithMeeting2).toBe(false)
      }
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
            type: 'flexible',
            capacity: {
              focusMinutes: 480,
              adminMinutes: 480,
            },
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
        accumulated: { focusMinutes: 0, adminMinutes: 0 },
      }

      const task: UnifiedScheduleItem = {
        id: 'task-1',
        name: 'Task',
        type: 'task',
        taskType: TaskType.Focused,
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
            type: 'flexible',
            capacity: {
              focusMinutes: 480,
              adminMinutes: 480,
            },
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
        accumulated: { focusMinutes: 0, adminMinutes: 0 },
      }

      const tasks: UnifiedScheduleItem[] = [
        {
          id: 'task-1',
          name: 'Low Priority Task',
          type: 'task',
          taskType: TaskType.Focused,
          duration: 30,
          priority: 1,
          dependencies: [],
        },
        {
          id: 'task-2',
          name: 'High Priority Task',
          type: 'task',
          taskType: TaskType.Focused,
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

      // High priority should start before low priority
      expect(highPriorityTask!.startTime!.getTime()).toBeLessThan(
        lowPriorityTask!.startTime!.getTime()
      )

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