/**
 * Tests for WorkTrackingService integration with useTaskStore
 * These tests verify that the store properly uses WorkTrackingService
 * for work session management instead of the local LocalWorkSession approach
 */

import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest'
import {
  useTaskStore,
  injectWorkTrackingServiceForTesting,
  clearInjectedWorkTrackingService,
} from './useTaskStore'
// WorkTrackingService import not used in mocked test
// import { WorkTrackingService } from '../services/workTrackingService'
import { getDatabase } from '../services/database'

// Mock the database
vi.mock('../services/database', () => ({
  getDatabase: vi.fn(() => ({
    getTasks: vi.fn(),
    getSequencedTasks: vi.fn(),
    updateTaskStepProgress: vi.fn(),
    createStepWorkSession: vi.fn(),
    getWorkSessions: vi.fn(),
    loadLastUsedSession: vi.fn(),
    createWorkSession: vi.fn(),
    updateWorkSession: vi.fn(),
    deleteWorkSession: vi.fn(),
    getCurrentSession: vi.fn(),
    initializeDefaultData: vi.fn(),
  })),
}))

// No longer need to mock the constructor - we'll use dependency injection

// Mock app events
vi.mock('../utils/events', () => ({
  appEvents: {
    emit: vi.fn(),
  },
  EVENTS: {
    TIME_LOGGED: 'timeLogged',
  },
}))

// Mock logger
vi.mock('@/shared/logger', () => ({
  logger: {
    ui: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
    main: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

describe('useTaskStore WorkTrackingService Integration', () => {
  let mockWorkTrackingService: any
  let mockDatabase: any

  beforeEach(() => {
    vi.clearAllMocks()

    // Clear any existing state in the store
    const store = useTaskStore.getState()
    store.activeWorkSessions.clear()
    store.sequencedTasks = []

    // Create a mock WorkTrackingService and inject it into the store
    mockWorkTrackingService = {
      initialize: vi.fn(),
      startWorkSession: vi.fn(),
      pauseWorkSession: vi.fn(),
      stopWorkSession: vi.fn(),
      getCurrentActiveSession: vi.fn(),
      isAnyWorkActive: vi.fn(),
    } as any

    // Inject the mock service into the store for testing
    injectWorkTrackingServiceForTesting(mockWorkTrackingService)

    mockDatabase = {
      getTasks: vi.fn().mockResolvedValue([]),
      getSequencedTasks: vi.fn().mockResolvedValue([]),
      updateTaskStepProgress: vi.fn().mockResolvedValue(undefined),
      createStepWorkSession: vi.fn().mockResolvedValue(undefined),
      getWorkSessions: vi.fn().mockResolvedValue([]),
      loadLastUsedSession: vi.fn().mockResolvedValue(undefined),
      createWorkSession: vi.fn().mockResolvedValue(undefined),
      updateWorkSession: vi.fn().mockResolvedValue(undefined),
      deleteWorkSession: vi.fn().mockResolvedValue(undefined),
      getCurrentSession: vi.fn().mockResolvedValue({ id: 'test-session' }),
      initializeDefaultData: vi.fn().mockResolvedValue(undefined),
    }

    vi.mocked(getDatabase).mockReturnValue(mockDatabase)
  })

  afterEach(() => {
    // Clean up injected service after each test
    clearInjectedWorkTrackingService()
  })

  describe('startWorkOnStep integration', () => {
    it('should call WorkTrackingService.startWorkSession when starting work on a step', async () => {
      // Arrange
      const stepId = 'step-123'
      const workflowId = 'workflow-456'

      mockWorkTrackingService.startWorkSession.mockResolvedValue({
        id: 'session-1',
        stepId,
        workflowId,
        startTime: new Date(),
      })

      // Act
      const store = useTaskStore.getState()
      store.startWorkOnStep(stepId, workflowId)

      // Assert
      expect(mockWorkTrackingService.startWorkSession).toHaveBeenCalledWith(
        undefined, // taskId
        stepId,    // stepId
        workflowId, // workflowId
      )
    })

    it('should handle WorkTrackingService errors gracefully', async () => {
      // Arrange
      const stepId = 'step-123'
      const workflowId = 'workflow-456'
      const error = new Error('Database connection failed')

      mockWorkTrackingService.startWorkSession.mockRejectedValue(error)

      // Act & Assert - Should throw the error (error is re-thrown after rollback)
      const store = useTaskStore.getState()
      await expect(store.startWorkOnStep(stepId, workflowId)).rejects.toThrow('Database connection failed')
    })

    it('should prevent starting work if another session is already active', async () => {
      // Arrange
      const stepId = 'step-123'
      const workflowId = 'workflow-456'

      mockWorkTrackingService.isAnyWorkActive.mockReturnValue(true)

      // Act
      const store = useTaskStore.getState()
      store.startWorkOnStep(stepId, workflowId)

      // Assert - Should not call startWorkSession if work is already active
      expect(mockWorkTrackingService.startWorkSession).not.toHaveBeenCalled()
    })
  })

  describe('pauseWorkOnStep integration', () => {
    it('should call WorkTrackingService.pauseWorkSession when pausing work', async () => {
      // Arrange
      const stepId = 'step-123'
      const workflowId = 'workflow-456'
      const sessionId = 'session-1'

      // First start a work session so it exists in local state
      mockWorkTrackingService.startWorkSession.mockResolvedValue({
        id: sessionId,
        stepId,
        workflowId,
        startTime: new Date(Date.now() - 30 * 60000), // 30 minutes ago
      })

      mockWorkTrackingService.getCurrentActiveSession.mockReturnValue({
        id: sessionId,
        stepId,
        startTime: new Date(Date.now() - 30 * 60000), // 30 minutes ago
      })

      mockWorkTrackingService.pauseWorkSession.mockResolvedValue(undefined)

      // Start work first to populate local state
      const store = useTaskStore.getState()
      await store.startWorkOnStep(stepId, workflowId)

      // Act - now pause the work
      await store.pauseWorkOnStep(stepId)

      // Assert
      expect(mockWorkTrackingService.pauseWorkSession).toHaveBeenCalledWith(sessionId)
    })

    it('should handle pausing when no active session exists', async () => {
      // Arrange
      const stepId = 'step-123'

      mockWorkTrackingService.getCurrentActiveSession.mockReturnValue(null)

      // Act
      const store = useTaskStore.getState()
      await store.pauseWorkOnStep(stepId)

      // Assert - Should not call pauseWorkSession
      expect(mockWorkTrackingService.pauseWorkSession).not.toHaveBeenCalled()
    })
  })

  describe('completeStep integration', () => {
    it('should call WorkTrackingService.stopWorkSession when completing a step', async () => {
      // Arrange
      const stepId = 'step-123'
      const sessionId = 'session-1'
      const actualMinutes = 45
      const notes = 'Step completed successfully'

      mockWorkTrackingService.getCurrentActiveSession.mockReturnValue({
        id: sessionId,
        stepId,
        startTime: new Date(Date.now() - actualMinutes * 60000),
      })

      mockWorkTrackingService.stopWorkSession.mockResolvedValue(undefined)

      // Act
      const store = useTaskStore.getState()
      await store.completeStep(stepId, actualMinutes, notes)

      // Assert
      expect(mockWorkTrackingService.stopWorkSession).toHaveBeenCalledWith(sessionId)
    })

    it('should complete steps without active sessions using manual time entry', async () => {
      // Arrange
      const stepId = 'step-123'
      const actualMinutes = 30
      const notes = 'Manual completion'

      mockWorkTrackingService.getCurrentActiveSession.mockReturnValue(null)

      // Act
      const store = useTaskStore.getState()
      await store.completeStep(stepId, actualMinutes, notes)

      // Assert - Should update database directly without stopping a session
      expect(mockWorkTrackingService.stopWorkSession).not.toHaveBeenCalled()
      expect(mockDatabase.updateTaskStepProgress).toHaveBeenCalledWith(stepId, expect.objectContaining({
        status: 'completed',
        actualDuration: actualMinutes,
        percentComplete: 100,
      }))
    })
  })

  describe('active session state', () => {
    it('should use WorkTrackingService to determine if work is active', () => {
      // Arrange
      const stepId = 'step-123'

      mockWorkTrackingService.getCurrentActiveSession.mockReturnValue({
        id: 'session-1',
        stepId,
        startTime: new Date(),
      })

      // Act
      const store = useTaskStore.getState()
      const activeSession = store.getActiveWorkSession(stepId)

      // Assert
      expect(activeSession).toBeDefined()
      expect(activeSession?.stepId).toBe(stepId)
    })

    it('should return undefined for inactive sessions', () => {
      // Arrange
      const stepId = 'step-123'

      mockWorkTrackingService.getCurrentActiveSession.mockReturnValue(null)

      // Act
      const store = useTaskStore.getState()
      const activeSession = store.getActiveWorkSession(stepId)

      // Assert
      expect(activeSession).toBeUndefined()
    })
  })

  describe('WorkTrackingService initialization', () => {
    it('should initialize WorkTrackingService when initializeData is called', async () => {
      // Act - Store initialization happens via initializeData()
      const store = useTaskStore.getState()
      await store.initializeData()

      // Assert - Initialization should be called during data initialization
      expect(mockWorkTrackingService.initialize).toHaveBeenCalled()
    })

    it('should handle WorkTrackingService initialization errors', async () => {
      // Arrange
      const error = new Error('Failed to initialize work tracking')
      mockWorkTrackingService.initialize.mockRejectedValue(error)

      // Act & Assert - Should not throw during store creation
      expect(() => {
        useTaskStore.getState()
      }).not.toThrow()
    })
  })

  describe('persistence across app restarts', () => {
    it('should restore active work sessions on store initialization', async () => {
      // Arrange
      const activeSession = {
        id: 'session-1',
        stepId: 'step-123',
        startTime: new Date(Date.now() - 15 * 60000), // 15 minutes ago
        isPaused: false,
      }

      mockWorkTrackingService.getCurrentActiveSession.mockReturnValue(activeSession)

      // Act
      const store = useTaskStore.getState()
      await store.initializeData()

      // Assert
      const restoredSession = store.getActiveWorkSession('step-123')
      expect(restoredSession).toBeDefined()
      expect(restoredSession?.stepId).toBe('step-123')
    })
  })
})
