/**
 * Tests for startNextTask (display/action consistency + stale-cache validation)
 * and refreshSchedule (manual scheduler re-run).
 *
 * Regression context (decisions/2026-06-11-hardening-findings/complete-task-stale-start.json):
 * the Start button used to read the scheduler store's CACHED nextScheduledItem with no live
 * validation, so after completing an async-wait task it restarted that same task — logging
 * new work onto it and flipping it back to in-progress.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

const {
  mockGetTasks,
  mockGetSequencedTasks,
  mockRecomputeSchedule,
  mockLoadWorkPatterns,
  mockIsAnyWorkActive,
  schedulerState,
} = vi.hoisted(() => ({
  mockGetTasks: vi.fn(),
  mockGetSequencedTasks: vi.fn(),
  mockRecomputeSchedule: vi.fn(),
  mockLoadWorkPatterns: vi.fn(async () => {}),
  mockIsAnyWorkActive: vi.fn(() => false),
  schedulerState: { nextScheduledItem: null as { id: string; type: string; workflowId?: string } | null },
}))

vi.mock('../../services/database', () => ({
  getDatabase: vi.fn(() => ({
    getTasks: mockGetTasks,
    getSequencedTasks: mockGetSequencedTasks,
  })),
}))

vi.mock('../useSchedulerStore', () => ({
  useSchedulerStore: {
    getState: vi.fn(() => ({
      recomputeSchedule: mockRecomputeSchedule,
      nextScheduledItem: schedulerState.nextScheduledItem,
    })),
  },
}))

vi.mock('../useWorkPatternStore', () => ({
  useWorkPatternStore: {
    getState: vi.fn(() => ({ loadWorkPatterns: mockLoadWorkPatterns })),
  },
}))

vi.mock('../../services/workTrackingService', () => {
  const service = {
    isAnyWorkActive: mockIsAnyWorkActive,
    initialize: vi.fn(async () => {}),
    getCurrentActiveSession: vi.fn(() => null),
  }
  return {
    WorkTrackingService: vi.fn(() => service),
    getWorkTrackingService: vi.fn(() => service),
  }
})

vi.mock('@/logger', () => ({
  logger: {
    ui: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    system: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  },
}))

import { useTaskStore } from '../useTaskStore'
import { TaskStatus, NextScheduledItemType } from '@shared/enums'
import type { Task } from '@shared/types'

function makeTask(id: string, overrides: Partial<Task> = {}): Task {
  return {
    id,
    name: `Task ${id}`,
    duration: 60,
    importance: 5,
    urgency: 5,
    type: 'focused',
    sessionId: 'session-1',
    asyncWaitTime: 0,
    dependencies: [],
    completed: false,
    hasSteps: false,
    overallStatus: TaskStatus.NotStarted,
    criticalPathDuration: 60,
    worstCaseDuration: 60,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

describe('startNextTask', () => {
  const startWorkOnTask = vi.fn(async () => {})
  const startWorkOnStep = vi.fn(async () => {})

  beforeEach(() => {
    vi.clearAllMocks()
    schedulerState.nextScheduledItem = null
    // Replace the work-starting actions so tests stay at the decision layer.
    useTaskStore.setState({
      tasks: [],
      sequencedTasks: [],
      startWorkOnTask,
      startWorkOnStep,
      nextTaskSkipIndex: 0,
    })
  })

  it('starts the EXPLICIT item the widget displays (never the cache)', async () => {
    schedulerState.nextScheduledItem = { id: 'stale-task', type: NextScheduledItemType.Task }

    const started = await useTaskStore.getState().startNextTask({
      id: 'displayed-step', type: NextScheduledItemType.Step, workflowId: 'wf-1',
    })

    expect(started).toBe(true)
    expect(startWorkOnStep).toHaveBeenCalledWith('displayed-step', 'wf-1')
    expect(startWorkOnTask).not.toHaveBeenCalled()
  })

  it('fallback REJECTS a cached item whose live task is Waiting (the stale-restart regression)', async () => {
    useTaskStore.setState({
      tasks: [makeTask('task-a', { completed: false, overallStatus: TaskStatus.Waiting })],
    })
    schedulerState.nextScheduledItem = { id: 'task-a', type: NextScheduledItemType.Task }

    const started = await useTaskStore.getState().startNextTask()

    expect(started).toBe(false)
    expect(startWorkOnTask).not.toHaveBeenCalled()
    expect(startWorkOnStep).not.toHaveBeenCalled()
  })

  it('fallback starts a cached item that live data confirms is startable', async () => {
    useTaskStore.setState({ tasks: [makeTask('task-b')] })
    schedulerState.nextScheduledItem = { id: 'task-b', type: NextScheduledItemType.Task }

    const started = await useTaskStore.getState().startNextTask()

    expect(started).toBe(true)
    expect(startWorkOnTask).toHaveBeenCalledWith('task-b')
  })

  it('returns false without starting anything when work is already active', async () => {
    mockIsAnyWorkActive.mockReturnValue(true)

    const started = await useTaskStore.getState().startNextTask({
      id: 'task-x', type: NextScheduledItemType.Task,
    })

    expect(started).toBe(false)
    expect(startWorkOnTask).not.toHaveBeenCalled()
  })
})

describe('refreshSchedule', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useTaskStore.setState({ tasks: [], sequencedTasks: [], nextTaskSkipIndex: 2 })
  })

  it('refetches data, reloads work patterns, recomputes — and preserves the skip index', async () => {
    const freshTasks = [makeTask('fresh-1')]
    mockGetTasks.mockResolvedValue(freshTasks)
    mockGetSequencedTasks.mockResolvedValue([])

    await useTaskStore.getState().refreshSchedule()

    const state = useTaskStore.getState()
    expect(state.tasks.map(t => t.id)).toEqual(['fresh-1'])
    expect(mockLoadWorkPatterns).toHaveBeenCalledTimes(1)
    expect(mockRecomputeSchedule).toHaveBeenCalledTimes(1)
    // Unlike initializeData, a manual refresh must not reset the user's skip position.
    expect(state.nextTaskSkipIndex).toBe(2)
  })
})
