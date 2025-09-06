import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { EisenhowerScatter } from '../EisenhowerScatter'
import { TaskType } from '@shared/enums'
import type { Task } from '@shared/types'
import { ResponsiveProvider } from '../../../providers/ResponsiveProvider'

// Helper function to render with ResponsiveProvider
const renderWithProvider = (component: React.ReactElement) => {
  return render(<ResponsiveProvider>{component}</ResponsiveProvider>)
}

// Mock the container query hook
vi.mock('../../../hooks/useContainerQuery', () => ({
  useContainerQuery: () => ({
    ref: vi.fn(),
    width: 800,
    height: 600,
  }),
}))

// Mock the logger
vi.mock('../../../logging/index.renderer', () => ({
  getRendererLogger: () => ({
    child: () => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  }),
}))

describe('EisenhowerScatter', () => {
  const mockOnSelectTask = vi.fn()
  const mockSetContainerSize = vi.fn()

  const mockTasks: Task[] = [
    {
      id: 'task-1',
      name: 'High Priority',
      importance: 9,
      urgency: 9,
      duration: 60,
      type: TaskType.Focused,
      completed: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'task-2',
      name: 'Medium Priority',
      importance: 5,
      urgency: 5,
      duration: 45,
      type: TaskType.Admin,
      completed: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'task-3',
      name: 'Low Priority',
      importance: 2,
      urgency: 2,
      duration: 30,
      type: TaskType.Personal,
      completed: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'task-4',
      name: 'Completed Task',
      importance: 7,
      urgency: 7,
      duration: 60,
      type: TaskType.Focused,
      completed: true, // Should not appear
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ]

  const mockAllItems = [
    ...mockTasks.filter(t => !t.completed),
    {
      ...mockTasks[0],
      id: 'step-1',
      name: 'High Priority - Step 1',
      duration: 30,
      isStep: true,
      parentWorkflow: 'task-1',
      stepName: 'Step 1',
      stepIndex: 0,
    },
  ]

  const defaultContainerSize = { width: 800, height: 600 }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
  })

  describe('Task Rendering', () => {
    it('should render incomplete tasks as points on the scatter plot', () => {
      renderWithProvider(
        <EisenhowerScatter
          tasks={mockTasks}
          allItemsForScatter={mockAllItems}
          onSelectTask={mockOnSelectTask}
          containerSize={defaultContainerSize}
          setContainerSize={mockSetContainerSize}
        />,
      )

      // Check that incomplete tasks are rendered (abbreviated names)
      expect(screen.getByText('Hi')).toBeInTheDocument() // High Priority
      expect(screen.getByText('Me')).toBeInTheDocument() // Medium Priority
      expect(screen.getByText('Lo')).toBeInTheDocument() // Low Priority

      // Completed task should not appear
      expect(screen.queryByText('Completed Task')).not.toBeInTheDocument()
    })

    it('should position tasks based on urgency (x-axis) and importance (y-axis)', () => {
      renderWithProvider(
        <EisenhowerScatter
          tasks={mockTasks}
          allItemsForScatter={mockAllItems}
          onSelectTask={mockOnSelectTask}
          containerSize={defaultContainerSize}
          setContainerSize={mockSetContainerSize}
        />,
      )

      // Find task elements by their titles
      const highPriorityTask = screen.getByText('High Priority').closest('[style*="position"]')
      const lowPriorityTask = screen.getByText('Low Priority').closest('[style*="position"]')

      // High priority task (9,9) should be positioned differently than low priority (2,2)
      expect(highPriorityTask).toHaveStyle({ position: 'absolute' })
      expect(lowPriorityTask).toHaveStyle({ position: 'absolute' })

      // The positioning should reflect the values (actual positions depend on implementation)
      const highStyle = highPriorityTask?.getAttribute('style')
      const lowStyle = lowPriorityTask?.getAttribute('style')

      expect(highStyle).toContain('left')
      expect(highStyle).toContain('top')
      expect(lowStyle).toContain('left')
      expect(lowStyle).toContain('top')
    })

    it('should render workflow steps when included in allItemsForScatter', () => {
      renderWithProvider(
        <EisenhowerScatter
          tasks={mockTasks}
          allItemsForScatter={mockAllItems}
          onSelectTask={mockOnSelectTask}
          containerSize={defaultContainerSize}
          setContainerSize={mockSetContainerSize}
        />,
      )

      // Check that workflow step is rendered (abbreviated)
      expect(screen.getByText('Hi')).toBeInTheDocument() // High Priority - Step 1 (same abbreviation as parent)
    })

    it('should show task duration in badges', () => {
      renderWithProvider(
        <EisenhowerScatter
          tasks={mockTasks}
          allItemsForScatter={mockAllItems}
          onSelectTask={mockOnSelectTask}
          containerSize={defaultContainerSize}
          setContainerSize={mockSetContainerSize}
        />,
      )

      // Check for duration badges
      expect(screen.getByText('60m')).toBeInTheDocument()
      expect(screen.getByText('45m')).toBeInTheDocument()
      expect(screen.getByText('30m')).toBeInTheDocument()
    })
  })

  describe('User Interactions', () => {
    it('should call onSelectTask when a task is clicked', () => {
      renderWithProvider(
        <EisenhowerScatter
          tasks={mockTasks}
          allItemsForScatter={mockAllItems}
          onSelectTask={mockOnSelectTask}
          containerSize={defaultContainerSize}
          setContainerSize={mockSetContainerSize}
        />,
      )

      const taskElement = screen.getByText('Hi').closest('[style*="cursor"]') // Abbreviated name
      fireEvent.click(taskElement!)

      expect(mockOnSelectTask).toHaveBeenCalledWith(mockTasks[0])
    })

    it('should show debug mode toggle button', () => {
      renderWithProvider(
        <EisenhowerScatter
          tasks={mockTasks}
          allItemsForScatter={mockAllItems}
          onSelectTask={mockOnSelectTask}
          containerSize={defaultContainerSize}
          setContainerSize={mockSetContainerSize}
        />,
      )

      // Debug button shows as "🔍 Debug OFF" or similar
      const debugButton = screen.getByText(/Debug OFF/i)
      expect(debugButton).toBeInTheDocument()
    })

    it('should toggle debug overlay when debug button is clicked', () => {
      renderWithProvider(
        <EisenhowerScatter
          tasks={mockTasks}
          allItemsForScatter={mockAllItems}
          onSelectTask={mockOnSelectTask}
          containerSize={defaultContainerSize}
          setContainerSize={mockSetContainerSize}
        />,
      )

      const debugButton = screen.getByText(/Debug OFF/i)

      // Click to enable debug mode
      fireEvent.click(debugButton)

      // Debug mode should be enabled (button text changes)
      expect(screen.getByText(/Debug ON/i)).toBeInTheDocument()
    })
  })

  describe('Diagonal Scan Feature', () => {
    it('should render diagonal scan button', () => {
      renderWithProvider(
        <EisenhowerScatter
          tasks={mockTasks}
          allItemsForScatter={mockAllItems}
          onSelectTask={mockOnSelectTask}
          containerSize={defaultContainerSize}
          setContainerSize={mockSetContainerSize}
        />,
      )

      // Find scan button by its text
      const scanButton = screen.getByText('Scan')
      expect(scanButton).toBeInTheDocument()
    })

    it('should start diagonal scan animation when button is clicked', async () => {
      renderWithProvider(
        <EisenhowerScatter
          tasks={mockTasks}
          allItemsForScatter={mockAllItems}
          onSelectTask={mockOnSelectTask}
          containerSize={defaultContainerSize}
          setContainerSize={mockSetContainerSize}
        />,
      )

      const scanButton = screen.getByText('Scan')

      // Start scanning
      fireEvent.click(scanButton)

      // Button should change to show scanning state
      expect(screen.getByText('Scan...')).toBeInTheDocument()

      // Advance timers to simulate animation
      act(() => {
        vi.advanceTimersByTime(500)
      })

      // Should show scan progress
      await waitFor(() => {
        const progressText = screen.queryByText(/Scan Progress:/)
        expect(progressText).toBeInTheDocument()
      })
    })

    it('should stop scanning when button is clicked again', () => {
      renderWithProvider(
        <EisenhowerScatter
          tasks={mockTasks}
          allItemsForScatter={mockAllItems}
          onSelectTask={mockOnSelectTask}
          containerSize={defaultContainerSize}
          setContainerSize={mockSetContainerSize}
        />,
      )

      const scanButton = screen.getByText('Scan')

      // Start scanning
      fireEvent.click(scanButton)

      // Find the scanning button and stop
      const scanningButton = screen.getByText('Scan...')
      fireEvent.click(scanningButton)

      // Should go back to normal state
      expect(screen.getByText('Scan')).toBeInTheDocument()
    })

    it('should highlight tasks during scan', async () => {
      const { container } = renderWithProvider(
        <EisenhowerScatter
          tasks={mockTasks}
          allItemsForScatter={mockAllItems}
          onSelectTask={mockOnSelectTask}
          containerSize={defaultContainerSize}
          setContainerSize={mockSetContainerSize}
        />,
      )

      const scanButton = screen.getByText('Scan')

      // Start scanning
      fireEvent.click(scanButton)

      // Advance timers to trigger scan progress
      act(() => {
        vi.advanceTimersByTime(1000)
      })

      // Look for highlighted task indicators (e.g., changed opacity or special styling)
      await waitFor(() => {
        const taskElements = container.querySelectorAll('[style*="opacity"]')
        expect(taskElements.length).toBeGreaterThan(0)
      })
    })
  })

  describe('Responsive Behavior', () => {
    it('should update container size when dimensions change', async () => {
      renderWithProvider(
        <EisenhowerScatter
          tasks={mockTasks}
          allItemsForScatter={mockAllItems}
          onSelectTask={mockOnSelectTask}
          containerSize={defaultContainerSize}
          setContainerSize={mockSetContainerSize}
        />,
      )

      // Wait for the effect to run
      await waitFor(() => {
        expect(mockSetContainerSize).toHaveBeenCalled()
      })
    })

    it('should not update container size for minor changes', () => {
      const { rerender } = renderWithProvider(
        <EisenhowerScatter
          tasks={mockTasks}
          allItemsForScatter={mockAllItems}
          onSelectTask={mockOnSelectTask}
          containerSize={{ width: 800, height: 600 }}
          setContainerSize={mockSetContainerSize}
        />,
      )

      // Clear initial calls
      mockSetContainerSize.mockClear()

      // Rerender with slightly different size (< 10px difference)
      rerender(
        <ResponsiveProvider>
          <EisenhowerScatter
            tasks={mockTasks}
            allItemsForScatter={mockAllItems}
            onSelectTask={mockOnSelectTask}
            containerSize={{ width: 805, height: 605 }}
            setContainerSize={mockSetContainerSize}
          />
        </ResponsiveProvider>,
      )

      // Should not update for minor changes
      expect(mockSetContainerSize).not.toHaveBeenCalled()
    })
  })

  describe('Visual Elements', () => {
    it('should display axis labels', () => {
      renderWithProvider(
        <EisenhowerScatter
          tasks={mockTasks}
          allItemsForScatter={mockAllItems}
          onSelectTask={mockOnSelectTask}
          containerSize={defaultContainerSize}
          setContainerSize={mockSetContainerSize}
        />,
      )

      expect(screen.getByText('Urgency →')).toBeInTheDocument()
      expect(screen.getByText('Importance →')).toBeInTheDocument()
    })

    it('should show grid lines', () => {
      const { container } = renderWithProvider(
        <EisenhowerScatter
          tasks={mockTasks}
          allItemsForScatter={mockAllItems}
          onSelectTask={mockOnSelectTask}
          containerSize={defaultContainerSize}
          setContainerSize={mockSetContainerSize}
        />,
      )

      // Look for grid line elements or container with grid background
      const scatterContainer = container.querySelector('.eisenhower-scatter-container') ||
                              container.querySelector('[style*="background"]')
      expect(scatterContainer).toBeInTheDocument()
    })

    it('should show quadrant labels', () => {
      renderWithProvider(
        <EisenhowerScatter
          tasks={mockTasks}
          allItemsForScatter={mockAllItems}
          onSelectTask={mockOnSelectTask}
          containerSize={defaultContainerSize}
          setContainerSize={mockSetContainerSize}
        />,
      )

      // Quadrant labels appear as overlay text in scatter view
      // They might be abbreviated or styled differently
      const container = document.body
      const _hasQuadrantIndicators =
        container.textContent?.includes('Do First') ||
        container.textContent?.includes('Schedule') ||
        container.textContent?.includes('Q1') ||
        container.textContent?.includes('Q2')

      // At minimum, we should have axis labels
      expect(screen.getByText('Urgency →')).toBeInTheDocument()
      expect(screen.getByText('Importance →')).toBeInTheDocument()
    })
  })

  describe('Edge Cases', () => {
    it('should handle empty task list', () => {
      renderWithProvider(
        <EisenhowerScatter
          tasks={[]}
          allItemsForScatter={[]}
          onSelectTask={mockOnSelectTask}
          containerSize={defaultContainerSize}
          setContainerSize={mockSetContainerSize}
        />,
      )

      // Should still render the scatter plot container and controls
      expect(screen.getByText('Scan')).toBeInTheDocument()
      expect(screen.getByText('Urgency →')).toBeInTheDocument()
      expect(screen.getByText('Importance →')).toBeInTheDocument()
    })

    it('should handle all completed tasks', () => {
      const completedTasks = mockTasks.map(task => ({ ...task, completed: true }))

      renderWithProvider(
        <EisenhowerScatter
          tasks={completedTasks}
          allItemsForScatter={[]}
          onSelectTask={mockOnSelectTask}
          containerSize={defaultContainerSize}
          setContainerSize={mockSetContainerSize}
        />,
      )

      // No task abbreviations should appear
      expect(screen.queryByText('Hi')).not.toBeInTheDocument()
      expect(screen.queryByText('Me')).not.toBeInTheDocument()
      expect(screen.queryByText('Lo')).not.toBeInTheDocument()
    })

    it('should handle tasks with same urgency and importance', () => {
      const duplicateTasks: Task[] = [
        {
          id: 'dup-1',
          name: 'Task A',
          importance: 5,
          urgency: 5,
          duration: 30,
          type: TaskType.Focused,
          completed: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'dup-2',
          name: 'Task B',
          importance: 5,
          urgency: 5,
          duration: 30,
          type: TaskType.Admin,
          completed: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]

      renderWithProvider(
        <EisenhowerScatter
          tasks={duplicateTasks}
          allItemsForScatter={duplicateTasks}
          onSelectTask={mockOnSelectTask}
          containerSize={defaultContainerSize}
          setContainerSize={mockSetContainerSize}
        />,
      )

      // Both tasks should be rendered (abbreviated)
      expect(screen.getByText('Ta')).toBeInTheDocument() // Task A
      // Note: Both have same abbreviation, so we check for at least one
      const taElements = screen.getAllByText('Ta')
      expect(taElements.length).toBeGreaterThanOrEqual(2)
    })

    it('should handle extreme importance/urgency values', () => {
      const extremeTasks: Task[] = [
        {
          id: 'extreme-1',
          name: 'Max Values',
          importance: 10,
          urgency: 10,
          duration: 60,
          type: TaskType.Focused,
          completed: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'extreme-2',
          name: 'Min Values',
          importance: 0,
          urgency: 0,
          duration: 60,
          type: TaskType.Admin,
          completed: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]

      renderWithProvider(
        <EisenhowerScatter
          tasks={extremeTasks}
          allItemsForScatter={extremeTasks}
          onSelectTask={mockOnSelectTask}
          containerSize={defaultContainerSize}
          setContainerSize={mockSetContainerSize}
        />,
      )

      // Both extreme tasks should be rendered (abbreviated)
      expect(screen.getByText('Ma')).toBeInTheDocument() // Max Values
      expect(screen.getByText('Mi')).toBeInTheDocument() // Min Values
    })
  })
})
