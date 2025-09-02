import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { TaskQuickEditModal } from '../TaskQuickEditModal'
import { useTaskStore } from '../../../store/useTaskStore'
import { TaskType } from '@shared/enums'
import { Task } from '@shared/types'

// Mock the store
vi.mock('../../../store/useTaskStore')

// Mock the logger
vi.mock('../../../../logging/index.renderer', () => ({
  useLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  }),
  getRendererLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  }),
  useLoggerContext: () => ({
    logger: {
      debug: vi.fn(),
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
    },
  }),
}))

// Mock Message component
vi.mock('../../common/Message', () => ({
  Message: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}))

describe('TaskQuickEditModal', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllTimers()
  })

  const mockTasks: Task[] = [
    {
      id: 'task-1',
      name: 'Test Task 1',
      duration: 60,
      importance: 5,
      urgency: 5,
      type: TaskType.Focused,
      asyncWaitTime: 0,
      dependencies: [],
      completed: false,
      sessionId: 'session-1',
      createdAt: new Date(),
      updatedAt: new Date(),
      hasSteps: false,
      overallStatus: 'not_started',
      criticalPathDuration: 60,
      worstCaseDuration: 60,
    },
    {
      id: 'task-2',
      name: 'Test Task 2',
      duration: 120,
      importance: 7,
      urgency: 8,
      type: TaskType.Admin,
      asyncWaitTime: 0,
      dependencies: [],
      completed: false,
      sessionId: 'session-1',
      createdAt: new Date(),
      updatedAt: new Date(),
      hasSteps: false,
      overallStatus: 'not_started',
      criticalPathDuration: 120,
      worstCaseDuration: 120,
    },
  ]

  const mockUpdateTask = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    ;(useTaskStore as any).mockReturnValue({
      tasks: mockTasks,
      updateTask: mockUpdateTask,
    })
  })

  it('should render modal with tasks', () => {
    render(
      <TaskQuickEditModal
        visible={true}
        onClose={vi.fn()}
        filter="incomplete"
      />,
    )

    expect(screen.getByText('Quick Edit')).toBeInTheDocument()
    expect(screen.getByText('1 of 2')).toBeInTheDocument()
    expect(screen.getByText('Test Task 1')).toBeInTheDocument()
  })

  it('should navigate between tasks with buttons', async () => {
    render(
      <TaskQuickEditModal
        visible={true}
        onClose={vi.fn()}
        filter="incomplete"
      />,
    )

    // Initially shows first task
    expect(screen.getByText('Test Task 1')).toBeInTheDocument()

    // Navigate to next task
    const nextButton = screen.getByText('Next')
    fireEvent.click(nextButton)

    await waitFor(() => {
      expect(screen.getByText('Test Task 2')).toBeInTheDocument()
    })

    // Navigate back
    const prevButton = screen.getByText('Previous')
    fireEvent.click(prevButton)

    await waitFor(() => {
      expect(screen.getByText('Test Task 1')).toBeInTheDocument()
    })
  })

  it('should update task fields with sliders', async () => {
    render(
      <TaskQuickEditModal
        visible={true}
        onClose={vi.fn()}
        filter="incomplete"
      />,
    )

    // The duration slider should show initial value
    expect(screen.getByText('Duration: 1h')).toBeInTheDocument()

    // Check that importance and urgency are displayed
    expect(screen.getByText('Importance: 5')).toBeInTheDocument()
    expect(screen.getByText('Urgency: 5')).toBeInTheDocument()
  })

  it('should save current task changes', async () => {
    mockUpdateTask.mockResolvedValue(undefined)

    render(
      <TaskQuickEditModal
        visible={true}
        onClose={vi.fn()}
        filter="incomplete"
      />,
    )

    // Click a duration preset button to make a change
    const preset30m = screen.getByRole('button', { name: '30m' })
    fireEvent.click(preset30m)

    // Save current task
    const saveCurrentButton = screen.getByText('Save Current')
    fireEvent.click(saveCurrentButton)

    await waitFor(() => {
      expect(mockUpdateTask).toHaveBeenCalledWith('task-1', { duration: 30 })
    })
  })

  it('should show unsaved changes warning', () => {
    render(
      <TaskQuickEditModal
        visible={true}
        onClose={vi.fn()}
        filter="incomplete"
      />,
    )

    // Make a change
    const preset30m = screen.getByRole('button', { name: '30m' })
    fireEvent.click(preset30m)

    // Should show unsaved changes indicator
    expect(screen.getByText('1 unsaved changes')).toBeInTheDocument()
  })

  it('should filter tasks correctly', () => {
    // Test with all tasks completed
    const completedTasks = mockTasks.map(t => ({ ...t, completed: true }))
    ;(useTaskStore as any).mockReturnValue({
      tasks: completedTasks,
      updateTask: mockUpdateTask,
    })

    render(
      <TaskQuickEditModal
        visible={true}
        onClose={vi.fn()}
        filter="incomplete"
      />,
    )

    // Should show empty state
    expect(screen.getByText('No tasks to edit')).toBeInTheDocument()
  })
})
