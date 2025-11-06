/**
 * Tests for nextTaskSkipIndex functionality in useTaskStore
 * Tests the skip index state management and its effect on getNextScheduledItem
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
    TIME_OVERRIDE_CHANGED: 'timeOverrideChanged',
  },
}))

vi.mock('@/logger', () => ({
  logger: {
    ui: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    system: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    db: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  },
}))

let mockSchedulerInstance: any

vi.mock('@shared/unified-scheduler', () => ({
  UnifiedScheduler: vi.fn().mockImplementation(() => mockSchedulerInstance),
  OptimizationMode: {
    Realistic: 'realistic',
    Optimal: 'optimal',
    Conservative: 'conservative',
  },
}))

vi.mock('@shared/time-provider', () => ({
  getCurrentTime: vi.fn(() => new Date('2025-01-15T08:00:00Z')),
}))

describe('useTaskStore - nextTaskSkipIndex', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // Reset mock scheduler
    mockSchedulerInstance = {
      scheduleForDisplay: vi.fn().mockReturnValue({
        scheduled: [],
        unscheduled: [],
        debugInfo: {
          scheduledItems: [],
          unscheduledItems: [],
          blockUtilization: [],
          warnings: [],
          totalScheduled: 0,
          totalUnscheduled: 0,
          scheduleEfficiency: 0,
        },
        conflicts: [],
      }),
    }

    // Reset the store state
    useTaskStore.setState({
      nextTaskSkipIndex: 0,
      tasks: [],
      sequencedTasks: [],
      workPatterns: [
        {
          date: new Date().toISOString().split('T')[0],
          blocks: [{ id: 'block-1', startTime: '09:00', endTime: '17:00', type: 'flexible', capacity: { focus: 480, admin: 480 } }],
          meetings: [],
          accumulated: { focus: 0, admin: 0, personal: 0 },
        },
      ],
    })
  })

  describe('incrementNextTaskSkipIndex', () => {
    it('should increment skip index from 0 to 1', () => {
      const store = useTaskStore.getState()
      expect(store.nextTaskSkipIndex).toBe(0)

      store.incrementNextTaskSkipIndex()

      expect(useTaskStore.getState().nextTaskSkipIndex).toBe(1)
    })

    it('should increment skip index multiple times', () => {
      const store = useTaskStore.getState()

      store.incrementNextTaskSkipIndex()
      store.incrementNextTaskSkipIndex()
      store.incrementNextTaskSkipIndex()

      expect(useTaskStore.getState().nextTaskSkipIndex).toBe(3)
    })
  })

  describe('resetNextTaskSkipIndex', () => {
    it('should reset skip index to 0', () => {
      const store = useTaskStore.getState()
      store.incrementNextTaskSkipIndex()
      store.incrementNextTaskSkipIndex()
      expect(useTaskStore.getState().nextTaskSkipIndex).toBe(2)

      store.resetNextTaskSkipIndex()

      expect(useTaskStore.getState().nextTaskSkipIndex).toBe(0)
    })

    it('should not change state if already 0', () => {
      const store = useTaskStore.getState()
      expect(store.nextTaskSkipIndex).toBe(0)

      store.resetNextTaskSkipIndex()

      expect(useTaskStore.getState().nextTaskSkipIndex).toBe(0)
    })
  })

  describe('getNextScheduledItem', () => {
    it('should use the stored skipIndex from state', async () => {
      const mockTasks = [
        { id: 'task-1', name: 'Task 1', type: 'focused', duration: 60, completed: false },
        { id: 'task-2', name: 'Task 2', type: 'focused', duration: 60, completed: false },
        { id: 'task-3', name: 'Task 3', type: 'focused', duration: 60, completed: false },
      ]

      mockSchedulerInstance.scheduleForDisplay.mockReturnValue({
        scheduled: [
          { id: 'task-1', name: 'Task 1', type: 'task', duration: 60, priority: 50, startTime: new Date('2024-01-15T09:00:00'), endTime: new Date('2024-01-15T10:00:00'), taskType: 'focused' },
          { id: 'task-2', name: 'Task 2', type: 'task', duration: 60, priority: 40, startTime: new Date('2024-01-15T10:00:00'), endTime: new Date('2024-01-15T11:00:00'), taskType: 'focused' },
          { id: 'task-3', name: 'Task 3', type: 'task', duration: 60, priority: 30, startTime: new Date('2024-01-15T11:00:00'), endTime: new Date('2024-01-15T12:00:00'), taskType: 'focused' },
        ],
        unscheduled: [],
        debugInfo: { scheduledItems: [], unscheduledItems: [], blockUtilization: [], warnings: [], totalScheduled: 3, totalUnscheduled: 0, scheduleEfficiency: 100 },
        conflicts: [],
      })

      useTaskStore.setState({
        tasks: mockTasks as any,
        sequencedTasks: [],
        nextTaskSkipIndex: 0,
      })

      const store = useTaskStore.getState()
      const firstResult = await store.getNextScheduledItem()

      expect(firstResult?.id).toBe('task-1')

      store.incrementNextTaskSkipIndex()
      const secondResult = await store.getNextScheduledItem()

      expect(secondResult?.id).toBe('task-2')
    })

    it('should advance through tasks as skipIndex increments', async () => {
      const mockTasks = [
        { id: 'task-1', name: 'Task 1', type: 'focused', duration: 60, completed: false },
        { id: 'task-2', name: 'Task 2', type: 'focused', duration: 60, completed: false },
        { id: 'task-3', name: 'Task 3', type: 'focused', duration: 60, completed: false },
      ]

      mockSchedulerInstance.scheduleForDisplay.mockReturnValue({
        scheduled: [
          { id: 'task-1', name: 'Task 1', type: 'task', duration: 60, priority: 50, startTime: new Date('2024-01-15T09:00:00'), endTime: new Date('2024-01-15T10:00:00'), taskType: 'focused' },
          { id: 'task-2', name: 'Task 2', type: 'task', duration: 60, priority: 40, startTime: new Date('2024-01-15T10:00:00'), endTime: new Date('2024-01-15T11:00:00'), taskType: 'focused' },
          { id: 'task-3', name: 'Task 3', type: 'task', duration: 60, priority: 30, startTime: new Date('2024-01-15T11:00:00'), endTime: new Date('2024-01-15T12:00:00'), taskType: 'focused' },
        ],
        unscheduled: [],
        debugInfo: { scheduledItems: [], unscheduledItems: [], blockUtilization: [], warnings: [], totalScheduled: 3, totalUnscheduled: 0, scheduleEfficiency: 100 },
        conflicts: [],
      })

      useTaskStore.setState({
        tasks: mockTasks as any,
        sequencedTasks: [],
        nextTaskSkipIndex: 0,
      })

      const store = useTaskStore.getState()

      const firstResult = await store.getNextScheduledItem()
      expect(firstResult?.id).toBe('task-1')

      store.incrementNextTaskSkipIndex()
      const secondResult = await store.getNextScheduledItem()
      expect(secondResult?.id).toBe('task-2')

      store.incrementNextTaskSkipIndex()
      const thirdResult = await store.getNextScheduledItem()
      expect(thirdResult?.id).toBe('task-3')
    })

    it('should cap skipIndex at last available item', async () => {
      const mockTasks = [
        { id: 'task-1', name: 'Task 1', type: 'focused', duration: 60, completed: false },
        { id: 'task-2', name: 'Task 2', type: 'focused', duration: 60, completed: false },
      ]

      mockSchedulerInstance.scheduleForDisplay.mockReturnValue({
        scheduled: [
          { id: 'task-1', name: 'Task 1', type: 'task', duration: 60, priority: 50, startTime: new Date('2024-01-15T09:00:00'), endTime: new Date('2024-01-15T10:00:00'), taskType: 'focused' },
          { id: 'task-2', name: 'Task 2', type: 'task', duration: 60, priority: 40, startTime: new Date('2024-01-15T10:00:00'), endTime: new Date('2024-01-15T11:00:00'), taskType: 'focused' },
        ],
        unscheduled: [],
        debugInfo: { scheduledItems: [], unscheduledItems: [], blockUtilization: [], warnings: [], totalScheduled: 2, totalUnscheduled: 0, scheduleEfficiency: 100 },
        conflicts: [],
      })

      useTaskStore.setState({
        tasks: mockTasks as any,
        sequencedTasks: [],
        nextTaskSkipIndex: 10, // Way beyond available items
      })

      const store = useTaskStore.getState()
      const result = await store.getNextScheduledItem()

      expect(result?.id).toBe('task-2') // Should return last item
    })

    it('should skip completed items and only count incomplete ones', async () => {
      const mockTasks = [
        { id: 'task-1', name: 'Task 1', type: 'focused', duration: 60, completed: true }, // completed
        { id: 'task-2', name: 'Task 2', type: 'focused', duration: 60, completed: false },
        { id: 'task-3', name: 'Task 3', type: 'focused', duration: 60, completed: false },
      ]

      // Scheduler should only schedule incomplete tasks
      mockSchedulerInstance.scheduleForDisplay.mockReturnValue({
        scheduled: [
          { id: 'task-2', name: 'Task 2', type: 'task', duration: 60, priority: 40, startTime: new Date('2024-01-15T09:00:00'), endTime: new Date('2024-01-15T10:00:00'), taskType: 'focused' },
          { id: 'task-3', name: 'Task 3', type: 'task', duration: 60, priority: 30, startTime: new Date('2024-01-15T10:00:00'), endTime: new Date('2024-01-15T11:00:00'), taskType: 'focused' },
        ],
        unscheduled: [],
        debugInfo: { scheduledItems: [], unscheduledItems: [], blockUtilization: [], warnings: [], totalScheduled: 2, totalUnscheduled: 0, scheduleEfficiency: 100 },
        conflicts: [],
      })

      useTaskStore.setState({
        tasks: mockTasks as any,
        sequencedTasks: [],
        nextTaskSkipIndex: 0,
      })

      const store = useTaskStore.getState()
      const firstResult = await store.getNextScheduledItem()

      expect(firstResult?.id).toBe('task-2') // Should skip completed task-1

      store.incrementNextTaskSkipIndex()
      const secondResult = await store.getNextScheduledItem()

      expect(secondResult?.id).toBe('task-3')
    })
  })
})
