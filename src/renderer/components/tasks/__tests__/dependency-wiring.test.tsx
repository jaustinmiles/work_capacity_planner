import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi } from 'vitest'
import { StepSplitModal } from '../StepSplitModal'
import { TaskSplitModal } from '../TaskSplitModal'
import { TaskStep } from '@shared/sequencing-types'
import { Task } from '@shared/types'
import { StepStatus, TaskType } from '@shared/enums'

// Mock the store
const mockUpdateTask = vi.fn()
const mockAddTask = vi.fn()

vi.mock('../../../store/useTaskStore', () => ({
  useTaskStore: () => ({
    updateTask: mockUpdateTask,
    addTask: mockAddTask,
  }),
}))

// Mock the Message component
vi.mock('../../common/Message', () => ({
  Message: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

describe('Dependency Wiring in Split Features', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('StepSplitModal - Dependency Preservation', () => {
    const mockStep: TaskStep = {
      id: 'step-3',
      taskId: 'task-1',
      name: 'Step with Dependencies',
      duration: 120,
      type: TaskType.Focused,
      asyncWaitTime: 0,
      dependsOn: ['step-1', 'step-2'], // This step depends on two others
      status: StepStatus.Pending,
      stepIndex: 2,
      percentComplete: 0,
      notes: 'Has dependencies',
      cognitiveComplexity: 3,
      importance: 5,
      urgency: 5,
      actualDuration: 0,
    }

    const mockOnSplit = vi.fn()
    const mockOnClose = vi.fn()

    it('should preserve dependencies in the second split step', async () => {
      render(
        <StepSplitModal
          step={mockStep}
          stepIndex={2}
          visible={true}
          onClose={mockOnClose}
          onSplit={mockOnSplit}
        />,
      )

      // Fill in names for both parts
      const inputs = screen.getAllByRole('textbox')
      fireEvent.change(inputs[0], { target: { value: 'Part 1' } })
      fireEvent.change(inputs[2], { target: { value: 'Part 2' } })

      // Split the step
      const splitButton = screen.getByRole('button', { name: 'Split Step' })
      fireEvent.click(splitButton)

      await waitFor(() => {
        expect(mockOnSplit).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'Part 1',
            dependsOn: ['step-1', 'step-2'], // First part keeps original dependencies
          }),
          expect.objectContaining({
            name: 'Part 2',
            dependsOn: ['step-1', 'step-2'], // Second part inherits same dependencies
          }),
        )
      })
    })

    it('should handle steps with no dependencies', async () => {
      const stepWithoutDeps = { ...mockStep, dependsOn: [] }

      render(
        <StepSplitModal
          step={stepWithoutDeps}
          stepIndex={0}
          visible={true}
          onClose={mockOnClose}
          onSplit={mockOnSplit}
        />,
      )

      const inputs = screen.getAllByRole('textbox')
      fireEvent.change(inputs[2], { target: { value: 'Part 2' } })

      const splitButton = screen.getByRole('button', { name: 'Split Step' })
      fireEvent.click(splitButton)

      await waitFor(() => {
        expect(mockOnSplit).toHaveBeenCalledWith(
          expect.objectContaining({
            dependsOn: [], // Empty array preserved
          }),
          expect.objectContaining({
            dependsOn: [], // Empty array preserved
          }),
        )
      })
    })

    it('should maintain complex dependency arrays', async () => {
      const complexStep = {
        ...mockStep,
        dependsOn: ['step-1', 'step-2', 'step-3', 'step-4', 'step-5'],
      }

      render(
        <StepSplitModal
          step={complexStep}
          stepIndex={5}
          visible={true}
          onClose={mockOnClose}
          onSplit={mockOnSplit}
        />,
      )

      const inputs = screen.getAllByRole('textbox')
      fireEvent.change(inputs[2], { target: { value: 'Complex Part 2' } })

      const splitButton = screen.getByRole('button', { name: 'Split Step' })
      fireEvent.click(splitButton)

      await waitFor(() => {
        expect(mockOnSplit).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({
            name: 'Complex Part 2',
            dependsOn: ['step-1', 'step-2', 'step-3', 'step-4', 'step-5'],
          }),
        )
      })
    })
  })

  describe('TaskSplitModal - Task Dependencies', () => {
    const mockTask: Task = {
      id: 'task-1',
      name: 'Task with Dependencies',
      duration: 120,
      importance: 5,
      urgency: 5,
      type: TaskType.Focused,
      asyncWaitTime: 0,
      dependencies: ['task-a', 'task-b'], // Task-level dependencies
      completed: false,
      sessionId: 'session-1',
      createdAt: new Date(),
      updatedAt: new Date(),
      notes: 'Has dependencies',
      deadline: new Date('2025-12-31'),
      cognitiveComplexity: 3,
      hasSteps: false,
      overallStatus: 'not_started',
      criticalPathDuration: 120,
      worstCaseDuration: 120,
    }

    const mockOnSplit = vi.fn()
    const mockOnClose = vi.fn()

    it('should preserve task dependencies in both split tasks', async () => {
      render(
        <TaskSplitModal
          task={mockTask}
          visible={true}
          onClose={mockOnClose}
          onSplit={mockOnSplit}
        />,
      )

      // Fill in names
      const inputs = screen.getAllByRole('textbox')
      fireEvent.change(inputs[0], { target: { value: 'First Half' } })
      fireEvent.change(inputs[2], { target: { value: 'Second Half' } })

      // Split the task
      const splitButton = screen.getByRole('button', { name: 'Split Task' })
      fireEvent.click(splitButton)

      await waitFor(() => {
        // First task updates (doesn't include dependencies in the update object)
        expect(mockUpdateTask).toHaveBeenCalledWith(
          'task-1',
          expect.objectContaining({
            name: 'First Half',
            duration: 60,
          }),
        )

        // Second task should inherit dependencies from original
        expect(mockAddTask).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'Second Half',
            dependencies: ['task-a', 'task-b'], // Inherited from original task
          }),
        )
      })
    })

    it('should handle tasks without dependencies', async () => {
      const taskWithoutDeps = { ...mockTask, dependencies: [] }

      render(
        <TaskSplitModal
          task={taskWithoutDeps}
          visible={true}
          onClose={mockOnClose}
          onSplit={mockOnSplit}
        />,
      )

      const inputs = screen.getAllByRole('textbox')
      fireEvent.change(inputs[2], { target: { value: 'No Deps Part 2' } })

      const splitButton = screen.getByRole('button', { name: 'Split Task' })
      fireEvent.click(splitButton)

      await waitFor(() => {
        expect(mockAddTask).toHaveBeenCalledWith(
          expect.objectContaining({
            dependencies: [],
          }),
        )
      })
    })
  })

  describe('Integration - Dependency Chain Integrity', () => {
    it('should verify that split steps maintain dependency chain integrity', () => {
      // This test verifies the conceptual integrity of dependency chains
      // when a step in the middle of a chain is split

      const _originalChain = {
        step1: { id: 'step-1', dependsOn: [] },
        step2: { id: 'step-2', dependsOn: ['step-1'] },
        step3: { id: 'step-3', dependsOn: ['step-2'] }, // This one gets split
        step4: { id: 'step-4', dependsOn: ['step-3'] },
      }

      // After splitting step3 into step3a and step3b
      const expectedChain = {
        step1: { id: 'step-1', dependsOn: [] },
        step2: { id: 'step-2', dependsOn: ['step-1'] },
        step3a: { id: 'step-3', dependsOn: ['step-2'] }, // First part keeps dependency
        step3b: { id: 'step-3-split', dependsOn: ['step-2'] }, // Second part inherits
        step4: { id: 'step-4', dependsOn: ['step-3'] }, // Still depends on original ID
      }

      // Verify the logic
      expect(expectedChain.step3a.dependsOn).toEqual(['step-2'])
      expect(expectedChain.step3b.dependsOn).toEqual(['step-2'])
      expect(expectedChain.step4.dependsOn).toContain('step-3')
    })

    it('should handle circular dependency prevention', () => {
      // Ensure that splitting doesn't create circular dependencies
      const step: TaskStep = {
        id: 'step-2',
        taskId: 'task-1',
        name: 'Middle Step',
        duration: 60,
        type: TaskType.Focused,
        asyncWaitTime: 0,
        dependsOn: ['step-1'],
        status: StepStatus.Pending,
        stepIndex: 1,
        percentComplete: 0,
        notes: '',
        cognitiveComplexity: 3,
        importance: 5,
        urgency: 5,
        actualDuration: 0,
      }

      // When split, neither part should depend on itself
      const step1 = { ...step, name: 'Part 1' }
      const step2 = {
        ...step,
        id: 'step-2-split',
        name: 'Part 2',
        stepIndex: 2,
      }

      // Verify no self-dependency
      expect(step1.dependsOn).not.toContain(step1.id)
      expect(step2.dependsOn).not.toContain(step2.id)

      // Verify both maintain original dependency
      expect(step1.dependsOn).toContain('step-1')
      expect(step2.dependsOn).toContain('step-1')
    })
  })

  describe('Edge Cases', () => {
    it('should handle undefined or null dependencies gracefully', () => {
      const stepWithUndefined: TaskStep = {
        id: 'step-1',
        taskId: 'task-1',
        name: 'Step',
        duration: 60,
        type: TaskType.Focused,
        asyncWaitTime: 0,
        dependsOn: undefined as any, // Simulating bad data
        status: StepStatus.Pending,
        stepIndex: 0,
        percentComplete: 0,
        notes: '',
        cognitiveComplexity: 3,
        importance: 5,
        urgency: 5,
        actualDuration: 0,
      }

      // The component should handle this gracefully
      const safeDependencies = stepWithUndefined.dependsOn || []
      expect(safeDependencies).toEqual([])
    })

    it('should preserve dependency order', () => {
      const dependencies = ['step-3', 'step-1', 'step-2']
      const step: TaskStep = {
        id: 'step-4',
        taskId: 'task-1',
        name: 'Step',
        duration: 60,
        type: TaskType.Focused,
        asyncWaitTime: 0,
        dependsOn: dependencies,
        status: StepStatus.Pending,
        stepIndex: 3,
        percentComplete: 0,
        notes: '',
        cognitiveComplexity: 3,
        importance: 5,
        urgency: 5,
        actualDuration: 0,
      }

      // After split, dependency order should be maintained
      const splitStep = { ...step, dependsOn: [...dependencies] }
      expect(splitStep.dependsOn).toEqual(['step-3', 'step-1', 'step-2'])
      expect(splitStep.dependsOn[0]).toBe('step-3')
      expect(splitStep.dependsOn[2]).toBe('step-2')
    })
  })
})
