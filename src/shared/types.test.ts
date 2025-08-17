import { describe, it, expect } from 'vitest'
import { Task, Session } from './types'
import { TaskType } from './enums'

describe('Type definitions', () => {
  describe('Session type', () => {
    it('should have required properties', () => {
      const session: Session = {
        id: 'test-id',
        name: 'Test Session',
        description: 'Test description',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      expect(session?.id).toBe('test-id')
      expect(session?.name).toBe('Test Session')
      expect(session?.description).toBe('Test description')
      expect(session?.isActive).toBe(true)
      expect(session?.createdAt).toBeInstanceOf(Date)
      expect(session?.updatedAt).toBeInstanceOf(Date)
    })

    it('should allow optional description', () => {
      const session: Session = {
        id: 'test-id',
        name: 'Test Session',
        isActive: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      expect(session?.description).toBeUndefined()
    })
  })

  describe('Task type', () => {
    it('should have required properties including sessionId', () => {
      const task: Task = {
        id: 'task-id',
        name: 'Test Task',
        duration: 60,
        importance: 7,
        urgency: 8,
        type: TaskType.Focused,
        sessionId: 'test-session',
        asyncWaitTime: 0,
        dependencies: [],
        completed: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        hasSteps: false,
        overallStatus: 'not_started',
        criticalPathDuration: 60,
        worstCaseDuration: 60,
      }

      expect(task?.sessionId).toBe('test-session')
      expect(task?.type).toBe(TaskType.Focused)
      expect(task?.importance).toBe(7)
      expect(task?.urgency).toBe(8)
    })

    it('should allow optional deadline', () => {
      const task: Task = {
        id: 'task-id',
        name: 'Test Task',
        duration: 60,
        importance: 5,
        urgency: 5,
        type: TaskType.Admin,
        sessionId: 'test-session',
        asyncWaitTime: 0,
        dependencies: [],
        completed: false,
        deadline: new Date('2024-12-31'),
        createdAt: new Date(),
        updatedAt: new Date(),
        hasSteps: false,
        overallStatus: 'not_started',
        criticalPathDuration: 60,
        worstCaseDuration: 60,
      }

      expect(task?.deadline).toBeInstanceOf(Date)
      expect(task.deadline?.getFullYear()).toBe(2024)
    })
  })
})
