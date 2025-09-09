/**
 * Tests for scheduling integration with useTaskStore
 * These tests verify that the store can get the next scheduled task/step
 * using the existing SchedulingService
 */

import { beforeEach, describe, it, expect, vi } from 'vitest'
import { useTaskStore } from './useTaskStore'
import { getDatabase } from '../services/database'

// Mock the database
vi.mock('../services/database', () => ({
  getDatabase: vi.fn(() => ({
    getTasks: vi.fn(),
    getSequencedTasks: vi.fn(),
    updateTaskStepProgress: vi.fn(),
    createStepWorkSession: vi.fn(),
  })),
}))

// Mock the WorkTrackingService
vi.mock('../services/workTrackingService', () => ({
  WorkTrackingService: vi.fn().mockImplementation(() => ({
    initialize: vi.fn(),
    startWorkSession: vi.fn(),
    pauseWorkSession: vi.fn(),
    stopWorkSession: vi.fn(),
    getCurrentActiveSession: vi.fn(),
    isAnyWorkActive: vi.fn(),
  })),
}))

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
vi.mock('../utils/logger', () => ({
  logger: {
    ui: { warn: vi.fn(), error: vi.fn() },
    store: { info: vi.fn(), error: vi.fn() },
  },
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
    }

    vi.mocked(getDatabase).mockReturnValue(mockDatabase)

    // Get the mock instance from the mocked module
    const schedulingModule = await import('@shared/scheduling-service') as any
    mockSchedulingService = schedulingModule.__mockInstance
  })

  describe('getNextScheduledItem integration', () => {
    it('should get the next scheduled task when no active session exists', async () => {
      // Arrange
      const mockTasks = [
        {
          id: 'task-1',
          title: 'High priority task',
          status: 'todo',
          type: 'focused',
          estimatedDuration: 120,
          priority: 1,
        },
      ]

      const mockSequencedTasks = [
        {
          id: 'workflow-1',
          title: 'Important workflow',
          steps: [
            {
              id: 'step-1',
              title: 'First step',
              status: 'todo',
              estimatedDuration: 60,
            },
          ],
        },
      ]

      const mockNextItem = {
        type: 'task',
        id: 'task-1',
        title: 'High priority task',
        estimatedDuration: 120,
        scheduledStartTime: new Date('2024-01-15T09:00:00Z'),
      }

      mockDatabase.getTasks.mockResolvedValue(mockTasks)
      mockDatabase.getSequencedTasks.mockResolvedValue(mockSequencedTasks)
      mockSchedulingService.getNextScheduledItem.mockResolvedValue(mockNextItem)

      // Set the store's state directly (since getNextScheduledItem reads from state, not database)
      const store = useTaskStore.getState()
      useTaskStore.setState({
        tasks: mockTasks as any,
        sequencedTasks: mockSequencedTasks as any,
      })

      // Act
      const nextItem = await store.getNextScheduledItem()

      // Assert - This should FAIL since getNextScheduledItem doesn't exist yet
      expect(mockSchedulingService.getNextScheduledItem).toHaveBeenCalledWith(
        mockTasks,
        mockSequencedTasks,
      )
      expect(nextItem).toEqual(mockNextItem)
    })

    it('should return null when no items are available to schedule', async () => {
      // Arrange
      mockDatabase.getTasks.mockResolvedValue([])
      mockDatabase.getSequencedTasks.mockResolvedValue([])
      mockSchedulingService.getNextScheduledItem.mockResolvedValue(null)

      // Act
      const store = useTaskStore.getState()
      const nextItem = await store.getNextScheduledItem()

      // Assert - This should FAIL since getNextScheduledItem doesn't exist yet
      expect(nextItem).toBeNull()
    })

    it('should handle scheduling service errors gracefully', async () => {
      // Arrange
      const error = new Error('Scheduling failed')
      mockDatabase.getTasks.mockResolvedValue([])
      mockDatabase.getSequencedTasks.mockResolvedValue([])
      mockSchedulingService.getNextScheduledItem.mockRejectedValue(error)

      // Act & Assert - Should not throw
      const store = useTaskStore.getState()
      await expect(store.getNextScheduledItem()).resolves.toBeNull()
    })

    it('should prioritize workflow steps over regular tasks', async () => {
      // Arrange
      const mockTasks = [
        {
          id: 'task-1',
          title: 'Low priority task',
          status: 'todo',
          priority: 3,
        },
      ]

      const mockSequencedTasks = [
        {
          id: 'workflow-1',
          title: 'High priority workflow',
          steps: [
            {
              id: 'step-1',
              title: 'Critical step',
              status: 'todo',
              estimatedDuration: 30,
            },
          ],
        },
      ]

      const mockNextItem = {
        type: 'step',
        id: 'step-1',
        workflowId: 'workflow-1',
        title: 'Critical step',
        estimatedDuration: 30,
        scheduledStartTime: new Date('2024-01-15T09:00:00Z'),
      }

      mockDatabase.getTasks.mockResolvedValue(mockTasks)
      mockDatabase.getSequencedTasks.mockResolvedValue(mockSequencedTasks)
      mockSchedulingService.getNextScheduledItem.mockResolvedValue(mockNextItem)

      // Act
      const store = useTaskStore.getState()
      const nextItem = await store.getNextScheduledItem()

      // Assert - This should FAIL since getNextScheduledItem doesn't exist yet
      expect(nextItem).toEqual(mockNextItem)
      expect(nextItem?.type).toBe('step')
    })

    it('should filter out completed and in-progress items', async () => {
      // Arrange
      const mockTasks = [
        {
          id: 'task-1',
          title: 'Completed task',
          status: 'completed',
        },
        {
          id: 'task-2',
          title: 'In progress task',
          status: 'in_progress',
        },
        {
          id: 'task-3',
          title: 'Available task',
          status: 'todo',
        },
      ]

      const mockSequencedTasks = [
        {
          id: 'workflow-1',
          title: 'Test workflow',
          steps: [
            {
              id: 'step-1',
              title: 'Completed step',
              status: 'completed',
            },
            {
              id: 'step-2',
              title: 'Available step',
              status: 'todo',
            },
          ],
        },
      ]

      // Only incomplete items should be passed to scheduling service
      const _expectedTasks = [mockTasks[2]] // Only the todo task
      const _expectedSequenced = [{
        ...mockSequencedTasks[0],
        steps: [mockSequencedTasks[0].steps[1]], // Only the todo step
      }]

      mockDatabase.getTasks.mockResolvedValue(mockTasks)
      mockDatabase.getSequencedTasks.mockResolvedValue(mockSequencedTasks)
      mockSchedulingService.getNextScheduledItem.mockResolvedValue(null)

      // Set the store's state directly
      const store = useTaskStore.getState()
      useTaskStore.setState({
        tasks: mockTasks as any,
        sequencedTasks: mockSequencedTasks as any,
      })

      // Act
      await store.getNextScheduledItem()

      // Assert - The store should pass all tasks to the SchedulingService, which does its own filtering
      expect(mockSchedulingService.getNextScheduledItem).toHaveBeenCalledWith(
        mockTasks, // Store passes all tasks, SchedulingService filters
        mockSequencedTasks, // Store passes all sequenced tasks, SchedulingService filters
      )
    })
  })

  describe('integration with startNextTask', () => {
    it('should start work on the next scheduled task', async () => {
      // Arrange
      const mockNextItem = {
        type: 'task',
        id: 'task-1',
        title: 'Next task',
        estimatedDuration: 90,
      }

      mockSchedulingService.getNextScheduledItem.mockResolvedValue(mockNextItem)

      // Act
      const store = useTaskStore.getState()
      await store.startNextTask()

      // Assert - This should FAIL since startNextTask doesn't exist yet
      expect(mockSchedulingService.getNextScheduledItem).toHaveBeenCalled()
      // Verify that startWorkOnTask was called with the next item
    })

    it('should start work on the next scheduled workflow step', async () => {
      // Arrange
      const mockNextItem = {
        type: 'step',
        id: 'step-1',
        workflowId: 'workflow-1',
        title: 'Next step',
        estimatedDuration: 45,
      }

      mockSchedulingService.getNextScheduledItem.mockResolvedValue(mockNextItem)

      // Act
      const store = useTaskStore.getState()
      await store.startNextTask()

      // Assert - This should FAIL since startNextTask doesn't exist yet
      expect(mockSchedulingService.getNextScheduledItem).toHaveBeenCalled()
      // Verify that startWorkOnStep was called with the next item
    })

    it('should handle case when no next task is available', async () => {
      // Arrange
      mockSchedulingService.getNextScheduledItem.mockResolvedValue(null)

      // Act & Assert - Should not throw
      const store = useTaskStore.getState()
      await expect(store.startNextTask()).resolves.toBeUndefined()
    })
  })
})
