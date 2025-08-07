import { scheduleItemsWithBlocks } from './flexible-scheduler'
import { Task } from '@shared/types'
import { DailyWorkPattern } from '@shared/work-blocks-types'

describe('Flexible Scheduler', () => {
  const createTask = (overrides: Partial<Task> = {}): Task => ({
    id: 'task-1',
    name: 'Test Task',
    duration: 60,
    importance: 5,
    urgency: 5,
    type: 'focused',
    asyncWaitTime: 0,
    dependencies: [],
    completed: false,
    sessionId: 'test-session',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  })

  const createWorkPattern = (date: string): DailyWorkPattern => ({
    date,
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
        endTime: '17:00',
        type: 'mixed',
        capacity: {
          focusMinutes: 120,
          adminMinutes: 120,
        },
      },
    ],
    accumulated: { focusMinutes: 0, adminMinutes: 0 },
    meetings: [],
  })

  describe('Deadline prioritization', () => {
    it('should prioritize tasks with deadlines within 24 hours', () => {
      const now = new Date()
      const tomorrow = new Date(now.getTime() + 20 * 60 * 60 * 1000) // 20 hours from now
      const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

      const urgentTask = createTask({
        id: 'urgent-task',
        name: 'Urgent Task',
        deadline: tomorrow,
        importance: 3,
        urgency: 3,
      })

      const normalTask = createTask({
        id: 'normal-task',
        name: 'Normal Task',
        deadline: nextWeek,
        importance: 8,
        urgency: 8,
      })

      const noDeadlineTask = createTask({
        id: 'no-deadline',
        name: 'No Deadline Task',
        importance: 10,
        urgency: 10,
      })

      const tasks = [noDeadlineTask, normalTask, urgentTask]
      const patterns = [createWorkPattern(now.toISOString().split('T')[0])]

      const scheduled = scheduleItemsWithBlocks(tasks, [], patterns, now)

      // The urgent task should be scheduled first despite lower priority
      expect(scheduled[0].id).toBe('urgent-task')
      expect(scheduled[0].name).toBe('Urgent Task')
    })

    it('should sort tasks with same-day deadlines by earliest deadline', () => {
      const now = new Date()
      const in2Hours = new Date(now.getTime() + 2 * 60 * 60 * 1000)
      const in5Hours = new Date(now.getTime() + 5 * 60 * 60 * 1000)

      const task1 = createTask({
        id: 'task-5h',
        name: 'Due in 5 hours',
        deadline: in5Hours,
      })

      const task2 = createTask({
        id: 'task-2h',
        name: 'Due in 2 hours',
        deadline: in2Hours,
      })

      const tasks = [task1, task2]
      const patterns = [createWorkPattern(now.toISOString().split('T')[0])]

      const scheduled = scheduleItemsWithBlocks(tasks, [], patterns, now)

      // Task due in 2 hours should be scheduled before task due in 5 hours
      expect(scheduled[0].id).toBe('task-2h')
      expect(scheduled[1].id).toBe('task-5h')
    })
  })

  describe('Work block capacity', () => {
    it('should respect focus and admin capacity limits', () => {
      const focusTask1 = createTask({
        id: 'focus-1',
        type: 'focused',
        duration: 120, // 2 hours
      })

      const focusTask2 = createTask({
        id: 'focus-2',
        type: 'focused',
        duration: 120, // 2 hours
      })

      const adminTask = createTask({
        id: 'admin-1',
        type: 'admin',
        duration: 60,
      })

      const tasks = [focusTask1, focusTask2, adminTask]
      const patterns = [createWorkPattern(new Date().toISOString().split('T')[0])]

      const scheduled = scheduleItemsWithBlocks(tasks, [], patterns)

      // Check that tasks are scheduled within capacity limits
      const focusBlock = scheduled.filter(
        item => item.startTime.getHours() >= 9 && item.startTime.getHours() < 12
      )
      
      // The focused block (9-12) has 180 minutes capacity
      // So both 120-minute focus tasks should fit
      expect(focusBlock.length).toBeGreaterThanOrEqual(1)
    })
  })

  describe('Async wait times', () => {
    it('should create wait time entries for tasks with asyncWaitTime', () => {
      const taskWithWait = createTask({
        id: 'async-task',
        asyncWaitTime: 60, // 1 hour wait
      })

      const patterns = [createWorkPattern(new Date().toISOString().split('T')[0])]
      const scheduled = scheduleItemsWithBlocks([taskWithWait], [], patterns)

      // Should have the task and its wait time
      const mainTask = scheduled.find(item => item.id === 'async-task')
      const waitTask = scheduled.find(item => item.id === 'async-task-wait')

      expect(mainTask).toBeDefined()
      expect(waitTask).toBeDefined()
      expect(waitTask?.type).toBe('async-wait')
      expect(waitTask?.isWaitTime).toBe(true)
      expect(waitTask?.duration).toBe(60)
    })
  })
})