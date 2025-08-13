import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TaskTimeLoggingModal } from '../TaskTimeLoggingModal'
import { useTaskStore } from '../../../store/useTaskStore'
import { appEvents, EVENTS } from '../../../utils/events'
import { Message } from '@arco-design/web-react'
import { createMockTask } from '@shared/test-utils'

// Mock the store
vi.mock('../../../store/useTaskStore')

// Mock the events
vi.mock('../../../utils/events', () => ({
  appEvents: {
    emit: vi.fn(),
  },
  EVENTS: {
    TIME_LOGGED: 'time-logged',
  },
}))

// Mock Arco Message
vi.mock('@arco-design/web-react', async () => {
  const actual = await vi.importActual('@arco-design/web-react')
  return {
    ...actual,
    Message: {
      success: vi.fn(),
      error: vi.fn(),
      warning: vi.fn(),
    },
  }
})

describe('TaskTimeLoggingModal', () => {
  const mockTask = createMockTask({
    id: '1',
    name: 'Test Task',
    duration: 60,
    actualDuration: 0,
    completed: false,
    type: 'focused',
        sessionId: 'test-session',    importance: 8,
    urgency: 7,
  })

  const mockUpdateTask = vi.fn()
  const mockOnClose = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useTaskStore).mockReturnValue({
      updateTask: mockUpdateTask,
    } as any)
  })

  it('should render with task information', () => {
    render(<TaskTimeLoggingModal task={mockTask} visible={true} onClose={mockOnClose} />)

    expect(screen.getByText('Log Time: Test Task')).toBeDefined()
    expect(screen.getByText('Estimated duration:')).toBeDefined()
    expect(screen.getByText('1h')).toBeDefined()
  })

  it('should not render when not visible', () => {
    const { container } = render(<TaskTimeLoggingModal task={mockTask} visible={false} onClose={mockOnClose} />)

    expect(container.querySelector('.arco-modal')).toBeNull()
  })

  it('should log time and emit event on submit', async () => {
    const user = userEvent.setup()
    render(<TaskTimeLoggingModal task={mockTask} visible={true} onClose={mockOnClose} />)

    const input = screen.getByLabelText('Time spent (minutes)')
    await user.clear(input)
    await user.type(input, '30')

    const submitButton = screen.getByText('Log Time')
    await user.click(submitButton)

    await waitFor(() => {
      expect(mockUpdateTask).toHaveBeenCalledWith('1', {
        actualDuration: 30,
      })
      expect(appEvents?.emit).toHaveBeenCalledWith(EVENTS.TIME_LOGGED)
      expect(Message?.success).toHaveBeenCalledWith('Time logged successfully')
      expect(mockOnClose).toHaveBeenCalled()
    })
  })

  it('should accumulate time when task already has actualDuration', async () => {
    const taskWithTime = createMockTask({ ...mockTask, actualDuration: 45 })
    const user = userEvent.setup()
    render(<TaskTimeLoggingModal task={taskWithTime} visible={true} onClose={mockOnClose} />)

    expect(screen.getByText('Time already logged:')).toBeDefined()
    expect(screen.getByText('45m')).toBeDefined()

    const input = screen.getByLabelText('Time spent (minutes)')
    await user.clear(input)
    await user.type(input, '30')

    const submitButton = screen.getByText('Log Time')
    await user.click(submitButton)

    await waitFor(() => {
      expect(mockUpdateTask).toHaveBeenCalledWith('1', {
        actualDuration: 75,
      })
    })
  })

  it('should show warning when logged time exceeds estimate', async () => {
    const user = userEvent.setup()
    render(<TaskTimeLoggingModal task={mockTask} visible={true} onClose={mockOnClose} />)

    const input = screen.getByLabelText('Time spent (minutes)')
    await user.clear(input)
    await user.type(input, '90')

    const submitButton = screen.getByText('Log Time')
    await user.click(submitButton)

    await waitFor(() => {
      expect(Message?.warning).toHaveBeenCalledWith({
        content: "You've logged 90 minutes on a 60 minute task. Consider re-estimating the remaining time.",
        duration: 5000,
      })
    })
  })

  it('should not show warning for completed tasks', async () => {
    const completedTask = createMockTask({ ...mockTask, completed: true })
    const user = userEvent.setup()
    render(<TaskTimeLoggingModal task={completedTask} visible={true} onClose={mockOnClose} />)

    const input = screen.getByLabelText('Time spent (minutes)')
    await user.clear(input)
    await user.type(input, '90')

    const submitButton = screen.getByText('Log Time')
    await user.click(submitButton)

    await waitFor(() => {
      expect(Message?.warning).not.toHaveBeenCalled()
    })
  })

  it('should handle errors gracefully', async () => {
    mockUpdateTask.mockRejectedValueOnce(new Error('Update failed'))
    const user = userEvent.setup()
    render(<TaskTimeLoggingModal task={mockTask} visible={true} onClose={mockOnClose} />)

    const input = screen.getByLabelText('Time spent (minutes)')
    await user.clear(input)
    await user.type(input, '30')

    const submitButton = screen.getByText('Log Time')
    await user.click(submitButton)

    await waitFor(() => {
      expect(Message?.error).toHaveBeenCalledWith('Failed to log time')
      expect(mockOnClose).not.toHaveBeenCalled()
    })
  })

  it('should format time correctly', () => {
    const longTask = createMockTask({ ...mockTask, duration: 135, actualDuration: 195 })
    render(<TaskTimeLoggingModal task={longTask} visible={true} onClose={mockOnClose} />)

    expect(screen.getByText('2h 15m')).toBeDefined() // Estimated
    expect(screen.getByText('3h 15m')).toBeDefined() // Already logged
  })

  it('should call onClose when cancel is clicked', async () => {
    const user = userEvent.setup()
    render(<TaskTimeLoggingModal task={mockTask} visible={true} onClose={mockOnClose} />)

    const cancelButton = screen.getByText('Cancel')
    await user.click(cancelButton)

    expect(mockOnClose).toHaveBeenCalled()
    expect(mockUpdateTask).not.toHaveBeenCalled()
  })
})
