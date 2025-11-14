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

// Events system has been removed

vi.mock('@/logger', () => ({
  logger: {
    ui: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    system: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    db: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  },
}))

// Mock unified scheduler with factory function to avoid hoisting issues
vi.mock('@shared/unified-scheduler', () => {
  const mockScheduleResult = {
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
  }

  return {
    UnifiedScheduler: vi.fn().mockImplementation(() => ({
      scheduleForDisplay: vi.fn().mockReturnValue(mockScheduleResult),
    })),
    OptimizationMode: {
      Realistic: 'realistic',
      Optimal: 'optimal',
      Conservative: 'conservative',
    },
  }
})

vi.mock('@shared/time-provider', () => ({
  getCurrentTime: vi.fn(() => new Date('2025-01-15T08:00:00Z')),
}))

describe('useTaskStore - nextTaskSkipIndex', () => {
  beforeEach(() => {
    vi.clearAllMocks()

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

  // getNextScheduledItem has been moved to useSchedulerStore,
  // so these tests are no longer applicable here
  describe.skip('getNextScheduledItem - moved to useSchedulerStore', () => {
    it('should use the stored skipIndex from state', async () => {
      // Test is no longer applicable - functionality moved to useSchedulerStore
    })

    it('should advance through tasks as skipIndex increments', async () => {
      // Test is no longer applicable - functionality moved to useSchedulerStore
    })

    it('should cap skipIndex at last available item', async () => {
      // Test is no longer applicable - functionality moved to useSchedulerStore
    })

    it('should skip completed items and only count incomplete ones', async () => {
      // Test is no longer applicable - functionality moved to useSchedulerStore
    })
  })
})
