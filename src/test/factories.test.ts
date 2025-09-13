import { describe, it, expect } from 'vitest'
import {
  createMockTask,
  createMockTaskStep,
  createMockSequencedTask,
  createMockPrismaTask,
  createMockPrismaSequencedTask,
  createMockWorkSession,
} from './factories'

describe('test/factories', () => {
  describe('createMockTask', () => {
    it('should create a task with default values', () => {
      const task = createMockTask()

      expect(task.name).toBe('Test Task')
      expect(task.duration).toBe(60)
      expect(task.importance).toBe(5)
      expect(task.urgency).toBe(5)
      expect(task.type).toBe('focused')
      expect(task.asyncWaitTime).toBe(0)
      expect(task.dependencies).toEqual([])
      expect(task.completed).toBe(false)
      expect(task.sessionId).toBe('test-session')
      expect(task.hasSteps).toBe(false)
      expect(task.overallStatus).toBe('not_started')
      expect(task.criticalPathDuration).toBe(60)
      expect(task.worstCaseDuration).toBe(60)
    })

    it('should generate unique IDs', () => {
      const task1 = createMockTask()
      const task2 = createMockTask()

      expect(task1.id).not.toBe(task2.id)
      expect(task1.id).toMatch(/^task-[a-z0-9]+$/)
    })

    it('should have dates', () => {
      const task = createMockTask()

      expect(task.createdAt).toBeInstanceOf(Date)
      expect(task.updatedAt).toBeInstanceOf(Date)
    })

    it('should have undefined optional fields', () => {
      const task = createMockTask()

      expect(task.notes).toBeUndefined()
      expect(task.deadline).toBeUndefined()
      expect(task.completedAt).toBeUndefined()
      expect(task.actualDuration).toBeUndefined()
      expect(task.currentStepId).toBeUndefined()
      expect(task.steps).toBeUndefined()
    })

    it('should accept overrides', () => {
      const customDate = new Date('2025-01-15')
      const task = createMockTask({
        name: 'Custom Task',
        duration: 120,
        importance: 8,
        urgency: 9,
        type: 'admin',
        completed: true,
        notes: 'Custom notes',
        deadline: customDate,
      })

      expect(task.name).toBe('Custom Task')
      expect(task.duration).toBe(120)
      expect(task.importance).toBe(8)
      expect(task.urgency).toBe(9)
      expect(task.type).toBe('admin')
      expect(task.completed).toBe(true)
      expect(task.notes).toBe('Custom notes')
      expect(task.deadline).toBe(customDate)
    })

    it('should preserve default values when partially overriding', () => {
      const task = createMockTask({ name: 'Partial Override' })

      expect(task.name).toBe('Partial Override')
      expect(task.duration).toBe(60) // Default
      expect(task.importance).toBe(5) // Default
    })
  })

  describe('createMockTaskStep', () => {
    it('should create a step with default values', () => {
      const step = createMockTaskStep()

      expect(step.taskId).toBe('task-1')
      expect(step.name).toBe('Test Step')
      expect(step.duration).toBe(30)
      expect(step.type).toBe('focused')
      expect(step.dependsOn).toEqual([])
      expect(step.asyncWaitTime).toBe(0)
      expect(step.status).toBe('pending')
      expect(step.stepIndex).toBe(0)
      expect(step.percentComplete).toBe(0)
    })

    it('should generate unique IDs', () => {
      const step1 = createMockTaskStep()
      const step2 = createMockTaskStep()

      expect(step1.id).not.toBe(step2.id)
      expect(step1.id).toMatch(/^step-[a-z0-9]+$/)
    })

    it('should have undefined optional fields', () => {
      const step = createMockTaskStep()

      expect(step.completedAt).toBeUndefined()
      expect(step.actualDuration).toBeUndefined()
      expect(step.startedAt).toBeUndefined()
    })

    it('should accept overrides', () => {
      const step = createMockTaskStep({
        taskId: 'custom-task',
        name: 'Custom Step',
        duration: 45,
        type: 'admin',
        dependsOn: ['step-1', 'step-2'],
        status: 'completed',
        percentComplete: 100,
      })

      expect(step.taskId).toBe('custom-task')
      expect(step.name).toBe('Custom Step')
      expect(step.duration).toBe(45)
      expect(step.type).toBe('admin')
      expect(step.dependsOn).toEqual(['step-1', 'step-2'])
      expect(step.status).toBe('completed')
      expect(step.percentComplete).toBe(100)
    })
  })

  describe('createMockSequencedTask', () => {
    it('should create a sequenced task with hasSteps=true', () => {
      const task = createMockSequencedTask()

      expect(task.hasSteps).toBe(true)
      expect(task.steps).toBeDefined()
      expect(task.steps).toHaveLength(1)
    })

    it('should include default step when no steps provided', () => {
      const task = createMockSequencedTask()

      expect(task.steps[0].taskId).toBe(task.id)
      expect(task.steps[0].name).toBe('Test Step')
    })

    it('should use provided steps', () => {
      const customSteps = [
        createMockTaskStep({ name: 'Step 1' }),
        createMockTaskStep({ name: 'Step 2' }),
      ]

      const task = createMockSequencedTask({ steps: customSteps })

      expect(task.steps).toHaveLength(2)
      expect(task.steps[0].name).toBe('Step 1')
      expect(task.steps[1].name).toBe('Step 2')
    })

    it('should accept overrides while maintaining hasSteps=true', () => {
      const task = createMockSequencedTask({
        name: 'Custom Sequenced',
        duration: 180,
        hasSteps: false, // Should be overridden to true
      })

      expect(task.name).toBe('Custom Sequenced')
      expect(task.duration).toBe(180)
      expect(task.hasSteps).toBe(true) // Force to true
    })

    it('should inherit base task properties', () => {
      const task = createMockSequencedTask()

      expect(task.importance).toBe(5)
      expect(task.urgency).toBe(5)
      expect(task.type).toBe('focused')
      expect(task.sessionId).toBe('test-session')
    })
  })

  describe('createMockPrismaTask', () => {
    it('should create a Prisma-formatted task', () => {
      const task = createMockPrismaTask()

      expect(task.id).toBe('task-1')
      expect(task.name).toBe('Test Task')
      expect(task.duration).toBe(60)
      expect(task.dependencies).toBe('[]') // JSON string
      expect(task.hasSteps).toBe(false)
    })

    it('should use null instead of undefined for optional fields', () => {
      const task = createMockPrismaTask()

      expect(task.notes).toBeNull()
      expect(task.deadline).toBeNull()
      expect(task.completedAt).toBeNull()
      expect(task.actualDuration).toBeNull()
      expect(task.currentStepId).toBeNull()
    })

    it('should stringify dependencies array', () => {
      const task = createMockPrismaTask({
        dependencies: ['dep-1', 'dep-2'],
      })

      expect(task.dependencies).toBe('["dep-1","dep-2"]')
    })

    it('should accept overrides', () => {
      const customDate = new Date('2025-01-15')
      const task = createMockPrismaTask({
        id: 'custom-id',
        name: 'Custom Prisma Task',
        notes: 'Some notes',
        deadline: customDate,
      })

      expect(task.id).toBe('custom-id')
      expect(task.name).toBe('Custom Prisma Task')
      expect(task.notes).toBe('Some notes')
      expect(task.deadline).toBe(customDate)
    })

    it('should have dates', () => {
      const task = createMockPrismaTask()

      expect(task.createdAt).toBeInstanceOf(Date)
      expect(task.updatedAt).toBeInstanceOf(Date)
    })
  })

  describe('createMockPrismaSequencedTask', () => {
    it('should create a Prisma-formatted sequenced task', () => {
      const task = createMockPrismaSequencedTask()

      expect(task.hasSteps).toBe(true)
      expect(task.totalDuration).toBe(180)
    })

    it('should use provided duration for totalDuration', () => {
      const task = createMockPrismaSequencedTask({
        duration: 240,
      })

      expect(task.totalDuration).toBe(240)
    })

    it('should inherit base Prisma task properties', () => {
      const task = createMockPrismaSequencedTask()

      expect(task.id).toBe('task-1')
      expect(task.name).toBe('Test Task')
      expect(task.dependencies).toBe('[]')
    })

    it('should accept overrides', () => {
      const task = createMockPrismaSequencedTask({
        id: 'seq-1',
        name: 'Sequenced Task',
        importance: 8,
      })

      expect(task.id).toBe('seq-1')
      expect(task.name).toBe('Sequenced Task')
      expect(task.importance).toBe(8)
    })
  })

  describe('createMockWorkSession', () => {
    it('should create a work session with default values', () => {
      const session = createMockWorkSession()

      expect(session.taskId).toBe('task-1')
      expect(session.type).toBe('focused')
      expect(session.startTime).toBeInstanceOf(Date)
      expect(session.endTime).toBeNull()
      expect(session.plannedMinutes).toBe(30)
      expect(session.actualMinutes).toBeNull()
      expect(session.notes).toBeNull()
      expect(session.stepId).toBeNull()
    })

    it('should generate unique IDs', () => {
      const session1 = createMockWorkSession()
      const session2 = createMockWorkSession()

      expect(session1.id).not.toBe(session2.id)
      expect(session1.id).toMatch(/^session-[a-z0-9]+$/)
    })

    it('should accept overrides', () => {
      const endTime = new Date('2025-01-15T11:00:00')
      const session = createMockWorkSession({
        taskId: 'custom-task',
        type: 'admin',
        endTime,
        plannedMinutes: 60,
        actualMinutes: 55,
        notes: 'Session notes',
        stepId: 'step-1',
      })

      expect(session.taskId).toBe('custom-task')
      expect(session.type).toBe('admin')
      expect(session.endTime).toBe(endTime)
      expect(session.plannedMinutes).toBe(60)
      expect(session.actualMinutes).toBe(55)
      expect(session.notes).toBe('Session notes')
      expect(session.stepId).toBe('step-1')
    })
  })
})