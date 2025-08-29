import { describe, it, expect } from 'vitest'
import { generateOptimalSchedule, OptimalScheduleConfig } from '../optimal-scheduler'
import { Task } from '@shared/types'
import { SequencedTask } from '@shared/sequencing-types'
import { TaskType } from '@shared/enums'

describe('Optimal Scheduler', () => {
  const createTask = (overrides: Partial<Task>): Task => ({
    id: `task-${Math.random()}`,
    name: 'Test Task',
    importance: 5,
    urgency: 5,
    type: TaskType.Focused,
    duration: 60,
    completed: false,
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

  const createWorkflow = (overrides: Partial<SequencedTask>): SequencedTask => ({
    id: `workflow-${Math.random()}`,
    name: 'Test Workflow',
    type: TaskType.Focused,
    importance: 5,
    urgency: 5,
    completed: false,
    steps: [],
    dependencies: [],
    sessionId: 'test-session',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  })

  describe('Basic Scheduling', () => {
    it('should schedule a simple task immediately', () => {
      const startTime = new Date('2025-09-08T08:00:00') // Monday 8am
      const config: OptimalScheduleConfig = {
        sleepStart: '23:00',
        sleepEnd: '07:00',
        meetings: [],
      }

      const task = createTask({
        name: 'Simple Task',
        duration: 60,
      })

      const result = generateOptimalSchedule([task], [], startTime, config)

      expect(result.schedule.length).toBe(1)
      expect(result.schedule[0].name).toBe('Simple Task')
      expect(result.schedule[0].startTime).toEqual(startTime)
      expect(result.schedule[0].endTime).toEqual(new Date('2025-09-08T09:00:00'))
      expect(result.metrics.totalDuration).toBe(60)
      expect(result.metrics.activeWorkTime).toBe(60)
    })

    it('should respect sleep hours', () => {
      const startTime = new Date('2025-09-08T22:00:00') // Monday 10pm
      const config: OptimalScheduleConfig = {
        sleepStart: '23:00',
        sleepEnd: '07:00',
        meetings: [],
      }

      const task = createTask({
        name: 'Late Night Task',
        duration: 120, // 2 hours - would go past 11pm
      })

      const result = generateOptimalSchedule([task], [], startTime, config)

      expect(result.schedule.length).toBe(1)
      // Should schedule from 10pm to midnight (can't go past 11pm sleep start)
      // Or should schedule the next morning at 7am
      const scheduledStart = result.schedule[0].startTime
      const hour = scheduledStart.getHours()

      // Either starts at 10pm and stops at 11pm, or starts at 7am next day
      expect(hour === 22 || hour === 7).toBe(true)
    })

    it('should handle meetings as blocked time', () => {
      const startTime = new Date('2025-09-08T08:00:00') // Monday 8am
      const config: OptimalScheduleConfig = {
        sleepStart: '23:00',
        sleepEnd: '07:00',
        meetings: [{
          id: 'meeting-1',
          title: 'Team Standup',
          startTime: new Date('2025-09-08T09:00:00'),
          endTime: new Date('2025-09-08T09:30:00'),
          date: '2025-09-08',
        }],
      }

      const tasks = [
        createTask({ name: 'Before Meeting', duration: 60 }),
        createTask({ name: 'After Meeting', duration: 60 }),
      ]

      const result = generateOptimalSchedule(tasks, [], startTime, config)

      // Should have scheduled both tasks
      expect(result.schedule.length).toBeGreaterThanOrEqual(2)

      // Find the actual tasks (not async waits)
      const actualTasks = result.schedule.filter(s => s.type !== 'async-wait')
      expect(actualTasks.length).toBe(2)

      // Check that tasks don't overlap with meeting
      actualTasks.forEach(task => {
        const taskOverlapsMeeting = !(
          task.endTime <= config.meetings[0].startTime ||
          task.startTime >= config.meetings[0].endTime
        )
        expect(taskOverlapsMeeting).toBe(false)
      })
    })
  })

  describe('Deadline Optimization', () => {
    it('should prioritize tasks with earlier deadlines', () => {
      const startTime = new Date('2025-09-08T08:00:00')
      const config: OptimalScheduleConfig = {
        sleepStart: '23:00',
        sleepEnd: '07:00',
        meetings: [],
      }

      const tasks = [
        createTask({
          name: 'Later Deadline',
          duration: 60,
          deadline: new Date('2025-09-10T17:00:00'), // Wednesday
        }),
        createTask({
          name: 'Earlier Deadline',
          duration: 60,
          deadline: new Date('2025-09-08T17:00:00'), // Monday (today)
        }),
        createTask({
          name: 'No Deadline',
          duration: 60,
        }),
      ]

      const result = generateOptimalSchedule(tasks, [], startTime, config)

      expect(result.schedule[0].name).toBe('Earlier Deadline')
      expect(result.schedule[1].name).toBe('Later Deadline')
      expect(result.schedule[2].name).toBe('No Deadline')
    })

    it('should meet urgent deadlines even if it means working late', () => {
      const startTime = new Date('2025-09-08T20:00:00') // Monday 8pm
      const config: OptimalScheduleConfig = {
        sleepStart: '23:00',
        sleepEnd: '07:00',
        meetings: [],
      }

      const task = createTask({
        name: 'Urgent Task',
        duration: 180, // 3 hours
        deadline: new Date('2025-09-08T23:00:00'), // Must finish by 11pm
        deadlineType: 'hard',
      })

      const result = generateOptimalSchedule([task], [], startTime, config)

      expect(result.schedule.length).toBeGreaterThan(0)
      const lastItem = result.schedule[result.schedule.length - 1]
      expect(lastItem.endTime.getTime()).toBeLessThanOrEqual(task.deadline!.getTime())
      expect(result.metrics.deadlinesMet).toBe(1)
      expect(result.metrics.deadlinesMissed).toBe(0)
    })
  })

  describe('Async Work Optimization', () => {
    it('should start async triggers early to maximize parallelization', () => {
      const startTime = new Date('2025-09-08T08:00:00')
      const config: OptimalScheduleConfig = {
        sleepStart: '23:00',
        sleepEnd: '07:00',
        meetings: [],
      }

      const tasks = [
        createTask({
          name: 'Regular Task',
          duration: 60,
        }),
        createTask({
          name: 'Async Trigger',
          duration: 30,
          isAsyncTrigger: true,
          asyncWaitTime: 120, // 2 hour wait
        }),
        createTask({
          name: 'Another Task',
          duration: 60,
        }),
      ]

      const result = generateOptimalSchedule(tasks, [], startTime, config)

      // Async trigger should be scheduled first to start the wait time
      expect(result.schedule[0].name).toBe('Async Trigger')

      // Should have async wait item
      const asyncWait = result.schedule.find(item => item.type === 'async-wait')
      expect(asyncWait).toBeDefined()
      expect(asyncWait?.name).toContain('Waiting')

      // Other tasks should be scheduled during the wait time
      expect(result.metrics.asyncParallelTime).toBeGreaterThan(0)
    })
  })

  describe('Break Management', () => {
    it('should insert breaks after continuous work', () => {
      const startTime = new Date('2025-09-08T08:00:00')
      const config: OptimalScheduleConfig = {
        sleepStart: '23:00',
        sleepEnd: '07:00',
        meetings: [],
        maxContinuousWork: 180, // 3 hours
        preferredBreakDuration: 15,
      }

      const tasks = [
        createTask({ name: 'Task 1', duration: 120 }),
        createTask({ name: 'Task 2', duration: 120 }),
        createTask({ name: 'Task 3', duration: 60 }),
      ]

      const result = generateOptimalSchedule(tasks, [], startTime, config)

      // Should have break blocks
      const breakBlocks = result.blocks.filter(b => b.type === 'break')
      expect(breakBlocks.length).toBeGreaterThan(0)

      // First break should be after 3 hours of work
      const firstBreak = breakBlocks[0]
      expect(firstBreak).toBeDefined()
    })
  })

  describe('Dependency Handling', () => {
    it('should respect task dependencies', () => {
      const startTime = new Date('2025-09-08T08:00:00')
      const config: OptimalScheduleConfig = {
        sleepStart: '23:00',
        sleepEnd: '07:00',
        meetings: [],
      }

      const task1 = createTask({ id: 'task-1', name: 'First Task', duration: 60 })
      const task2 = createTask({
        id: 'task-2',
        name: 'Dependent Task',
        duration: 60,
        dependencies: ['task-1'],
      })
      const task3 = createTask({ id: 'task-3', name: 'Independent Task', duration: 60 })

      const result = generateOptimalSchedule([task2, task3, task1], [], startTime, config)

      // First task should come before dependent task
      const firstIndex = result.schedule.findIndex(s => s.name === 'First Task')
      const dependentIndex = result.schedule.findIndex(s => s.name === 'Dependent Task')

      expect(firstIndex).toBeLessThan(dependentIndex)

      // Independent task can be scheduled anytime
      const independentIndex = result.schedule.findIndex(s => s.name === 'Independent Task')
      expect(independentIndex).toBeGreaterThanOrEqual(0)
    })

    it('should handle workflow step dependencies', () => {
      const startTime = new Date('2025-09-08T08:00:00')
      const config: OptimalScheduleConfig = {
        sleepStart: '23:00',
        sleepEnd: '07:00',
        meetings: [],
      }

      const workflow = createWorkflow({
        name: 'Test Workflow',
        steps: [
          {
            id: 'step-1',
            name: 'Step 1',
            duration: 30,
            description: 'First step',
            status: 'not_started',
          },
          {
            id: 'step-2',
            name: 'Step 2',
            duration: 30,
            description: 'Second step',
            dependsOn: ['step-1'],
            status: 'not_started',
          },
          {
            id: 'step-3',
            name: 'Step 3',
            duration: 30,
            description: 'Third step',
            dependsOn: ['step-2'],
            status: 'not_started',
          },
        ],
      })

      const result = generateOptimalSchedule([], [workflow], startTime, config)

      expect(result.schedule.length).toBe(3)
      expect(result.schedule[0].name).toContain('Step 1')
      expect(result.schedule[1].name).toContain('Step 2')
      expect(result.schedule[2].name).toContain('Step 3')
    })
  })

  describe('Critical Path Analysis', () => {
    it('should prioritize tasks on the critical path', () => {
      const startTime = new Date('2025-09-08T08:00:00')
      const config: OptimalScheduleConfig = {
        sleepStart: '23:00',
        sleepEnd: '07:00',
        meetings: [],
      }

      // Create a dependency chain that forms a critical path
      const task1 = createTask({ id: 'task-1', name: 'Critical 1', duration: 60 })
      const task2 = createTask({
        id: 'task-2',
        name: 'Critical 2',
        duration: 60,
        dependencies: ['task-1'],
      })
      const task3 = createTask({
        id: 'task-3',
        name: 'Critical 3',
        duration: 60,
        dependencies: ['task-2'],
        deadline: new Date('2025-09-08T12:00:00'), // Noon deadline
      })
      const task4 = createTask({
        id: 'task-4',
        name: 'Side Task',
        duration: 30,
      })

      const result = generateOptimalSchedule([task4, task3, task2, task1], [], startTime, config)

      // Critical path tasks should be scheduled in order
      const indices = [
        result.schedule.findIndex(s => s.name === 'Critical 1'),
        result.schedule.findIndex(s => s.name === 'Critical 2'),
        result.schedule.findIndex(s => s.name === 'Critical 3'),
      ]

      expect(indices[0]).toBeLessThan(indices[1])
      expect(indices[1]).toBeLessThan(indices[2])

      // Should meet the deadline
      const critical3 = result.schedule.find(s => s.name === 'Critical 3')
      expect(critical3?.endTime.getTime()).toBeLessThanOrEqual(task3.deadline!.getTime())
    })
  })

  describe('Edge Cases', () => {
    it('should handle empty task list', () => {
      const startTime = new Date('2025-09-08T08:00:00')
      const config: OptimalScheduleConfig = {
        sleepStart: '23:00',
        sleepEnd: '07:00',
        meetings: [],
      }

      const result = generateOptimalSchedule([], [], startTime, config)

      expect(result.schedule.length).toBe(0)
      expect(result.blocks.length).toBe(0)
      expect(result.metrics.totalDuration).toBe(0)
    })

    it('should handle impossible deadlines gracefully', () => {
      const startTime = new Date('2025-09-08T08:00:00')
      const config: OptimalScheduleConfig = {
        sleepStart: '23:00',
        sleepEnd: '07:00',
        meetings: [],
      }

      const task = createTask({
        name: 'Impossible Task',
        duration: 120, // 2 hours
        deadline: new Date('2025-09-08T08:30:00'), // Only 30 minutes available
      })

      const result = generateOptimalSchedule([task], [], startTime, config)

      expect(result.schedule.length).toBe(1)
      expect(result.metrics.deadlinesMissed).toBe(1)
      expect(result.warnings.length).toBeGreaterThan(0)
      expect(result.warnings[0]).toContain('miss deadline')
    })

    it('should handle tasks with missing dependencies', () => {
      const startTime = new Date('2025-09-08T08:00:00')
      const config: OptimalScheduleConfig = {
        sleepStart: '23:00',
        sleepEnd: '07:00',
        meetings: [],
      }

      const task = createTask({
        name: 'Orphaned Task',
        duration: 60,
        dependencies: ['non-existent-task'],
      })

      const result = generateOptimalSchedule([task], [], startTime, config)

      // Task with missing dependency won't be scheduled
      expect(result.schedule.length).toBe(0)
      expect(result.warnings.length).toBeGreaterThan(0)
      expect(result.warnings[0]).toContain('check dependencies')
    })
  })
})
