import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { useTaskStore } from '../useTaskStore'
import { useSchedulerStore } from '../useSchedulerStore'
import { useWorkPatternStore } from '../useWorkPatternStore'
import { connectStores } from '../storeConnector'
import type { Task } from '@shared/types'
import type { DailyWorkPattern } from '@shared/work-blocks-types'

// Mock dependencies
vi.mock('@/logger', () => ({
  logger: {
    ui: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
  },
}))

vi.mock('@shared/time-provider', () => ({
  getCurrentTime: vi.fn(() => new Date('2024-01-15T10:00:00')),
}))

vi.mock('../services/database', () => ({
  getDatabase: vi.fn(() => ({
    getTasks: vi.fn().mockResolvedValue([]),
    getCurrentSession: vi.fn().mockResolvedValue({ id: 'session-1' }),
  })),
}))

vi.mock('../services/workTrackingService', () => ({
  getWorkTrackingService: vi.fn(() => ({
    initialize: vi.fn().mockResolvedValue(undefined),
  })),
}))

describe('Store Connector - Reactive Updates', () => {
  let unsubscribe: (() => void) | null = null

  beforeEach(() => {
    // Reset stores
    useTaskStore.setState({
      tasks: [],
      sequencedTasks: [],
      activeWorkSessions: new Map(),
      nextTaskSkipIndex: 0,
    })

    useSchedulerStore.setState({
      tasks: [],
      sequencedTasks: [],
      workPatterns: [],
      workSettings: null,
      activeWorkSessions: new Set(),
      scheduleResult: null,
      scheduledItems: [],
      nextScheduledItem: null,
      nextTaskSkipIndex: 0,
    })

    useWorkPatternStore.setState({
      workPatterns: [],
    })

    vi.clearAllMocks()
  })

  afterEach(() => {
    if (unsubscribe) {
      unsubscribe()
      unsubscribe = null
    }
  })

  it('should connect task store to scheduler store', async () => {
    unsubscribe = connectStores()

    const setInputsSpy = vi.spyOn(useSchedulerStore.getState(), 'setInputs')

    const newTask: Task = {
      id: 'task-1',
      name: 'Test Task',
      description: '',
      estimatedDuration: 60,
      type: 'focused' as any,
      priority: 1,
      completed: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    useTaskStore.setState({ tasks: [newTask] })

    // Wait for debounce (100ms)
    await new Promise(resolve => setTimeout(resolve, 150))

    // Verify scheduler was updated
    expect(setInputsSpy).toHaveBeenCalled()
    const callArgs = setInputsSpy.mock.calls[0][0]
    expect(callArgs.tasks).toEqual([newTask])
  })

  it('should connect work pattern store to scheduler store', () => {
    unsubscribe = connectStores()

    const setInputsSpy = vi.spyOn(useSchedulerStore.getState(), 'setInputs')

    const newPattern: DailyWorkPattern = {
      date: '2024-01-15',
      blocks: [],
      meetings: [],
    }

    useWorkPatternStore.setState({ workPatterns: [newPattern] })

    expect(setInputsSpy).toHaveBeenCalled()
    const callArgs = setInputsSpy.mock.calls[0][0]
    expect(callArgs.workPatterns).toEqual([newPattern])
  })

  it('should connect skip index to scheduler', async () => {
    unsubscribe = connectStores()

    const setSkipIndexSpy = vi.spyOn(useSchedulerStore.getState(), 'setNextTaskSkipIndex')

    useTaskStore.setState({ nextTaskSkipIndex: 3 })

    // Wait for debounce (100ms)
    await new Promise(resolve => setTimeout(resolve, 150))

    expect(setSkipIndexSpy).toHaveBeenCalledWith(3)
  })

  it('should handle active work sessions updates', async () => {
    unsubscribe = connectStores()

    const setInputsSpy = vi.spyOn(useSchedulerStore.getState(), 'setInputs')

    const activeSession = {
      id: 'session-1',
      taskId: 'task-1',
      startTime: new Date(),
      plannedMinutes: 60,
    }

    useTaskStore.setState({
      activeWorkSessions: new Map([['task-1', activeSession as any]]),
    })

    // Wait for debounce (100ms)
    await new Promise(resolve => setTimeout(resolve, 150))

    expect(setInputsSpy).toHaveBeenCalled()
    const callArgs = setInputsSpy.mock.calls[0][0]
    expect(callArgs.activeWorkSessions).toEqual(new Set(['task-1']))
  })

  it('should return cleanup function', () => {
    const cleanup = connectStores()
    expect(typeof cleanup).toBe('function')
    cleanup()
  })

  it('should prevent multiple connections', () => {
    const cleanup1 = connectStores()
    connectStores() // Should warn and not return a cleanup function

    // Only need to clean up the first one
    cleanup1()
  })
})
