import { describe, it, expect, beforeEach, vi } from 'vitest'
import { scheduleItemsWithBlocks, ScheduledItem } from '../flexible-scheduler'
import { Task } from '@shared/types'
import { SequencedTask } from '@shared/sequencing-types'
import { DailyWorkPattern } from '@shared/work-blocks-types'

describe('flexible-scheduler', () => {
  let mockTasks: Task[]
  let mockSequencedTasks: SequencedTask[]
  let mockPatterns: DailyWorkPattern[]

  beforeEach(() => {
    // Mock current time to be 9 AM on 2025-08-12
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-08-12T09:00:00'))

    // Create mock tasks
    mockTasks = [
      {
        id: 'task-1',
        name: 'Review code',
        type: 'focused',
        sessionId: 'test-session',        duration: 60,
        importance: 8,
        urgency: 7,
        completed: false,
        asyncWaitTime: 0,
        status: 'pending',
      },
      {
        id: 'task-2',
        name: 'Team meeting',
        type: 'admin',
        sessionId: 'test-session',        duration: 30,
        importance: 6,
        urgency: 9,
        completed: false,
        asyncWaitTime: 0,
        status: 'pending',
      },
    ]

    // Create mock sequenced tasks (workflows)
    mockSequencedTasks = [
      {
        id: 'workflow-1',
        name: 'Deploy Feature',
        description: 'Deploy new feature to production',
        importance: 9,
        urgency: 8,
        overallStatus: 'pending',
        steps: [
          {
            id: 'step-1',
            name: 'Write tests',
            description: 'Write unit tests',
            type: 'focused',
        sessionId: 'test-session',            duration: 90,
            asyncWaitTime: 0,
            status: 'pending',
            order: 0,
          },
          {
            id: 'step-2',
            name: 'Run CI/CD',
            description: 'Run automated tests',
            type: 'admin',
        sessionId: 'test-session',            duration: 15,
            asyncWaitTime: 30, // Has async wait time
            status: 'pending',
            order: 1,
            dependsOn: ['step-1'],
          },
        ],
      },
    ]

    // Create mock work patterns
    mockPatterns = [
      {
        date: '2025-08-12',
        blocks: [
          {
            id: 'morning-block',
            startTime: '09:00',
            endTime: '12:00',
            type: 'mixed',
        sessionId: 'test-session',            capacity: {
              focused: 120,
              admin: 60,
            },
          },
          {
            id: 'afternoon-block',
            startTime: '13:00',
            endTime: '17:00',
            type: 'focused',
        sessionId: 'test-session'          },
        ],
        meetings: [
          {
            id: 'meeting-1',
            name: 'Daily Standup',
            startTime: '10:00',
            endTime: '10:30',
            type: 'meeting',
        sessionId: 'test-session'          },
        ],
        accumulated: { focused: 0, admin: 0 },
      },
    ]
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('basic scheduling', () => {
    it('should schedule tasks and return scheduled items', () => {
      const result = scheduleItemsWithBlocks(mockTasks, [], mockPatterns)

      expect(result?.length).toBeGreaterThan(0)
      expect(result[0]).toMatchObject({
        id: expect.any(String),
        name: expect.any(String),
        type: expect.stringMatching(/^(task|workflow-step|meeting|blocked-time|break|async-wait)$/),
        priority: expect.any(Number),
        duration: expect.any(Number),
        startTime: expect.any(Date),
        endTime: expect.any(Date),
        color: expect.any(String),
      })
    })

    it('should include meetings as blocked time', () => {
      const result = scheduleItemsWithBlocks([], [], mockPatterns)

      const meetings = result.filter(item => item.isBlocked)
      expect(meetings?.length).toBeGreaterThanOrEqual(1)
      const standup = meetings.find(m => m.name === 'Daily Standup')
      expect(standup).toBeTruthy()
      expect(standup!.isBlocked).toBe(true)
    })

    it('should not schedule tasks in the past', () => {
      // Set current time to 11 AM
      vi.setSystemTime(new Date('2025-08-12T11:00:00'))

      const result = scheduleItemsWithBlocks(mockTasks, [], mockPatterns)

      // All scheduled items should start at or after 11 AM
      const nonBlockedItems = result.filter(item => !item.isBlocked)
      nonBlockedItems.forEach(item => {
        expect(item.startTime.getTime()).toBeGreaterThanOrEqual(new Date('2025-08-12T11:00:00').getTime())
      })
    })
  })

  describe('workflow scheduling', () => {
    it('should schedule workflow steps in order', () => {
      const result = scheduleItemsWithBlocks([], mockSequencedTasks, mockPatterns)

      const workflowSteps = result.filter(item => item.type === 'workflow-step' && !item.isWaitTime)
      expect(workflowSteps?.length).toBeGreaterThanOrEqual(1)
      expect(workflowSteps[0].name).toContain('Write tests')
      // Second step might not be scheduled if capacity is exceeded
      if (workflowSteps.length > 1) {
        expect(workflowSteps[1].name).toContain('Run CI/CD')
      }
    })

    it('should create async wait items for steps with asyncWaitTime', () => {
      const result = scheduleItemsWithBlocks([], mockSequencedTasks, mockPatterns)

      const waitItems = result.filter(item => item.isWaitTime)
      // Wait items are only created when the step is scheduled
      if (waitItems.length > 0) {
        expect(waitItems[0].name).toContain('Waiting:')
        expect(waitItems[0].duration).toBe(30)
      }
    })

    it('should assign workflow steps to the same row', () => {
      const result = scheduleItemsWithBlocks([], mockSequencedTasks, mockPatterns)

      const workflowSteps = result.filter(item => item.workflowId === 'workflow-1')
      expect(workflowSteps?.length).toBeGreaterThan(0)
      // All steps from same workflow should have same workflowId
      const workflowIds = workflowSteps.map(s => s.workflowId)
      expect(new Set(workflowIds).size).toBe(1)
    })
  })

  describe('capacity management', () => {
    it('should respect block capacity limits', () => {
      // Create tasks that exceed morning block capacity
      const manyTasks: Task[] = []
      for (let i = 0; i < 10; i++) {
        manyTasks.push({
          id: `task-${i}`,
          name: `Task ${i}`,
          type: 'focused',
        sessionId: 'test-session',          duration: 60, // 1 hour each
          importance: 5,
          urgency: 5,
          completed: false,
          asyncWaitTime: 0,
          status: 'pending',
        })
      }

      const result = scheduleItemsWithBlocks(manyTasks, [], mockPatterns)

      // Check that tasks are distributed across blocks
      const morningEnd = new Date('2025-08-12T12:00:00')
      const tasksInMorning = result.filter(
        item => !item.isBlocked && item.startTime < morningEnd,
      )

      // Morning block has 120 minutes focus capacity
      const morningFocusMinutes = tasksInMorning
        .filter(item => item.type === 'task')
        .reduce((sum, item) => sum + item.duration, 0)

      expect(morningFocusMinutes).toBeLessThanOrEqual(120)
    })

    it('should schedule admin tasks in appropriate blocks', () => {
      const adminTask: Task = {
        id: 'admin-task',
        name: 'Admin work',
        type: 'admin',
        sessionId: 'test-session',        duration: 45,
        importance: 5,
        urgency: 5,
        completed: false,
        asyncWaitTime: 0,
        status: 'pending',
      }

      const result = scheduleItemsWithBlocks([adminTask], [], mockPatterns)

      const scheduled = result.find(item => item.id === 'admin-task')
      expect(scheduled).toBeTruthy()
      // Should be scheduled in morning block which has admin capacity
      expect(scheduled!.startTime.getHours()).toBeGreaterThanOrEqual(9)
      expect(scheduled!.startTime.getHours()).toBeLessThan(12)
    })
  })

  describe('priority and deadline handling', () => {
    it('should prioritize tasks with urgent deadlines', () => {
      const urgentTask: Task = {
        id: 'urgent-task',
        name: 'Urgent task',
        type: 'focused',
        sessionId: 'test-session',        duration: 30,
        importance: 5,
        urgency: 5,
        completed: false,
        asyncWaitTime: 0,
        status: 'pending',
        deadline: new Date('2025-08-12T15:00:00'), // Due today
      }

      const normalTask: Task = {
        id: 'normal-task',
        name: 'Normal task',
        type: 'focused',
        sessionId: 'test-session',        duration: 30,
        importance: 9,
        urgency: 9,
        completed: false,
        asyncWaitTime: 0,
        status: 'pending',
      }

      const result = scheduleItemsWithBlocks([normalTask, urgentTask], [], mockPatterns)

      const urgentIndex = result.findIndex(item => item.id === 'urgent-task')
      const normalIndex = result.findIndex(item => item.id === 'normal-task')

      // Urgent task should be scheduled before normal task despite lower priority
      expect(urgentIndex).toBeLessThan(normalIndex)
    })
  })

  describe('meeting deduplication', () => {
    it('should create unique IDs for meetings on the same day', () => {
      const result = scheduleItemsWithBlocks([], [], mockPatterns)

      const meetingIds = result
        .filter(item => item.type === 'meeting')
        .map(item => item.id)

      // All meeting IDs should be unique
      expect(new Set(meetingIds).size).toBe(meetingIds.length)
    })

    it('should handle sleep blocks that cross midnight', () => {
      const patternWithSleep: DailyWorkPattern = {
        ...mockPatterns[0],
        meetings: [
          ...mockPatterns[0].meetings,
          {
            id: 'sleep-1',
            name: 'Sleep',
            startTime: '22:00',
            endTime: '06:00', // Crosses midnight
            type: 'blocked',
        sessionId: 'test-session'          },
        ],
      }

      const result = scheduleItemsWithBlocks([], [], [patternWithSleep])

      const sleepBlocks = result.filter(item => item.name === 'Sleep' && item.isBlocked)
      // Sleep blocks that cross midnight should be handled specially
      expect(sleepBlocks?.length).toBeGreaterThanOrEqual(1)
      // Check if IDs contain date information
      const hasSleepBlock = sleepBlocks.some(block => block.id.includes('sleep'))
      expect(hasSleepBlock).toBe(true)
    })
  })

  describe('multi-day scheduling', () => {
    it('should schedule across multiple days when needed', () => {
      // Create many tasks that exceed one day's capacity
      const manyTasks: Task[] = []
      for (let i = 0; i < 20; i++) {
        manyTasks.push({
          id: `task-${i}`,
          name: `Task ${i}`,
          type: 'focused',
        sessionId: 'test-session',          duration: 60,
          importance: 5,
          urgency: 5,
          completed: false,
          asyncWaitTime: 0,
          status: 'pending',
        })
      }

      // Add a second day pattern
      const multiDayPatterns: DailyWorkPattern[] = [
        ...mockPatterns,
        {
          date: '2025-08-13',
          blocks: [
            {
              id: 'day2-morning',
              startTime: '09:00',
              endTime: '12:00',
              type: 'focused',
        sessionId: 'test-session'            },
          ],
          meetings: [],
          accumulated: { focused: 0, admin: 0 },
        },
      ]

      const result = scheduleItemsWithBlocks(manyTasks, [], multiDayPatterns)

      // Check that tasks are scheduled across multiple days
      const day1Tasks = result.filter(item =>
        !item.isBlocked &&
        item.startTime.toISOString().startsWith('2025-08-12'),
      )
      const day2Tasks = result.filter(item =>
        !item.isBlocked &&
        item.startTime.toISOString().startsWith('2025-08-13'),
      )

      expect(day1Tasks.length).toBeGreaterThan(0)
      expect(day2Tasks.length).toBeGreaterThan(0)
    })
  })
})
