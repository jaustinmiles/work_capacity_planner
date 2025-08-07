import { Task, Session } from './types'

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

      expect(session.id).toBe('test-id')
      expect(session.name).toBe('Test Session')
      expect(session.description).toBe('Test description')
      expect(session.isActive).toBe(true)
      expect(session.createdAt).toBeInstanceOf(Date)
      expect(session.updatedAt).toBeInstanceOf(Date)
    })

    it('should allow optional description', () => {
      const session: Session = {
        id: 'test-id',
        name: 'Test Session',
        isActive: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      expect(session.description).toBeUndefined()
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
        type: 'focused',
        asyncWaitTime: 0,
        dependencies: [],
        completed: false,
        sessionId: 'session-id',
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      expect(task.sessionId).toBe('session-id')
      expect(task.type).toBe('focused')
      expect(task.importance).toBe(7)
      expect(task.urgency).toBe(8)
    })

    it('should allow optional deadline', () => {
      const task: Task = {
        id: 'task-id',
        name: 'Test Task',
        duration: 60,
        importance: 5,
        urgency: 5,
        type: 'admin',
        asyncWaitTime: 0,
        dependencies: [],
        completed: false,
        sessionId: 'session-id',
        deadline: new Date('2024-12-31'),
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      expect(task.deadline).toBeInstanceOf(Date)
      expect(task.deadline?.getFullYear()).toBe(2024)
    })
  })
})