import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useTaskStore } from '../store/useTaskStore'
import { getDatabase } from '../services/database'
import { WorkTrackingService } from '../services/workTrackingService'

// Mock dependencies
vi.mock('../services/database', () => ({
  getDatabase: vi.fn(),
}))

vi.mock('../services/workTrackingService', () => {
  const mockService = {
    startWorkSession: vi.fn().mockResolvedValue({ id: 'session-1' }),
    stopWorkSession: vi.fn().mockResolvedValue(undefined),
    pauseWorkSession: vi.fn().mockResolvedValue(undefined),
    resumeWorkSession: vi.fn().mockResolvedValue(undefined),
    isAnyWorkActive: vi.fn().mockReturnValue(false),
    getActiveWorkSessions: vi.fn().mockReturnValue([]),
    getCurrentActiveSession: vi.fn().mockReturnValue(null),
    on: vi.fn(),
    off: vi.fn(),
    updateWorkSession: vi.fn().mockResolvedValue(undefined),
    emit: vi.fn(),
  }
  
  return {
    WorkTrackingService: vi.fn().mockImplementation(() => mockService),
    getWorkTrackingService: vi.fn().mockReturnValue(mockService),
  }
})

// Mock the renderer logger
vi.mock('../utils/rendererLogger', () => ({
  getRendererLogger: vi.fn().mockReturnValue({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}))

// Mock events
vi.mock('../utils/events', () => ({
  appEvents: {
    emit: vi.fn(),
  },
  EVENTS: {
    TIME_LOGGED: 'timeLogged',
  },
}))

// Mock logger
vi.mock('../utils/logger', () => ({
  logger: {
    ui: { warn: vi.fn(), error: vi.fn() },
    store: { info: vi.fn(), error: vi.fn() },
  },
}))

// Mock the renderer logging module
vi.mock('../../logging/index.renderer', () => ({
  getRendererLogger: vi.fn().mockReturnValue({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}))

// Mock the shared SchedulingService
vi.mock('@shared/scheduling-service', () => {
  const mockInstance = {
    createSchedule: vi.fn(),
    getNextScheduledItem: vi.fn(),
  }

  return {
    SchedulingService: vi.fn().mockImplementation(() => mockInstance),
    __mockInstance: mockInstance, // Export for access in tests
  }
})

describe('useTaskStore Scheduling Integration', () => {
  let mockDatabase: any
  let mockSchedulingService: any

  beforeEach(async () => {
    vi.clearAllMocks()

    mockDatabase = {
      getTasks: vi.fn().mockResolvedValue([]),
      getSequencedTasks: vi.fn().mockResolvedValue([]),
      updateTaskStepProgress: vi.fn().mockResolvedValue(undefined),
      createStepWorkSession: vi.fn().mockResolvedValue(undefined),
      getWorkPattern: vi.fn().mockResolvedValue(null),
    }

    vi.mocked(getDatabase).mockReturnValue(mockDatabase)

    // Get the mock instance from the mocked module
    const schedulingModule = await import('@shared/scheduling-service') as any
    mockSchedulingService = schedulingModule.__mockInstance
    
    // Set default return values for the mock
    const defaultSchedule = {
      scheduledItems: [],
      conflicts: [],
      unscheduledTasks: [],
    }
    mockSchedulingService.createSchedule.mockResolvedValue(defaultSchedule)
    mockSchedulingService.getNextScheduledItem.mockResolvedValue(null)
    
    // Reset store state
    useTaskStore.setState({
      tasks: [],
      sequencedTasks: [],
      currentSchedule: null,
      isScheduling: false,
      schedulingError: null,
    })
  })

  describe('getNextScheduledItem integration', () => {
    it('should get the next scheduled task when no active session exists', async () => {
      // Arrange
      const mockTasks = [
        {
          id: 'task-1',
          title: 'High priority task',
          name: 'High priority task',
          status: 'todo',
          type: 'focused',
          estimatedDuration: 120,
          duration: 120,
          priority: 1,
          completed: false,
        },
      ]

      const mockSequencedTasks = [
        {
          id: 'workflow-1',
          title: 'Important workflow',
          name: 'Important workflow',
          overallStatus: 'todo',
          steps: [
            {
              id: 'step-1',
              title: 'First step',
              name: 'First step',
              status: 'todo',
              estimatedDuration: 60,
              duration: 60,
            },
          ],
        },
      ]

      // Mock schedule with items
      const mockSchedule = {
        scheduledItems: [
          {
            id: 'task-1',
            title: 'High priority task',
            type: 'task',
            estimatedDuration: 120,
            scheduledStart: new Date(),
          },
        ],
        conflicts: [],
        unscheduledTasks: [],
      }

      mockSchedulingService.createSchedule.mockResolvedValue(mockSchedule)

      // Set the store's state directly
      useTaskStore.setState({
        tasks: mockTasks as any,
        sequencedTasks: mockSequencedTasks as any,
      })

      // Act
      const store = useTaskStore.getState()
      const nextItem = await store.getNextScheduledItem()

      // Assert
      expect(mockSchedulingService.createSchedule).toHaveBeenCalledWith(
        mockTasks,
        mockSequencedTasks,
        {},
      )
      expect(nextItem).toEqual({
        type: 'task',
        id: 'task-1',
        title: 'High priority task',
        estimatedDuration: 120,
      })
    })

    it('should return null when no items are available to schedule', async () => {
      // Arrange - empty schedule
      const mockSchedule = {
        scheduledItems: [],
        conflicts: [],
        unscheduledTasks: [],
      }

      mockSchedulingService.createSchedule.mockResolvedValue(mockSchedule)

      // Act
      const store = useTaskStore.getState()
      const nextItem = await store.getNextScheduledItem()

      // Assert
      expect(nextItem).toBeNull()
    })

    it('should prioritize workflow steps over regular tasks', async () => {
      // Arrange
      const mockTasks = [
        {
          id: 'task-1',
          title: 'Regular task',
          name: 'Regular task',
          status: 'todo',
          type: 'admin',
          estimatedDuration: 60,
          duration: 60,
          priority: 3,
          completed: false,
        },
      ]

      const mockSequencedTasks = [
        {
          id: 'workflow-1',
          title: 'Important workflow',
          name: 'Important workflow',
          overallStatus: 'todo',
          steps: [
            {
              id: 'step-1',
              title: 'First step',
              name: 'First step',
              status: 'todo',
              estimatedDuration: 45,
              duration: 45,
            },
          ],
        },
      ]

      // Mock schedule with both tasks and steps
      const mockSchedule = {
        scheduledItems: [
          {
            id: 'step-1',
            title: 'First step',
            type: 'step',
            workflowId: 'workflow-1',
            estimatedDuration: 45,
            scheduledStart: new Date(),
          },
          {
            id: 'task-1',
            title: 'Regular task',
            type: 'task',
            estimatedDuration: 60,
            scheduledStart: new Date(Date.now() + 60 * 60 * 1000),
          },
        ],
        conflicts: [],
        unscheduledTasks: [],
      }

      mockSchedulingService.createSchedule.mockResolvedValue(mockSchedule)

      useTaskStore.setState({
        tasks: mockTasks as any,
        sequencedTasks: mockSequencedTasks as any,
      })

      // Act
      const store = useTaskStore.getState()
      const nextItem = await store.getNextScheduledItem()

      // Assert - should return the workflow step first
      expect(nextItem).toEqual({
        type: 'step',
        id: 'step-1',
        workflowId: 'workflow-1',
        title: 'First step',
        estimatedDuration: 45,
      })
    })

    it('should filter out completed and in-progress items', async () => {
      // Arrange
      const mockTasks = [
        {
          id: 'task-1',
          title: 'Completed task',
          name: 'Completed task',
          status: 'done',
          completed: true,
          type: 'focused',
          estimatedDuration: 90,
          duration: 90,
          priority: 1,
        },
        {
          id: 'task-2',
          title: 'In progress task',
          name: 'In progress task',
          status: 'doing',
          completed: false,
          type: 'admin',
          estimatedDuration: 60,
          duration: 60,
          priority: 2,
        },
        {
          id: 'task-3',
          title: 'Todo task',
          name: 'Todo task',
          status: 'todo',
          completed: false,
          type: 'personal',
          estimatedDuration: 30,
          duration: 30,
          priority: 3,
        },
      ]

      // Mock schedule with only the todo task
      const mockSchedule = {
        scheduledItems: [
          {
            id: 'task-3',
            title: 'Todo task',
            type: 'task',
            estimatedDuration: 30,
            scheduledStart: new Date(),
          },
        ],
        conflicts: [],
        unscheduledTasks: [],
      }

      mockSchedulingService.createSchedule.mockResolvedValue(mockSchedule)

      useTaskStore.setState({
        tasks: mockTasks as any,
        sequencedTasks: [],
      })

      // Act
      const store = useTaskStore.getState()
      const result = await store.getNextScheduledItem()

      // Assert - should only return the todo task
      expect(mockSchedulingService.createSchedule).toHaveBeenCalled()
      expect(result).toEqual({
        type: 'task',
        id: 'task-3',
        title: 'Todo task',
        estimatedDuration: 30,
      })
    })

    it('should handle scheduling service errors gracefully', async () => {
      // Arrange
      const mockError = new Error('Scheduling failed')
      mockSchedulingService.createSchedule.mockRejectedValue(mockError)

      // Act
      const store = useTaskStore.getState()
      const nextItem = await store.getNextScheduledItem()

      // Assert
      expect(nextItem).toBeNull()
    })
  })

  describe('integration with startNextTask', () => {
    it('should start work on the next scheduled task', async () => {
      // Arrange
      const mockTasks = [
        {
          id: 'task-1',
          title: 'Next task',
          name: 'Next task',
          status: 'todo',
          completed: false,
          estimatedDuration: 90,
          duration: 90,
        } as any,
      ]
      
      const mockSchedule = {
        scheduledItems: [
          {
            id: 'task-1',
            title: 'Next task',
            type: 'task',
            estimatedDuration: 90,
            scheduledStart: new Date(),
          },
        ],
        conflicts: [],
        unscheduledTasks: [],
      }

      mockSchedulingService.createSchedule.mockResolvedValue(mockSchedule)
      
      useTaskStore.setState({
        tasks: mockTasks as any,
        sequencedTasks: [],
      })

      // Act
      const store = useTaskStore.getState()
      await store.startNextTask()

      // Assert - should generate schedule via createSchedule
      expect(mockSchedulingService.createSchedule).toHaveBeenCalled()
    })

    it('should start work on the next scheduled workflow step', async () => {
      // Arrange
      const mockSequencedTasks = [
        {
          id: 'workflow-1',
          title: 'Test workflow',
          name: 'Test workflow',
          overallStatus: 'todo',
          steps: [
            {
              id: 'step-1',
              title: 'Next step',
              name: 'Next step',
              status: 'todo',
              estimatedDuration: 45,
              duration: 45,
            },
          ],
        } as any,
      ]
      
      const mockSchedule = {
        scheduledItems: [
          {
            id: 'step-1',
            title: 'Next step',
            type: 'step',
            workflowId: 'workflow-1',
            estimatedDuration: 45,
            scheduledStart: new Date(),
          },
        ],
        conflicts: [],
        unscheduledTasks: [],
      }

      mockSchedulingService.createSchedule.mockResolvedValue(mockSchedule)
      
      useTaskStore.setState({
        tasks: [],
        sequencedTasks: mockSequencedTasks as any,
      })

      // Act
      const store = useTaskStore.getState()
      await store.startNextTask()

      // Assert - should generate schedule via createSchedule
      expect(mockSchedulingService.createSchedule).toHaveBeenCalled()
    })

    it('should handle case when no next task is available', async () => {
      // Arrange - empty schedule
      const mockSchedule = {
        scheduledItems: [],
        conflicts: [],
        unscheduledTasks: [],
      }

      mockSchedulingService.createSchedule.mockResolvedValue(mockSchedule)

      // Act
      const store = useTaskStore.getState()
      await store.startNextTask()

      // Assert
      expect(mockSchedulingService.createSchedule).toHaveBeenCalled()
    })
  })
})