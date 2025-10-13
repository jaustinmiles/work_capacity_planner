/**
 * Tests for nextTaskSkipIndex functionality in useTaskStore
 * Tests the skip index state management and reset behavior
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useTaskStore } from '../useTaskStore'

// Mock dependencies
vi.mock('../../services/database', () => ({
  getDatabase: vi.fn(() => ({
    getTasks: vi.fn().mockResolvedValue([]),
    getSequencedTasks: vi.fn().mockResolvedValue([]),
    getWorkPattern: vi.fn().mockResolvedValue(null),
    loadLastUsedSession: vi.fn().mockResolvedValue(undefined),
  })),
}))

vi.mock('../../services/workTrackingService', () => ({
  WorkTrackingService: vi.fn().mockImplementation(() => ({
    initialize: vi.fn().mockResolvedValue(undefined),
    getCurrentActiveSession: vi.fn().mockReturnValue(null),
    isAnyWorkActive: vi.fn().mockReturnValue(false),
  })),
}))

vi.mock('../../utils/events', () => ({
  appEvents: { on: vi.fn(), off: vi.fn(), emit: vi.fn() },
  EVENTS: {
    TIME_LOGGED: 'timeLogged',
    WORKFLOW_UPDATED: 'workflowUpdated',
    SESSION_CHANGED: 'sessionChanged',
    DATA_REFRESH_NEEDED: 'dataRefresh',
  },
}))

vi.mock('@/shared/logger', () => ({
  logger: { ui: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } },
}))

vi.mock('../../../logging/index.renderer', () => ({
  getRendererLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}))

vi.mock('@shared/scheduling-service', () => ({
  SchedulingService: vi.fn().mockImplementation(() => ({
    createWeeklySchedule: vi.fn().mockResolvedValue({}),
  })),
}))

vi.mock('@shared/unified-scheduler-adapter', () => ({
  UnifiedSchedulerAdapter: vi.fn().mockImplementation(() => ({
    scheduleTasks: vi.fn().mockReturnValue({
      scheduledTasks: [],
      unscheduledTasks: [],
      conflicts: [],
      totalDuration: 0,
    }),
  })),
}))

vi.mock('@shared/time-provider', () => ({
  getCurrentTime: vi.fn(() => new Date('2025-01-15T08:00:00Z')),
}))

describe('useTaskStore - nextTaskSkipIndex', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset the store state
    useTaskStore.setState({
      nextTaskSkipIndex: 0,
    })
  })

  describe('incrementNextTaskSkipIndex', () => {
    it('should increment skip index from 0 to 1', () => {
      // Arrange
      const store = useTaskStore.getState()
      expect(store.nextTaskSkipIndex).toBe(0)

      // Act
      store.incrementNextTaskSkipIndex()

      // Assert
      expect(useTaskStore.getState().nextTaskSkipIndex).toBe(1)
    })

    it('should increment skip index multiple times', () => {
      // Arrange
      const store = useTaskStore.getState()

      // Act
      store.incrementNextTaskSkipIndex()
      store.incrementNextTaskSkipIndex()
      store.incrementNextTaskSkipIndex()

      // Assert
      expect(useTaskStore.getState().nextTaskSkipIndex).toBe(3)
    })
  })

  describe('resetNextTaskSkipIndex', () => {
    it('should reset skip index to 0', () => {
      // Arrange
      const store = useTaskStore.getState()
      store.incrementNextTaskSkipIndex()
      store.incrementNextTaskSkipIndex()
      expect(useTaskStore.getState().nextTaskSkipIndex).toBe(2)

      // Act
      store.resetNextTaskSkipIndex()

      // Assert
      expect(useTaskStore.getState().nextTaskSkipIndex).toBe(0)
    })

    it('should not change state if already 0', () => {
      // Arrange
      const store = useTaskStore.getState()
      expect(store.nextTaskSkipIndex).toBe(0)

      // Act
      store.resetNextTaskSkipIndex()

      // Assert
      expect(useTaskStore.getState().nextTaskSkipIndex).toBe(0)
    })
  })

  describe('getNextScheduledItem', () => {
    it('should use the stored skipIndex from state', async () => {
      // Arrange
      const store = useTaskStore.getState()

      // Set up mock schedule with multiple items
      useTaskStore.setState({
        currentSchedule: {
          scheduledItems: [
            { id: 'task-1', name: 'Task 1', scheduledStartTime: new Date() },
            { id: 'task-2', name: 'Task 2', scheduledStartTime: new Date() },
            { id: 'task-3', name: 'Task 3', scheduledStartTime: new Date() },
          ],
          unscheduledItems: [],
          conflicts: [],
          overCapacityDays: [],
          underUtilizedDays: [],
          suggestions: [],
          warnings: [],
          success: true,
          totalWorkDays: 1,
          totalFocusedHours: 8,
          totalAdminHours: 2,
          projectedCompletionDate: new Date(),
        },
        tasks: [
          { id: 'task-1', name: 'Task 1', completed: false, duration: 60 },
          { id: 'task-2', name: 'Task 2', completed: false, duration: 60 },
          { id: 'task-3', name: 'Task 3', completed: false, duration: 60 },
        ] as any,
        sequencedTasks: [],
        isScheduling: false,
        nextTaskSkipIndex: 0,
      })

      // Act - Should get first task
      const firstResult = await store.getNextScheduledItem()

      // Assert
      expect(firstResult).toBeDefined()
      expect(firstResult?.id).toBe('task-1')

      // Act - Increment and get next task
      store.incrementNextTaskSkipIndex()
      const secondResult = await store.getNextScheduledItem()

      // Assert
      expect(secondResult).toBeDefined()
      expect(secondResult?.id).toBe('task-2')
    })

    it('should advance through tasks as skipIndex increments', async () => {
      // Arrange
      const store = useTaskStore.getState()

      useTaskStore.setState({
        currentSchedule: {
          scheduledItems: [
            { id: 'task-1', name: 'Task 1', scheduledStartTime: new Date() },
            { id: 'task-2', name: 'Task 2', scheduledStartTime: new Date() },
            { id: 'task-3', name: 'Task 3', scheduledStartTime: new Date() },
          ],
          unscheduledItems: [],
          conflicts: [],
          overCapacityDays: [],
          underUtilizedDays: [],
          suggestions: [],
          warnings: [],
          success: true,
          totalWorkDays: 1,
          totalFocusedHours: 8,
          totalAdminHours: 2,
          projectedCompletionDate: new Date(),
        },
        tasks: [
          { id: 'task-1', name: 'Task 1', completed: false, duration: 60 },
          { id: 'task-2', name: 'Task 2', completed: false, duration: 60 },
          { id: 'task-3', name: 'Task 3', completed: false, duration: 60 },
        ] as any,
        sequencedTasks: [],
        isScheduling: false,
        nextTaskSkipIndex: 0,
      })

      // Act - Get task at index 0
      const firstResult = await store.getNextScheduledItem()
      expect(firstResult?.id).toBe('task-1')

      // Increment and get task at index 1
      store.incrementNextTaskSkipIndex()
      const secondResult = await store.getNextScheduledItem()
      expect(secondResult?.id).toBe('task-2')

      // Increment and get task at index 2
      store.incrementNextTaskSkipIndex()
      const thirdResult = await store.getNextScheduledItem()
      expect(thirdResult?.id).toBe('task-3')
    })

    it('should cap skipIndex at last available item', async () => {
      // Arrange
      const store = useTaskStore.getState()

      useTaskStore.setState({
        currentSchedule: {
          scheduledItems: [
            { id: 'task-1', name: 'Task 1', scheduledStartTime: new Date() },
            { id: 'task-2', name: 'Task 2', scheduledStartTime: new Date() },
          ],
          unscheduledItems: [],
          conflicts: [],
          overCapacityDays: [],
          underUtilizedDays: [],
          suggestions: [],
          warnings: [],
          success: true,
          totalWorkDays: 1,
          totalFocusedHours: 8,
          totalAdminHours: 2,
          projectedCompletionDate: new Date(),
        },
        tasks: [
          { id: 'task-1', name: 'Task 1', completed: false, duration: 60 },
          { id: 'task-2', name: 'Task 2', completed: false, duration: 60 },
        ] as any,
        sequencedTasks: [],
        isScheduling: false,
        nextTaskSkipIndex: 10, // Way beyond available items
      })

      // Act - skipIndex is 10 but only 2 items exist
      const result = await store.getNextScheduledItem()

      // Assert - Should return last item (index 1)
      expect(result).toBeDefined()
      expect(result?.id).toBe('task-2')
    })

    it('should skip completed items and only count incomplete ones', async () => {
      // Arrange
      const store = useTaskStore.getState()

      useTaskStore.setState({
        currentSchedule: {
          scheduledItems: [
            { id: 'task-1', name: 'Task 1', scheduledStartTime: new Date() },
            { id: 'task-2', name: 'Task 2', scheduledStartTime: new Date() },
            { id: 'task-3', name: 'Task 3', scheduledStartTime: new Date() },
          ],
          unscheduledItems: [],
          conflicts: [],
          overCapacityDays: [],
          underUtilizedDays: [],
          suggestions: [],
          warnings: [],
          success: true,
          totalWorkDays: 1,
          totalFocusedHours: 8,
          totalAdminHours: 2,
          projectedCompletionDate: new Date(),
        },
        tasks: [
          { id: 'task-1', name: 'Task 1', completed: true, duration: 60 }, // completed
          { id: 'task-2', name: 'Task 2', completed: false, duration: 60 },
          { id: 'task-3', name: 'Task 3', completed: false, duration: 60 },
        ] as any,
        sequencedTasks: [],
        isScheduling: false,
        nextTaskSkipIndex: 0,
      })

      // Act - Get first incomplete task (should be task-2, not task-1)
      const firstResult = await store.getNextScheduledItem()

      // Assert
      expect(firstResult).toBeDefined()
      expect(firstResult?.id).toBe('task-2')

      // Act - Increment and get second incomplete task
      store.incrementNextTaskSkipIndex()
      const secondResult = await store.getNextScheduledItem()

      // Assert
      expect(secondResult).toBeDefined()
      expect(secondResult?.id).toBe('task-3')
    })
  })
})
