import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useTaskStore } from '../useTaskStore'
import { TaskType, TaskStatus } from '@shared/enums'

// Mocks must be defined inline for hoisting
vi.mock('../../services/database', () => {
  const mockCreateStepWorkSession = vi.fn().mockResolvedValue({})
  const mockUpdateTaskStepProgress = vi.fn().mockResolvedValue({})
  const mockGetSequencedTaskById = vi.fn().mockResolvedValue(null)

  return {
    getDatabase: vi.fn(() => ({
      createStepWorkSession: mockCreateStepWorkSession,
      updateTaskStepProgress: mockUpdateTaskStepProgress,
      getSequencedTaskById: mockGetSequencedTaskById,
      // Additional methods needed by WorkTrackingService
      getTasks: vi.fn().mockResolvedValue([]),
      getSequencedTasks: vi.fn().mockResolvedValue([]),
      getWorkSessions: vi.fn().mockResolvedValue([]),
      loadLastUsedSession: vi.fn().mockResolvedValue(undefined),
      createWorkSession: vi.fn().mockResolvedValue(undefined),
      updateWorkSession: vi.fn().mockResolvedValue(undefined),
      deleteWorkSession: vi.fn().mockResolvedValue(undefined),
      getCurrentSession: vi.fn().mockResolvedValue({ id: 'test-session' }),
      initializeDefaultData: vi.fn().mockResolvedValue(undefined),
    })),
    // Export mocks for test access
    __mocks: {
      createStepWorkSession: mockCreateStepWorkSession,
      updateTaskStepProgress: mockUpdateTaskStepProgress,
      getSequencedTaskById: mockGetSequencedTaskById,
    },
  }
})

// Mock the logger
vi.mock('../../utils/logger', () => ({
  logger: {
    ui: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
    store: {
      info: vi.fn(),
      error: vi.fn(),
    },
  },
}))

// Mock app events
vi.mock('../../utils/events', () => {
  const mockEmit = vi.fn()
  return {
    appEvents: {
      emit: mockEmit,
    },
    EVENTS: {
      TIME_LOGGED: 'time-logged',
    },
    __mockEmit: mockEmit,
  }
})

// Mock WorkTrackingService
vi.mock('../../services/workTrackingService', () => {
  const mockStartWorkSession = vi.fn().mockResolvedValue({
    id: 'session-1',
    taskId: 'task-1',
    stepId: 'step-1',
    startTime: new Date(),
    plannedMinutes: 60,
    type: 'focused',
  })
  const mockPauseWorkSession = vi.fn().mockResolvedValue(undefined)
  const mockStopWorkSession = vi.fn().mockResolvedValue(undefined)
  const mockGetCurrentActiveSession = vi.fn().mockReturnValue(null)
  const mockIsAnyWorkActive = vi.fn().mockReturnValue(false)

  return {
    WorkTrackingService: vi.fn().mockImplementation(() => ({
      startWorkSession: mockStartWorkSession,
      pauseWorkSession: mockPauseWorkSession,
      stopWorkSession: mockStopWorkSession,
      getCurrentActiveSession: mockGetCurrentActiveSession,
      isAnyWorkActive: mockIsAnyWorkActive,
    })),
    __mocks: {
      startWorkSession: mockStartWorkSession,
      pauseWorkSession: mockPauseWorkSession,
      stopWorkSession: mockStopWorkSession,
      getCurrentActiveSession: mockGetCurrentActiveSession,
      isAnyWorkActive: mockIsAnyWorkActive,
    },
  }
})

describe('Workflow Time Tracking', () => {
  let mockCreateStepWorkSession: any
  let mockUpdateTaskStepProgress: any
  let mockEmit: any
  let mockStartWorkSession: any
  let mockPauseWorkSession: any
  let _mockStopWorkSession: any
  let mockGetCurrentActiveSession: any

  beforeEach(async () => {
    vi.clearAllMocks()
    vi.useFakeTimers()

    // Get the mocks
    const dbModule = await import('../../services/database') as any
    mockCreateStepWorkSession = dbModule.__mocks.createStepWorkSession
    mockUpdateTaskStepProgress = dbModule.__mocks.updateTaskStepProgress

    const eventsModule = await import('../../utils/events') as any
    mockEmit = eventsModule.__mockEmit

    const workTrackingModule = await import('../../services/workTrackingService') as any
    mockStartWorkSession = workTrackingModule.__mocks.startWorkSession
    mockPauseWorkSession = workTrackingModule.__mocks.pauseWorkSession
    _mockStopWorkSession = workTrackingModule.__mocks.stopWorkSession
    mockGetCurrentActiveSession = workTrackingModule.__mocks.getCurrentActiveSession

    // Reset mock return values to avoid test pollution
    mockGetCurrentActiveSession.mockReturnValue(null)

    // Reset the store's active sessions to prevent test pollution
    const { result } = renderHook(() => useTaskStore())
    result.current.activeWorkSessions.clear()
    result.current.sequencedTasks = []
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('Start/Pause workflow tracking', () => {
    it('should create a work session when pausing after work', async () => {
      const { result } = renderHook(() => useTaskStore())

      const stepId = 'step-1'
      const workflowId = 'workflow-1'
      const now = new Date('2025-09-01T14:00:00')
      vi.setSystemTime(now)

      // Add a test step to the store
      act(() => {
        result.current.sequencedTasks = [{
          id: workflowId,
          name: 'Test Workflow',
          type: TaskType.Focused,
          importance: 5,
          urgency: 5,
          duration: 120,
          hasSteps: true,
          steps: [{
            id: stepId,
            taskId: workflowId,
            name: 'Test Step',
            type: TaskType.Focused,
            duration: 60,
            actualDuration: 0,
            notes: null,
            status: TaskStatus.NotStarted,
            stepIndex: 0,
            percentComplete: 0,
            dependsOn: [],
          }],
          status: TaskStatus.InProgress,
          createdAt: new Date(),
          updatedAt: new Date(),
        }]
      })

      // Set up mock to return active session during pause
      mockGetCurrentActiveSession.mockReturnValue({
        id: 'session-1',
        stepId: stepId,
        taskId: workflowId,
        startTime: now,
        plannedMinutes: 60,
        type: 'focused',
      })

      // Start work on the step
      await act(async () => {
        await result.current.startWorkOnStep(stepId, workflowId)
      })

      // Advance time by 25 minutes
      const laterTime = new Date('2025-09-01T14:25:00')
      vi.setSystemTime(laterTime)

      // Pause work
      await act(async () => {
        await result.current.pauseWorkOnStep(stepId)
      })

      // Verify WorkTrackingService methods were called
      expect(mockStartWorkSession).toHaveBeenCalledWith(undefined, stepId, workflowId)
      expect(mockPauseWorkSession).toHaveBeenCalledWith('session-1')

      // Verify work session was created for the time worked (only if > 0 minutes)
      expect(mockCreateStepWorkSession).toHaveBeenCalledWith({
        taskStepId: stepId,
        startTime: expect.any(Date), // This uses the session startTime from the local store
        duration: 25,
      })

      // Verify step duration was updated
      expect(mockUpdateTaskStepProgress).toHaveBeenCalledWith(stepId, {
        actualDuration: 25,
      })

      // Verify event was emitted
      expect(mockEmit).toHaveBeenCalledWith('time-logged')
    })

    it('should not create work session if no time has passed', async () => {
      const { result } = renderHook(() => useTaskStore())

      const stepId = 'step-2'
      const workflowId = 'workflow-2'
      const now = new Date('2025-09-01T14:00:00')
      vi.setSystemTime(now)

      // Set up mock to return active session during pause
      mockGetCurrentActiveSession.mockReturnValue({
        id: 'session-2',
        stepId: stepId,
        taskId: workflowId,
        startTime: now,
        plannedMinutes: 60,
        type: 'focused',
      })

      // Start work on the step
      await act(async () => {
        await result.current.startWorkOnStep(stepId, workflowId)
      })

      // Clear the mock calls from start
      vi.clearAllMocks()

      // Pause immediately (no time passed - same timestamp)
      await act(async () => {
        await result.current.pauseWorkOnStep(stepId)
      })

      // Verify WorkTrackingService pause was called
      expect(mockPauseWorkSession).toHaveBeenCalledWith('session-2')

      // Verify no work session was created (since no time passed, minutesWorked = 0)
      expect(mockCreateStepWorkSession).not.toHaveBeenCalled()

      // Verify actualDuration was not updated (since no time passed)
      expect(mockUpdateTaskStepProgress).not.toHaveBeenCalled()

      // Verify no event was emitted (since no time was logged)
      expect(mockEmit).not.toHaveBeenCalled()
    })

    it('should accumulate time across multiple start/pause cycles', async () => {
      const { result } = renderHook(() => useTaskStore())

      const stepId = 'step-3'
      const workflowId = 'workflow-3'

      // Add a test step to the store
      act(() => {
        result.current.sequencedTasks = [{
          id: workflowId,
          name: 'Test Workflow',
          type: TaskType.Admin,
          importance: 5,
          urgency: 5,
          duration: 120,
          hasSteps: true,
          steps: [{
            id: stepId,
            taskId: workflowId,
            name: 'Test Step',
            type: TaskType.Admin,
            duration: 60,
            actualDuration: 0,
            notes: null,
            status: TaskStatus.InProgress,
            stepIndex: 0,
            percentComplete: 0,
            dependsOn: [],
          }],
          status: TaskStatus.InProgress,
          createdAt: new Date(),
          updatedAt: new Date(),
        }]
      })

      // First work session: 10 minutes
      const time1 = new Date('2025-09-01T09:00:00')
      vi.setSystemTime(time1)

      mockGetCurrentActiveSession.mockReturnValue({
        id: 'session-3a',
        stepId: stepId,
        taskId: workflowId,
        startTime: time1,
        plannedMinutes: 60,
        type: 'admin',
      })

      await act(async () => {
        await result.current.startWorkOnStep(stepId, workflowId)
      })

      vi.setSystemTime(new Date('2025-09-01T09:10:00'))
      await act(async () => {
        await result.current.pauseWorkOnStep(stepId)
      })

      // Update the step's actual duration in mock
      act(() => {
        result.current.sequencedTasks[0].steps[0].actualDuration = 10
      })

      // Second work session: 15 minutes
      const time2 = new Date('2025-09-01T10:00:00')
      vi.setSystemTime(time2)

      mockGetCurrentActiveSession.mockReturnValue({
        id: 'session-3b',
        stepId: stepId,
        taskId: workflowId,
        startTime: time2,
        plannedMinutes: 60,
        type: 'admin',
      })

      await act(async () => {
        await result.current.startWorkOnStep(stepId, workflowId)
      })

      vi.setSystemTime(new Date('2025-09-01T10:15:00'))
      await act(async () => {
        await result.current.pauseWorkOnStep(stepId)
      })

      // Verify both work sessions were created
      expect(mockCreateStepWorkSession).toHaveBeenCalledTimes(2)

      // Find the actualDuration update calls (filtering out status updates)
      const durationUpdateCalls = mockUpdateTaskStepProgress.mock.calls.filter(
        (call: any[]) => call[1].actualDuration !== undefined,
      )

      // Verify durations were updated correctly
      expect(durationUpdateCalls[0]).toEqual([stepId, { actualDuration: 10 }])
      expect(durationUpdateCalls[1]).toEqual([stepId, { actualDuration: 25 }]) // 10 + 15
    })
  })

  describe('Time direction (backward from now)', () => {
    it('should create work sessions that end at current time', async () => {
      const { result } = renderHook(() => useTaskStore())

      const stepId = 'step-4'
      const now = new Date('2025-09-01T15:30:00')
      vi.setSystemTime(now)

      // Log 45 minutes of work
      await act(async () => {
        await result.current.logWorkSession(stepId, 45, 'Worked on implementation')
      })

      // Verify work session starts 45 minutes before now
      const expectedStartTime = new Date('2025-09-01T14:45:00')
      expect(mockCreateStepWorkSession).toHaveBeenCalledWith({
        taskStepId: stepId,
        startTime: expectedStartTime,
        duration: 45,
        notes: 'Worked on implementation',
      })
    })

    it('should handle completion without active session by calculating backward', async () => {
      const { result } = renderHook(() => useTaskStore())

      const stepId = 'step-5'
      const now = new Date('2025-09-01T16:00:00')
      vi.setSystemTime(now)

      // Complete step with 30 minutes of work (no active session)
      await act(async () => {
        await result.current.completeStep(stepId, 30, 'Completed the task')
      })

      // Verify work session starts 30 minutes before now
      const expectedStartTime = new Date('2025-09-01T15:30:00')
      expect(mockCreateStepWorkSession).toHaveBeenCalledWith({
        taskStepId: stepId,
        startTime: expectedStartTime,
        duration: 30,
        notes: 'Completed the task',
      })
    })

    it('should use session start time when completing with active session', async () => {
      const { result } = renderHook(() => useTaskStore())

      const stepId = 'step-6'
      const workflowId = 'workflow-6'
      const startTime = new Date('2025-09-01T10:00:00')
      vi.setSystemTime(startTime)

      // Set up mock to return active session during completion
      mockGetCurrentActiveSession.mockReturnValue({
        id: 'session-6',
        stepId: stepId,
        taskId: workflowId,
        startTime: startTime,
        plannedMinutes: 60,
        type: 'focused',
      })

      // Add a test step to the store
      act(() => {
        result.current.sequencedTasks = [{
          id: workflowId,
          name: 'Test Workflow',
          type: TaskType.Focused,
          importance: 5,
          urgency: 5,
          duration: 120,
          hasSteps: true,
          steps: [{
            id: stepId,
            taskId: workflowId,
            name: 'Test Step',
            type: TaskType.Focused,
            duration: 60,
            actualDuration: 0,
            notes: null,
            status: TaskStatus.NotStarted,
            stepIndex: 0,
            percentComplete: 0,
            dependsOn: [],
          }],
          status: TaskStatus.InProgress,
          createdAt: new Date(),
          updatedAt: new Date(),
        }]
      })

      // Start work on the step
      await act(async () => {
        await result.current.startWorkOnStep(stepId, workflowId)
      })

      // Advance time by 60 minutes
      const endTime = new Date('2025-09-01T11:00:00')
      vi.setSystemTime(endTime)

      // Complete the step with explicit duration to ensure it's recorded
      await act(async () => {
        await result.current.completeStep(stepId, 60)  // Pass explicit duration
      })

      // Verify work session was created with the explicit duration
      expect(mockCreateStepWorkSession).toHaveBeenCalledWith({
        taskStepId: stepId,
        startTime: expect.any(Date),
        duration: 60,
        notes: undefined,
      })

      // Verify WorkTrackingService stop was called
      expect(mockGetCurrentActiveSession).toHaveBeenCalled()
    })
  })

  describe('Workflow progress visibility', () => {
    it('should update UI components when time is logged', async () => {
      const { result } = renderHook(() => useTaskStore())

      const stepId = 'step-7'
      const workflowId = 'workflow-7'

      // Start and pause to trigger time logging
      const now = new Date('2025-09-01T12:00:00')
      vi.setSystemTime(now)

      // Set up mock to return active session during pause
      mockGetCurrentActiveSession.mockReturnValue({
        id: 'session-7',
        stepId: stepId,
        taskId: workflowId,
        startTime: now,
        plannedMinutes: 60,
        type: 'focused',
      })

      await act(async () => {
        await result.current.startWorkOnStep(stepId, workflowId)
      })

      // Work for 20 minutes
      vi.setSystemTime(new Date('2025-09-01T12:20:00'))

      await act(async () => {
        await result.current.pauseWorkOnStep(stepId)
      })

      // Verify TIME_LOGGED event was emitted for UI updates
      expect(mockEmit).toHaveBeenCalledWith('time-logged')

      // Verify logger was called
      const loggerModule = await import('../../utils/logger')
      expect(loggerModule.logger.store.info).toHaveBeenCalledWith(
        'Logged 20 minutes for step step-7 on pause',
      )
    })
  })
})
