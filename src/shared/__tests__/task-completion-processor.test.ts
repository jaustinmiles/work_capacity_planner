import { processCompletion } from '../task-completion-processor'
import { TaskStatus, StepStatus } from '../enums'
import { Task, TaskStep } from '../types'

const makeTask = (overrides: Partial<Task> = {}): Task => ({
  id: 'task-1',
  name: 'Test Task',
  duration: 60,
  importance: 5,
  urgency: 5,
  asyncWaitTime: 0,
  dependencies: [],
  completed: false,
  status: 'not_started',
  taskType: 'focused',
  cognitiveComplexity: 3,
  createdAt: new Date('2025-01-15T08:00:00Z'),
  notes: '',
  ...overrides,
})

const makeStep = (overrides: Partial<TaskStep> = {}): TaskStep => ({
  id: 'step-1',
  name: 'Test Step',
  duration: 30,
  type: 'focused',
  taskId: 'task-1',
  dependsOn: [],
  asyncWaitTime: 0,
  status: StepStatus.InProgress,
  stepIndex: 0,
  percentComplete: 0,
  ...overrides,
})

describe('processCompletion', () => {
  const fixedTime = new Date('2025-01-15T10:00:00Z')

  describe('task completion', () => {
    it('should return completed when task has no asyncWaitTime', () => {
      const result = processCompletion({
        entityType: 'task',
        entityId: 'task-1',
        task: makeTask({ asyncWaitTime: 0 }),
        completedAt: fixedTime,
      })

      expect(result.finalStatus).toBe(TaskStatus.Completed)
      expect(result.shouldStartTimer).toBe(false)
      expect(result.asyncWaitMinutes).toBe(0)
      expect(result.completedAt).toEqual(fixedTime)
    })

    it('should return waiting when task has asyncWaitTime > 0', () => {
      const result = processCompletion({
        entityType: 'task',
        entityId: 'task-1',
        task: makeTask({ asyncWaitTime: 30 }),
        completedAt: fixedTime,
      })

      expect(result.finalStatus).toBe(TaskStatus.Waiting)
      expect(result.shouldStartTimer).toBe(true)
      expect(result.asyncWaitMinutes).toBe(30)
      expect(result.completedAt).toEqual(fixedTime)
    })

    it('should treat undefined asyncWaitTime as 0', () => {
      const task = makeTask()
      delete (task as any).asyncWaitTime
      const result = processCompletion({
        entityType: 'task',
        entityId: 'task-1',
        task,
        completedAt: fixedTime,
      })

      expect(result.finalStatus).toBe(TaskStatus.Completed)
      expect(result.shouldStartTimer).toBe(false)
    })
  })

  describe('step completion', () => {
    it('should return completed when step has no asyncWaitTime', () => {
      const result = processCompletion({
        entityType: 'step',
        entityId: 'step-1',
        step: makeStep({ asyncWaitTime: 0 }),
        completedAt: fixedTime,
      })

      expect(result.finalStatus).toBe(TaskStatus.Completed)
      expect(result.shouldStartTimer).toBe(false)
      expect(result.asyncWaitMinutes).toBe(0)
    })

    it('should return waiting when step has asyncWaitTime > 0', () => {
      const result = processCompletion({
        entityType: 'step',
        entityId: 'step-1',
        step: makeStep({ asyncWaitTime: 15 }),
        completedAt: fixedTime,
      })

      expect(result.finalStatus).toBe(TaskStatus.Waiting)
      expect(result.shouldStartTimer).toBe(true)
      expect(result.asyncWaitMinutes).toBe(15)
    })
  })

  describe('completedAt handling', () => {
    it('should use provided completedAt', () => {
      const customTime = new Date('2025-06-01T12:00:00Z')
      const result = processCompletion({
        entityType: 'task',
        entityId: 'task-1',
        task: makeTask(),
        completedAt: customTime,
      })

      expect(result.completedAt).toEqual(customTime)
    })

    it('should use getCurrentTime when completedAt not provided', () => {
      const result = processCompletion({
        entityType: 'task',
        entityId: 'task-1',
        task: makeTask(),
      })

      // Should be a Date close to now
      expect(result.completedAt).toBeInstanceOf(Date)
    })
  })
})
