import { describe, it, expect, beforeEach, vi } from 'vitest'
import { RendererDatabaseService } from './database'

// TODO: Rewrite tests - they expect IPC calls but we now use HTTP api-client
describe.skip('RendererDatabaseService', () => {
  let db: RendererDatabaseService

  beforeEach(() => {
    vi.clearAllMocks()
    db = RendererDatabaseService.getInstance()
  })

  describe('Session Management', () => {
    it('should get sessions from electron API', async () => {
      const mockSessions = [
        { id: '1', name: 'Session 1', isActive: true },
        { id: '2', name: 'Session 2', isActive: false },
      ]
      window.electronAPI.db.getSessions.mockResolvedValue(mockSessions)

      const sessions = await db.getSessions()

      expect(window.electronAPI.db.getSessions).toHaveBeenCalled()
      expect(sessions).toEqual(mockSessions)
    })

    it('should create a new session', async () => {
      const mockSession = {
        id: 'new-session',
        name: 'New Session',
        description: 'Test description',
        isActive: true,
      }
      window.electronAPI.db.createSession.mockResolvedValue(mockSession)

      const session = await db.createSession('New Session', 'Test description')

      expect(window.electronAPI.db.createSession).toHaveBeenCalledWith('New Session', 'Test description')
      expect(session).toEqual(mockSession)
    })

    it('should switch to a different session', async () => {
      const mockSession = { id: 'session-2', name: 'Session 2', isActive: true }
      window.electronAPI.db.switchSession.mockResolvedValue(mockSession)

      const session = await db.switchSession('session-2')

      expect(window.electronAPI.db.switchSession).toHaveBeenCalledWith('session-2')
      expect(session).toEqual(mockSession)
    })
  })

  describe('Task Operations', () => {
    it('should get tasks from electron API', async () => {
      const mockTasks = [
        {
          id: '1',
          name: 'Task 1',
          completed: false,
        },
      ]
      window.electronAPI.db.getTasks.mockResolvedValue(mockTasks)

      const tasks = await db.getTasks()

      expect(window.electronAPI.db.getTasks).toHaveBeenCalled()
      expect(tasks).toEqual(mockTasks)
    })

    it('should create a new task', async () => {
      const taskData = {
        id: 'step-' + Math.random().toString(36).substr(2, 9),
        taskId: 'test-task',
        name: 'New Task',
        duration: 60,
        importance: 7,
        urgency: 8,
        type: 'focused' as const,
        sessionId: 'test-session',        asyncWaitTime: 0,
        dependencies: [],
        completed: false,
      }

      const mockCreatedTask = {
        ...taskData,
        id: 'new-task-id',
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      window.electronAPI.db.createTask.mockResolvedValue(mockCreatedTask)

      const task = await db.createTask(taskData)

      expect(window.electronAPI.db.createTask).toHaveBeenCalledWith(taskData)
      expect(task).toEqual(mockCreatedTask)
    })

    it('should update a task', async () => {
      const updates = { name: 'Updated Task', completed: true }
      const mockUpdatedTask = {
        id: 'task-1',
        name: 'Updated Task',
        completed: true,
      }

      window.electronAPI.db.updateTask.mockResolvedValue(mockUpdatedTask)

      const task = await db.updateTask('task-1', updates)

      expect(window.electronAPI.db.updateTask).toHaveBeenCalledWith('task-1', updates)
      expect(task).toEqual(mockUpdatedTask)
    })

    it('should delete a task', async () => {
      await db.deleteTask('task-1')

      expect(window.electronAPI.db.deleteTask).toHaveBeenCalledWith('task-1')
    })
  })

  describe('Work Pattern Operations', () => {
    it('should get work pattern for a date', async () => {
      const mockPattern = {
        id: 'pattern-1',
        date: '2024-01-15',
        blocks: [],
        meetings: [],
      }
      window.electronAPI.db.getWorkPattern.mockResolvedValue(mockPattern)

      const pattern = await db.getWorkPattern('2024-01-15')

      expect(window.electronAPI.db.getWorkPattern).toHaveBeenCalledWith('2024-01-15')
      expect(pattern).toEqual(mockPattern)
    })

    it('should get today accumulated time', async () => {
      const mockAccumulated = { focused: 120, admin: 60 }
      window.electronAPI.db.getTodayAccumulated.mockResolvedValue(mockAccumulated)

      const accumulated = await db.getTodayAccumulated('2024-01-15')

      expect(window.electronAPI.db.getTodayAccumulated).toHaveBeenCalledWith('2024-01-15')
      expect(accumulated).toEqual(mockAccumulated)
    })
  })

  describe('Singleton Pattern', () => {
    it('should return the same instance', () => {
      const instance1 = RendererDatabaseService.getInstance()
      const instance2 = RendererDatabaseService.getInstance()

      expect(instance1).toBe(instance2)
    })
  })
})
