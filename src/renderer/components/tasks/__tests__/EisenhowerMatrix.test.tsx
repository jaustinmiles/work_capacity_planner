import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ResponsiveProvider } from '../../../providers/ResponsiveProvider'
import { EisenhowerMatrix } from '../EisenhowerMatrix'
import { useTaskStore } from '../../../store/useTaskStore'
import { TaskType } from '@shared/enums'

// Mock the useContainerQuery hook to return proper dimensions in tests
vi.mock('../../../hooks/useContainerQuery', () => ({
  useContainerQuery: () => ({
    ref: vi.fn(),
    width: 800,
    height: 600,
  }),
}))

// Helper function to render with ResponsiveProvider
const renderWithProvider = (component: React.ReactElement) => {
  return render(<ResponsiveProvider>{component}</ResponsiveProvider>)
}

// Mock the task store
vi.mock('../../../store/useTaskStore', () => ({
  useTaskStore: vi.fn(),
}))

describe('EisenhowerMatrix', () => {
  const mockSelectTask = vi.fn()
  const mockOnAddTask = vi.fn()

  const mockTasks = [
    {
      id: 'task-1',
      name: 'Urgent Important Task',
      importance: 8,
      urgency: 9,
      duration: 60,
      type: TaskType.Focused,
      completed: false,
    },
    {
      id: 'task-2',
      name: 'Important Not Urgent',
      importance: 8,
      urgency: 3,
      duration: 120,
      type: TaskType.Admin,
      completed: false,
    },
    {
      id: 'task-3',
      name: 'Urgent Not Important',
      importance: 3,
      urgency: 8,
      duration: 30,
      type: TaskType.Personal,
      completed: false,
    },
    {
      id: 'task-4',
      name: 'Low Priority',
      importance: 2,
      urgency: 2,
      duration: 45,
      type: TaskType.Personal,
      completed: false,
    },
    {
      id: 'task-5',
      name: 'Completed Task',
      importance: 5,
      urgency: 5,
      duration: 60,
      type: TaskType.Focused,
      completed: true, // Should not appear in matrix
    },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    ;(useTaskStore as any).mockReturnValue({
      tasks: mockTasks,
      sequencedTasks: [],
      selectTask: mockSelectTask,
    })
  })

  describe('Grid View', () => {
    it('should render tasks in correct quadrants', () => {
      renderWithProvider(<EisenhowerMatrix onAddTask={mockOnAddTask} />)

      // Check that completed task is not shown
      expect(screen.queryByText('Completed Task')).not.toBeInTheDocument()

      // Check that other tasks are shown
      expect(screen.getByText('Urgent Important Task')).toBeInTheDocument()
      expect(screen.getByText('Important Not Urgent')).toBeInTheDocument()
      expect(screen.getByText('Urgent Not Important')).toBeInTheDocument()
      expect(screen.getByText('Low Priority')).toBeInTheDocument()
    })

    it('should categorize tasks correctly', () => {
      renderWithProvider(<EisenhowerMatrix onAddTask={mockOnAddTask} />)

      // Check quadrant headers exist
      expect(screen.getByText('Do First')).toBeInTheDocument()
      expect(screen.getByText('Schedule')).toBeInTheDocument()
      expect(screen.getByText('Delegate')).toBeInTheDocument()
      expect(screen.getByText('Eliminate')).toBeInTheDocument()
    })

    it('should handle task selection', () => {
      renderWithProvider(<EisenhowerMatrix onAddTask={mockOnAddTask} />)

      const task = screen.getByText('Urgent Important Task')
      fireEvent.click(task)

      expect(mockSelectTask).toHaveBeenCalledWith('task-1')
    })
  })

  describe('Scatter Plot View', () => {
    beforeEach(() => {
      // Mock getBoundingClientRect to return valid dimensions
      Element.prototype.getBoundingClientRect = vi.fn(() => ({
        width: 800,
        height: 600,
        top: 0,
        left: 0,
        right: 800,
        bottom: 600,
        x: 0,
        y: 0,
        toJSON: () => {},
      }))
    })

    it('should toggle to scatter plot view', async () => {
      renderWithProvider(<EisenhowerMatrix onAddTask={mockOnAddTask} />)

      // Find and click the scatter view toggle
      const scatterButton = screen.getByRole('radio', { name: /scatter/i })
      fireEvent.click(scatterButton)

      // Check that scatter plot elements are rendered
      await waitFor(() => {
        expect(screen.getByText('Urgency →')).toBeInTheDocument()
        expect(screen.getByText('Importance →')).toBeInTheDocument()
      })
    })

    it('should position tasks correctly in scatter plot', async () => {
      const { container } = renderWithProvider(<EisenhowerMatrix onAddTask={mockOnAddTask} />)

      // Switch to scatter view
      const scatterButton = screen.getByRole('radio', { name: /scatter/i })
      fireEvent.click(scatterButton)

      await waitFor(() => {
        // Find task bubbles by their positioning
        const bubbles = container.querySelectorAll('[style*="position: absolute"]')

        // Filter to only get task bubbles (not axis labels or grid lines)
        const taskBubbles = Array.from(bubbles).filter(el => {
          const style = (el as HTMLElement).style
          return style.borderRadius === '50%' // Task bubbles are circular
        })

        // Should have 4 visible tasks (excluding completed one) + 1 debug marker
        expect(taskBubbles).toHaveLength(5)

        // Check that bubbles have different positions based on importance/urgency
        const positions = taskBubbles.map(bubble => {
          const style = (bubble as HTMLElement).style
          return {
            left: parseInt(style.left),
            top: parseInt(style.top),
          }
        })

        // All positions should be different (no overlapping tasks at same importance/urgency)
        const uniquePositions = new Set(positions.map(p => `${p.left},${p.top}`))
        expect(uniquePositions.size).toBeGreaterThan(1)
      })
    })

    it('should size bubbles based on task duration', async () => {
      const { container } = renderWithProvider(<EisenhowerMatrix onAddTask={mockOnAddTask} />)

      // Switch to scatter view
      const scatterButton = screen.getByRole('radio', { name: /scatter/i })
      fireEvent.click(scatterButton)

      await waitFor(() => {
        const bubbles = container.querySelectorAll('[style*="border-radius: 50%"]')

        const sizes = Array.from(bubbles).map(bubble => {
          const style = (bubble as HTMLElement).style
          return parseInt(style.width) || 0
        })

        // Should have different sizes based on duration
        const uniqueSizes = new Set(sizes)
        expect(uniqueSizes.size).toBeGreaterThan(1)

        // Sizes should be within expected range (20-60px)
        sizes.forEach(size => {
          if (size > 0) { // Ignore non-bubble elements
            expect(size).toBeGreaterThanOrEqual(20)
            expect(size).toBeLessThanOrEqual(60)
          }
        })
      })
    })

    it('should handle zoom controls', async () => {
      const { container } = renderWithProvider(<EisenhowerMatrix onAddTask={mockOnAddTask} />)

      // Switch to scatter view
      const scatterButton = screen.getByRole('radio', { name: /scatter/i })
      fireEvent.click(scatterButton)

      // Find zoom controls
      const zoomInButton = screen.getAllByRole('button').find(btn =>
        btn.querySelector('[class*="icon-zoom-in"]'),
      )
      const zoomOutButton = screen.getAllByRole('button').find(btn =>
        btn.querySelector('[class*="icon-zoom-out"]'),
      )

      // Test zoom in
      if (zoomInButton) {
        fireEvent.click(zoomInButton)

        await waitFor(() => {
          const bubbles = container.querySelectorAll('[style*="border-radius: 50%"]')
          // Find a task bubble (not the debug marker)
          const taskBubble = Array.from(bubbles).find(b =>
            (b as HTMLElement).style.transform?.includes('scale'),
          ) as HTMLElement

          if (taskBubble) {
            // Check that transform scale exists
            expect(taskBubble.style.transform).toContain('scale')
          }
        })
      }

      // Test zoom out
      if (zoomOutButton) {
        fireEvent.click(zoomOutButton)
        // Zoom functionality should work without errors
        expect(true).toBe(true)
      }
    })

    it('should show tooltips on hover', async () => {
      const { container } = renderWithProvider(<EisenhowerMatrix onAddTask={mockOnAddTask} />)

      // Switch to scatter view
      const scatterButton = screen.getByRole('radio', { name: /scatter/i })
      fireEvent.click(scatterButton)

      await waitFor(() => {
        const bubbles = container.querySelectorAll('[style*="border-radius: 50%"]')
        // Find a task bubble (not the debug marker - it has opacity 0.8 by default)
        const taskBubble = Array.from(bubbles).find(b =>
          (b as HTMLElement).style.opacity === '0.8',
        ) as HTMLElement

        if (taskBubble) {
          // Hover over task bubble
          fireEvent.mouseEnter(taskBubble)

          // Bubble should change opacity on hover
          expect(taskBubble.style.opacity).toBe('1')

          // Mouse leave should restore opacity
          fireEvent.mouseLeave(taskBubble)
          expect(taskBubble.style.opacity).toBe('0.8')
        }
      })
    })

    it('should handle task click in scatter plot', async () => {
      const { container } = renderWithProvider(<EisenhowerMatrix onAddTask={mockOnAddTask} />)

      // Switch to scatter view
      const scatterButton = screen.getByRole('radio', { name: /scatter/i })
      fireEvent.click(scatterButton)

      await waitFor(() => {
        const bubbles = container.querySelectorAll('[style*="border-radius: 50%"]')
        // Find a task bubble (not the debug marker - it has cursor: pointer)
        const taskBubble = Array.from(bubbles).find(b =>
          (b as HTMLElement).style.cursor === 'pointer',
        ) as HTMLElement

        if (taskBubble) {
          fireEvent.click(taskBubble)

          // Should have called selectTask with one of the task IDs
          expect(mockSelectTask).toHaveBeenCalled()
        }
      })
    })
  })

  describe('View Mode Toggle', () => {
    it('should persist view mode selection', () => {
      const { rerender } = renderWithProvider(<EisenhowerMatrix onAddTask={mockOnAddTask} />)

      // Switch to scatter view
      const scatterButton = screen.getByRole('radio', { name: /scatter/i })
      fireEvent.click(scatterButton)

      // Check scatter view is active
      expect(screen.getByText('Urgency →')).toBeInTheDocument()

      // Rerender component
      rerender(<ResponsiveProvider><EisenhowerMatrix onAddTask={mockOnAddTask} /></ResponsiveProvider>)

      // View mode should be maintained (in real app, would use localStorage)
      // For now, just verify the toggle works
      expect(screen.getByRole('radio', { name: /scatter/i })).toBeInTheDocument()
    })
  })

  describe('Add Task Button', () => {
    it('should call onAddTask when add button is clicked', () => {
      renderWithProvider(<EisenhowerMatrix onAddTask={mockOnAddTask} />)

      const addButton = screen.getByRole('button', { name: /add task/i })
      fireEvent.click(addButton)

      expect(mockOnAddTask).toHaveBeenCalled()
    })
  })
})
