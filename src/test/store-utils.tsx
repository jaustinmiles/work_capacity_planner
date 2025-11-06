import React from 'react'
import { vi } from 'vitest'
import type { ActiveWorkSession } from '@/shared/types'
import type { TaskStore } from '@renderer/store/useTaskStore'

/**
 * Creates a fully mocked TaskStore with all required properties and methods
 */
export function createMockTaskStore(overrides?: Partial<TaskStore>): TaskStore {
  const defaultStore: TaskStore = {
    // Data
    tasks: [],
    sequencedTasks: [],
    workPatterns: [],
    workSettings: {
      workBlocksEnabled: true,
      strictOrderingEnabled: false,
      dailyWorkHours: 8,
      weeklyWorkDays: 5,
      workStartTime: '09:00',
      workEndTime: '17:00',
      breakDuration: 60,
      focusSessionDuration: 25,
      shortBreakDuration: 5,
      longBreakDuration: 15,
    },
    activeWorkSessions: new Map<string, ActiveWorkSession>(),

    // Loading states
    isLoading: false,
    workPatternsLoading: false,

    // Actions - Tasks
    loadTasks: vi.fn().mockResolvedValue(undefined),
    addTask: vi.fn().mockResolvedValue(undefined),
    updateTask: vi.fn().mockResolvedValue(undefined),
    deleteTask: vi.fn().mockResolvedValue(undefined),
    archiveTask: vi.fn().mockResolvedValue(undefined),
    completeTask: vi.fn().mockResolvedValue(undefined),

    // Actions - Sequenced Tasks
    addSequencedTask: vi.fn().mockResolvedValue(undefined),
    updateSequencedTask: vi.fn().mockResolvedValue(undefined),
    deleteSequencedTask: vi.fn().mockResolvedValue(undefined),
    addTaskStep: vi.fn().mockResolvedValue(undefined),
    updateTaskStep: vi.fn().mockResolvedValue(undefined),
    deleteTaskStep: vi.fn().mockResolvedValue(undefined),
    completeStep: vi.fn().mockResolvedValue(undefined),

    // Actions - Work Sessions
    startWorkOnTask: vi.fn().mockResolvedValue(undefined),
    startWorkOnStep: vi.fn().mockResolvedValue(undefined),
    pauseWorkOnTask: vi.fn().mockResolvedValue(undefined),
    pauseWorkOnStep: vi.fn().mockResolvedValue(undefined),
    resumeWorkOnTask: vi.fn().mockResolvedValue(undefined),
    resumeWorkOnStep: vi.fn().mockResolvedValue(undefined),
    completeWorkOnTask: vi.fn().mockResolvedValue(undefined),
    completeWorkOnStep: vi.fn().mockResolvedValue(undefined),
    getActiveWorkSessions: vi.fn().mockReturnValue(new Map()),

    // Actions - Work Patterns
    loadWorkPatterns: vi.fn().mockResolvedValue(undefined),
    updateWorkPatterns: vi.fn().mockResolvedValue(undefined),
    getWorkPatternForDate: vi.fn().mockReturnValue(null),

    // Actions - Work Settings
    loadWorkSettings: vi.fn().mockResolvedValue(undefined),
    updateWorkSettings: vi.fn().mockResolvedValue(undefined),

    // Actions - Scheduling
    getNextScheduledItem: vi.fn().mockResolvedValue(null),
    startNextTask: vi.fn().mockResolvedValue(undefined),

    // Actions - Utility
    refreshData: vi.fn().mockResolvedValue(undefined),
    clearAllData: vi.fn().mockResolvedValue(undefined),

    ...overrides,
  }

  return defaultStore
}

/**
 * Mock implementation of useTaskStore hook
 */
export function createMockUseTaskStore(initialStore?: Partial<TaskStore>) {
  const store = createMockTaskStore(initialStore)

  return vi.fn((selector?: any) => {
    if (typeof selector === 'function') {
      return selector(store)
    }
    return store
  })
}

/**
 * StoreWrapper component for wrapping components in tests
 * This simulates having the store available without actually using Zustand
 */
interface StoreWrapperProps {
  children: React.ReactNode
  store?: Partial<TaskStore>
}

export const StoreWrapper: React.FC<StoreWrapperProps> = ({ children }) => {
  // Since we mock useTaskStore directly, we don't need to provide context
  // This wrapper is mainly for consistency and future expansion
  return <>{children}</>
}

/**
 * Async helper to wait for store updates
 * Useful when testing components that react to store changes
 */
export async function waitForStoreUpdate(
  callback: () => void,
  options?: { timeout?: number },
): Promise<void> {
  const { timeout = 1000 } = options || {}

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Store update timeout after ${timeout}ms`))
    }, timeout)

    // Execute callback
    callback()

    // Use setImmediate or setTimeout to allow React to re-render
    setTimeout(() => {
      clearTimeout(timer)
      resolve()
    }, 0)
  })
}

/**
 * Helper to update mock store and trigger re-render
 * Useful for simulating store state changes in tests
 */
export function updateMockStore(
  mockUseTaskStore: ReturnType<typeof vi.fn>,
  updates: Partial<TaskStore>,
): void {
  const currentStore = mockUseTaskStore() as TaskStore
  Object.assign(currentStore, updates)

  // Update the mock to return the new state
  mockUseTaskStore.mockImplementation((selector?: any) => {
    if (typeof selector === 'function') {
      return selector(currentStore)
    }
    return currentStore
  })
}

/**
 * Helper to simulate async store operations
 */
export async function simulateAsyncStoreOperation(
  mockStore: TaskStore,
  operation: keyof TaskStore,
  result: any,
  delay: number = 10,
): Promise<void> {
  const method = mockStore[operation] as any
  if (typeof method === 'function' && vi.isMockFunction(method)) {
    method.mockImplementation(async () => {
      await new Promise(resolve => setTimeout(resolve, delay))
      return result
    })
  }
}

/**
 * Create a mock store with realistic data
 */
export function createPopulatedMockStore(): TaskStore {
  const store = createMockTaskStore()

  // Add some realistic tasks
  store.tasks = [
    {
      id: 'task-1',
      title: 'Review pull request',
      description: 'Review the latest PR for the feature branch',
      type: 'focused',
      status: 'incomplete',
      importance: 8,
      urgency: 7,
      estimatedDuration: 30,
      actualDuration: 0,
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
    },
    {
      id: 'task-2',
      title: 'Write unit tests',
      description: 'Add tests for the new components',
      type: 'work',
      status: 'incomplete',
      importance: 9,
      urgency: 6,
      estimatedDuration: 120,
      actualDuration: 0,
      createdAt: new Date('2024-01-02'),
      updatedAt: new Date('2024-01-02'),
    },
  ]

  // Add a workflow
  store.sequencedTasks = [
    {
      id: 'workflow-1',
      title: 'Feature implementation',
      description: 'Implement the new feature',
      type: 'work',
      status: 'incomplete',
      importance: 9,
      urgency: 8,
      steps: [
        {
          id: 'step-1',
          sequencedTaskId: 'workflow-1',
          name: 'Design API',
          description: 'Design the API endpoints',
          status: 'incomplete',
          estimatedDuration: 60,
          actualDuration: 0,
          order: 0,
          completedAt: null,
          updatedAt: new Date('2024-01-03'),
        },
        {
          id: 'step-2',
          sequencedTaskId: 'workflow-1',
          name: 'Implement backend',
          description: 'Implement the backend logic',
          status: 'incomplete',
          estimatedDuration: 180,
          actualDuration: 0,
          order: 1,
          dependsOn: ['step-1'],
          completedAt: null,
          updatedAt: new Date('2024-01-03'),
        },
      ],
      totalEstimatedDuration: 240,
      totalActualDuration: 0,
      criticalPathDuration: 240,
      currentStepIndex: 0,
      createdAt: new Date('2024-01-03'),
      updatedAt: new Date('2024-01-03'),
    },
  ]

  // Add work patterns
  store.workPatterns = [
    {
      id: 'pattern-1',
      date: '2024-01-10',
      dayOfWeek: 3, // Wednesday
      blocks: [
        {
          type: 'focused',
          startTime: '09:00',
          endTime: '11:00',
          capacity: 120,
          accumulated: 30,
        },
        {
          type: 'admin',
          startTime: '11:00',
          endTime: '12:00',
          capacity: 60,
          accumulated: 0,
        },
        {
          type: 'break',
          startTime: '12:00',
          endTime: '13:00',
          capacity: 0,
          accumulated: 0,
        },
        {
          type: 'work',
          startTime: '13:00',
          endTime: '15:00',
          capacity: 120,
          accumulated: 60,
        },
        {
          type: 'flexible',
          startTime: '15:00',
          endTime: '17:00',
          capacity: 120,
          accumulated: 0,
        },
      ],
      totalCapacity: 420,
      totalAccumulated: 90,
      meetings: [],
    },
  ]

  return store
}
