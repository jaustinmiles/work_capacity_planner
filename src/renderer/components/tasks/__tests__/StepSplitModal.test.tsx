import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { StepSplitModal } from '../StepSplitModal'
import { TaskStep } from '@shared/sequencing-types'
import { StepStatus, TaskType } from '@shared/enums'
import { vi } from 'vitest'

// Mock the Message component
vi.mock('../../common/Message', () => ({
  Message: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

describe('StepSplitModal', () => {
  const mockStep: TaskStep = {
    id: 'test-step-id',
    taskId: 'test-task-id',
    name: 'Test Step',
    duration: 120, // 2 hours
    type: TaskType.Focused,
    asyncWaitTime: 0,
    dependsOn: [],
    status: StepStatus.Pending,
    stepIndex: 0,
    percentComplete: 0,
    notes: 'Test notes',
    cognitiveComplexity: 3,
    importance: 5,
    urgency: 5,
    actualDuration: 0,
  }

  const mockOnClose = vi.fn()
  const mockOnSplit = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the modal with correct title', () => {
    render(
      <StepSplitModal
        step={mockStep}
        stepIndex={0}
        visible={true}
        onClose={mockOnClose}
        onSplit={mockOnSplit}
      />,
    )

    // Check that the modal is visible with correct content
    expect(screen.getByText(/This will split Step 1: "Test Step"/)).toBeInTheDocument()
  })

  it('displays duration split correctly with default 50/50', () => {
    render(
      <StepSplitModal
        step={mockStep}
        stepIndex={0}
        visible={true}
        onClose={mockOnClose}
        onSplit={mockOnSplit}
      />,
    )

    // Should show 1h each for 50/50 split of 2 hours
    const durations = screen.getAllByText('1h')
    expect(durations).toHaveLength(2)
  })

  it('calls onClose when Cancel is clicked', () => {
    render(
      <StepSplitModal
        step={mockStep}
        stepIndex={0}
        visible={true}
        onClose={mockOnClose}
        onSplit={mockOnSplit}
      />,
    )

    const cancelButton = screen.getByText('Cancel')
    fireEvent.click(cancelButton)

    expect(mockOnClose).toHaveBeenCalled()
  })

  it('splits step correctly with valid input', async () => {
    render(
      <StepSplitModal
        step={mockStep}
        stepIndex={0}
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
    const splitButton = screen.getByRole('button', { name: 'Split Step' })

    await act(async () => {
      fireEvent.click(splitButton)
    })

    await waitFor(() => {
      // Should call onSplit with two steps
      expect(mockOnSplit).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'First Part',
          duration: 60, // 50% of 120
        }),
        expect.objectContaining({
          name: 'Second Part',
          duration: 60, // 50% of 120
          dependsOn: mockStep.dependsOn, // Inherit dependencies
        }),
      )
    })
  })

  it('preserves step properties in both split steps', async () => {
    render(
      <StepSplitModal
        step={mockStep}
        stepIndex={0}
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
    const splitButton = screen.getByRole('button', { name: 'Split Step' })

    await act(async () => {
      fireEvent.click(splitButton)
    })

    await waitFor(() => {
      // Check that the second step inherits properties
      expect(mockOnSplit).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          type: TaskType.Focused,
          dependsOn: mockStep.dependsOn,
          status: StepStatus.Pending,
          cognitiveComplexity: 3,
          importance: 5,
          urgency: 5,
        }),
      )
    })
  })

  it('shows step index in alert message', () => {
    render(
      <StepSplitModal
        step={mockStep}
        stepIndex={2}
        visible={true}
        onClose={mockOnClose}
        onSplit={mockOnSplit}
      />,
    )

    // Should show Step 3 (stepIndex + 1)
    expect(screen.getByText(/This will split Step 3: "Test Step"/)).toBeInTheDocument()
  })

  it('initializes form with correct default values', () => {
    render(
      <StepSplitModal
        step={mockStep}
        stepIndex={0}
        visible={true}
        onClose={mockOnClose}
        onSplit={mockOnSplit}
      />,
    )

    const inputs = screen.getAllByRole('textbox')
    
    // First step name should be original name
    expect(inputs[0]).toHaveValue('Test Step')
    
    // First description should have original notes
    expect(inputs[1]).toHaveValue('Test notes')
    
    // Second step name should have "(continued)" suffix
    expect(inputs[2]).toHaveValue('Test Step (continued)')
  })
})