import { describe, it, expect } from 'vitest'
import {
  calculateDeadlinePressure,
  calculateAsyncUrgency,
  calculateCognitiveMatch,
  calculatePriorityWithBreakdown,
} from '../scheduler-priority'
import type { Task, TaskStep } from '../types'
import type { ScheduleContext } from '../unified-scheduler'

// Helper to create minimal task
function createTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    name: 'Test Task',
    duration: 60,
    type: 'task',
    status: 'not_started',
    importance: 5,
    urgency: 5,
    cognitiveComplexity: 3,
    ...overrides,
  } as Task
}

// Helper to create minimal context
function createContext(overrides: Partial<ScheduleContext> = {}): ScheduleContext {
  return {
    tasks: [],
    workflows: [],
    workBlocks: [],
    currentTime: new Date('2025-01-15T10:00:00Z'),
    schedulingHorizon: 7,
    productivityPatterns: [],
    ...overrides,
  } as ScheduleContext
}

describe('scheduler-priority', () => {
  describe('calculateDeadlinePressure', () => {
    it('should return 1 for task with no deadline', () => {
      const task = createTask({ deadline: undefined })
      const context = createContext()

      const result = calculateDeadlinePressure(task, context)
      expect(result).toBe(1)
    })

    it('should return 10 for hard deadline that has passed', () => {
      const pastDeadline = new Date('2025-01-15T08:00:00Z') // 2 hours before currentTime
      const task = createTask({
        deadline: pastDeadline,
        deadlineType: 'hard',
      })
      const context = createContext()

      const result = calculateDeadlinePressure(task, context)
      expect(result).toBe(10)
    })

    it('should return 5 for soft deadline that has passed', () => {
      const pastDeadline = new Date('2025-01-15T08:00:00Z')
      const task = createTask({
        deadline: pastDeadline,
        deadlineType: 'soft',
      })
      const context = createContext()

      const result = calculateDeadlinePressure(task, context)
      expect(result).toBe(5)
    })

    it('should return 8 for hard deadline less than 4 hours away', () => {
      const deadline = new Date('2025-01-15T13:00:00Z') // 3 hours from currentTime
      const task = createTask({
        deadline,
        deadlineType: 'hard',
      })
      const context = createContext()

      const result = calculateDeadlinePressure(task, context)
      expect(result).toBe(8)
    })

    it('should return 5 for hard deadline 4-8 hours away', () => {
      const deadline = new Date('2025-01-15T16:00:00Z') // 6 hours from currentTime
      const task = createTask({
        deadline,
        deadlineType: 'hard',
      })
      const context = createContext()

      const result = calculateDeadlinePressure(task, context)
      expect(result).toBe(5)
    })

    it('should return 3 for hard deadline 8-24 hours away', () => {
      const deadline = new Date('2025-01-16T00:00:00Z') // 14 hours from currentTime
      const task = createTask({
        deadline,
        deadlineType: 'hard',
      })
      const context = createContext()

      const result = calculateDeadlinePressure(task, context)
      expect(result).toBe(3)
    })

    it('should return 2 for hard deadline 24-48 hours away', () => {
      const deadline = new Date('2025-01-17T00:00:00Z') // 38 hours from currentTime
      const task = createTask({
        deadline,
        deadlineType: 'hard',
      })
      const context = createContext()

      const result = calculateDeadlinePressure(task, context)
      expect(result).toBe(2)
    })

    it('should return 1.5 for hard deadline 48-72 hours away', () => {
      const deadline = new Date('2025-01-18T00:00:00Z') // 62 hours from currentTime
      const task = createTask({
        deadline,
        deadlineType: 'hard',
      })
      const context = createContext()

      const result = calculateDeadlinePressure(task, context)
      expect(result).toBe(1.5)
    })

    it('should return 1.2 for hard deadline more than 72 hours away', () => {
      const deadline = new Date('2025-01-20T00:00:00Z') // 110 hours from currentTime
      const task = createTask({
        deadline,
        deadlineType: 'hard',
      })
      const context = createContext()

      const result = calculateDeadlinePressure(task, context)
      expect(result).toBe(1.2)
    })

    it('should return 3 for soft deadline less than 8 hours away', () => {
      const deadline = new Date('2025-01-15T16:00:00Z') // 6 hours from currentTime
      const task = createTask({
        deadline,
        deadlineType: 'soft',
      })
      const context = createContext()

      const result = calculateDeadlinePressure(task, context)
      expect(result).toBe(3)
    })

    it('should return 2 for soft deadline 8-24 hours away', () => {
      const deadline = new Date('2025-01-16T00:00:00Z') // 14 hours from currentTime
      const task = createTask({
        deadline,
        deadlineType: 'soft',
      })
      const context = createContext()

      const result = calculateDeadlinePressure(task, context)
      expect(result).toBe(2)
    })

    it('should return 1.5 for soft deadline 24-48 hours away', () => {
      const deadline = new Date('2025-01-17T00:00:00Z') // 38 hours from currentTime
      const task = createTask({
        deadline,
        deadlineType: 'soft',
      })
      const context = createContext()

      const result = calculateDeadlinePressure(task, context)
      expect(result).toBe(1.5)
    })

    it('should return 1.2 for soft deadline 48-72 hours away', () => {
      const deadline = new Date('2025-01-18T00:00:00Z') // 62 hours from currentTime
      const task = createTask({
        deadline,
        deadlineType: 'soft',
      })
      const context = createContext()

      const result = calculateDeadlinePressure(task, context)
      expect(result).toBe(1.2)
    })

    it('should return 1 for soft deadline more than 72 hours away', () => {
      const deadline = new Date('2025-01-20T00:00:00Z') // 110 hours from currentTime
      const task = createTask({
        deadline,
        deadlineType: 'soft',
      })
      const context = createContext()

      const result = calculateDeadlinePressure(task, context)
      expect(result).toBe(1)
    })
  })

  describe('calculateAsyncUrgency', () => {
    it('should return 0 for task with no async wait time', () => {
      const task = createTask({ asyncWaitTime: undefined })
      const context = createContext()

      const result = calculateAsyncUrgency(task, context)
      expect(result).toBe(0)
    })

    it('should return 0 for task with zero async wait time', () => {
      const task = createTask({ asyncWaitTime: 0 })
      const context = createContext()

      const result = calculateAsyncUrgency(task, context)
      expect(result).toBe(0)
    })

    it('should return 0 for task with negative async wait time', () => {
      const task = createTask({ asyncWaitTime: -30 })
      const context = createContext()

      const result = calculateAsyncUrgency(task, context)
      expect(result).toBe(0)
    })

    it('should return 10 for 1 hour async wait', () => {
      const task = createTask({ asyncWaitTime: 60 }) // 60 minutes = 1 hour
      const context = createContext()

      const result = calculateAsyncUrgency(task, context)
      expect(result).toBe(10)
    })

    it('should return 20 for 2 hour async wait', () => {
      const task = createTask({ asyncWaitTime: 120 }) // 120 minutes = 2 hours
      const context = createContext()

      const result = calculateAsyncUrgency(task, context)
      expect(result).toBe(20)
    })

    it('should cap at 50 for very long async wait', () => {
      const task = createTask({ asyncWaitTime: 600 }) // 10 hours = would be 100, capped at 50
      const context = createContext()

      const result = calculateAsyncUrgency(task, context)
      expect(result).toBe(50)
    })

    it('should handle fractional hours', () => {
      const task = createTask({ asyncWaitTime: 90 }) // 90 minutes = 1.5 hours = 15 points
      const context = createContext()

      const result = calculateAsyncUrgency(task, context)
      expect(result).toBe(15)
    })
  })

  describe('calculateCognitiveMatch', () => {
    it('should return 1.2 for perfect match (complexity 3, moderate capacity)', () => {
      const task = createTask({ cognitiveComplexity: 3 })
      const currentTime = new Date('2025-01-15T10:00:00Z')
      const context = createContext({ productivityPatterns: [] }) // Empty patterns = moderate

      const result = calculateCognitiveMatch(task, currentTime, context)
      expect(result).toBe(1.2)
    })

    it('should return 1.0 for one level off', () => {
      const task = createTask({ cognitiveComplexity: 4 }) // 4 vs moderate (3) = 1 level off
      const currentTime = new Date('2025-01-15T10:00:00Z')
      const context = createContext({ productivityPatterns: [] })

      const result = calculateCognitiveMatch(task, currentTime, context)
      expect(result).toBe(1.0)
    })

    it('should return 0.9 for two levels off', () => {
      const task = createTask({ cognitiveComplexity: 5 }) // 5 vs moderate (3) = 2 levels off
      const currentTime = new Date('2025-01-15T10:00:00Z')
      const context = createContext({ productivityPatterns: [] })

      const result = calculateCognitiveMatch(task, currentTime, context)
      expect(result).toBe(0.9)
    })

    it('should return 0.8 for three or more levels off', () => {
      const task = createTask({ cognitiveComplexity: 1 }) // 1 vs moderate (3) = 2 levels - let's try extreme
      const currentTime = new Date('2025-01-15T10:00:00Z')
      // Need a task with very different complexity from capacity
      const highComplexityTask = createTask({ cognitiveComplexity: 5 })
      const contextWithLowCapacity = createContext({
        productivityPatterns: [
          {
            timeRangeStart: '00:00',
            timeRangeEnd: '23:59',
            cognitiveCapacity: 'low' as const, // low = 2
          },
        ],
      })

      // complexity 5 vs capacity 2 (low) = 3 levels off
      const result = calculateCognitiveMatch(highComplexityTask, currentTime, contextWithLowCapacity)
      expect(result).toBe(0.8)
    })

    it('should use default complexity of 3 when not specified', () => {
      const task = createTask({ cognitiveComplexity: undefined })
      const currentTime = new Date('2025-01-15T10:00:00Z')
      const context = createContext({ productivityPatterns: [] })

      // Default complexity 3 vs moderate capacity 3 = perfect match
      const result = calculateCognitiveMatch(task, currentTime, context)
      expect(result).toBe(1.2)
    })

    it('should handle high capacity productivity pattern', () => {
      const task = createTask({ cognitiveComplexity: 4 })
      const currentTime = new Date('2025-01-15T10:00:00Z')
      const context = createContext({
        productivityPatterns: [
          {
            timeRangeStart: '00:00',
            timeRangeEnd: '23:59',
            cognitiveCapacity: 'high' as const, // high = 4
          },
        ],
      })

      // complexity 4 vs high capacity 4 = perfect match
      const result = calculateCognitiveMatch(task, currentTime, context)
      expect(result).toBe(1.2)
    })

    it('should handle patterns without time ranges', () => {
      const task = createTask({ cognitiveComplexity: 3 })
      const currentTime = new Date('2025-01-15T10:00:00Z')
      const context = createContext({
        productivityPatterns: [
          {
            // No timeRangeStart/End - should be skipped
            cognitiveCapacity: 'peak' as const,
          },
        ],
      })

      // Falls back to moderate (3) since pattern has no time range
      // complexity 3 vs moderate 3 = perfect match
      const result = calculateCognitiveMatch(task, currentTime, context)
      expect(result).toBe(1.2)
    })
  })

  describe('calculatePriorityWithBreakdown', () => {
    // Helper to create TaskStep
    function createStep(overrides: Partial<TaskStep> = {}): TaskStep {
      return {
        id: 'step-1',
        name: 'Test Step',
        duration: 30,
        status: 'not_started',
        taskId: 'workflow-1',
        order: 1,
        ...overrides,
      } as TaskStep
    }

    it('should calculate priority for a basic task', () => {
      const task = createTask({ importance: 7, urgency: 8 })
      const context = createContext()

      const result = calculatePriorityWithBreakdown(task, context)

      expect(result.total).toBeGreaterThan(0)
      expect(result.eisenhower).toBe(56) // 7 * 8
    })

    it('should use step-specific importance when provided', () => {
      // Step without urgency as number - forces else branch
      const step = {
        id: 'step-1',
        name: 'Test Step',
        duration: 30,
        status: 'not_started',
        taskId: 'workflow-1',
        order: 1,
        importance: 9, // Step-specific override
        // No urgency - will use workflow's urgency
      } as TaskStep
      const context = createContext({
        workflows: [
          {
            id: 'workflow-1',
            name: 'Test Workflow',
            importance: 5,
            urgency: 7,
            steps: [step],
          } as any,
        ],
      })

      const result = calculatePriorityWithBreakdown(step, context)

      // Step importance 9 overrides workflow's 5, urgency 7 from workflow
      expect(result.eisenhower).toBe(63) // 9 * 7
    })

    it('should use step-specific urgency when provided', () => {
      // Step without importance as number - forces else branch
      const step = {
        id: 'step-1',
        name: 'Test Step',
        duration: 30,
        status: 'not_started',
        taskId: 'workflow-1',
        order: 1,
        urgency: 10, // Step-specific override
        // No importance - will use workflow's importance
      } as TaskStep
      const context = createContext({
        workflows: [
          {
            id: 'workflow-1',
            name: 'Test Workflow',
            importance: 8,
            urgency: 5,
            steps: [step],
          } as any,
        ],
      })

      const result = calculatePriorityWithBreakdown(step, context)

      // Importance 8 from workflow, step urgency 10 overrides workflow's 5
      expect(result.eisenhower).toBe(80) // 8 * 10
    })

    it('should apply context switch penalty for different workflows', () => {
      // Step without both importance AND urgency as numbers to hit else branch
      const step = {
        id: 'step-1',
        name: 'Test Step',
        duration: 30,
        status: 'not_started',
        taskId: 'workflow-2',
        order: 1,
      } as TaskStep
      const lastStep = {
        id: 'last-step',
        name: 'Last Step',
        duration: 30,
        status: 'not_started',
        taskId: 'workflow-1', // Different workflow
        order: 1,
      } as TaskStep
      const context = createContext({
        lastScheduledItem: {
          originalItem: lastStep,
        } as any,
        schedulingPreferences: {
          contextSwitchPenalty: 10,
        } as any,
      })

      const result = calculatePriorityWithBreakdown(step, context)

      expect(result.contextSwitchPenalty).toBe(-10)
    })

    it('should apply context switch penalty for different projects', () => {
      const task = createTask({
        projectId: 'project-2',
        importance: 5,
        urgency: 5,
      })
      const lastTask = createTask({
        id: 'last-task',
        projectId: 'project-1', // Different project
      })
      const context = createContext({
        lastScheduledItem: {
          originalItem: lastTask,
        } as any,
        schedulingPreferences: {
          contextSwitchPenalty: 15,
        } as any,
      })

      const result = calculatePriorityWithBreakdown(task, context)

      expect(result.contextSwitchPenalty).toBe(-15)
    })

    it('should use default context switch penalty when not specified', () => {
      // Step without both importance AND urgency as numbers to hit else branch
      const step = {
        id: 'step-1',
        name: 'Test Step',
        duration: 30,
        status: 'not_started',
        taskId: 'workflow-2',
        order: 1,
      } as TaskStep
      const lastStep = {
        id: 'last-step',
        name: 'Last Step',
        duration: 30,
        status: 'not_started',
        taskId: 'workflow-1',
        order: 1,
      } as TaskStep
      const context = createContext({
        lastScheduledItem: {
          originalItem: lastStep,
        } as any,
        // No schedulingPreferences - should use default of 5
      })

      const result = calculatePriorityWithBreakdown(step, context)

      expect(result.contextSwitchPenalty).toBe(-5)
    })

    it('should find containing workflow when parent lookup fails', () => {
      // Step with taskId pointing to non-existent workflow, but contained in another
      const step = {
        id: 'orphan-step',
        name: 'Orphan Step',
        duration: 30,
        status: 'not_started',
        taskId: 'non-existent-workflow', // This workflow doesn't exist
        order: 1,
      } as TaskStep
      const context = createContext({
        workflows: [
          {
            id: 'actual-workflow',
            name: 'Actual Workflow',
            importance: 8,
            urgency: 7,
            steps: [{ id: 'orphan-step', name: 'Step', duration: 30 }],
          } as any,
        ],
      })

      const result = calculatePriorityWithBreakdown(step, context)

      // Should find workflow containing this step and use its importance/urgency
      expect(result.eisenhower).toBe(56) // 8 * 7
    })
  })
})
