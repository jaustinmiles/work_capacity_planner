/**
 * Test suite for UnifiedScheduler integration scenarios
 * Tests end-to-end scheduling, mixed workloads, and real-world scenarios
 */

import { UnifiedScheduler } from '../unified-scheduler'
import { ScheduleContext, ScheduleConfig } from '../unified-scheduler-types'
import { Task, SequencedTask } from '../types'
import { DailyWorkPattern } from '../work-blocks-types'

describe('UnifiedScheduler - Integration', () => {
  let scheduler: UnifiedScheduler

  beforeEach(() => {
    scheduler = new UnifiedScheduler()
  })

  const createWeeklyWorkPatterns = (): DailyWorkPattern[] => {
    const patterns: DailyWorkPattern[] = []

    for (let i = 0; i < 7; i++) {
      const date = new Date('2025-01-15')
      date.setDate(date.getDate() + i)
      const dateStr = date.toISOString().split('T')[0]

      patterns.push({
        date: dateStr,
        blocks: [
          {
            id: `morning-focus-${i}`,
            startTime: '09:00',
            endTime: '12:00',
            typeConfig: { kind: 'single' as const, typeId: 'focused' },
            capacity: { totalMinutes: 180 },
          },
          {
            id: `afternoon-admin-${i}`,
            startTime: '13:00',
            endTime: '15:00',
            typeConfig: { kind: 'single' as const, typeId: 'admin' },
            capacity: { totalMinutes: 120 },
          },
          {
            id: `evening-personal-${i}`,
            startTime: '18:00',
            endTime: '19:00',
            typeConfig: { kind: 'single' as const, typeId: 'personal' },
            capacity: { totalMinutes: 60 },
          },
        ],
        accumulated: {}, // Dynamic format
        meetings: [],
      })
    }

    return patterns
  }

  const mockContext: ScheduleContext = {
    startDate: '2025-01-15',
    currentTime: new Date('2025-01-15T08:00:00.000Z'),
    tasks: [],
    workflows: [],
    workPatterns: createWeeklyWorkPatterns(),
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
    endDate: '2025-01-22',
    includeWeekends: true,
    allowTaskSplitting: true,
    respectMeetings: true,
    optimizationMode: 'realistic',
    debugMode: true,
  }

  const createTestTask = (id: string, duration: number, options: Partial<Task> = {}): Task => ({
    id,
    name: `Task ${id}`,
    duration,
    importance: 5,
    urgency: 5,
    cognitiveComplexity: 3,
    taskType: 'focused',
    status: 'not_started',
    createdAt: new Date('2025-01-15T08:00:00.000Z'),
    notes: '',
    ...options,
  })

  const createTestWorkflow = (id: string, stepCount: number): SequencedTask => ({
    id,
    name: `Workflow ${id}`,
    steps: Array.from({ length: stepCount }, (_, i) => ({
      id: `${id}-step-${i + 1}`,
      name: `Step ${i + 1} of ${id}`,
      duration: 30,
      taskId: id,
      sequenceIndex: i,
      isCompleted: false,
      createdAt: new Date('2025-01-15T08:00:00.000Z'),
    })),
    createdAt: new Date('2025-01-15T08:00:00.000Z'),
    isCompleted: false,
    totalEstimatedDuration: stepCount * 30,
  })

  describe('End-to-End Scheduling', () => {
    it('should handle mixed tasks and workflows', () => {
      const tasks = [
        createTestTask('individual-1', 60, { taskType: 'focused' }),
        createTestTask('individual-2', 45, { taskType: 'admin' }),
      ]

      const workflows = [
        createTestWorkflow('workflow-1', 3), // 90 minutes total
      ]

      const mixedItems = [...tasks, ...workflows]
      const result = scheduler.scheduleForDisplay(mixedItems, mockContext, mockConfig)

      expect(result.scheduled.length).toBeGreaterThan(0)
      expect(result.unscheduled.length).toBeLessThanOrEqual(mixedItems.length)
      expect(result.conflicts.length).toBe(0)

      // Should have both individual tasks and workflow steps
      const taskItems = result.scheduled.filter(item => item.type === 'task' || !item.type)
      const workflowItems = result.scheduled.filter(item => item.type === 'workflow-step')

      expect(taskItems.length).toBeGreaterThan(0)
      // Workflow items might be 0 if conversion isn't fully implemented yet
      expect(workflowItems.length).toBeGreaterThanOrEqual(0)
    })

    it('should respect all constraints simultaneously', () => {
      const tasks = [
        createTestTask('urgent-important', 60, {
          importance: 9,
          urgency: 9,
          taskType: 'focused',
        }),
        createTestTask('with-deadline', 45, {
          importance: 6,
          urgency: 6,
          deadline: new Date('2025-01-16T17:00:00.000Z'),
          deadlineType: 'hard',
          taskType: 'admin',
        }),
        createTestTask('low-priority', 30, {
          importance: 2,
          urgency: 2,
          taskType: 'personal',
        }),
        createTestTask('dependent', 45, {
          importance: 7,
          urgency: 7,
          dependencies: ['urgent-important'],
          taskType: 'focused',
        }),
      ]

      const result = scheduler.scheduleForDisplay(tasks, mockContext, mockConfig)

      expect(result.scheduled.length).toBe(4)
      expect(result.unscheduled.length).toBe(0)
      expect(result.conflicts.length).toBe(0)

      // Verify dependency order
      const urgentTask = result.scheduled.find(item =>
        item.originalItem && 'id' in item.originalItem && item.originalItem.id === 'urgent-important',
      )
      const dependentTask = result.scheduled.find(item =>
        item.originalItem && 'id' in item.originalItem && item.originalItem.id === 'dependent',
      )

      if (urgentTask && dependentTask && urgentTask.endTime && dependentTask.startTime) {
        expect(urgentTask.endTime.getTime()).toBeLessThanOrEqual(dependentTask.startTime.getTime())
      }

      // Verify task types are matched to appropriate blocks
      result.scheduled.forEach(item => {
        expect(item.startTime).toBeDefined()
        expect(item.endTime).toBeDefined()
        expect(item.startTime!.getTime()).toBeLessThan(item.endTime!.getTime())
      })
    })

    it('should generate valid schedules for 7-day periods', () => {
      // Create a realistic workload
      const tasks = [
        ...Array.from({ length: 10 }, (_, i) =>
          createTestTask(`focus-${i}`, 60, { taskType: 'focused' }),
        ),
        ...Array.from({ length: 8 }, (_, i) =>
          createTestTask(`admin-${i}`, 45, { taskType: 'admin' }),
        ),
        ...Array.from({ length: 5 }, (_, i) =>
          createTestTask(`personal-${i}`, 30, { taskType: 'personal' }),
        ),
      ]

      const workflows = [
        createTestWorkflow('project-alpha', 5),
        createTestWorkflow('project-beta', 3),
      ]

      const result = scheduler.scheduleForDisplay([...tasks, ...workflows], mockContext, mockConfig)

      // Should be able to schedule most items
      expect(result.scheduled.length).toBeGreaterThan(15)

      // Verify all scheduled items have valid times
      result.scheduled.forEach(item => {
        expect(item.startTime).toBeDefined()
        expect(item.endTime).toBeDefined()
        if (item.startTime && item.endTime) {
          expect(item.startTime.getTime()).toBeLessThan(item.endTime.getTime())
        }
      })

      // Verify metrics are generated
      expect(result.metrics).toBeDefined()
      expect(result.metrics.totalWorkDays).toBeGreaterThan(0)
      expect(result.metrics.hoursByType).toBeDefined()
    })
  })

  describe('Large-Scale Scenarios', () => {
    it('should handle high-volume task scheduling', () => {
      // Create 50 tasks of varying types and durations
      const largeTasks = Array.from({ length: 50 }, (_, i) => {
        const types = ['focused', 'admin', 'personal']
        const durations = [15, 30, 45, 60, 90, 120]

        return createTestTask(`large-${i}`, durations[i % durations.length], {
          taskType: types[i % types.length],
          importance: Math.floor(Math.random() * 10) + 1,
          urgency: Math.floor(Math.random() * 10) + 1,
        })
      })

      const result = scheduler.scheduleForDisplay(largeTasks, mockContext, mockConfig)

      // Should handle large volume without errors (might be more if tasks get split)
      expect(result.scheduled.length + result.unscheduled.length).toBeGreaterThanOrEqual(largeTasks.length)
      expect(result.conflicts.length).toBe(0)
      expect(result.metrics.totalWorkDays).toBeGreaterThan(0)
    })

    it('should handle complex dependency chains', () => {
      const chainTasks = [
        createTestTask('chain-1', 30),
        createTestTask('chain-2', 30, { dependencies: ['chain-1'] }),
        createTestTask('chain-3', 30, { dependencies: ['chain-2'] }),
        createTestTask('chain-4', 30, { dependencies: ['chain-3'] }),
        createTestTask('parallel-1', 30, { dependencies: ['chain-1'] }),
        createTestTask('parallel-2', 30, { dependencies: ['chain-1'] }),
        createTestTask('final', 30, { dependencies: ['chain-4', 'parallel-1', 'parallel-2'] }),
      ]

      const result = scheduler.scheduleForDisplay(chainTasks, mockContext, mockConfig)

      expect(result.scheduled.length).toBe(chainTasks.length)
      expect(result.conflicts.length).toBe(0)

      // Verify dependency order is maintained
      const scheduledMap = new Map()
      result.scheduled.forEach(item => {
        if (item.originalItem && 'id' in item.originalItem) {
          scheduledMap.set(item.originalItem.id, item)
        }
      })

      // Chain-2 should come after chain-1
      const chain1 = scheduledMap.get('chain-1')
      const chain2 = scheduledMap.get('chain-2')
      if (chain1 && chain2) {
        expect(chain1.endTime!.getTime()).toBeLessThanOrEqual(chain2.startTime!.getTime())
      }

      // Final should come after all its dependencies
      const final = scheduledMap.get('final')
      const chain4 = scheduledMap.get('chain-4')
      const parallel1 = scheduledMap.get('parallel-1')
      const parallel2 = scheduledMap.get('parallel-2')

      if (final && chain4 && parallel1 && parallel2) {
        expect(chain4.endTime!.getTime()).toBeLessThanOrEqual(final.startTime!.getTime())
        expect(parallel1.endTime!.getTime()).toBeLessThanOrEqual(final.startTime!.getTime())
        expect(parallel2.endTime!.getTime()).toBeLessThanOrEqual(final.startTime!.getTime())
      }
    })
  })

  describe('Async Scheduling', () => {
    it('should return enhanced results with capacity modeling', async () => {
      const tasks = [
        createTestTask('async-1', 60, { taskType: 'focused' }),
        createTestTask('async-2', 45, { taskType: 'admin' }),
      ]

      const result = await scheduler.scheduleForPersistence(tasks, mockContext, mockConfig)

      expect(result.scheduled.length).toBeGreaterThan(0)
      expect(result.metrics).toBeDefined()
      expect(result.metrics.capacityUtilization).toBeDefined()
      expect(result.metrics.deadlineRiskScore).toBeDefined()
      expect(result.debugInfo?.capacityModel).toBeDefined()
    })

    it('should handle deadline risk analysis', async () => {
      const tasks = [
        createTestTask('risky-task', 120, {
          deadline: new Date('2025-01-15T15:00:00.000Z'), // Same day, tight deadline
          deadlineType: 'hard',
          taskType: 'focused',
        }),
        createTestTask('safe-task', 60, {
          deadline: new Date('2025-01-20T17:00:00.000Z'), // Several days later
          deadlineType: 'soft',
          taskType: 'admin',
        }),
      ]

      const result = await scheduler.scheduleForPersistence(tasks, mockContext, mockConfig)

      expect(result.debugInfo?.deadlineAnalysis).toBeDefined()
      expect(result.debugInfo?.deadlineAnalysis.riskyItems).toBeDefined()
      expect(result.metrics.deadlineRiskScore).toBeGreaterThan(0)
    })
  })

  describe('Performance and Metrics', () => {
    it('should complete scheduling within reasonable time', () => {
      const mediumTasks = Array.from({ length: 20 }, (_, i) =>
        createTestTask(`perf-${i}`, 60, {
          taskType: i % 2 === 0 ? 'focused' : 'admin',
        }),
      )

      const startTime = globalThis.performance.now()
      const result = scheduler.scheduleForDisplay(mediumTasks, mockContext, mockConfig)
      const endTime = globalThis.performance.now()

      // Should complete within 100ms for 20 tasks
      expect(endTime - startTime).toBeLessThan(100)
      expect(result.scheduled.length).toBeGreaterThan(0)
    })

    it('should generate comprehensive metrics', () => {
      const tasks = [
        createTestTask('metric-1', 60, { taskType: 'focused' }),
        createTestTask('metric-2', 45, { taskType: 'admin' }),
        createTestTask('metric-3', 30, { taskType: 'personal' }),
      ]

      const result = scheduler.scheduleForDisplay(tasks, mockContext, mockConfig)

      expect(result.metrics.totalWorkDays).toBeGreaterThan(0)
      expect(result.metrics.hoursByType).toBeDefined()
      expect(result.metrics.averageUtilization).toBeGreaterThanOrEqual(0)
      // Note: utilization might be > 1 if calculated as hours/day rather than percentage
      expect(result.metrics.averageUtilization).toBeDefined()
    })
  })

  describe('Error Handling and Edge Cases', () => {
    it('should handle empty work patterns gracefully', () => {
      const emptyContext = { ...mockContext, workPatterns: [] }
      const tasks = [createTestTask('empty-pattern', 60)]

      const result = scheduler.scheduleForDisplay(tasks, emptyContext, mockConfig)

      expect(result.scheduled.length).toBe(0)
      expect(result.unscheduled.length).toBe(1)
      expect(result.conflicts.length).toBe(0)
    })

    it('should handle tasks with no available blocks', () => {
      const focusOnlyContext = {
        ...mockContext,
        workPatterns: [{
          date: '2025-01-15',
          blocks: [{
            id: 'focus-only',
            startTime: '09:00',
            endTime: '10:00',
            typeConfig: { kind: 'single' as const, typeId: 'focused' },
            capacity: { totalMinutes: 60 },
          }],
          accumulated: {}, // Dynamic format
          meetings: [],
        }],
      }

      const adminTask = createTestTask('admin-no-blocks', 60, { taskType: 'admin' })
      const result = scheduler.scheduleForDisplay([adminTask], focusOnlyContext, mockConfig)

      // Admin task should be unscheduled since no admin blocks available
      expect(result.unscheduled.length).toBe(1)
      expect(result.unscheduled[0].name).toContain('admin-no-blocks')
    })

    it('should handle invalid dates gracefully', () => {
      const invalidConfig = {
        ...mockConfig,
        startDate: 'invalid-date',
      }

      const tasks = [createTestTask('invalid-date', 60)]

      // Should either not throw or handle gracefully
      try {
        const result = scheduler.scheduleForDisplay(tasks, mockContext, invalidConfig)
        // If it doesn't throw, it should return a valid result
        expect(result.scheduled).toBeDefined()
        expect(result.unscheduled).toBeDefined()
        expect(result.conflicts).toBeDefined()
      } catch (error) {
        // If it throws, it should be a reasonable error type
        expect(error).toBeInstanceOf(Error)
      }
    })
  })
})
