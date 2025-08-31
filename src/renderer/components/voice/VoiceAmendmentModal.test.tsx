import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { VoiceAmendmentModal } from './VoiceAmendmentModal'
import { Amendment, AmendmentType, DeadlineChange, PriorityChange, TypeChange } from '@shared/amendment-types'
import { TaskType } from '@shared/enums'
import '@testing-library/jest-dom'

// No AI service to mock - clarification is handled differently

describe('VoiceAmendmentModal', () => {
  const mockOnApply = vi.fn()
  const mockOnCancel = vi.fn()

  const mockDeadlineAmendment: DeadlineChange = {
    type: AmendmentType.DeadlineChange,
    targetTaskId: 'task-1',
    targetName: 'Test Task',
    newDeadline: new Date('2025-08-30T23:00:00'),
  }

  const mockPriorityAmendment: PriorityChange = {
    type: AmendmentType.PriorityChange,
    targetTaskId: 'task-2',
    targetName: 'Another Task',
    newImportance: 8,
    newUrgency: 7,
  }

  const mockTypeAmendment: TypeChange = {
    type: AmendmentType.TypeChange,
    targetTaskId: 'task-3',
    targetName: 'Third Task',
    newType: TaskType.Personal,
  }

  const mockAmendments: Amendment[] = [
    mockDeadlineAmendment,
    mockPriorityAmendment,
    mockTypeAmendment,
  ]

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should render the modal with amendments', () => {
    render(
      <VoiceAmendmentModal
        visible={true}
        amendments={mockAmendments}
        onApply={mockOnApply}
        onCancel={mockOnCancel}
      />,
    )

    expect(screen.getByText('Voice Command Amendments')).toBeInTheDocument()
    expect(screen.getByText('Test Task')).toBeInTheDocument()
    expect(screen.getByText('Another Task')).toBeInTheDocument()
    expect(screen.getByText('Third Task')).toBeInTheDocument()
  })

  it('should not render when visible is false', () => {
    render(
      <VoiceAmendmentModal
        visible={false}
        amendments={mockAmendments}
        onApply={mockOnApply}
        onCancel={mockOnCancel}
      />,
    )

    expect(screen.queryByText('Voice Command Amendments')).not.toBeInTheDocument()
  })

  it('should display deadline change with date and time', () => {
    render(
      <VoiceAmendmentModal
        visible={true}
        amendments={[mockDeadlineAmendment]}
        onApply={mockOnApply}
        onCancel={mockOnCancel}
      />,
    )

    // Should show the deadline change type
    expect(screen.getByText('Deadline Change')).toBeInTheDocument()
    // Should show formatted date and time
    expect(screen.getByText(/Aug 30, 2025/)).toBeInTheDocument()
    expect(screen.getByText(/11:00 PM/)).toBeInTheDocument()
  })

  it('should display priority change', () => {
    render(
      <VoiceAmendmentModal
        visible={true}
        amendments={[mockPriorityAmendment]}
        onApply={mockOnApply}
        onCancel={mockOnCancel}
      />,
    )

    expect(screen.getByText('Priority Change')).toBeInTheDocument()
    expect(screen.getByText(/Importance: 8/)).toBeInTheDocument()
    expect(screen.getByText(/Urgency: 7/)).toBeInTheDocument()
  })

  it('should display type change', () => {
    render(
      <VoiceAmendmentModal
        visible={true}
        amendments={[mockTypeAmendment]}
        onApply={mockOnApply}
        onCancel={mockOnCancel}
      />,
    )

    expect(screen.getByText('Type Change')).toBeInTheDocument()
    expect(screen.getByText(/personal/i)).toBeInTheDocument()
  })

  it('should handle edit mode toggle', () => {
    render(
      <VoiceAmendmentModal
        visible={true}
        amendments={mockAmendments}
        onApply={mockOnApply}
        onCancel={mockOnCancel}
      />,
    )

    const editButton = screen.getByRole('button', { name: /edit/i })
    fireEvent.click(editButton)

    // Should show save changes button in edit mode
    expect(screen.getByRole('button', { name: /save changes/i })).toBeInTheDocument()
  })

  it('should call onApply when apply button is clicked', () => {
    render(
      <VoiceAmendmentModal
        visible={true}
        amendments={mockAmendments}
        onApply={mockOnApply}
        onCancel={mockOnCancel}
      />,
    )

    const applyButton = screen.getByRole('button', { name: /apply amendments/i })
    fireEvent.click(applyButton)

    expect(mockOnApply).toHaveBeenCalledWith(mockAmendments)
  })

  it('should call onCancel when cancel button is clicked', () => {
    render(
      <VoiceAmendmentModal
        visible={true}
        amendments={mockAmendments}
        onApply={mockOnApply}
        onCancel={mockOnCancel}
      />,
    )

    const cancelButton = screen.getByRole('button', { name: /cancel/i })
    fireEvent.click(cancelButton)

    expect(mockOnCancel).toHaveBeenCalled()
  })

  it('should handle remove amendment', () => {
    render(
      <VoiceAmendmentModal
        visible={true}
        amendments={mockAmendments}
        onApply={mockOnApply}
        onCancel={mockOnCancel}
      />,
    )

    // Find and click remove button for first amendment
    const removeButtons = screen.getAllByLabelText(/remove/i)
    fireEvent.click(removeButtons[0])

    // Apply with remaining amendments
    const applyButton = screen.getByRole('button', { name: /apply amendments/i })
    fireEvent.click(applyButton)

    // Should have been called with only 2 amendments
    expect(mockOnApply).toHaveBeenCalledWith([
      mockPriorityAmendment,
      mockTypeAmendment,
    ])
  })

  it('should show empty state message when no amendments', () => {
    render(
      <VoiceAmendmentModal
        visible={true}
        amendments={[]}
        onApply={mockOnApply}
        onCancel={mockOnCancel}
      />,
    )

    expect(screen.getByText(/no amendments to display/i)).toBeInTheDocument()
  })

  it('should edit deadline in edit mode', () => {
    render(
      <VoiceAmendmentModal
        visible={true}
        amendments={[mockDeadlineAmendment]}
        onApply={mockOnApply}
        onCancel={mockOnCancel}
      />,
    )

    // Enter edit mode
    const editButton = screen.getByRole('button', { name: /edit/i })
    fireEvent.click(editButton)

    // Should show date picker for deadline
    const datePicker = screen.getByRole('textbox')
    expect(datePicker).toBeInTheDocument()
  })

  // Clarification is not handled via a button in the current implementation
  // This test is removed as there's no clarification button

  it('should normalize amendment type from string', () => {
    // Test with amendment type as string (from IPC)
    const stringTypeAmendment = {
      ...mockDeadlineAmendment,
      type: 'DeadlineChange' as any,
    }

    render(
      <VoiceAmendmentModal
        visible={true}
        amendments={[stringTypeAmendment]}
        onApply={mockOnApply}
        onCancel={mockOnCancel}
      />,
    )

    expect(screen.getByText('Deadline Change')).toBeInTheDocument()
  })

  it('should display amendment summary correctly', () => {
    render(
      <VoiceAmendmentModal
        visible={true}
        amendments={mockAmendments}
        onApply={mockOnApply}
        onCancel={mockOnCancel}
      />,
    )

    // Check summary shows correct count
    expect(screen.getByText(/3 amendments will be applied/i)).toBeInTheDocument()
  })

  it('should handle save changes in edit mode', () => {
    render(
      <VoiceAmendmentModal
        visible={true}
        amendments={mockAmendments}
        onApply={mockOnApply}
        onCancel={mockOnCancel}
      />,
    )

    // Enter edit mode
    const editButton = screen.getByRole('button', { name: /edit/i })
    fireEvent.click(editButton)

    // Save changes
    const saveButton = screen.getByRole('button', { name: /save changes/i })
    fireEvent.click(saveButton)

    // Should exit edit mode
    expect(screen.getByRole('button', { name: /edit/i })).toBeInTheDocument()
  })

  it('should display step operations', () => {
    const stepAmendment = {
      type: AmendmentType.StepDurationChange,
      targetWorkflowId: 'workflow-1',
      targetStepId: 'step-1',
      targetName: 'Workflow Step',
      newDuration: 45,
    }

    render(
      <VoiceAmendmentModal
        visible={true}
        amendments={[stepAmendment]}
        onApply={mockOnApply}
        onCancel={mockOnCancel}
      />,
    )

    expect(screen.getByText('Step Duration Change')).toBeInTheDocument()
    expect(screen.getByText('Workflow Step')).toBeInTheDocument()
    expect(screen.getByText(/45 minutes/i)).toBeInTheDocument()
  })

  it('should handle dependency changes', () => {
    const dependencyAmendment = {
      type: AmendmentType.DependencyChange,
      targetWorkflowId: 'workflow-1',
      targetStepId: 'step-2',
      targetName: 'Step with Dependencies',
      dependencies: ['step-1'],
    }

    render(
      <VoiceAmendmentModal
        visible={true}
        amendments={[dependencyAmendment]}
        onApply={mockOnApply}
        onCancel={mockOnCancel}
      />,
    )

    expect(screen.getByText('Dependency Change')).toBeInTheDocument()
    expect(screen.getByText(/step-1/i)).toBeInTheDocument()
  })

  it('should handle modal close via X button', () => {
    render(
      <VoiceAmendmentModal
        visible={true}
        amendments={mockAmendments}
        onApply={mockOnApply}
        onCancel={mockOnCancel}
      />,
    )

    // Find close button (usually an X icon button)
    const closeButton = screen.getByLabelText(/close/i)
    fireEvent.click(closeButton)

    expect(mockOnCancel).toHaveBeenCalled()
  })
})
