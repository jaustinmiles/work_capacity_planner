import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { WorkTrackingService } from '../workTrackingService'
import type {
  LocalWorkSession,
} from '../types/workTracking'
import * as database from '../database'

// Mock the database module
vi.mock('../database', () => ({
  getDatabase: vi.fn(() => ({
    saveActiveWorkSession: vi.fn(),
    getActiveWorkSessions: vi.fn(),
    clearActiveWorkSessions: vi.fn(),
    deleteActiveWorkSession: vi.fn(),
    getCurrentSession: vi.fn(),
  })),
}))

// Mock logger
vi.mock('../../utils/logger', () => ({
  logger: {
    service: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
  },
}))

describe('WorkTrackingService', () => {
  let service: WorkTrackingService
  let mockDatabase: any

  beforeEach(() => {
    vi.clearAllMocks()
    mockDatabase = (database.getDatabase as any)()
    service = new WorkTrackingService()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('Service Initialization', () => {
    it('should initialize with empty active sessions', () => {
      expect(service.getCurrentActiveSession()).toBeNull()
      expect(service.isAnyWorkActive()).toBe(false)
    })

    it('should initialize with default persistence options', () => {
      const options = service.getPersistenceOptions()
      expect(options.clearStaleSessionsOnStartup).toBe(true)
      expect(options.maxSessionAgeHours).toBe(24)
    })

    it('should connect to database on initialization', () => {
      expect(database.getDatabase).toHaveBeenCalled()
    })
  })

  describe('Start Work Session', () => {
    it('should start a work session for a task', async () => {
      const taskId = 'task-123'
      mockDatabase.getCurrentSession.mockResolvedValue({ id: 'session-1' })

      const session = await service.startWorkSession(taskId)

      expect(session).toBeDefined()
      expect(session.taskId).toBe(taskId)
      expect(session.startTime).toBeInstanceOf(Date)
      expect(session.duration).toBe(0)
      expect(mockDatabase.saveActiveWorkSession).toHaveBeenCalledWith(
        expect.objectContaining({
          taskId,
          sessionId: 'session-1',
        }),
      )
    })

    it('should start a work session for a workflow step', async () => {
      const stepId = 'step-456'
      const workflowId = 'workflow-789'
      mockDatabase.getCurrentSession.mockResolvedValue({ id: 'session-1' })

      const session = await service.startWorkSession(undefined, stepId, workflowId)

      expect(session.stepId).toBe(stepId)
      expect(session.workflowId).toBe(workflowId)
      expect(session.taskId).toBeUndefined()
    })

    it('should prevent starting multiple sessions simultaneously', async () => {
      mockDatabase.getCurrentSession.mockResolvedValue({ id: 'session-1' })

      // Start first session
      await service.startWorkSession('task-1')

      // Attempt to start second session should throw
      await expect(
        service.startWorkSession('task-2'),
      ).rejects.toThrow('Cannot start new work session: another session is already active')
    })

    it('should validate input parameters', async () => {
      await expect(
        service.startWorkSession(), // No parameters
      ).rejects.toThrow('Must provide either taskId or stepId to start work session')

      await expect(
        service.startWorkSession('task-1', 'step-1'), // Both task and step
      ).rejects.toThrow('Cannot provide both taskId and stepId for a work session')
    })

    it('should handle database errors gracefully', async () => {
      mockDatabase.getCurrentSession.mockRejectedValue(new Error('Database connection failed'))

      await expect(
        service.startWorkSession('task-1'),
      ).rejects.toThrow('Failed to start work session: Database connection failed')
    })
  })

  describe('Session Persistence', () => {
    it('should save active session to database', async () => {
      const session: LocalWorkSession = {
        id: 'local-session-1',
        taskId: 'task-123',
        startTime: new Date(),
        duration: 30,
        isPaused: false,
      }

      await service.saveActiveSession(session)

      expect(mockDatabase.saveActiveWorkSession).toHaveBeenCalledWith(
        expect.objectContaining({
          taskId: 'task-123',
          startTime: session.startTime,
          duration: 30,
        }),
      )
    })

    it('should restore active sessions from database', async () => {
      const mockSessions = [
        {
          id: 'db-session-1',
          taskId: 'task-123',
          startTime: new Date('2025-09-08T10:00:00Z'),
          duration: 30,
          sessionId: 'session-1',
        },
        {
          id: 'db-session-2',
          stepId: 'step-456',
          workflowId: 'workflow-789',
          startTime: new Date('2025-09-08T11:00:00Z'),
          duration: 15,
          sessionId: 'session-1',
        },
      ]

      mockDatabase.getActiveWorkSessions.mockResolvedValue(mockSessions)

      const restored = await service.restoreActiveSessions()

      expect(restored.size).toBe(2)
      expect(restored.has('task-123')).toBe(true)
      expect(restored.has('step-456')).toBe(true)

      const taskSession = restored.get('task-123')
      expect(taskSession?.duration).toBe(30)
      expect(taskSession?.isPaused).toBe(true) // Should be paused after restore
    })

    it('should restore sessions on service initialization', async () => {
      const mockSessions = [
        {
          id: 'db-session-1',
          taskId: 'task-123',
          startTime: new Date(),
          duration: 10,
          sessionId: 'session-1',
        },
      ]

      mockDatabase.getActiveWorkSessions.mockResolvedValue(mockSessions)

      const newService = new WorkTrackingService({
        clearStaleSessionsOnStartup: false,
      })
      await newService.initialize()

      expect(newService.getCurrentActiveSession()).toBeTruthy()
      expect(mockDatabase.getActiveWorkSessions).toHaveBeenCalled()
    })

    it('should clear stale sessions on startup when enabled', async () => {
      const oldSession = {
        id: 'old-session',
        taskId: 'task-old',
        startTime: new Date(Date.now() - 25 * 60 * 60 * 1000), // 25 hours ago
        duration: 5,
        sessionId: 'session-1',
      }

      mockDatabase.getActiveWorkSessions.mockResolvedValue([oldSession])

      const newService = new WorkTrackingService({
        clearStaleSessionsOnStartup: true,
        maxSessionAgeHours: 24,
      })
      await newService.initialize()

      expect(mockDatabase.deleteActiveWorkSession).toHaveBeenCalledWith('old-session')
    })
  })

  describe('Session State Management', () => {
    beforeEach(async () => {
      mockDatabase.getCurrentSession.mockResolvedValue({ id: 'session-1' })
      await service.startWorkSession('task-123')
    })

    it('should pause active work session', async () => {
      const sessionId = service.getCurrentActiveSession()?.id
      expect(sessionId).toBeDefined()

      await service.pauseWorkSession(sessionId!)

      const session = service.getCurrentActiveSession()
      expect(session?.isPaused).toBe(true)
      expect(session?.pausedAt).toBeInstanceOf(Date)
      expect(mockDatabase.saveActiveWorkSession).toHaveBeenCalledWith(
        expect.objectContaining({
          pausedAt: expect.any(Date),
        }),
      )
    })

    it('should resume paused work session', async () => {
      const sessionId = service.getCurrentActiveSession()?.id!

      // First pause the session
      await service.pauseWorkSession(sessionId)
      expect(service.getCurrentActiveSession()?.isPaused).toBe(true)

      // Then resume it
      await service.resumeWorkSession(sessionId)

      const session = service.getCurrentActiveSession()
      expect(session?.isPaused).toBe(false)
      expect(session?.pausedAt).toBeUndefined()
    })

    it('should stop active work session', async () => {
      const sessionId = service.getCurrentActiveSession()?.id!

      await service.stopWorkSession(sessionId)

      expect(service.getCurrentActiveSession()).toBeNull()
      expect(service.isAnyWorkActive()).toBe(false)
      expect(mockDatabase.deleteActiveWorkSession).toHaveBeenCalled()
    })

    it('should handle invalid session IDs gracefully', async () => {
      await expect(
        service.pauseWorkSession('invalid-session-id'),
      ).rejects.toThrow('No active session found with ID: invalid-session-id')

      await expect(
        service.resumeWorkSession('invalid-session-id'),
      ).rejects.toThrow('No active session found with ID: invalid-session-id')

      await expect(
        service.stopWorkSession('invalid-session-id'),
      ).rejects.toThrow('No active session found with ID: invalid-session-id')
    })
  })

  describe('Current Work Tracking', () => {
    it('should return null when no work is active', () => {
      expect(service.getCurrentActiveSession()).toBeNull()
      expect(service.getCurrentActiveTask()).toBeNull()
      expect(service.isAnyWorkActive()).toBe(false)
    })

    it('should track current active task session', async () => {
      mockDatabase.getCurrentSession.mockResolvedValue({ id: 'session-1' })

      await service.startWorkSession('task-123')

      const activeSession = service.getCurrentActiveSession()
      expect(activeSession?.taskId).toBe('task-123')
      expect(service.isAnyWorkActive()).toBe(true)
    })

    it('should track current active step session', async () => {
      mockDatabase.getCurrentSession.mockResolvedValue({ id: 'session-1' })

      await service.startWorkSession(undefined, 'step-456', 'workflow-789')

      const activeSession = service.getCurrentActiveSession()
      expect(activeSession?.stepId).toBe('step-456')
      expect(activeSession?.workflowId).toBe('workflow-789')
    })

    it('should calculate elapsed time correctly', async () => {
      mockDatabase.getCurrentSession.mockResolvedValue({ id: 'session-1' })

      const startTime = new Date(Date.now() - 10 * 60 * 1000) // 10 minutes ago
      vi.spyOn(Date, 'now').mockReturnValue(startTime.getTime() + 5 * 60 * 1000) // 5 minutes later

      await service.startWorkSession('task-123')

      const session = service.getCurrentActiveSession()
      expect(session?.getElapsedMinutes()).toBe(5)
    })
  })

  describe('Error Handling', () => {
    it('should handle session error with context', () => {
      const error = new Error('Test error')
      const context = 'starting work session'

      // Should not throw, but log the error
      expect(() => service.handleSessionError(error, context)).not.toThrow()
    })

    it('should handle database connection failures', async () => {
      mockDatabase.saveActiveWorkSession.mockRejectedValue(
        new Error('Database connection lost'),
      )

      await expect(
        service.startWorkSession('task-123'),
      ).rejects.toThrow('Failed to start work session: Database connection lost')
    })

    it('should handle malformed session data from database', async () => {
      const malformedSession = {
        id: 'bad-session',
        // Missing required fields
        startTime: 'not-a-date',
      }

      mockDatabase.getActiveWorkSessions.mockResolvedValue([malformedSession])

      const restored = await service.restoreActiveSessions()

      // Should skip malformed sessions and log warning
      expect(restored.size).toBe(0)
    })
  })

  describe('Cleanup Operations', () => {
    it('should clear stale sessions before specified date', async () => {
      const cutoffDate = new Date('2025-09-07T00:00:00Z')
      mockDatabase.clearActiveWorkSessions.mockResolvedValue(3)

      const clearedCount = await service.clearStaleSessionsBeforeDate(cutoffDate)

      expect(clearedCount).toBe(3)
      expect(mockDatabase.clearActiveWorkSessions).toHaveBeenCalledWith(cutoffDate)
    })

    it('should handle cleanup errors gracefully', async () => {
      mockDatabase.clearActiveWorkSessions.mockRejectedValue(
        new Error('Cleanup failed'),
      )

      await expect(
        service.clearStaleSessionsBeforeDate(new Date()),
      ).rejects.toThrow('Failed to clear stale sessions: Cleanup failed')
    })
  })
})
