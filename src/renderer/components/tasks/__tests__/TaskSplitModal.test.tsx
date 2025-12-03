import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { TaskSplitModal } from '../TaskSplitModal'
import { Task } from '@shared/types'
import { vi } from 'vitest'

// Mock the store
const mockAddTask = vi.fn()
const mockUpdateTask = vi.fn()

vi.mock('../../../store/useTaskStore', () => ({
  useTaskStore: () => ({
    addTask: mockAddTask,
    updateTask: mockUpdateTask,
  }),
}))

// Mock the Message component
vi.mock('../../common/Message', () => ({
  Message: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

describe('TaskSplitModal', () => {
  const mockTask: Task = {
    id: 'test-task-id',
    name: 'Test Task',
    duration: 120, // 2 hours
    importance: 5,
    urgency: 5,
    type: 'focused',
    asyncWaitTime: 0,
    dependencies: [],
    completed: false,
    sessionId: 'test-session',
    createdAt: new Date(),
    updatedAt: new Date(),
    notes: 'Test notes',
    deadline: new Date('2025-12-31'),
    cognitiveComplexity: 3,
    hasSteps: false,
    overallStatus: 'not_started',
    criticalPathDuration: 120,
    worstCaseDuration: 120,
  }

  const mockOnClose = vi.fn()
  const mockOnSplit = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the modal with correct title', () => {
    render(
      <TaskSplitModal
        task={mockTask}
        visible={true}
        onClose={mockOnClose}
        onSplit={mockOnSplit}
      />,
    )

    // Check that the modal is visible with correct content
    expect(screen.getByText(/This will split "Test Task"/)).toBeInTheDocument()
  })

  it('displays duration split correctly with default 50/50', () => {
    render(
      <TaskSplitModal
        task={mockTask}
        visible={true}
        onClose={mockOnClose}
        onSplit={mockOnSplit}
      />,
    )

    // Should show 1h each for 50/50 split of 2 hours
    const durations = screen.getAllByText('1h')
    expect(durations).toHaveLength(2)
  })

  it.skip('updates durations when slider changes', async () => {
    const { container } = render(
      <TaskSplitModal
        task={mockTask}
        visible={true}
        onClose={mockOnClose}
        onSplit={mockOnSplit}
      />,
    )

    // Find the slider element
    const slider = container.querySelector('.arco-slider')
    expect(slider).toBeInTheDocument()

    // The slider interaction would require more complex mocking
    // For now, we'll just check that the slider is present
  })

  it.skip('validates required fields before splitting', async () => {
    render(
      <TaskSplitModal
        task={mockTask}
        visible={true}
        onClose={mockOnClose}
        onSplit={mockOnSplit}
      />,
    )

    // Clear the first task name
    const firstNameInput = screen.getAllByRole('textbox')[0]

    await act(async () => {
      fireEvent.change(firstNameInput, { target: { value: '' } })
    })

    // Try to submit
    const splitButton = screen.getByRole('button', { name: 'Split Task' })

    await act(async () => {
      fireEvent.click(splitButton)
    })

    // Should show validation error (implementation specific)
    await waitFor(() => {
      expect(mockUpdateTask).not.toHaveBeenCalled()
      expect(mockAddTask).not.toHaveBeenCalled()
    })
  })

  it('calls onClose when Cancel is clicked', () => {
    render(
      <TaskSplitModal
        task={mockTask}
        visible={true}
        onClose={mockOnClose}
        onSplit={mockOnSplit}
      />,
    )

    const cancelButton = screen.getByText('Cancel')
    fireEvent.click(cancelButton)

    expect(mockOnClose).toHaveBeenCalled()
  })

  it('splits task correctly with valid input', async () => {
    render(
      <TaskSplitModal
        task={mockTask}
        visible={true}
        onClose={mockOnClose}
        onSplit={mockOnSplit}
      />,
    )

    // Fill in the form
    const inputs = screen.getAllByRole('textbox')

    await act(async () => {
      fireEvent.change(inputs[0], { target: { value: 'First Part' } })
      fireEvent.change(inputs[2], { target: { value: 'Second Part' } })
    })

    // Click split
    const splitButton = screen.getByRole('button', { name: 'Split Task' })

    await act(async () => {
      fireEvent.click(splitButton)
    })

    await waitFor(() => {
      // Should update the first task
      expect(mockUpdateTask).toHaveBeenCalledWith(
        'test-task-id',
        expect.objectContaining({
          name: 'First Part',
          duration: 60, // 50% of 120
        }),
      )

      // Should add the second task
      expect(mockAddTask).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Second Part',
          duration: 60, // 50% of 120
          importance: 5,
          urgency: 5,
        }),
      )

      // Should call onSplit callback
      expect(mockOnSplit).toHaveBeenCalled()
    })
  })

  it('preserves task properties in both split tasks', async () => {
    render(
      <TaskSplitModal
        task={mockTask}
        visible={true}
        onClose={mockOnClose}
        onSplit={mockOnSplit}
      />,
    )

    // Fill in minimal required fields
    const inputs = screen.getAllByRole('textbox')

    await act(async () => {
      fireEvent.change(inputs[2], { target: { value: 'Second Part' } })
    })

    // Click split
    const splitButton = screen.getByRole('button', { name: 'Split Task' })

    await act(async () => {
      fireEvent.click(splitButton)
    })

    await waitFor(() => {
      // Check that the second task inherits properties
      expect(mockAddTask).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'focused',
          importance: 5,
          urgency: 5,
          deadline: mockTask.deadline,
          cognitiveComplexity: 3,
        }),
      )
    })
  })
})
