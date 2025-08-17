import { describe, it, expect, beforeEach } from 'vitest'
import { Task } from '@shared/types'
import { SequencedTask, TaskStep } from '@shared/sequencing-types'
import { TaskType } from '@shared/enums'
import {
  calculateDeadlinePressure,
  calculateAsyncUrgency,
  calculatePriority,
  scheduleWithDeadlines,
  SchedulingContext,
} from '../deadline-scheduler'

describe.skip('Deadline-Driven Scheduling (DEPRECATED - needs rewrite for unified scheduler)', () => {
  let context: SchedulingContext

  beforeEach(() => {
    const now = new Date('2024-01-15T09:00:00')
    context = {
      currentTime: now,
      workSettings: {
        defaultCapacity: {
          maxFocusHours: 4,
          maxAdminHours: 3,
        },
        defaultWorkHours: {
          startTime: '09:00',
          endTime: '18:00',
        },
        customWorkHours: {},
      } as any,
      tasks: [],
      workflows: [],
      workPatterns: [],
      productivityPatterns: [],
      schedulingPreferences: {
        allowWeekendWork: false,
        weekendPenalty: 0.5,
        contextSwitchPenalty: 15,
        asyncParallelizationBonus: 10,
      } as any,
      lastScheduledItem: null,
    }
  })

  describe('Deadline Pressure Calculation', () => {
    it('should calculate exponential pressure as deadline approaches', () => {
      const task: Task = {
        id: 'task-1',
        name: 'Test Task',
        importance: 5,
        urgency: 5,
        duration: 120, // 2 hours
        deadline: new Date('2024-01-20T17:00:00'), // 5 days away
        deadlineType: 'hard',
        completed: false,
        type: TaskType.Focused,
        asyncWaitTime: 0,
        dependencies: [],
        sessionId: 'test-session',
        createdAt: new Date(),
        updatedAt: new Date(),
        hasSteps: false,
        overallStatus: 'not_started',
        criticalPathDuration: 120,
        worstCaseDuration: 120,
      } as Task

      // 5 days slack (approximately)
      const pressure5Days = calculateDeadlinePressure(task, context)
      expect(pressure5Days).toBeGreaterThan(1)
      expect(pressure5Days).toBeLessThan(3)

      // 2 days slack
      context.currentTime = new Date('2024-01-18T09:00:00')
      const pressure2Days = calculateDeadlinePressure(task, context)
      expect(pressure2Days).toBeGreaterThan(3)
      expect(pressure2Days).toBeLessThan(10)

      // 0.5 days slack
      context.currentTime = new Date('2024-01-20T05:00:00')
      const pressure12Hours = calculateDeadlinePressure(task, context)
      expect(pressure12Hours).toBeGreaterThan(15)
      expect(pressure12Hours).toBeLessThan(50)

      // No slack (critical)
      context.currentTime = new Date('2024-01-20T15:00:00')
      const pressureCritical = calculateDeadlinePressure(task, context)
      expect(pressureCritical).toBe(1000)
    })

    it('should apply less pressure for soft deadlines', () => {
      const hardTask: Task = {
        id: 'hard-1',
        name: 'Hard Deadline Task',
        importance: 5,
        urgency: 5,
        duration: 120,
        deadline: new Date('2024-01-17T17:00:00'), // 2 days
        deadlineType: 'hard',
        completed: false,
        type: TaskType.Focused,
        asyncWaitTime: 0,
        dependencies: [],
        sessionId: 'test-session',
        createdAt: new Date(),
        updatedAt: new Date(),
        hasSteps: false,
        overallStatus: 'not_started',
        criticalPathDuration: 120,
        worstCaseDuration: 120,
      } as Task

      const softTask: Task = {
        ...hardTask,
        id: 'soft-1',
        name: 'Soft Deadline Task',
        deadlineType: 'soft',
      }

      const hardPressure = calculateDeadlinePressure(hardTask, context)
      const softPressure = calculateDeadlinePressure(softTask, context)

      expect(softPressure).toBeLessThan(hardPressure)
      expect(softPressure).toBeGreaterThan(1) // Still has some pressure
    })

    it('should consider critical path for workflows', () => {
      const workflow: SequencedTask = {
        id: 'wf-1',
        name: 'Complex Workflow',
        steps: [
          { id: 'step-1', taskId: 'wf-1', name: 'Step 1', duration: 60, status: 'completed', type: TaskType.Focused, asyncWaitTime: 0, dependsOn: [], stepIndex: 0, percentComplete: 100 },
          { id: 'step-2', taskId: 'wf-1', name: 'Step 2', duration: 120, status: 'pending', type: TaskType.Focused, asyncWaitTime: 0, dependsOn: [], stepIndex: 1, percentComplete: 0 },
          { id: 'step-3', taskId: 'wf-1', name: 'Step 3', duration: 180, status: 'pending', type: TaskType.Focused, asyncWaitTime: 0, dependsOn: ['step-2'], stepIndex: 2, percentComplete: 0 },
        ],
        deadline: new Date('2024-01-17T17:00:00'), // 2 days
        deadlineType: 'hard',
        importance: 5,
        urgency: 5,
        totalDuration: 360,
        overallStatus: 'in_progress',
        criticalPathDuration: 360,
        worstCaseDuration: 540,
        completed: false,
        type: TaskType.Focused,
        createdAt: new Date(),
        updatedAt: new Date(),
        sessionId: 'test-session',
      } as SequencedTask

      // Add workflow to context so steps can find their parent
      context.workflows = [workflow]

      // Should only count uncompleted steps (120 + 180 = 300 min = 5 hours)
      const pressure = calculateDeadlinePressure(workflow.steps[1], context)
      expect(pressure).toBeGreaterThan(1)
    })
  })

  describe('Async Urgency Calculation', () => {
    it('should prioritize async tasks with tight dependent work', () => {
      const asyncStep: TaskStep = {
        id: 'async-1',
        taskId: 'wf-1',
        name: 'Request Review',
        duration: 30,
        asyncWaitTime: 1440, // 24 hours
        isAsyncTrigger: true,
        type: TaskType.Focused,
        status: 'pending',
        dependsOn: [],
        stepIndex: 0,
        percentComplete: 0,
      }

      const dependentStep: TaskStep = {
        id: 'dep-1',
        taskId: 'wf-1',
        name: 'Address Feedback',
        duration: 600, // 10 hours of work
        dependsOn: ['async-1'],
        type: TaskType.Focused,
        status: 'pending',
        asyncWaitTime: 0,
        stepIndex: 1,
        percentComplete: 0,
      }

      context.workflows = [{
        id: 'wf-1',
        name: 'Review Process',
        steps: [asyncStep, dependentStep],
        deadline: new Date('2024-01-17T17:00:00'), // 48 hours away
        deadlineType: 'hard',
        importance: 5,
        urgency: 5,
        totalDuration: 630,
        overallStatus: 'not_started',
        criticalPathDuration: 630,
        worstCaseDuration: 945,
        completed: false,
        type: TaskType.Focused,
        createdAt: new Date(),
        updatedAt: new Date(),
        sessionId: 'test-session',
      } as SequencedTask]

      // Starting now: 24hr wait + 10hr work fits in 48hr
      const urgencyNow = calculateAsyncUrgency(asyncStep, context)
      expect(urgencyNow).toBeGreaterThan(10)
      expect(urgencyNow).toBeLessThan(50)

      // Starting in 24 hours: Very tight!
      context.currentTime = new Date('2024-01-16T09:00:00')
      const urgencyLater = calculateAsyncUrgency(asyncStep, context)
      expect(urgencyLater).toBeGreaterThan(100)
    })

    it('should give minimal urgency to async tasks without deadlines', () => {
      const asyncStep: TaskStep = {
        id: 'async-2',
        taskId: 'wf-2',
        name: 'Request Review',
        duration: 30,
        asyncWaitTime: 1440,
        isAsyncTrigger: true,
        type: TaskType.Focused,
        status: 'pending',
        dependsOn: [],
        stepIndex: 0,
        percentComplete: 0,
      }

      const urgency = calculateAsyncUrgency(asyncStep, context)
      expect(urgency).toBe(0)
    })

    it('should handle multiple async triggers in sequence', () => {
      const workflow: SequencedTask = {
        id: 'wf-2',
        name: 'Multi-Stage Review',
        steps: [
          { id: 'submit-1', taskId: 'wf-2', name: 'Submit 1', duration: 30, asyncWaitTime: 720, isAsyncTrigger: true, type: TaskType.Focused, status: 'pending', dependsOn: [], stepIndex: 0, percentComplete: 0 },
          { id: 'submit-2', taskId: 'wf-2', name: 'Submit 2', duration: 30, asyncWaitTime: 720, isAsyncTrigger: true, type: TaskType.Focused, status: 'pending', dependsOn: ['submit-1'], stepIndex: 1, percentComplete: 0 },
          { id: 'finalize', taskId: 'wf-2', name: 'Finalize', duration: 120, asyncWaitTime: 0, type: TaskType.Focused, status: 'pending', dependsOn: ['submit-2'], stepIndex: 2, percentComplete: 0 },
        ],
        deadline: new Date('2024-01-17T17:00:00'), // 48 hours
        deadlineType: 'hard',
        importance: 5,
        urgency: 5,
        totalDuration: 180,
        overallStatus: 'not_started',
        criticalPathDuration: 1620,
        worstCaseDuration: 2430,
        completed: false,
        type: TaskType.Focused,
        createdAt: new Date(),
        updatedAt: new Date(),
        sessionId: 'test-session',
      } as SequencedTask

      context.workflows = [workflow]

      // First async should have high urgency (needs 24hr total for both async waits)
      const urgency1 = calculateAsyncUrgency(workflow.steps[0], context)
      expect(urgency1).toBeGreaterThan(20)
    })
  })

  describe('Integrated Priority Calculation', () => {
    it('should balance Eisenhower score with deadline pressure', () => {
      const importantTask: Task = {
        id: 'important-1',
        name: 'Important No Deadline',
        importance: 9,
        urgency: 8,
        duration: 120,
        completed: false,
        type: TaskType.Focused,
        asyncWaitTime: 0,
        dependencies: [],
        sessionId: 'test-session',
        createdAt: new Date(),
        updatedAt: new Date(),
        hasSteps: false,
        overallStatus: 'not_started',
        criticalPathDuration: 120,
        worstCaseDuration: 120,
      } as Task

      const deadlineTask: Task = {
        id: 'deadline-1',
        name: 'Low Priority with Deadline',
        importance: 3,
        urgency: 2,
        duration: 60,
        deadline: new Date('2024-01-16T12:00:00'), // Tomorrow noon
        deadlineType: 'hard',
        completed: false,
        type: TaskType.Focused,
        asyncWaitTime: 0,
        dependencies: [],
        sessionId: 'test-session',
        createdAt: new Date(),
        updatedAt: new Date(),
        hasSteps: false,
        overallStatus: 'not_started',
        criticalPathDuration: 60,
        worstCaseDuration: 60,
      } as Task

      const importantPriority = calculatePriority(importantTask, context)
      const deadlinePriority = calculatePriority(deadlineTask, context)

      // Important task: 9 * 8 = 72
      expect(importantPriority).toBeCloseTo(72, 0)

      // Deadline task: 3 * 2 = 6, but with ~5x pressure = ~30
      expect(deadlinePriority).toBeGreaterThan(25)
      expect(deadlinePriority).toBeLessThan(40)

      // Important task should still win in this case
      expect(importantPriority).toBeGreaterThan(deadlinePriority)

      // But as deadline gets closer...
      context.currentTime = new Date('2024-01-16T08:00:00') // 4 hours before deadline
      const criticalDeadlinePriority = calculatePriority(deadlineTask, context)
      expect(criticalDeadlinePriority).toBeGreaterThan(importantPriority)
    })

    it('should boost async triggers appropriately', () => {
      const normalTask: Task = {
        id: 'normal-1',
        name: 'Regular Task',
        importance: 6,
        urgency: 6,
        duration: 120,
        completed: false,
        type: TaskType.Focused,
        asyncWaitTime: 0,
        dependencies: [],
        sessionId: 'test-session',
        createdAt: new Date(),
        updatedAt: new Date(),
        hasSteps: false,
        overallStatus: 'not_started',
        criticalPathDuration: 120,
        worstCaseDuration: 120,
      } as Task

      const asyncTask: Task = {
        id: 'async-1',
        name: 'Submit for Review',
        importance: 6,
        urgency: 6,
        duration: 30,
        asyncWaitTime: 1440,
        isAsyncTrigger: true,
        completed: false,
        type: TaskType.Focused,
        dependencies: [],
        sessionId: 'test-session',
        createdAt: new Date(),
        updatedAt: new Date(),
        hasSteps: false,
        overallStatus: 'not_started',
        criticalPathDuration: 30,
        worstCaseDuration: 30,
      } as Task

      // With dependent work and deadline
      context.workflows = [{
        id: 'wf-1',
        steps: [
          { ...asyncTask, id: 'step-1' },
          { id: 'step-2', duration: 480, dependsOn: ['step-1'] },
        ],
        deadline: new Date('2024-01-17T17:00:00'),
      }]

      const normalPriority = calculatePriority(normalTask, context)
      const asyncPriority = calculatePriority(asyncTask, context)

      // Async should get urgency bonus
      expect(asyncPriority).toBeGreaterThan(normalPriority)
    })
  })

  describe('Schedule Generation', () => {
    it('should detect impossible deadlines', () => {
      const task: Task = {
        id: 'impossible-1',
        name: 'Impossible Task',
        importance: 5,
        urgency: 5,
        duration: 600, // 10 hours
        deadline: new Date('2024-01-15T12:00:00'), // 3 hours from now
        deadlineType: 'hard',
        completed: false,
      }

      const result = scheduleWithDeadlines({ ...context, tasks: [task] })

      expect(result.failures).toHaveLength(1)
      expect(result.failures[0].type).toBe('impossible_deadline')
      expect(result.failures[0].suggestions.minimumDeadlineExtension).toBeGreaterThan(7)
    })

    it('should warn about soft deadline risks', () => {
      const task: Task = {
        id: 'soft-1',
        name: 'Soft Deadline Task',
        importance: 3,
        urgency: 3,
        duration: 240,
        deadline: new Date('2024-01-16T17:00:00'),
        deadlineType: 'soft',
        completed: false,
      }

      const higherPriorityTask: Task = {
        id: 'high-1',
        name: 'Higher Priority',
        importance: 8,
        urgency: 8,
        duration: 360,
        completed: false,
      }

      const result = scheduleWithDeadlines({
        ...context,
        tasks: [task, higherPriorityTask],
      })

      // Higher priority task should be scheduled first
      expect(result.schedule[0].id).toBe('high-1')

      // Should warn about soft deadline risk
      expect(result.warnings.some(w =>
        w.type === 'soft_deadline_risk' && w.item.id === 'soft-1',
      )).toBe(true)
    })

    it('should optimize async trigger timing', () => {
      const workflow: SequencedTask = {
        id: 'wf-1',
        name: 'Review Process',
        steps: [
          { id: 'prep', duration: 60, status: 'pending' },
          { id: 'submit', duration: 30, asyncWaitTime: 1440, isAsyncTrigger: true, dependsOn: ['prep'] },
          { id: 'address', duration: 240, dependsOn: ['submit'] },
          { id: 'deploy', duration: 60, dependsOn: ['address'] },
        ],
        deadline: new Date('2024-01-18T17:00:00'), // 3 days
        deadlineType: 'hard',
      }

      const result = scheduleWithDeadlines({
        ...context,
        workflows: [workflow],
      })

      // Should schedule async trigger early to maximize flexibility
      const submitStep = result.schedule.find(s => s.id === 'submit')
      const addressStep = result.schedule.find(s => s.id === 'address')

      expect(submitStep).toBeDefined()
      expect(addressStep).toBeDefined()

      // Address should be at least 24 hours after submit
      const timeDiff = addressStep!.startTime.getTime() - submitStep!.endTime.getTime()
      expect(timeDiff).toBeGreaterThanOrEqual(24 * 60 * 60 * 1000)
    })

    it('should respect cognitive load matching', () => {
      const complexTask: Task = {
        id: 'complex-1',
        name: 'Complex Analysis',
        importance: 7,
        urgency: 5,
        duration: 120,
        cognitiveComplexity: 5,
        completed: false,
      }

      const simpleTask: Task = {
        id: 'simple-1',
        name: 'Simple Update',
        importance: 7,
        urgency: 5,
        duration: 60,
        cognitiveComplexity: 1,
        completed: false,
      }

      context.productivityPatterns = [
        { timeRange: { start: '09:00', end: '12:00' }, cognitiveCapacity: 'peak' },
        { timeRange: { start: '13:00', end: '15:00' }, cognitiveCapacity: 'low' },
      ]

      const result = scheduleWithDeadlines({
        ...context,
        tasks: [complexTask, simpleTask],
      })

      const complexScheduled = result.schedule.find(s => s.id === 'complex-1')
      const simpleScheduled = result.schedule.find(s => s.id === 'simple-1')

      // Complex task should be in morning peak
      expect(complexScheduled!.startTime.getHours()).toBeGreaterThanOrEqual(9)
      expect(complexScheduled!.startTime.getHours()).toBeLessThan(12)

      // Simple task can be in afternoon
      expect(simpleScheduled!.startTime.getHours()).toBeGreaterThanOrEqual(13)
    })
  })

  describe('Failure Recovery Suggestions', () => {
    it('should suggest tasks to drop when overloaded', () => {
      const criticalTask: Task = {
        id: 'critical-1',
        name: 'Critical Delivery',
        importance: 10,
        urgency: 10,
        duration: 480, // 8 hours
        deadline: new Date('2024-01-16T17:00:00'),
        deadlineType: 'hard',
        completed: false,
      }

      const lowPriorityTasks: Task[] = [
        { id: 'low-1', name: 'Nice to have 1', importance: 2, urgency: 3, duration: 120 },
        { id: 'low-2', name: 'Nice to have 2', importance: 3, urgency: 2, duration: 180 },
        { id: 'low-3', name: 'Nice to have 3', importance: 4, urgency: 3, duration: 240 },
      ]

      const result = scheduleWithDeadlines({
        ...context,
        tasks: [criticalTask, ...lowPriorityTasks],
        workSettings: {
          defaultCapacity: {
            maxFocusHours: 4, // Only 4 hours per day
            maxAdminHours: 0,
          },
        },
      })

      // Should suggest dropping low priority tasks
      expect(result.failures[0].suggestions.tasksToDropOrDefer).toContain('low-1')
      expect(result.failures[0].suggestions.tasksToDropOrDefer).toContain('low-2')
    })

    it('should calculate minimum deadline extension needed', () => {
      const task: Task = {
        id: 'extend-1',
        name: 'Needs Extension',
        importance: 8,
        urgency: 8,
        duration: 600, // 10 hours
        deadline: new Date('2024-01-16T09:00:00'), // Tomorrow 9am (24 hours)
        deadlineType: 'hard',
        completed: false,
      }

      context.workSettings.defaultCapacity = {
        maxFocusHours: 4,
        maxAdminHours: 0,
      }

      const result = scheduleWithDeadlines({ ...context, tasks: [task] })

      // Needs 10 hours, have 4 hours today, 4 tomorrow = 8 total
      // Need at least 2 more hours = half a day more
      expect(result.failures[0].suggestions.minimumDeadlineExtension).toBeGreaterThanOrEqual(12)
    })
  })
})
