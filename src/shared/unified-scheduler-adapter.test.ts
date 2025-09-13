import { describe, it, expect, vi, beforeEach } from 'vitest'
import { UnifiedSchedulerAdapter } from './unified-scheduler-adapter'
import { Task } from './types'
import { SequencedTask } from './sequencing-types'
import { DailyWorkPattern } from './work-blocks-types'
import { TaskType } from './enums'
import * as UnifiedSchedulerModule from './unified-scheduler'

// Mock the UnifiedScheduler
vi.mock('./unified-scheduler', () => ({
  UnifiedScheduler: vi.fn().mockImplementation(() => ({
    scheduleForDisplay: vi.fn().mockReturnValue({
      scheduled: [],
      unscheduled: [],
      debugInfo: {
        totalScheduled: 0,
        totalUnscheduled: 0,
        totalDuration: 0,
        scheduleEfficiency: 0,
        warnings: [],
        unscheduled: [],
        blockUtilization: [],
      },
    }),
    calculatePriority: vi.fn().mockImplementation((task) => {
      // Simple priority calculation based on importance and urgency
      const importance = task.importance || 3
      const urgency = task.urgency || 3
      return importance * urgency
    }),
    validateDependencies: vi.fn().mockReturnValue({
      isValid: true,
      errors: [],
    }),
  })),
}))

describe('UnifiedSchedulerAdapter', () => {
  let adapter: UnifiedSchedulerAdapter
  let mockScheduler: any

  beforeEach(() => {
    vi.clearAllMocks()
    adapter = new UnifiedSchedulerAdapter()
    // Get the mock instance
    mockScheduler = (UnifiedSchedulerModule.UnifiedScheduler as any).mock.results[0].value
  })

  const createMockTask = (overrides: Partial<Task> = {}): Task => ({
    id: 'task-1',
    name: 'Test Task',
    type: TaskType.Focused,
    duration: 60,
    completed: false,
    priority: 1,
    importance: 5,
    urgency: 5,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  })

  const createMockSequencedTask = (overrides: Partial<SequencedTask> = {}): SequencedTask => ({
    id: 'seq-1',
    name: 'Sequenced Task',
    type: TaskType.Focused,
    duration: 90,
    priority: 2,
    importance: 6,
    urgency: 6,
    completed: false,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    steps: [
      {
        id: 'step-1',
        name: 'Step 1',
        duration: 45,
        taskType: TaskType.Focused,
        completed: false,
      },
      {
        id: 'step-2',
        name: 'Step 2',
        duration: 45,
        taskType: TaskType.Admin,
        completed: false,
      },
    ],
    ...overrides,
  })

  const createMockWorkPattern = (date: string): DailyWorkPattern => ({
    date,
    blocks: [
      {
        id: `block-${date}-1`,
        type: TaskType.Focused,
        startTime: '09:00',
        endTime: '12:00',
        capacity: {
          focusMinutes: 180,
          adminMinutes: 0,
        },
      },
      {
        id: `block-${date}-2`,
        type: TaskType.Admin,
        startTime: '13:00',
        endTime: '17:00',
        capacity: {
          focusMinutes: 0,
          adminMinutes: 240,
        },
      },
    ],
    accumulated: {
      focusMinutes: 0,
      adminMinutes: 0,
    },
    meetings: [],
  })

  describe('scheduleTasks', () => {
    it('schedules tasks and returns adapted result', () => {
      const tasks = [createMockTask()]
      const workPatterns = [createMockWorkPattern('2024-01-01')]

      // Set up mock return value
      mockScheduler.scheduleForDisplay.mockReturnValue({
        scheduled: [
          {
            id: 'task-1',
            name: 'Test Task',
            type: 'task',
            duration: 60,
            startTime: new Date('2024-01-01T09:00:00'),
            endTime: new Date('2024-01-01T10:00:00'),
            priority: 25,
            dependencies: [],
            originalItem: tasks[0],
          },
        ],
        unscheduled: [],
        debugInfo: {
          totalScheduled: 1,
          totalUnscheduled: 0,
          totalDuration: 60,
          scheduleEfficiency: 100,
          warnings: [],
          unscheduled: [],
          blockUtilization: [],
        },
      })

      const result = adapter.scheduleTasks(tasks, workPatterns, { startDate: '2024-01-01' })

      expect(result.scheduledTasks).toHaveLength(1)
      expect(result.scheduledTasks[0].task.id).toBe('task-1')
      expect(result.unscheduledTasks).toHaveLength(0)
      expect(result.totalDuration).toBe(60)
    })

    it('handles sequenced tasks', () => {
      const tasks = [createMockTask()]
      const sequencedTasks = [createMockSequencedTask()]
      const workPatterns = [createMockWorkPattern('2024-01-01')]

      mockScheduler.scheduleForDisplay.mockReturnValue({
        scheduled: [
          {
            id: 'step-1',
            name: 'Step 1',
            type: TaskType.Focused,
            duration: 45,
            startTime: new Date('2024-01-01T09:00:00'),
            endTime: new Date('2024-01-01T09:45:00'),
            priority: 30,
            dependencies: [],
            workflowId: 'seq-1',
            workflowName: 'Sequenced Task',
            originalItem: {
              id: 'step-1',
              name: 'Step 1',
              taskId: 'seq-1',
              duration: 45,
              status: 'not_started',
            },
          },
        ],
        unscheduled: [],
        debugInfo: {
          totalScheduled: 1,
          totalUnscheduled: 0,
          totalDuration: 45,
          scheduleEfficiency: 100,
          warnings: [],
          unscheduled: [],
          blockUtilization: [],
        },
      })

      adapter.scheduleTasks(tasks, workPatterns, { startDate: '2024-01-01' }, sequencedTasks)

      expect(mockScheduler.scheduleForDisplay).toHaveBeenCalled()
      const callArgs = mockScheduler.scheduleForDisplay.mock.calls[0]
      expect(callArgs[0]).toHaveLength(2) // 1 task + 1 workflow (workflows are expanded internally)
    })

    it('handles options correctly', () => {
      const tasks = [createMockTask()]
      const workPatterns = [createMockWorkPattern('2024-01-01')]
      const options = {
        startDate: '2024-01-01',
        endDate: '2024-01-07',
        respectDeadlines: true,
        allowSplitting: true,
        debug: true,
      }

      adapter.scheduleTasks(tasks, workPatterns, options)

      expect(mockScheduler.scheduleForDisplay).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.objectContaining({
          startDate: '2024-01-01',
          endDate: '2024-01-07',
          allowTaskSplitting: true,
          debugMode: true,
          respectMeetings: true,
          includeWeekends: false,
          optimizationMode: 'realistic',
        }),
      )
    })

    it('filters out completed tasks', () => {
      const tasks = [
        createMockTask({ id: 'task-1', completed: false }),
        createMockTask({ id: 'task-2', completed: true }),
      ]
      const workPatterns = [createMockWorkPattern('2024-01-01')]

      adapter.scheduleTasks(tasks, workPatterns, { startDate: '2024-01-01' })

      const callArgs = mockScheduler.scheduleForDisplay.mock.calls[0]
      expect(callArgs[0]).toHaveLength(1) // Only incomplete task (allItems is first arg)
      expect(callArgs[0][0].id).toBe('task-1')
    })

    it('handles unscheduled tasks', () => {
      const tasks = [
        createMockTask({ id: 'task-1' }),
        createMockTask({ id: 'task-2' }),
      ]
      const workPatterns = [createMockWorkPattern('2024-01-01')]

      mockScheduler.scheduleForDisplay.mockReturnValue({
        scheduled: [
          {
            id: 'task-1',
            name: 'Test Task',
            type: TaskType.Focused,
            duration: 60,
            startTime: new Date('2024-01-01T09:00:00'),
            endTime: new Date('2024-01-01T10:00:00'),
            priority: 25,
            dependencies: [],
            originalItem: {
              id: 'task-1',
              name: 'Test Task',
              type: TaskType.Focused,
              duration: 60,
            },
          },
        ],
        unscheduled: [
          {
            id: 'task-2',
            name: 'Test Task',
            type: TaskType.Focused,
            duration: 60,
            reason: 'No available capacity',
            originalItem: {
              id: 'task-2',
              name: 'Test Task',
              type: TaskType.Focused,
              duration: 60,
            },
          },
        ],
        debugInfo: {
          totalScheduled: 1,
          totalUnscheduled: 1,
          totalDuration: 60,
          scheduleEfficiency: 50,
          warnings: ['Some tasks could not be scheduled'],
          unscheduled: [],
          blockUtilization: [],
        },
      })

      const result = adapter.scheduleTasks(tasks, workPatterns, { startDate: '2024-01-01' })

      expect(result.scheduledTasks).toHaveLength(1)
      expect(result.unscheduledTasks).toHaveLength(1)
      expect(result.unscheduledTasks[0].id).toBe('task-2')
      expect(result.conflicts).toContain('Some tasks could not be scheduled')
    })
  })

  describe('getNextScheduledTask', () => {
    it('returns the first scheduled task', () => {
      const tasks = [createMockTask()]
      const workPatterns = [createMockWorkPattern('2024-01-01')]

      mockScheduler.scheduleForDisplay.mockReturnValue({
        scheduled: [
          {
            id: 'task-1',
            name: 'Test Task',
            type: TaskType.Focused,
            duration: 60,
            startTime: new Date(Date.now() + 3600000), // 1 hour from now
            endTime: new Date(Date.now() + 7200000), // 2 hours from now
            priority: 25,
            dependencies: [],
            originalItem: createMockTask(),
          },
        ],
        unscheduled: [],
        debugInfo: null,
      })

      const result = adapter.getNextScheduledTask(tasks, workPatterns, { startDate: '2024-01-01' })

      expect(result).not.toBeNull()
      expect(result?.task.id).toBe('task-1')
    })

    it('returns null when no tasks are scheduled', () => {
      const tasks = [createMockTask()]
      const workPatterns = []

      mockScheduler.scheduleForDisplay.mockReturnValue({
        scheduled: [],
        unscheduled: [],
        debugInfo: null,
      })

      const result = adapter.getNextScheduledTask(tasks, workPatterns, { startDate: '2024-01-01' })

      expect(result).toBeNull()
    })
  })

  describe('validateDependencies', () => {
    it('validates tasks with no dependencies', () => {
      const tasks = [
        createMockTask({ id: 'task-1' }),
        createMockTask({ id: 'task-2' }),
      ]

      mockScheduler.validateDependencies.mockReturnValue({
        isValid: true,
        errors: [],
      })

      const result = adapter.validateDependencies(tasks)

      expect(result.isValid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('detects circular dependencies', () => {
      const tasks = [
        createMockTask({ id: 'task-1', dependencies: ['task-2'] }),
        createMockTask({ id: 'task-2', dependencies: ['task-1'] }),
      ]

      mockScheduler.validateDependencies.mockReturnValue({
        isValid: false,
        errors: [{ description: 'Circular dependency detected: task-1' }],
      })

      const result = adapter.validateDependencies(tasks)

      expect(result.isValid).toBe(false)
      expect(result.errors).toContain('Circular dependency detected: task-1')
    })

    it('detects missing dependencies', () => {
      const tasks = [
        createMockTask({ id: 'task-1', dependencies: ['task-3'] }),
        createMockTask({ id: 'task-2' }),
      ]

      mockScheduler.validateDependencies.mockReturnValue({
        isValid: false,
        errors: [{ description: 'Task task-1 depends on non-existent task: task-3' }],
      })

      const result = adapter.validateDependencies(tasks)

      expect(result.isValid).toBe(false)
      expect(result.errors).toContain('Task task-1 depends on non-existent task: task-3')
    })

    it('validates complex dependency chains', () => {
      const tasks = [
        createMockTask({ id: 'task-1', dependencies: ['task-2'] }),
        createMockTask({ id: 'task-2', dependencies: ['task-3'] }),
        createMockTask({ id: 'task-3' }),
      ]

      mockScheduler.validateDependencies.mockReturnValue({
        isValid: true,
        errors: [],
      })

      const result = adapter.validateDependencies(tasks)

      expect(result.isValid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })
  })

  describe('calculateTaskPriority', () => {
    it('delegates to UnifiedScheduler calculatePriority', () => {
      const task = createMockTask({ importance: 5, urgency: 5 })

      mockScheduler.calculatePriority.mockReturnValue(42)
      const priority = adapter.calculateTaskPriority(task)

      expect(mockScheduler.calculatePriority).toHaveBeenCalled()
      expect(priority).toBe(42)
    })

    it('applies deadline boost', () => {
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)

      const task = createMockTask({
        importance: 5,
        urgency: 5,
        deadline: tomorrow,
      })

      mockScheduler.calculatePriority.mockReturnValue(35)
      const priority = adapter.calculateTaskPriority(task)

      expect(priority).toBe(35) // Should use mock return value
    })

    it('handles overdue tasks', () => {
      const yesterday = new Date()
      yesterday.setDate(yesterday.getDate() - 1)

      const task = createMockTask({
        importance: 5,
        urgency: 5,
        deadline: yesterday,
      })

      mockScheduler.calculatePriority.mockReturnValue(75)
      const priority = adapter.calculateTaskPriority(task)

      expect(priority).toBe(75) // Max boost for overdue
    })

    it('handles tasks without deadline', () => {
      const task = createMockTask({
        importance: 3,
        urgency: 4,
        deadline: undefined,
      })

      mockScheduler.calculatePriority.mockReturnValue(12)
      const priority = adapter.calculateTaskPriority(task)

      expect(priority).toBe(12) // 3 * 4
    })
  })

  describe('getSchedulingMetrics', () => {
    it('returns scheduling metrics', () => {
      const tasks = [
        createMockTask({ id: 'task-1', importance: 5, urgency: 5 }),
        createMockTask({ id: 'task-2', importance: 3, urgency: 4 }),
      ]
      const workPatterns = [createMockWorkPattern('2024-01-01')]

      mockScheduler.scheduleForDisplay.mockReturnValue({
        scheduled: [
          {
            id: 'task-1',
            name: 'Test Task',
            type: TaskType.Focused,
            duration: 60,
            startTime: new Date('2024-01-01T09:00:00'),
            endTime: new Date('2024-01-01T10:00:00'),
            priority: 25,
            dependencies: [],
            originalItem: createMockTask({ id: 'task-1', importance: 5, urgency: 5 }),
          },
        ],
        unscheduled: [
          {
            id: 'task-2',
            name: 'Test Task 2',
            type: TaskType.Focused,
            duration: 60,
            reason: 'No capacity',
            originalItem: createMockTask({ id: 'task-2', importance: 3, urgency: 4 }),
          },
        ],
        debugInfo: null,
      })

      const metrics = adapter.getSchedulingMetrics(tasks, workPatterns, { startDate: '2024-01-01' })

      expect(metrics.totalTasks).toBe(2)
      expect(metrics.scheduledTasks).toBe(1)
      expect(metrics.unscheduledTasks).toBe(1)
      expect(metrics.totalDuration).toBe(60)
      expect(metrics.averagePriority).toBe(18.5) // (25 + 12) / 2
      expect(metrics.utilizationRate).toBeCloseTo(0.1428, 3) // 60 / 420 total capacity
    })

    it('handles empty task list', () => {
      const metrics = adapter.getSchedulingMetrics([], [], { startDate: '2024-01-01' })

      expect(metrics.totalTasks).toBe(0)
      expect(metrics.scheduledTasks).toBe(0)
      expect(metrics.unscheduledTasks).toBe(0)
      expect(metrics.totalDuration).toBe(0)
      expect(metrics.averagePriority).toBe(0)
      expect(metrics.utilizationRate).toBe(0)
    })

    it('calculates utilization correctly', () => {
      const tasks = [createMockTask({ duration: 180 })]
      const workPatterns = [createMockWorkPattern('2024-01-01')] // 420 minutes total

      mockScheduler.scheduleForDisplay.mockReturnValue({
        scheduled: [
          {
            id: 'task-1',
            name: 'Test Task',
            type: TaskType.Focused,
            duration: 180,
            startTime: new Date('2024-01-01T09:00:00'),
            endTime: new Date('2024-01-01T12:00:00'),
            priority: 25,
            dependencies: [],
            originalItem: createMockTask({ duration: 180 }),
          },
        ],
        unscheduled: [],
        debugInfo: null,
      })

      const metrics = adapter.getSchedulingMetrics(tasks, workPatterns, { startDate: '2024-01-01' })

      expect(metrics.utilizationRate).toBeCloseTo(0.4286, 3) // 180 / 420
    })
  })
})
