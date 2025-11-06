import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useTaskStore } from './useTaskStore'
import { getDatabase } from '../services/database'

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

vi.mock('@/logger', () => ({
  logger: {
    ui: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
    system: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
    db: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
  },
}))

vi.mock('../utils/events', () => ({
  appEvents: {
    emit: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
  },
  EVENTS: {
    TIME_LOGGED: 'timeLogged',
    DATA_REFRESH_NEEDED: 'dataRefresh',
    SESSION_CHANGED: 'sessionChanged',
    TIME_OVERRIDE_CHANGED: 'timeOverrideChanged',
  },
}))

// Mock the UnifiedScheduler
vi.mock('@shared/unified-scheduler', () => {
  const mockScheduler = {
    scheduleForDisplay: vi.fn(),
  }

  return {
    UnifiedScheduler: vi.fn().mockImplementation(() => mockScheduler),
    OptimizationMode: {
      Realistic: 'realistic',
      Optimal: 'optimal',
      Conservative: 'conservative',
    },
    __mockScheduler: mockScheduler,
  }
})

describe('useTaskStore - getNextScheduledItem UI behavior', () => {
  let mockDatabase: any
  let mockScheduler: any
  let mockWorkPatterns: any

  beforeEach(async () => {
    vi.clearAllMocks()

    mockDatabase = {
      getTasks: vi.fn().mockResolvedValue([]),
      getSequencedTasks: vi.fn().mockResolvedValue([]),
      getWorkPattern: vi.fn().mockResolvedValue(null),
    }

    vi.mocked(getDatabase).mockReturnValue(mockDatabase)

    const schedulerModule = await import('@shared/unified-scheduler') as any
    mockScheduler = schedulerModule.__mockScheduler

    mockWorkPatterns = [
      {
        date: new Date().toISOString().split('T')[0],
        blocks: [
          {
            id: 'block-1',
            startTime: '09:00',
            endTime: '17:00',
            type: 'flexible',
            capacity: { focus: 480, admin: 480 },
          },
        ],
        meetings: [],
        accumulated: { focus: 0, admin: 0, personal: 0 },
      },
    ]

    mockScheduler.scheduleForDisplay.mockReturnValue({
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
    })

    useTaskStore.setState({
      tasks: [],
      sequencedTasks: [],
      workPatterns: mockWorkPatterns,
      nextTaskSkipIndex: 0,
    })
  })

  it('should use skipIndex to select the nth scheduled item', async () => {
    const mockTasks = [
      { id: 'task-1', name: 'Task 1', type: 'focused', duration: 60, completed: false },
      { id: 'task-2', name: 'Task 2', type: 'focused', duration: 60, completed: false },
      { id: 'task-3', name: 'Task 3', type: 'focused', duration: 60, completed: false },
    ]

    mockScheduler.scheduleForDisplay.mockReturnValue({
      scheduled: [
        {
          id: 'task-1',
          name: 'Task 1',
          type: 'task' as const,
          duration: 60,
          priority: 50,
          startTime: new Date('2024-01-15T09:00:00'),
          endTime: new Date('2024-01-15T10:00:00'),
          taskType: 'focused',
        },
        {
          id: 'task-2',
          name: 'Task 2',
          type: 'task' as const,
          duration: 60,
          priority: 40,
          startTime: new Date('2024-01-15T10:00:00'),
          endTime: new Date('2024-01-15T11:00:00'),
          taskType: 'focused',
        },
        {
          id: 'task-3',
          name: 'Task 3',
          type: 'task' as const,
          duration: 60,
          priority: 30,
          startTime: new Date('2024-01-15T11:00:00'),
          endTime: new Date('2024-01-15T12:00:00'),
          taskType: 'focused',
        },
      ],
      unscheduled: [],
      debugInfo: {
        scheduledItems: [],
        unscheduledItems: [],
        blockUtilization: [],
        warnings: [],
        totalScheduled: 3,
        totalUnscheduled: 0,
        scheduleEfficiency: 100,
      },
      conflicts: [],
    })

    useTaskStore.setState({
      tasks: mockTasks as any,
      sequencedTasks: [],
      workPatterns: mockWorkPatterns,
      nextTaskSkipIndex: 1, // Skip first, get second
    })

    const store = useTaskStore.getState()
    const result = await store.getNextScheduledItem()

    expect(result).not.toBeNull()
    expect(result?.id).toBe('task-2') // Should get second task due to skipIndex=1
  })

  it('should cap skipIndex at last available item', async () => {
    const mockTasks = [
      { id: 'task-1', name: 'Task 1', type: 'focused', duration: 60, completed: false },
      { id: 'task-2', name: 'Task 2', type: 'focused', duration: 60, completed: false },
    ]

    mockScheduler.scheduleForDisplay.mockReturnValue({
      scheduled: [
        {
          id: 'task-1',
          name: 'Task 1',
          type: 'task' as const,
          duration: 60,
          priority: 50,
          startTime: new Date('2024-01-15T09:00:00'),
          endTime: new Date('2024-01-15T10:00:00'),
          taskType: 'focused',
        },
        {
          id: 'task-2',
          name: 'Task 2',
          type: 'task' as const,
          duration: 60,
          priority: 40,
          startTime: new Date('2024-01-15T10:00:00'),
          endTime: new Date('2024-01-15T11:00:00'),
          taskType: 'focused',
        },
      ],
      unscheduled: [],
      debugInfo: {
        scheduledItems: [],
        unscheduledItems: [],
        blockUtilization: [],
        warnings: [],
        totalScheduled: 2,
        totalUnscheduled: 0,
        scheduleEfficiency: 100,
      },
      conflicts: [],
    })

    useTaskStore.setState({
      tasks: mockTasks as any,
      sequencedTasks: [],
      workPatterns: mockWorkPatterns,
      nextTaskSkipIndex: 999, // Way beyond available items
    })

    const store = useTaskStore.getState()
    const result = await store.getNextScheduledItem()

    expect(result).not.toBeNull()
    expect(result?.id).toBe('task-2') // Should return last item, not crash
  })

  it('should filter out meetings and blocked time from results', async () => {
    const mockTasks = [
      { id: 'task-1', name: 'Task 1', type: 'focused', duration: 60, completed: false },
    ]

    mockScheduler.scheduleForDisplay.mockReturnValue({
      scheduled: [
        {
          id: 'task-1',
          name: 'Task 1',
          type: 'task' as const,
          duration: 60,
          priority: 50,
          startTime: new Date('2024-01-15T09:00:00'),
          endTime: new Date('2024-01-15T10:00:00'),
          taskType: 'focused',
        },
        {
          id: 'meeting-1',
          name: 'Team Meeting',
          type: 'meeting' as const,
          duration: 30,
          priority: 0,
          startTime: new Date('2024-01-15T10:00:00'),
          endTime: new Date('2024-01-15T10:30:00'),
        },
        {
          id: 'break-1',
          name: 'Lunch',
          type: 'break' as const,
          duration: 60,
          priority: 0,
          startTime: new Date('2024-01-15T12:00:00'),
          endTime: new Date('2024-01-15T13:00:00'),
        },
      ],
      unscheduled: [],
      debugInfo: {
        scheduledItems: [],
        unscheduledItems: [],
        blockUtilization: [],
        warnings: [],
        totalScheduled: 3,
        totalUnscheduled: 0,
        scheduleEfficiency: 100,
      },
      conflicts: [],
    })

    useTaskStore.setState({
      tasks: mockTasks as any,
      sequencedTasks: [],
      workPatterns: mockWorkPatterns,
      nextTaskSkipIndex: 0,
    })

    const store = useTaskStore.getState()
    const result = await store.getNextScheduledItem()

    expect(result).not.toBeNull()
    expect(result?.id).toBe('task-1') // Should return task, not meeting or break
  })

  it('should return null when no work patterns available', async () => {
    useTaskStore.setState({
      tasks: [{ id: 'task-1', name: 'Task 1', type: 'focused', duration: 60, completed: false }] as any,
      sequencedTasks: [],
      workPatterns: [], // No patterns
      nextTaskSkipIndex: 0,
    })

    const store = useTaskStore.getState()
    const result = await store.getNextScheduledItem()

    expect(result).toBeNull()
  })

  it('should handle workflow steps correctly', async () => {
    const mockWorkflow = {
      id: 'workflow-1',
      name: 'Important workflow',
      overallStatus: 'in_progress',
      steps: [
        {
          id: 'step-1',
          name: 'First step',
          status: 'pending',
          duration: 45,
        },
      ],
    }

    mockScheduler.scheduleForDisplay.mockReturnValue({
      scheduled: [
        {
          id: 'step-1',
          name: 'First step',
          type: 'workflow-step' as const,
          duration: 45,
          priority: 60,
          startTime: new Date('2024-01-15T09:00:00'),
          endTime: new Date('2024-01-15T09:45:00'),
          taskType: 'focused',
          workflowId: 'workflow-1',
          stepIndex: 0,
        },
      ],
      unscheduled: [],
      debugInfo: {
        scheduledItems: [],
        unscheduledItems: [],
        blockUtilization: [],
        warnings: [],
        totalScheduled: 1,
        totalUnscheduled: 0,
        scheduleEfficiency: 100,
      },
      conflicts: [],
    })

    useTaskStore.setState({
      tasks: [],
      sequencedTasks: [mockWorkflow] as any,
      workPatterns: mockWorkPatterns,
      nextTaskSkipIndex: 0,
    })

    const store = useTaskStore.getState()
    const result = await store.getNextScheduledItem()

    expect(result).not.toBeNull()
    expect(result?.type).toBe('step')
    expect(result?.id).toBe('step-1')
    expect(result?.workflowId).toBe('workflow-1')
  })
})
