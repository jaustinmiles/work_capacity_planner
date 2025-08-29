import { describe, it, expect } from 'vitest'
import { generateOptimalSchedule, OptimalScheduleConfig } from '../optimal-scheduler'
import { Task } from '@shared/types'
import { TaskType } from '@shared/enums'

describe('Optimal Scheduler - Meeting Handling', () => {
  const createTask = (overrides: Partial<Task>): Task => ({
    id: `task-${Math.random()}`,
    name: 'Test Task',
    importance: 5,
    urgency: 5,
    type: TaskType.Focused,
    duration: 60,
    completed: false,
    priority: 50,
    cognitiveComplexity: 3,
    hasSteps: false,
    asyncWaitTime: 0,
    isAsyncTrigger: false,
    dependencies: [],
    sessionId: 'test-session',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  })

  describe('Meeting date format handling', () => {
    it('should handle meetings with date property and time strings', () => {
      const config: OptimalScheduleConfig = {
        sleepStart: '23:00',
        sleepEnd: '07:00',
        meetings: [
          {
            id: 'sleep-1',
            name: 'Sleep',
            type: 'blocked',
            startTime: '23:00',
            endTime: '07:00',
            date: '2025-08-30', // Date as separate property
          } as any,
        ],
        preferredBreakInterval: 90,
        preferredBreakDuration: 15,
        maxContinuousWork: 180,
      }

      const tasks = [createTask({ duration: 120 })]
      const startTime = new Date('2025-08-30T09:00:00')

      // Should not throw "Invalid time value" error
      expect(() => {
        generateOptimalSchedule(tasks, [], startTime, config)
      }).not.toThrow()
    })

    it('should handle meetings with only time strings', () => {
      const config: OptimalScheduleConfig = {
        sleepStart: '23:00',
        sleepEnd: '07:00',
        meetings: [
          {
            id: 'meeting-1',
            name: 'Team Meeting',
            type: 'meeting',
            startTime: '14:00',
            endTime: '15:00',
            // No date property - should use current date
          },
        ],
        preferredBreakInterval: 90,
        preferredBreakDuration: 15,
        maxContinuousWork: 180,
      }

      const tasks = [createTask({ duration: 60 })]
      const startTime = new Date('2025-08-30T09:00:00')

      const result = generateOptimalSchedule(tasks, [], startTime, config)

      // Should successfully generate schedule
      expect(result.schedule).toBeDefined()
      expect(result.schedule.length).toBeGreaterThan(0)

      // Task should be scheduled around the meeting
      const taskSchedule = result.schedule[0]
      const meetingStart = new Date('2025-08-30T14:00:00')
      const meetingEnd = new Date('2025-08-30T15:00:00')

      // Task should not overlap with meeting
      const taskOverlaps = taskSchedule.startTime < meetingEnd && taskSchedule.endTime > meetingStart
      expect(taskOverlaps).toBe(false)
    })

    it('should handle meetings with full ISO date-time strings', () => {
      const config: OptimalScheduleConfig = {
        sleepStart: '23:00',
        sleepEnd: '07:00',
        meetings: [
          {
            id: 'meeting-2',
            name: 'Client Call',
            type: 'meeting',
            startTime: '2025-08-30T10:00:00',
            endTime: '2025-08-30T11:00:00',
          } as any,
        ],
        preferredBreakInterval: 90,
        preferredBreakDuration: 15,
        maxContinuousWork: 180,
      }

      const tasks = [createTask({ duration: 60 })]
      const startTime = new Date('2025-08-30T09:00:00')

      const result = generateOptimalSchedule(tasks, [], startTime, config)

      expect(result.schedule).toBeDefined()
      expect(result.schedule.length).toBeGreaterThan(0)
    })

    it('should skip invalid meetings gracefully', () => {
      const config: OptimalScheduleConfig = {
        sleepStart: '23:00',
        sleepEnd: '07:00',
        meetings: [
          {
            id: 'invalid-1',
            name: 'Invalid Meeting',
            type: 'meeting',
            startTime: 'invalid-time',
            endTime: 'also-invalid',
          } as any,
        ],
        preferredBreakInterval: 90,
        preferredBreakDuration: 15,
        maxContinuousWork: 180,
      }

      const tasks = [createTask({ duration: 60 })]
      const startTime = new Date('2025-08-30T09:00:00')

      // Should not throw error, just skip the invalid meeting
      expect(() => {
        generateOptimalSchedule(tasks, [], startTime, config)
      }).not.toThrow()

      const result = generateOptimalSchedule(tasks, [], startTime, config)
      expect(result.schedule).toBeDefined()
      expect(result.schedule.length).toBeGreaterThan(0)
    })

    it('should handle sleep blocks that cross midnight', () => {
      const config: OptimalScheduleConfig = {
        sleepStart: '23:00',
        sleepEnd: '07:00',
        meetings: [
          {
            id: 'sleep-night',
            name: 'Sleep',
            type: 'blocked',
            startTime: '23:00',
            endTime: '23:59',
            date: '2025-08-30',
          } as any,
          {
            id: 'sleep-morning',
            name: 'Sleep',
            type: 'blocked',
            startTime: '00:00',
            endTime: '07:00',
            date: '2025-08-31',
          } as any,
        ],
        preferredBreakInterval: 90,
        preferredBreakDuration: 15,
        maxContinuousWork: 180,
      }

      const tasks = [createTask({ duration: 120 })]
      const startTime = new Date('2025-08-30T21:00:00')

      const result = generateOptimalSchedule(tasks, [], startTime, config)

      // Should successfully generate a schedule without errors
      expect(result.schedule).toBeDefined()
      expect(result.warnings.length).toBe(0)

      // The main test is that it doesn't throw "Invalid time value" error
      // The exact scheduling depends on the algorithm's logic
    })
  })

  describe('Daily recurring meetings', () => {
    it('should handle daily recurring sleep blocks', () => {
      const meetings: any[] = []

      // Simulate daily recurring sleep blocks for next 7 days
      for (let i = 0; i < 7; i++) {
        const date = new Date('2025-08-30')
        date.setDate(date.getDate() + i)
        const dateStr = date.toISOString().split('T')[0]

        meetings.push({
          id: `sleep-${i}`,
          name: 'Sleep',
          type: 'blocked',
          startTime: '23:00',
          endTime: '07:00',
          date: dateStr,
          recurring: 'daily',
        })
      }

      const config: OptimalScheduleConfig = {
        sleepStart: '23:00',
        sleepEnd: '07:00',
        meetings,
        preferredBreakInterval: 90,
        preferredBreakDuration: 15,
        maxContinuousWork: 180,
      }

      const tasks = [
        createTask({ duration: 480 }), // 8 hours of work
      ]
      const startTime = new Date('2025-08-30T09:00:00')

      const result = generateOptimalSchedule(tasks, [], startTime, config)

      expect(result.schedule).toBeDefined()
      expect(result.warnings.length).toBe(0)

      // All scheduled items should avoid sleep times
      for (const item of result.schedule) {
        const hour = item.startTime.getHours()
        // Should not be scheduled during sleep (23:00 - 07:00)
        if (hour >= 23 || hour < 7) {
          expect(item.type).not.toBe('task')
        }
      }
    })
  })
})
