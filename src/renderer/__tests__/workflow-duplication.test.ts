import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useTaskStore } from '../store/useTaskStore'
import { TaskType } from '@shared/enums'
import type { SequencedTask } from '@shared/types'

// Mock the database
vi.mock('../services/database', () => {
  let mockSequencedTasks: SequencedTask[] = []

  return {
    getDatabase: () => ({
      createSequencedTask: vi.fn(async (task) => {
        const newTask = {
          ...task,
          id: `workflow-${Date.now()}-${Math.random()}`,
          createdAt: new Date(),
          updatedAt: new Date(),
        }
        mockSequencedTasks.push(newTask)
        return newTask
      }),
      updateSequencedTask: vi.fn(async (id, updates) => {
        const index = mockSequencedTasks.findIndex(t => t.id === id)
        if (index >= 0) {
          // Preserve the ID and timestamps
          mockSequencedTasks[index] = {
            ...mockSequencedTasks[index],
            ...updates,
            id: mockSequencedTasks[index].id,
            createdAt: mockSequencedTasks[index].createdAt,
            updatedAt: new Date(),
          }
          return mockSequencedTasks[index]
        }
        throw new Error('Task not found')
      }),
      getSequencedTasks: vi.fn(async () => mockSequencedTasks),
      getAllSequencedTasks: vi.fn(async () => mockSequencedTasks),
      getAllTasks: vi.fn(async () => []),
      deleteSequencedTask: vi.fn(async (id) => {
        const index = mockSequencedTasks.findIndex(t => t.id === id)
        if (index >= 0) {
          mockSequencedTasks.splice(index, 1)
        }
      }),
    }),
    // Reset mock data between tests
    __resetMockData: () => {
      mockSequencedTasks = []
    },
  }
})

describe('Workflow Duplication Bug', () => {
  beforeEach(async () => {
    // Clear mock data
    vi.clearAllMocks()
    const { __resetMockData } = await import('../services/database')
    __resetMockData()
  })

  it('should update existing workflow when edited, not create duplicate', async () => {
    const { result } = renderHook(() => useTaskStore())

    // Create initial workflow
    const initialWorkflow = {
      name: 'Test Workflow',
      importance: 7,
      urgency: 8,
      type: TaskType.Focused,
      notes: 'Initial notes',
      dependencies: [],
      completed: false,
      duration: 120,
      asyncWaitTime: 0,
      sessionId: 'test-session',
      hasSteps: true as true,
      criticalPathDuration: 120,
      worstCaseDuration: 180,
      overallStatus: 'not_started' as const,
      steps: [
        {
          id: 'step-1',
          taskId: '',
          name: 'Step 1',
          duration: 60,
          type: TaskType.Focused,
          dependsOn: [],
          asyncWaitTime: 0,
          status: 'pending' as const,
          stepIndex: 0,
          percentComplete: 0,
        },
        {
          id: 'step-2',
          taskId: '',
          name: 'Step 2',
          duration: 60,
          type: TaskType.Focused,
          dependsOn: ['step-1'],
          asyncWaitTime: 0,
          status: 'pending' as const,
          stepIndex: 1,
          percentComplete: 0,
        },
      ],
    }

    // Add initial workflow
    await act(async () => {
      await result.current.addSequencedTask(initialWorkflow)
    })

    // Load workflows to verify it was created
    await act(async () => {
      await result.current.loadSequencedTasks()
    })

    expect(result.current.sequencedTasks).toHaveLength(1)
    expect(result.current.sequencedTasks[0].name).toBe('Test Workflow')

    // Simulate editing the workflow (what should happen from brainstorm modal)
    const editedWorkflow = {
      ...initialWorkflow,
      notes: 'Edited notes',
      steps: [
        ...initialWorkflow.steps,
        {
          id: 'step-3',
          taskId: '',
          name: 'Step 3',
          duration: 30,
          type: TaskType.Admin,
          dependsOn: ['step-2'],
          asyncWaitTime: 0,
          status: 'pending' as const,
          stepIndex: 2,
          percentComplete: 0,
        },
      ],
    }

    // Use the new addOrUpdateSequencedTask method which should handle updates correctly
    await act(async () => {
      await result.current.addOrUpdateSequencedTask(editedWorkflow)
    })

    // Load workflows again
    await act(async () => {
      await result.current.loadSequencedTasks()
    })

    // Should have 1 workflow (updated), not 2 (duplicate)
    expect(result.current.sequencedTasks).toHaveLength(1)
    expect(result.current.sequencedTasks[0].steps).toHaveLength(3)
    expect(result.current.sequencedTasks[0].notes).toBe('Edited notes')
  })

  it('should correctly handle workflow updates without duplication', async () => {
    const { result } = renderHook(() => useTaskStore())

    // Create initial workflow
    const initialWorkflow = {
      name: 'Update Test Workflow',
      importance: 5,
      urgency: 6,
      type: TaskType.Personal,
      notes: 'Original',
      dependencies: [],
      completed: false,
      duration: 60,
      asyncWaitTime: 0,
      sessionId: 'test-session',
      hasSteps: true as true,
      criticalPathDuration: 60,
      worstCaseDuration: 90,
      overallStatus: 'not_started' as const,
      steps: [
        {
          id: 'step-a',
          taskId: '',
          name: 'Original Step',
          duration: 60,
          type: TaskType.Personal,
          dependsOn: [],
          asyncWaitTime: 0,
          status: 'pending' as const,
          stepIndex: 0,
          percentComplete: 0,
        },
      ],
    }

    await act(async () => {
      await result.current.addSequencedTask(initialWorkflow)
      await result.current.loadSequencedTasks()
    })

    const workflowId = result.current.sequencedTasks[0].id

    // Use updateSequencedTask for updates (correct approach)
    await act(async () => {
      await result.current.updateSequencedTask(workflowId, {
        notes: 'Updated notes',
        steps: [
          ...result.current.sequencedTasks[0].steps,
          {
            id: 'step-b',
            taskId: workflowId,
            name: 'Added Step',
            duration: 30,
            type: TaskType.Personal,
            dependsOn: ['step-a'],
            asyncWaitTime: 0,
            status: 'pending' as const,
            stepIndex: 1,
            percentComplete: 0,
          },
        ],
      })
    })

    await act(async () => {
      await result.current.loadSequencedTasks()
    })

    // This should work correctly
    expect(result.current.sequencedTasks).toHaveLength(1)
    expect(result.current.sequencedTasks[0].steps).toHaveLength(2)
    expect(result.current.sequencedTasks[0].notes).toBe('Updated notes')
  })
})
