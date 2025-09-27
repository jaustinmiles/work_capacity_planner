import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useTaskStore, injectWorkTrackingServiceForTesting, clearInjectedWorkTrackingService } from '../useTaskStore'
import { TaskType, TaskStatus } from '@shared/enums'

// Mock the database
vi.mock('../../services/database', () => {
  const mockCreateStepWorkSession = vi.fn().mockResolvedValue({})
  const mockUpdateTaskStepProgress = vi.fn().mockResolvedValue({})
  const mockGetSequencedTaskById = vi.fn().mockResolvedValue(null)

  return {
    getDatabase: vi.fn(() => ({
      createStepWorkSession: mockCreateStepWorkSession,
      updateTaskStepProgress: mockUpdateTaskStepProgress,
      getSequencedTaskById: mockGetSequencedTaskById,
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
vi.mock('@/shared/logger', () => ({
  logger: {
    progress: {
      info: vi.fn(),
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

describe('Notes Persistence in Time Tracking', () => {
  let mockCreateStepWorkSession: any
  let mockUpdateTaskStepProgress: any

  beforeEach(async () => {
    vi.clearAllMocks()

    // Get the mocks
    const dbModule = await import('../../services/database') as any
    mockCreateStepWorkSession = dbModule.__mocks.createStepWorkSession
    mockUpdateTaskStepProgress = dbModule.__mocks.updateTaskStepProgress

    // Create a mock WorkTrackingService instance and inject it
    const mockService = {
      startWorkSession: vi.fn().mockResolvedValue({
        id: 'session-1',
        taskId: 'task-1',
        stepId: 'step-1',
        startTime: new Date(),
        plannedMinutes: 60,
        type: 'focused',
      }),
      pauseWorkSession: vi.fn().mockResolvedValue(undefined),
      stopWorkSession: vi.fn().mockResolvedValue(undefined),
      getCurrentActiveSession: vi.fn().mockReturnValue(null),
      isAnyWorkActive: vi.fn().mockReturnValue(false),
      initialize: vi.fn().mockResolvedValue(undefined),
    }

    // Inject the mock service into the store
    injectWorkTrackingServiceForTesting(mockService as any)
  })

  afterEach(() => {
    // Clear the injected mock service
    clearInjectedWorkTrackingService()
  })

  describe('completeStep', () => {
    it('should save notes to the step when completing', async () => {
      const { result } = renderHook(() => useTaskStore())

      // Set up test data
      const stepId = 'step-1'
      const notes = 'Completed this task successfully with some challenges'
      const actualMinutes = 45

      await act(async () => {
        await result.current.completeStep(stepId, actualMinutes, notes)
      })

      // Verify that updateTaskStepProgress was called with notes
      expect(mockUpdateTaskStepProgress).toHaveBeenCalledWith(
        stepId,
        expect.objectContaining({
          status: 'completed',
          actualDuration: actualMinutes,
          percentComplete: 100,
          notes: notes,
        }),
      )

      // Verify that createStepWorkSession was called with notes
      expect(mockCreateStepWorkSession).toHaveBeenCalledWith(
        expect.objectContaining({
          taskStepId: stepId,
          duration: actualMinutes,
          notes: notes,
        }),
      )
    })

    it('should not include notes field if no notes provided', async () => {
      const { result } = renderHook(() => useTaskStore())

      const stepId = 'step-2'
      const actualMinutes = 30

      await act(async () => {
        await result.current.completeStep(stepId, actualMinutes, undefined)
      })

      // Verify notes field is not included when not provided
      expect(mockUpdateTaskStepProgress).toHaveBeenCalledWith(
        stepId,
        expect.not.objectContaining({
          notes: expect.anything(),
        }),
      )
    })
  })

  describe('logWorkSession', () => {
    it('should append notes to existing step notes with timestamp', async () => {
      const { result } = renderHook(() => useTaskStore())

      // Add a test step to the store
      const existingStep = {
        id: 'step-3',
        taskId: 'task-1',
        name: 'Test Step',
        type: TaskType.Focused,
        duration: 60,
        actualDuration: 15,
        notes: 'Initial notes from earlier',
        status: TaskStatus.InProgress,
        stepIndex: 0,
        percentComplete: 25,
        dependsOn: [],
      }

      act(() => {
        result.current.sequencedTasks = [{
          id: 'task-1',
          name: 'Test Task',
          type: TaskType.Focused,
          importance: 5,
          urgency: 5,
          duration: 60,
          hasSteps: true,
          steps: [existingStep],
          status: TaskStatus.InProgress,
          createdAt: new Date(),
          updatedAt: new Date(),
        }]
      })

      const newNotes = 'Made good progress on this part'
      const minutes = 20

      await act(async () => {
        await result.current.logWorkSession(existingStep.id, minutes, newNotes)
      })

      // Verify notes were appended with timestamp
      expect(mockUpdateTaskStepProgress).toHaveBeenCalledWith(
        existingStep.id,
        expect.objectContaining({
          actualDuration: 35, // 15 + 20
          notes: expect.stringContaining('Initial notes from earlier'),
        }),
      )

      // The notes should contain both old and new with timestamp
      const callArgs = mockUpdateTaskStepProgress.mock.calls[0][1]
      expect(callArgs.notes).toContain('Initial notes from earlier')
      expect(callArgs.notes).toContain(newNotes)
      expect(callArgs.notes).toMatch(/\d{1,2}\/\d{1,2}\/\d{4}.*Made good progress/)
    })

    it('should create notes with timestamp when no existing notes', async () => {
      const { result } = renderHook(() => useTaskStore())

      // Add a test step without notes
      const stepWithoutNotes = {
        id: 'step-4',
        taskId: 'task-2',
        name: 'Step Without Notes',
        type: TaskType.Admin,
        duration: 30,
        actualDuration: 0,
        notes: null,
        status: TaskStatus.NotStarted,
        stepIndex: 0,
        percentComplete: 0,
        dependsOn: [],
      }

      act(() => {
        result.current.sequencedTasks = [{
          id: 'task-2',
          name: 'Test Task 2',
          type: TaskType.Admin,
          importance: 3,
          urgency: 7,
          duration: 30,
          hasSteps: true,
          steps: [stepWithoutNotes],
          status: TaskStatus.NotStarted,
          createdAt: new Date(),
          updatedAt: new Date(),
        }]
      })

      const notes = 'Starting work on this step'
      const minutes = 15

      await act(async () => {
        await result.current.logWorkSession(stepWithoutNotes.id, minutes, notes)
      })

      // Verify notes were created with timestamp
      const callArgs = mockUpdateTaskStepProgress.mock.calls[0][1]
      expect(callArgs.notes).toMatch(/\d{1,2}\/\d{1,2}\/\d{4}.*Starting work on this step/)
    })

    it('should not update notes if none provided', async () => {
      const { result } = renderHook(() => useTaskStore())

      const step = {
        id: 'step-5',
        taskId: 'task-3',
        name: 'Test Step',
        type: TaskType.Personal,
        duration: 45,
        actualDuration: 10,
        notes: 'Existing notes',
        status: TaskStatus.InProgress,
        stepIndex: 0,
        percentComplete: 20,
        dependsOn: [],
      }

      act(() => {
        result.current.sequencedTasks = [{
          id: 'task-3',
          name: 'Test Task 3',
          type: TaskType.Personal,
          importance: 4,
          urgency: 4,
          duration: 45,
          hasSteps: true,
          steps: [step],
          status: TaskStatus.InProgress,
          createdAt: new Date(),
          updatedAt: new Date(),
        }]
      })

      await act(async () => {
        await result.current.logWorkSession(step.id, 15, undefined)
      })

      // Verify notes field was not included
      expect(mockUpdateTaskStepProgress).toHaveBeenCalledWith(
        step.id,
        expect.not.objectContaining({
          notes: expect.anything(),
        }),
      )
    })
  })

  describe('WorkSession records', () => {
    it('should always save notes to WorkSession table', async () => {
      const { result } = renderHook(() => useTaskStore())

      const stepId = 'step-6'
      const notes = 'Notes for work session record'
      const minutes = 25

      await act(async () => {
        await result.current.logWorkSession(stepId, minutes, notes)
      })

      // Verify WorkSession was created with notes
      expect(mockCreateStepWorkSession).toHaveBeenCalledWith(
        expect.objectContaining({
          taskStepId: stepId,
          duration: minutes,
          notes: notes,
        }),
      )
    })
  })
})
