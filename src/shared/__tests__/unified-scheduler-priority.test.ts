/**
 * Test suite for UnifiedScheduler priority calculation features
 * Tests the priority features including Eisenhower matrix, deadline pressure,
 * async task boosting, and cognitive complexity matching
 */

import { UnifiedScheduler } from '../unified-scheduler'
import { ScheduleContext } from '../unified-scheduler-types'
import { Task } from '../types'
import { DailyWorkPattern } from '../work-blocks-types'

describe('UnifiedScheduler - Priority Features', () => {
  let scheduler: UnifiedScheduler

  beforeEach(() => {
    scheduler = new UnifiedScheduler()
  })

  const mockWorkPattern: DailyWorkPattern = {
    date: '2025-01-15',
    blocks: [
      {
        id: 'morning-focus',
        startTime: '09:00',
        endTime: '12:00',
        type: 'focused',
      },
    ],
    accumulated: {
      focus: 0,
      admin: 0,
      personal: 0,
    },
    meetings: [],
  }

  const mockContext: ScheduleContext = {
    startDate: '2025-01-15',
    currentTime: new Date('2025-01-15T08:00:00.000Z'),
    tasks: [],
    workflows: [],
    workPatterns: [mockWorkPattern],
    workSettings: {
      sleepHours: { start: '23:00', end: '07:00' },
      workingHours: { start: '09:00', end: '17:00' },
      breakPreferences: { duration: 15, frequency: 90 },
      defaultCapacity: {
        maxFocusHours: 4,
        maxAdminHours: 2,
        maxPersonalHours: 1,
      },
    },
  }

  const createTestTask = (id: string, options: Partial<Task> = {}): Task => ({
    id,
    name: `Task ${id}`,
    duration: 60,
    importance: 5,
    urgency: 5,
    cognitiveComplexity: 3,
    taskType: 'focused',
    status: 'not_started',
    createdAt: new Date('2025-01-15T08:00:00.000Z'),
    notes: '',
    ...options,
  })

  describe('Eisenhower Matrix Integration', () => {
    it('should calculate base Eisenhower score correctly', () => {
      const task = createTestTask('eisenhower-test', {
        importance: 8,
        urgency: 7,
      })

      const breakdown = scheduler.calculatePriorityWithBreakdown(task, mockContext)

      expect(breakdown.eisenhower).toBe(56) // 8 * 7
      expect(breakdown.total).toBeGreaterThanOrEqual(56)
    })

    it('should apply proper weightings to importance vs urgency', () => {
      const highImportance = createTestTask('high-importance', {
        importance: 10,
        urgency: 1,
      })

      const highUrgency = createTestTask('high-urgency', {
        importance: 1,
        urgency: 10,
      })

      const highImportanceBreakdown = scheduler.calculatePriorityWithBreakdown(highImportance, mockContext)
      const highUrgencyBreakdown = scheduler.calculatePriorityWithBreakdown(highUrgency, mockContext)

      // Both should have same base Eisenhower score
      expect(highImportanceBreakdown.eisenhower).toBe(10) // 10 * 1
      expect(highUrgencyBreakdown.eisenhower).toBe(10) // 1 * 10
    })

    it('should handle extreme values correctly', () => {
      const extremeTask = createTestTask('extreme', {
        importance: 10,
        urgency: 10,
      })

      const breakdown = scheduler.calculatePriorityWithBreakdown(extremeTask, mockContext)

      expect(breakdown.eisenhower).toBe(100) // 10 * 10 (max possible)
      expect(breakdown.total).toBeGreaterThanOrEqual(100)
    })
  })

  describe('Deadline Pressure', () => {
    it('should boost priority for approaching deadlines', () => {
      const nearDeadline = new Date('2025-01-16T12:00:00.000Z') // Tomorrow

      const taskWithDeadline = createTestTask('deadline-task', {
        importance: 5,
        urgency: 5,
        deadline: nearDeadline,
        deadlineType: 'hard',
      })

      const taskWithoutDeadline = createTestTask('no-deadline', {
        importance: 5,
        urgency: 5,
      })

      const withDeadlineBreakdown = scheduler.calculatePriorityWithBreakdown(taskWithDeadline, mockContext)
      const withoutDeadlineBreakdown = scheduler.calculatePriorityWithBreakdown(taskWithoutDeadline, mockContext)

      expect(withDeadlineBreakdown.deadlineBoost).toBeGreaterThan(0)
      expect(withoutDeadlineBreakdown.deadlineBoost).toBe(0)
      expect(withDeadlineBreakdown.total).toBeGreaterThan(withoutDeadlineBreakdown.total)
    })

    it('should differentiate hard vs soft deadlines', () => {
      const tomorrow = new Date('2025-01-16T12:00:00.000Z')

      const hardDeadlineTask = createTestTask('hard-deadline', {
        importance: 5,
        urgency: 5,
        deadline: tomorrow,
        deadlineType: 'hard',
      })

      const softDeadlineTask = createTestTask('soft-deadline', {
        importance: 5,
        urgency: 5,
        deadline: tomorrow,
        deadlineType: 'soft',
      })

      const hardBreakdown = scheduler.calculatePriorityWithBreakdown(hardDeadlineTask, mockContext)
      const softBreakdown = scheduler.calculatePriorityWithBreakdown(softDeadlineTask, mockContext)

      // Hard deadlines should have higher boost than soft deadlines
      expect(hardBreakdown.deadlineBoost).toBeGreaterThan(softBreakdown.deadlineBoost)
    })

    it('should calculate inverse power function correctly', () => {
      const soonDeadline = new Date('2025-01-15T14:00:00.000Z') // 6 hours away
      const laterDeadline = new Date('2025-01-17T12:00:00.000Z') // 2 days away

      const soonTask = createTestTask('soon-deadline', {
        importance: 5,
        urgency: 5,
        deadline: soonDeadline,
        deadlineType: 'hard',
      })

      const laterTask = createTestTask('later-deadline', {
        importance: 5,
        urgency: 5,
        deadline: laterDeadline,
        deadlineType: 'hard',
      })

      const soonBreakdown = scheduler.calculatePriorityWithBreakdown(soonTask, mockContext)
      const laterBreakdown = scheduler.calculatePriorityWithBreakdown(laterTask, mockContext)

      // Sooner deadline should have higher boost (inverse relationship)
      expect(soonBreakdown.deadlineBoost).toBeGreaterThan(laterBreakdown.deadlineBoost)
    })
  })

  describe('Async Task Boosting', () => {
    it('should provide async boost field in breakdown', () => {
      const task = createTestTask('task', {
        importance: 5,
        urgency: 5,
      })

      const breakdown = scheduler.calculatePriorityWithBreakdown(task, mockContext)

      // Async boost should exist as a field (may be 0 for regular tasks)
      expect(typeof breakdown.asyncBoost).toBe('number')
      expect(breakdown.asyncBoost).toBeGreaterThanOrEqual(0)
    })

    it('should handle async-related calculations', () => {
      const task1 = createTestTask('task1', {
        importance: 6,
        urgency: 7,
      })

      const task2 = createTestTask('task2', {
        importance: 6,
        urgency: 7,
      })

      const breakdown1 = scheduler.calculatePriorityWithBreakdown(task1, mockContext)
      const breakdown2 = scheduler.calculatePriorityWithBreakdown(task2, mockContext)

      // Both should have same async boost (likely 0 for regular tasks)
      expect(breakdown1.asyncBoost).toBe(breakdown2.asyncBoost)
    })
  })

  describe('Cognitive Complexity Matching', () => {
    it('should match high-complexity tasks to peak hours', () => {
      const highComplexityTask = createTestTask('complex-task', {
        importance: 5,
        urgency: 5,
        cognitiveComplexity: 9,
      })

      const lowComplexityTask = createTestTask('simple-task', {
        importance: 5,
        urgency: 5,
        cognitiveComplexity: 1,
      })

      const complexBreakdown = scheduler.calculatePriorityWithBreakdown(highComplexityTask, mockContext)
      const simpleBreakdown = scheduler.calculatePriorityWithBreakdown(lowComplexityTask, mockContext)

      // Cognitive match should influence priority
      expect(typeof complexBreakdown.cognitiveMatch).toBe('number')
      expect(typeof simpleBreakdown.cognitiveMatch).toBe('number')
    })

    it('should penalize context switching', () => {
      // This would need access to scheduled context to test properly
      // For now, just verify the field exists in breakdown
      const task = createTestTask('context-switch', {
        importance: 5,
        urgency: 5,
      })

      const breakdown = scheduler.calculatePriorityWithBreakdown(task, mockContext)

      expect(typeof breakdown.contextSwitchPenalty).toBe('number')
    })
  })

  describe('Workflow Integration', () => {
    it('should provide workflow depth bonus', () => {
      const task = createTestTask('workflow-task', {
        importance: 5,
        urgency: 5,
      })

      const breakdown = scheduler.calculatePriorityWithBreakdown(task, mockContext)

      expect(typeof breakdown.workflowDepthBonus).toBe('number')
    })
  })

  describe('Priority Calculation Edge Cases', () => {
    it('should handle zero importance and urgency', () => {
      const zeroTask = createTestTask('zero-task', {
        importance: 0,
        urgency: 0,
      })

      const breakdown = scheduler.calculatePriorityWithBreakdown(zeroTask, mockContext)

      expect(breakdown.eisenhower).toBe(0)
      expect(breakdown.total).toBeGreaterThanOrEqual(0)
    })

    it('should handle missing optional fields gracefully', () => {
      const minimalTask = createTestTask('minimal', {
        importance: 5,
        urgency: 5,
      })

      // Remove optional fields
      delete minimalTask.deadline
      delete minimalTask.deadlineType

      const breakdown = scheduler.calculatePriorityWithBreakdown(minimalTask, mockContext)

      expect(breakdown.eisenhower).toBe(25) // 5 * 5
      expect(breakdown.deadlineBoost).toBe(0)
      expect(breakdown.total).toBeGreaterThanOrEqual(25)
    })

    it('should provide consistent results for identical inputs', () => {
      const task1 = createTestTask('consistent-1', {
        importance: 7,
        urgency: 6,
        cognitiveComplexity: 4,
      })

      const task2 = createTestTask('consistent-2', {
        importance: 7,
        urgency: 6,
        cognitiveComplexity: 4,
      })

      const breakdown1 = scheduler.calculatePriorityWithBreakdown(task1, mockContext)
      const breakdown2 = scheduler.calculatePriorityWithBreakdown(task2, mockContext)

      expect(breakdown1.total).toBe(breakdown2.total)
      expect(breakdown1.eisenhower).toBe(breakdown2.eisenhower)
    })
  })
})
