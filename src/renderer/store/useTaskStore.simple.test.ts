/**
 * Simple integration test for Start Next Task functionality
 * Tests the core methods without complex mocking
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock all the dependencies to avoid runtime errors
vi.mock('../services/database', () => ({
  getDatabase: vi.fn(() => ({
    getTasks: vi.fn().mockResolvedValue([]),
    getSequencedTasks: vi.fn().mockResolvedValue([]),
    updateTask: vi.fn(),
    updateTaskStepProgress: vi.fn(),
    createStepWorkSession: vi.fn(),
  })),
}))

// Events system has been removed

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

vi.mock('../../logging/index.renderer', () => ({
  getRendererLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn() }),
}))

describe('Start Next Task Simple Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should have startNextTask method', async () => {
    // Import the store after mocking
    const { useTaskStore } = await import('./useTaskStore')

    const store = useTaskStore.getState()

    // Verify the method exists
    expect(typeof store.startNextTask).toBe('function')
    // getNextScheduledItem has been moved to useSchedulerStore
    expect(typeof store.startWorkOnTask).toBe('function')
  })

  it('should have correct method signatures', async () => {
    const { useTaskStore } = await import('./useTaskStore')

    const store = useTaskStore.getState()

    // These methods should exist and be functions
    expect(store.startNextTask).toBeDefined()
    // getNextScheduledItem has been moved to useSchedulerStore
    expect(store.startWorkOnTask).toBeDefined()
    expect(store.startWorkOnStep).toBeDefined()
  })

  it('should handle empty task list gracefully', async () => {
    const { useTaskStore } = await import('./useTaskStore')

    const store = useTaskStore.getState()

    // getNextScheduledItem has been moved to useSchedulerStore
    // With no tasks, startNextTask should not throw
    await expect(store.startNextTask()).resolves.not.toThrow()
  })
})
