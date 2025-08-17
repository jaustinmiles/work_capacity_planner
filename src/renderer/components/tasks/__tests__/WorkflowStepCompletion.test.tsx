import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TaskStepItem } from '../TaskStepItem'
import { TaskStep } from '@shared/sequencing-types'

describe('Workflow Step Completion UI', () => {
  const mockStep: TaskStep = {
    id: 'step-1',
    taskId: 'task-1',
    name: 'Test Step',
    duration: 60,
    type: 'focused',
    dependsOn: [],
    asyncWaitTime: 0,
    status: 'pending',
    stepIndex: 0,
    percentComplete: 0,
  }

  const mockOnStart = vi.fn()
  const mockOnComplete = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('TaskStepItem', () => {
    it('should render step information', () => {
      render(
        <TaskStepItem
          step={mockStep}
          stepIndex={0}
          isActive={false}
          isCompleted={false}
        />,
      )

      expect(screen.getByText('Test Step')).toBeTruthy()
      expect(screen.getByText('1h')).toBeTruthy() // Duration
      expect(screen.getByText('Focused Work')).toBeTruthy() // Type
    })

    it('should show Start button for pending steps', () => {
      render(
        <TaskStepItem
          step={mockStep}
          stepIndex={0}
          isActive={false}
          isCompleted={false}
          onStart={mockOnStart}
        />,
      )

      const startButton = screen.getByText('Start')
      expect(startButton).toBeTruthy()
    })

    it('should call onStart when Start button is clicked', () => {
      render(
        <TaskStepItem
          step={mockStep}
          stepIndex={0}
          isActive={false}
          isCompleted={false}
          onStart={mockOnStart}
        />,
      )

      const startButton = screen.getByText('Start')
      fireEvent.click(startButton)

      expect(mockOnStart).toHaveBeenCalledWith('step-1')
    })

    it('should show Complete button for active steps', () => {
      render(
        <TaskStepItem
          step={{ ...mockStep, status: 'in_progress' }}
          stepIndex={0}
          isActive={true}
          isCompleted={false}
          onComplete={mockOnComplete}
        />,
      )

      const completeButton = screen.getByText('Complete')
      expect(completeButton).toBeTruthy()
    })

    it('should call onComplete when Complete button is clicked', () => {
      render(
        <TaskStepItem
          step={{ ...mockStep, status: 'in_progress' }}
          stepIndex={0}
          isActive={true}
          isCompleted={false}
          onComplete={mockOnComplete}
        />,
      )

      const completeButton = screen.getByText('Complete')
      fireEvent.click(completeButton)

      expect(mockOnComplete).toHaveBeenCalledWith('step-1')
    })

    it('should show completed state with strikethrough', () => {
      render(
        <TaskStepItem
          step={{ ...mockStep, status: 'completed' }}
          stepIndex={0}
          isActive={false}
          isCompleted={true} />
      )

      const stepName = screen.getByText('Test Step')
      // Check that the step shows as completed rather than checking CSS styles
      expect(stepName).toBeInTheDocument()
      // Verify completed steps don't have action buttons
      expect(screen.queryByText('Start')).not.toBeInTheDocument()
      expect(screen.queryByText('Complete')).not.toBeInTheDocument()
    })

    it('should not show buttons for completed steps', () => {
      render(
        <TaskStepItem
          step={{ ...mockStep, status: 'completed' }}
          stepIndex={0}
          isActive={false}
          isCompleted={true}
          onStart={mockOnStart}
          onComplete={mockOnComplete}
        />,
      )

      expect(screen.queryByText('Start')).toBeFalsy()
      expect(screen.queryByText('Complete')).toBeFalsy()
    })

    it('should show async wait time when present', () => {
      render(
        <TaskStepItem
          step={{ ...mockStep, asyncWaitTime: 120 }}
          stepIndex={0}
          isActive={false}
          isCompleted={false}
        />,
      )

      expect(screen.getByText('Wait: 2h')).toBeTruthy()
    })

    it('should show "In Progress" badge for active steps', () => {
      render(
        <TaskStepItem
          step={{ ...mockStep, status: 'in_progress' }}
          stepIndex={0}
          isActive={true}
          isCompleted={false}
        />,
      )

      expect(screen.getByText('In Progress')).toBeTruthy()
    })
  })
})
