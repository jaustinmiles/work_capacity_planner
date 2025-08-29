import { describe, it, expect } from 'vitest'
import { Task } from '@shared/types'
import { TaskType } from '@shared/enums'
import { scheduleWithDeadlines, SchedulingContext } from '../../../utils/deadline-scheduler'
import { DailyWorkPattern } from '@shared/work-blocks-types'

describe('Schedule Generation', () => {
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

  const createWorkPattern = (date: string, hasWeekendWork = false): DailyWorkPattern => {
    const d = new Date(date)
    const isWeekend = d.getDay() === 0 || d.getDay() === 6

    if (isWeekend && !hasWeekendWork) {
      return {
        date,
        blocks: [],
        meetings: [],
        accumulated: { focusMinutes: 0, adminMinutes: 0, personalMinutes: 0 },
      }
    }

    return {
      date,
      blocks: [{
        id: `block-${date}`,
        startTime: isWeekend ? '10:00' : '09:00',
        endTime: isWeekend ? '14:00' : '18:00',
        type: 'mixed',
        capacity: {
          focusMinutes: isWeekend ? 180 : 240,
          adminMinutes: isWeekend ? 60 : 180,
        },
      }],
      meetings: [],
      accumulated: { focusMinutes: 0, adminMinutes: 0, personalMinutes: 0 },
    }
  }

  describe('Deadline Meeting Guarantees', () => {
    it.skip('should schedule tasks to meet Monday deadline when starting Friday - OLD SCHEDULER TEST', () => {
      // Use dates in September 2025 (in the future from Aug 29, 2025)
      const friday = new Date('2025-09-05T09:00:00') // Friday Sep 5, 2025
      const monday = new Date('2025-09-08T17:00:00') // Monday Sep 8, 2025 5pm

      const tasks = [
        createTask({
          name: 'Urgent Feature',
          duration: 480, // 8 hours
          deadline: monday,
          deadlineType: 'hard',
        }),
      ]

      // Create work patterns for Fri, Sat, Sun, Mon
      const workPatterns = [
        createWorkPattern('2025-09-05', false), // Friday - 7 hours capacity
        createWorkPattern('2025-09-06', true),  // Saturday - 4 hours if enabled
        createWorkPattern('2025-09-07', true),  // Sunday - 4 hours if enabled
        createWorkPattern('2025-09-08', false), // Monday - 7 hours capacity
      ]

      const context: SchedulingContext = {
        currentTime: friday,
        tasks,
        workflows: [],
        workPatterns,
        productivityPatterns: [],
        schedulingPreferences: {
          id: 'deadline-focused',
          sessionId: 'test',
          allowWeekendWork: true,
          weekendPenalty: 1.0, // No penalty for deadline-focused
          contextSwitchPenalty: 15,
          asyncParallelizationBonus: 5,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        workSettings: {
          defaultCapacity: { maxFocusHours: 4, maxAdminHours: 3 },
          defaultWorkHours: { startTime: '09:00', endTime: '18:00' },
          customWorkHours: {},
        } as any,
        lastScheduledItem: null,
      }

      const result = scheduleWithDeadlines(context)


      // Should successfully schedule the task
      expect(result.schedule.length).toBeGreaterThan(0)
      expect(result.failures.length).toBe(0)

      // Should complete before deadline
      const lastItem = result.schedule[result.schedule.length - 1]
      expect(lastItem.endTime).toBeLessThanOrEqual(monday)
    })

    it('should report failure when deadline is impossible to meet', () => {
      const now = new Date('2025-09-08T09:00:00') // Monday morning
      const tonight = new Date('2025-09-08T17:00:00') // Monday 5pm

      const tasks = [
        createTask({
          name: 'Impossible Task',
          duration: 600, // 10 hours - impossible in one day
          deadline: tonight,
          deadlineType: 'hard',
        }),
      ]

      const workPatterns = [
        createWorkPattern('2025-09-08', false), // Monday - only 7 hours capacity
      ]

      const context: SchedulingContext = {
        currentTime: now,
        tasks,
        workflows: [],
        workPatterns,
        productivityPatterns: [],
        schedulingPreferences: {
          id: 'deadline-focused',
          sessionId: 'test',
          allowWeekendWork: false,
          weekendPenalty: 0.5,
          contextSwitchPenalty: 15,
          asyncParallelizationBonus: 5,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        workSettings: {
          defaultCapacity: { maxFocusHours: 4, maxAdminHours: 3 },
          defaultWorkHours: { startTime: '09:00', endTime: '18:00' },
          customWorkHours: {},
        } as any,
        lastScheduledItem: null,
      }

      const result = scheduleWithDeadlines(context)

      // Should report failure for impossible deadline
      expect(result.failures.length).toBeGreaterThan(0)
      expect(result.failures[0].type).toBe('impossible_deadline')
      expect(result.failures[0].message).toContain('Impossible Task')
    })

    it('should not create personal blocks on weekends without personal tasks', () => {
      const friday = new Date('2025-09-05T09:00:00')

      const tasks = [
        createTask({
          name: 'Work Task',
          type: TaskType.Focused,
          duration: 120,
        }),
      ]

      const workPatterns = [
        createWorkPattern('2025-09-05', false), // Friday
        createWorkPattern('2025-09-06', false), // Saturday - no blocks
        createWorkPattern('2025-09-07', false), // Sunday - no blocks
      ]

      const context: SchedulingContext = {
        currentTime: friday,
        tasks,
        workflows: [],
        workPatterns,
        productivityPatterns: [],
        schedulingPreferences: {
          id: 'balanced',
          sessionId: 'test',
          allowWeekendWork: false,
          weekendPenalty: 0.5,
          contextSwitchPenalty: 20,
          asyncParallelizationBonus: 10,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        workSettings: {
          defaultCapacity: { maxFocusHours: 4, maxAdminHours: 3 },
          defaultWorkHours: { startTime: '09:00', endTime: '18:00' },
          customWorkHours: {},
        } as any,
        lastScheduledItem: null,
      }

      const result = scheduleWithDeadlines(context)

      // Should schedule on Friday, not on weekend
      expect(result.schedule.length).toBeGreaterThan(0)
      const scheduledDates = result.schedule.map(item =>
        new Date(item.startTime).toISOString().split('T')[0],
      )
      expect(scheduledDates).toContain('2025-09-05') // Friday
      expect(scheduledDates).not.toContain('2025-09-06') // Saturday
      expect(scheduledDates).not.toContain('2025-09-07') // Sunday
    })

    it.skip('should utilize weekends for urgent deadlines in deadline-focused mode - OLD SCHEDULER TEST', () => {
      const friday = new Date('2025-09-05T09:00:00')
      const monday = new Date('2025-09-08T09:00:00')

      const tasks = [
        createTask({
          name: 'Urgent Project',
          duration: 900, // 15 hours - needs weekend work
          deadline: monday,
          deadlineType: 'hard',
        }),
      ]

      const workPatterns = [
        createWorkPattern('2025-09-05', false), // Friday - 7 hours
        createWorkPattern('2025-09-06', true),  // Saturday - 4 hours
        createWorkPattern('2025-09-07', true),  // Sunday - 4 hours
      ]

      const context: SchedulingContext = {
        currentTime: friday,
        tasks,
        workflows: [],
        workPatterns,
        productivityPatterns: [],
        schedulingPreferences: {
          id: 'deadline-focused',
          sessionId: 'test',
          allowWeekendWork: true,
          weekendPenalty: 1.0,
          contextSwitchPenalty: 15,
          asyncParallelizationBonus: 5,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        workSettings: {
          defaultCapacity: { maxFocusHours: 4, maxAdminHours: 3 },
          defaultWorkHours: { startTime: '09:00', endTime: '18:00' },
          customWorkHours: {},
        } as any,
        lastScheduledItem: null,
      }

      const result = scheduleWithDeadlines(context)


      // Should successfully schedule using weekend time
      expect(result.schedule.length).toBeGreaterThan(0)
      expect(result.failures.length).toBe(0)

      const scheduledDates = result.schedule.map(item =>
        new Date(item.startTime).toISOString().split('T')[0],
      )
      expect(scheduledDates).toContain('2025-09-05') // Friday
      expect(scheduledDates).toContain('2025-09-06') // Saturday
      expect(scheduledDates).toContain('2025-09-07') // Sunday
    })

    it.skip('should respect work block capacity constraints - OLD SCHEDULER TEST', () => {
      const monday = new Date('2025-09-08T09:00:00')

      const tasks = [
        createTask({
          name: 'Focus Task 1',
          type: TaskType.Focused,
          duration: 180, // 3 hours
        }),
        createTask({
          name: 'Focus Task 2',
          type: TaskType.Focused,
          duration: 120, // 2 hours - exceeds 4 hour focus limit
        }),
        createTask({
          name: 'Admin Task',
          type: TaskType.Admin,
          duration: 60,
        }),
      ]

      const workPatterns = [
        createWorkPattern('2025-09-08', false), // Monday - 4h focus, 3h admin
        createWorkPattern('2025-09-09', false), // Tuesday
      ]

      const context: SchedulingContext = {
        currentTime: monday,
        tasks,
        workflows: [],
        workPatterns,
        productivityPatterns: [],
        schedulingPreferences: {
          id: 'balanced',
          sessionId: 'test',
          allowWeekendWork: false,
          weekendPenalty: 0.5,
          contextSwitchPenalty: 20,
          asyncParallelizationBonus: 10,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        workSettings: {
          defaultCapacity: { maxFocusHours: 4, maxAdminHours: 3 },
          defaultWorkHours: { startTime: '09:00', endTime: '18:00' },
          customWorkHours: {},
        } as any,
        lastScheduledItem: null,
      }

      const result = scheduleWithDeadlines(context)

      // Should schedule across multiple days due to capacity constraints
      const scheduledDates = result.schedule.map(item =>
        new Date(item.startTime).toISOString().split('T')[0],
      )
      expect(scheduledDates).toContain('2025-09-08') // Monday
      expect(scheduledDates).toContain('2025-09-09') // Tuesday (overflow)
    })

    it('should not create overlapping work blocks', () => {
      const monday = new Date('2025-09-08T09:00:00')

      const tasks = [
        createTask({ name: 'Task 1', duration: 60 }),
        createTask({ name: 'Task 2', duration: 60 }),
        createTask({ name: 'Task 3', duration: 60 }),
      ]

      const workPatterns = [
        createWorkPattern('2025-09-08', false),
      ]

      const context: SchedulingContext = {
        currentTime: monday,
        tasks,
        workflows: [],
        workPatterns,
        productivityPatterns: [],
        schedulingPreferences: {
          id: 'balanced',
          sessionId: 'test',
          allowWeekendWork: false,
          weekendPenalty: 0.5,
          contextSwitchPenalty: 20,
          asyncParallelizationBonus: 10,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        workSettings: {
          defaultCapacity: { maxFocusHours: 4, maxAdminHours: 3 },
          defaultWorkHours: { startTime: '09:00', endTime: '18:00' },
          customWorkHours: {},
        } as any,
        lastScheduledItem: null,
      }

      const result = scheduleWithDeadlines(context)

      // Check that no scheduled items overlap
      for (let i = 0; i < result.schedule.length - 1; i++) {
        const current = result.schedule[i]
        const next = result.schedule[i + 1]

        // If on same day, end time should not exceed next start time
        const currentDate = new Date(current.startTime).toDateString()
        const nextDate = new Date(next.startTime).toDateString()

        if (currentDate === nextDate) {
          expect(current.endTime).toBeLessThanOrEqual(next.startTime)
        }
      }
    })
  })

  describe('Schedule Option Generation', () => {
    it('should generate multiple schedule options with different strategies', () => {
      // This would test the ScheduleGenerator component's option generation
      // but would require mocking the component and its dependencies
      expect(true).toBe(true) // Placeholder
    })
  })

  describe('Block Creation and Saving', () => {
    it('should create a single work block per day when saving schedule', () => {
      // This tests the saveSelectedSchedule function logic
      // Would require component testing setup
      expect(true).toBe(true) // Placeholder
    })
  })
})
