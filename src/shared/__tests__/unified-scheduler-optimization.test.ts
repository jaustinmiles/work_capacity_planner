/**
 * Test suite for UnifiedScheduler optimization methods
 * Tests the optimization features ported from optimal-scheduler
 */

import { UnifiedScheduler } from '../unified-scheduler'
import { UnifiedScheduleItem, ScheduleContext } from '../unified-scheduler-types'
import { Task } from '../types'

describe('UnifiedScheduler - Optimization Methods', () => {
  let scheduler: UnifiedScheduler

  beforeEach(() => {
    scheduler = new UnifiedScheduler()
  })

  const mockContext: ScheduleContext = {
    startDate: '2025-01-15',
    tasks: [],
    workflows: [],
    workPatterns: [],
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

  const createTestItem = (
    id: string,
    duration: number,
    dependencies: string[] = [],
    isAsyncTrigger = false,
    asyncWaitTime = 0,
  ): UnifiedScheduleItem => ({
    id,
    name: `Task ${id}`,
    duration,
    dependencies,
    priority: 50,
    taskType: 'focused',
    originalItem: { id, name: `Task ${id}`, duration } as Task,
    isAsyncTrigger,
    asyncWaitTime,
  })

  describe('calculateOptimalSchedule', () => {
    it('should schedule items in dependency order', () => {
      const items = [
        createTestItem('C', 30, ['A', 'B']),
        createTestItem('A', 60),
        createTestItem('B', 45, ['A']),
      ]

      const result = scheduler.calculateOptimalSchedule(items, mockContext)

      expect(result.scheduled).toHaveLength(3)

      // Check schedule order: A should come first, then B, then C
      const scheduleOrder = result.scheduled.map(item => item.id)
      expect(scheduleOrder.indexOf('A')).toBeLessThan(scheduleOrder.indexOf('B'))
      expect(scheduleOrder.indexOf('B')).toBeLessThan(scheduleOrder.indexOf('C'))
    })

    it('should handle async tasks correctly', () => {
      const items = [
        createTestItem('async-task', 30, [], true, 60), // 30min work + 60min wait
        createTestItem('dependent', 45, ['async-task']),
        createTestItem('independent', 20),
      ]

      const result = scheduler.calculateOptimalSchedule(items, mockContext)

      expect(result.scheduled).toHaveLength(3)
      expect(result.metrics.totalDuration).toBeGreaterThan(0)
    })

    it('should calculate accurate metrics', () => {
      const items = [
        createTestItem('A', 60),
        createTestItem('B', 30),
      ]

      const result = scheduler.calculateOptimalSchedule(items, mockContext)

      expect(result.metrics.scheduledCount).toBe(2)
      expect(result.metrics.unscheduledCount).toBe(0)
      expect(result.metrics.totalDuration).toBe(90) // 60 + 30
      expect(result.metrics.utilizationRate).toBe(1) // Perfect utilization in optimal schedule
    })
  })

  describe('calculateMinimumCompletionTime', () => {
    it('should return 0 for empty items', () => {
      const result = scheduler.calculateMinimumCompletionTime([])
      expect(result).toBe(0)
    })

    it('should calculate minimum time for independent tasks', () => {
      const items = [
        createTestItem('A', 30),
        createTestItem('B', 45),
        createTestItem('C', 60),
      ]

      // Independent tasks can run in parallel, so minimum time is the longest task
      const result = scheduler.calculateMinimumCompletionTime(items)
      expect(result).toBe(60) // Longest task duration
    })

    it('should handle dependency chains', () => {
      const items = [
        createTestItem('A', 30),
        createTestItem('B', 45, ['A']),
        createTestItem('C', 60, ['B']),
      ]

      // Sequential chain: 30 + 45 + 60 = 135
      const result = scheduler.calculateMinimumCompletionTime(items)
      expect(result).toBe(135)
    })

    it('should optimize mixed parallel and sequential work', () => {
      const items = [
        createTestItem('A', 60),
        createTestItem('B', 30, ['A']),
        createTestItem('C', 45, ['A']), // Can run parallel to B
        createTestItem('D', 20, ['B', 'C']),
      ]

      const result = scheduler.calculateMinimumCompletionTime(items)

      // A(60) -> max(B(30), C(45)) -> D(20) = 60 + 45 + 20 = 125
      expect(result).toBe(125)
    })
  })

  describe('modelParallelExecution', () => {
    it('should identify independent tasks as parallelizable', () => {
      const items = [
        createTestItem('A', 30),
        createTestItem('B', 45),
        createTestItem('C', 60),
      ]

      const result = scheduler.modelParallelExecution(items)

      expect(result.parallelGroups).toHaveLength(1)
      expect(result.parallelGroups[0]).toHaveLength(3) // All can run in parallel
      expect(result.maxParallelism).toBe(3)
      expect(result.timeReduction).toBeGreaterThan(0)
    })

    it('should group tasks by dependency level', () => {
      const items = [
        createTestItem('A', 30),
        createTestItem('B', 45, ['A']),
        createTestItem('C', 60, ['A']), // Same level as B
        createTestItem('D', 20, ['B', 'C']),
      ]

      const result = scheduler.modelParallelExecution(items)

      expect(result.parallelGroups).toHaveLength(3)
      expect(result.parallelGroups[0]).toHaveLength(1) // A
      expect(result.parallelGroups[1]).toHaveLength(2) // B, C
      expect(result.parallelGroups[2]).toHaveLength(1) // D
      expect(result.maxParallelism).toBe(2) // B and C can run together
    })

    it('should calculate time reduction from parallelization', () => {
      const items = [
        createTestItem('A', 30),
        createTestItem('B', 45),
      ]

      const result = scheduler.modelParallelExecution(items)

      // Sequential: 30 + 45 = 75
      // Parallel: max(30, 45) = 45
      // Reduction: 75 - 45 = 30
      expect(result.timeReduction).toBe(30)
    })

    it('should handle complex dependency graphs', () => {
      const items = [
        createTestItem('A', 60),
        createTestItem('B', 30),
        createTestItem('C', 45, ['A']),
        createTestItem('D', 20, ['A']),
        createTestItem('E', 35, ['C', 'D']),
        createTestItem('F', 25, ['B']),
      ]

      const result = scheduler.modelParallelExecution(items)

      // Should have multiple levels with different parallelization opportunities
      expect(result.parallelGroups.length).toBeGreaterThan(2)
      expect(result.maxParallelism).toBeGreaterThan(1)
      expect(result.timeReduction).toBeGreaterThan(0)
    })
  })

  describe('Integration with critical path calculation', () => {
    it('should use critical path in minimum completion time', () => {
      const items = [
        createTestItem('A', 30),
        createTestItem('B', 45, ['A']),
        createTestItem('C', 60, ['B']),
      ]

      const criticalPath = scheduler.calculateCriticalPath(items)
      const minTime = scheduler.calculateMinimumCompletionTime(items)

      // For a simple sequential chain, critical path should equal minimum time
      expect(criticalPath).toBe(135) // 30 + 45 + 60
      expect(minTime).toBe(135)
    })

    it('should optimize critical path with parallelization', () => {
      const items = [
        createTestItem('A', 60),
        createTestItem('B1', 30, ['A']),
        createTestItem('B2', 45, ['A']), // Can run parallel to B1
        createTestItem('C', 20, ['B1', 'B2']),
      ]

      const criticalPath = scheduler.calculateCriticalPath(items)
      const minTime = scheduler.calculateMinimumCompletionTime(items)

      // Critical path: A(60) + max(B1(30), B2(45)) + C(20) = 60 + 45 + 20 = 125
      expect(criticalPath).toBe(125)
      expect(minTime).toBeLessThanOrEqual(criticalPath)
    })
  })
})
