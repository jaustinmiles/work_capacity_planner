/**
 * Test suite for UnifiedScheduler core functionality
 * Tests the main scheduling methods, priority calculation, dependency resolution, and allocation
 */

import { UnifiedScheduler } from '../unified-scheduler'
import { UnifiedScheduleItem, ScheduleContext, ScheduleConfig } from '../unified-scheduler'
import { Task } from '../types'
import { TaskType } from '../enums'
import { DailyWorkPattern } from '../work-blocks-types'

describe('UnifiedScheduler - Core Functionality', () => {
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
        typeConfig: { kind: 'single', typeId: 'focused' },
        capacity: { totalMinutes: 180 },
      },
      {
        id: 'afternoon-admin',
        startTime: '13:00',
        endTime: '15:00',
        typeConfig: { kind: 'single', typeId: 'admin' },
        capacity: { totalMinutes: 120 },
      },
    ],
    accumulated: {},
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

  const mockConfig: ScheduleConfig = {
    startDate: '2025-01-15',
    debugMode: true,
    maxDays: 7,
  }

  const createTestTask = (id: string, duration: number, options: Partial<Task> = {}): Task => ({
    id,
    name: `Task ${id}`,
    duration,
    importance: 5,
    urgency: 5,
    cognitiveComplexity: 3,
    taskType: TaskType.Focused,
    status: 'not_started',
    createdAt: new Date('2025-01-15T08:00:00.000Z'),
    notes: '',
    ...options,
  })

  describe('scheduleForDisplay', () => {
    it('should schedule simple tasks without dependencies', () => {
      const tasks = [
        createTestTask('task1', 60),
        createTestTask('task2', 45, { taskType: TaskType.Admin }),
      ]

      const result = scheduler.scheduleForDisplay(tasks, mockContext, mockConfig)

      console.log('Debug - Scheduling result:', {
        scheduled: result.scheduled.length,
        unscheduled: result.unscheduled.length,
        conflicts: result.conflicts.length,
        warnings: result.warnings.length,
        unscheduledItems: result.unscheduled.map(item => ({ id: item.id, name: item.name })),
        workPatterns: mockContext.workPatterns.length,
      })

      expect(result.scheduled).toHaveLength(2)
      expect(result.unscheduled).toHaveLength(0)
      expect(result.conflicts).toHaveLength(0)

      // Check that tasks are scheduled
      const task1Scheduled = result.scheduled.find(item => item.originalItem && 'id' in item.originalItem && item.originalItem.id === 'task1')
      const task2Scheduled = result.scheduled.find(item => item.originalItem && 'id' in item.originalItem && item.originalItem.id === 'task2')

      expect(task1Scheduled).toBeDefined()
      expect(task2Scheduled).toBeDefined()
      expect(task1Scheduled?.startTime).toBeDefined()
      expect(task1Scheduled?.endTime).toBeDefined()
    })

    it('should handle tasks with dependencies', () => {
      const tasks = [
        createTestTask('task1', 60),
        createTestTask('task2', 45, { dependencies: ['task1'] }),
      ]

      const result = scheduler.scheduleForDisplay(tasks, mockContext, mockConfig)

      expect(result.scheduled).toHaveLength(2)

      const task1Scheduled = result.scheduled.find(item => item.originalItem && 'id' in item.originalItem && item.originalItem.id === 'task1')
      const task2Scheduled = result.scheduled.find(item => item.originalItem && 'id' in item.originalItem && item.originalItem.id === 'task2')

      // Task2 should be scheduled after task1
      if (task1Scheduled?.endTime && task2Scheduled?.startTime) {
        expect(task1Scheduled.endTime.getTime()).toBeLessThanOrEqual(task2Scheduled.startTime.getTime())
      }
    })

    it('should return debug info when requested', () => {
      const tasks = [createTestTask('task1', 60)]

      const result = scheduler.scheduleForDisplay(tasks, mockContext, mockConfig)

      expect(result.debugInfo).toBeDefined()
      expect(result.metrics).toBeDefined()
    })

    it('should handle empty task list', () => {
      const result = scheduler.scheduleForDisplay([], mockContext, mockConfig)

      expect(result.scheduled).toHaveLength(0)
      expect(result.unscheduled).toHaveLength(0)
      expect(result.conflicts).toHaveLength(0)
    })
  })

  describe('scheduleForPersistence', () => {
    it('should return enhanced results with capacity modeling', async () => {
      const tasks = [
        createTestTask('task1', 60),
        createTestTask('task2', 45),
      ]

      const result = await scheduler.scheduleForPersistence(tasks, mockContext, mockConfig)

      expect(result.scheduled).toHaveLength(2)
      expect(result.metrics).toBeDefined()

      // Check for enhanced async features
      expect(result.metrics.capacityUtilization).toBeDefined()
      expect(result.metrics.deadlineRiskScore).toBeDefined()
      expect(result.debugInfo?.capacityModel).toBeDefined()
    })

    it('should analyze deadline risks', async () => {
      const tomorrow = new Date('2025-01-16T12:00:00.000Z')
      const tasks = [
        createTestTask('urgent-task', 120, {
          deadline: tomorrow,
          deadlineType: 'hard',
        }),
      ]

      const result = await scheduler.scheduleForPersistence(tasks, mockContext, mockConfig)

      expect(result.debugInfo?.deadlineAnalysis).toBeDefined()
      expect(result.debugInfo?.deadlineAnalysis.riskyItems).toBeDefined()
    })
  })

  describe('calculatePriority', () => {
    it('should calculate priority for tasks', () => {
      const task = createTestTask('test', 60, { importance: 8, urgency: 7 })

      const priority = scheduler.calculatePriority(task, mockContext)

      expect(priority).toBeGreaterThan(0)
      expect(typeof priority).toBe('number')
    })

    it('should calculate priority breakdown', () => {
      const task = createTestTask('test', 60, { importance: 8, urgency: 7 })

      const breakdown = scheduler.calculatePriorityWithBreakdown(task, mockContext)

      expect(breakdown.eisenhower).toBe(56) // 8 * 7
      expect(breakdown.total).toBeGreaterThan(0)
      expect(breakdown.deadlineBoost).toBeDefined()
      expect(breakdown.asyncBoost).toBeDefined()
      expect(breakdown.cognitiveMatch).toBeDefined()
    })

    it('should handle deadline pressure', () => {
      const tomorrow = new Date('2025-01-16T12:00:00.000Z')
      const task = createTestTask('urgent', 60, {
        deadline: tomorrow,
        deadlineType: 'hard',
      })

      const breakdown = scheduler.calculatePriorityWithBreakdown(task, mockContext)

      expect(breakdown.deadlineBoost).toBeGreaterThan(0)
    })
  })

  describe('topologicalSort', () => {
    it('should sort items by dependencies', () => {
      const items: UnifiedScheduleItem[] = [
        {
          id: 'C',
          name: 'Task C',
          duration: 30,
          dependencies: ['A', 'B'],
          priority: 50,
          originalItem: createTestTask('C', 30),
        },
        {
          id: 'A',
          name: 'Task A',
          duration: 60,
          priority: 50,
          originalItem: createTestTask('A', 60),
        },
        {
          id: 'B',
          name: 'Task B',
          duration: 45,
          dependencies: ['A'],
          priority: 50,
          originalItem: createTestTask('B', 45),
        },
      ]

      const sorted = scheduler.topologicalSort(items)

      expect(sorted).toHaveLength(3)

      const orderMap = new Map()
      sorted.forEach((item, index) => orderMap.set(item.id, index))

      // A should come before B and C
      expect(orderMap.get('A')).toBeLessThan(orderMap.get('B'))
      expect(orderMap.get('A')).toBeLessThan(orderMap.get('C'))
      // B should come before C
      expect(orderMap.get('B')).toBeLessThan(orderMap.get('C'))
    })

    it('should detect dependency cycles', () => {
      const items: UnifiedScheduleItem[] = [
        {
          id: 'A',
          name: 'Task A',
          duration: 60,
          dependencies: ['B'],
          priority: 50,
          originalItem: createTestTask('A', 60),
        },
        {
          id: 'B',
          name: 'Task B',
          duration: 45,
          dependencies: ['A'],
          priority: 50,
          originalItem: createTestTask('B', 45),
        },
      ]

      // This should detect the cycle and handle it gracefully
      const sorted = scheduler.topologicalSort(items)

      // Should still return items, potentially removing cyclic dependencies
      expect(sorted).toHaveLength(2)
    })
  })

  describe('allocateToWorkBlocks', () => {
    it('should allocate tasks to appropriate work blocks', () => {
      const items: UnifiedScheduleItem[] = [
        {
          id: 'focus-task',
          name: 'Focus Task',
          duration: 60,
          priority: 50,
          taskType: TaskType.Focused,
          originalItem: createTestTask('focus-task', 60),
        },
        {
          id: 'admin-task',
          name: 'Admin Task',
          duration: 45,
          priority: 50,
          taskType: TaskType.Admin,
          originalItem: createTestTask('admin-task', 45, { taskType: TaskType.Admin }),
        },
      ]

      // Don't pass currentTime so it doesn't restrict scheduling
      const configWithoutCurrentTime = { ...mockConfig }
      delete (configWithoutCurrentTime as any).currentTime

      const allocated = scheduler.allocateToWorkBlocks(items, [mockWorkPattern], configWithoutCurrentTime)

      expect(allocated.length).toBeGreaterThan(0)

      // Check that tasks have start and end times
      allocated.forEach(item => {
        if (item.type === 'task' || item.type === 'workflow-step') {
          expect(item.startTime).toBeDefined()
          expect(item.endTime).toBeDefined()
        }
      })
    })

    it('should handle tasks that exceed work block capacity', () => {
      const largeTask: UnifiedScheduleItem = {
        id: 'large-task',
        name: 'Large Task',
        duration: 240, // 4 hours - exceeds morning focus block
        priority: 50,
        taskType: TaskType.Focused,
        originalItem: createTestTask('large-task', 240),
      }

      // Don't pass currentTime so it doesn't restrict scheduling
      const configWithoutCurrentTime = { ...mockConfig }
      delete (configWithoutCurrentTime as any).currentTime

      const allocated = scheduler.allocateToWorkBlocks([largeTask], [mockWorkPattern], configWithoutCurrentTime)

      // Should either split the task or handle it appropriately
      expect(allocated.length).toBeGreaterThan(0)
    })
  })

  describe('splitTaskAcrossDays', () => {
    it('should split large tasks across multiple days', () => {
      const largeTask: UnifiedScheduleItem = {
        id: 'large-task',
        name: 'Large Task',
        duration: 240, // 4 hours
        priority: 50,
        originalItem: createTestTask('large-task', 240),
      }

      const availableSlots = [
        { date: new Date('2025-01-15'), duration: 120 },
        { date: new Date('2025-01-16'), duration: 120 },
      ]

      const splitParts = scheduler.splitTaskAcrossDays(largeTask, availableSlots)

      expect(splitParts.length).toBeGreaterThan(1)

      // Check split properties
      splitParts.forEach((part, index) => {
        expect(part.isSplit).toBe(true)
        expect(part.splitPart).toBe(index + 1)
        expect(part.splitTotal).toBe(splitParts.length)
        expect(part.originalTaskId).toBe('large-task')
      })

      // Check total duration is preserved
      const totalSplitDuration = splitParts.reduce((sum, part) => sum + part.duration, 0)
      expect(totalSplitDuration).toBe(240)
    })

    it('should not split tasks smaller than minimum duration', () => {
      const smallTask: UnifiedScheduleItem = {
        id: 'small-task',
        name: 'Small Task',
        duration: 15, // Less than 30min minimum
        priority: 50,
        originalItem: createTestTask('small-task', 15),
      }

      const availableSlots = [
        { date: new Date('2025-01-15'), duration: 10 },
        { date: new Date('2025-01-16'), duration: 10 },
      ]

      const splitParts = scheduler.splitTaskAcrossDays(smallTask, availableSlots)

      expect(splitParts).toHaveLength(0) // Can't split effectively
    })
  })

  describe('calculateCriticalPath', () => {
    it('should calculate the longest dependency chain', () => {
      const items: UnifiedScheduleItem[] = [
        {
          id: 'A',
          name: 'Task A',
          duration: 60,
          priority: 50,
          originalItem: createTestTask('A', 60),
        },
        {
          id: 'B',
          name: 'Task B',
          duration: 45,
          dependencies: ['A'],
          priority: 50,
          originalItem: createTestTask('B', 45),
        },
        {
          id: 'C',
          name: 'Task C',
          duration: 30,
          dependencies: ['B'],
          priority: 50,
          originalItem: createTestTask('C', 30),
        },
      ]

      const criticalPath = scheduler.calculateCriticalPath(items)

      expect(criticalPath).toBe(135) // 60 + 45 + 30
    })

    it('should handle parallel paths correctly', () => {
      const items: UnifiedScheduleItem[] = [
        {
          id: 'A',
          name: 'Task A',
          duration: 60,
          priority: 50,
          originalItem: createTestTask('A', 60),
        },
        {
          id: 'B1',
          name: 'Task B1',
          duration: 30,
          dependencies: ['A'],
          priority: 50,
          originalItem: createTestTask('B1', 30),
        },
        {
          id: 'B2',
          name: 'Task B2',
          duration: 90, // Longer parallel path
          dependencies: ['A'],
          priority: 50,
          originalItem: createTestTask('B2', 90),
        },
      ]

      const criticalPath = scheduler.calculateCriticalPath(items)

      expect(criticalPath).toBe(150) // 60 + 90 (longer path)
    })
  })
})
