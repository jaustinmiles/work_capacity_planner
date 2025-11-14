import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ResponsiveProvider } from '../../../providers/ResponsiveProvider'
import { EisenhowerMatrix } from '../EisenhowerMatrix'
import { useTaskStore } from '../../../store/useTaskStore'
import { TaskType } from '@shared/enums'

// Don't mock the actual components anymore - test the integration
// Only mock components that don't exist yet
vi.mock('../EisenhowerDiagonalScan', () => ({
  EisenhowerDiagonalScan: ({ isScanning, onToggleScan }: any) => (
    <button data-testid="diagonal-scan-button" onClick={onToggleScan}>
      {isScanning ? 'Stop Scan' : 'Start Scan'}
    </button>
  ),
}))

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

  describe('View Mode Orchestration', () => {
    it('should render scatter view by default', () => {
      renderWithProvider(<EisenhowerMatrix onAddTask={mockOnAddTask} />)

      // Check for scatter-specific elements
      expect(screen.getByText('Urgency →')).toBeInTheDocument()
      expect(screen.getByText('Importance →')).toBeInTheDocument()

      // Grid quadrant labels should not be visible in scatter view
      // (They might exist as overlays but not as card titles)
      const doFirstElements = screen.queryAllByText('Do First')
      expect(doFirstElements.length).toBeLessThanOrEqual(1) // May exist as overlay label
    })

    it('should switch to grid view when toggled', () => {
      renderWithProvider(<EisenhowerMatrix onAddTask={mockOnAddTask} />)

      // Find grid toggle button
      const gridButton = screen.getByDisplayValue('grid')
      fireEvent.click(gridButton)

      // Check for grid-specific elements
      expect(screen.getByText('Do First')).toBeInTheDocument()
      expect(screen.getByText('Schedule')).toBeInTheDocument()
      expect(screen.getByText('Delegate')).toBeInTheDocument()
      expect(screen.getByText('Eliminate')).toBeInTheDocument()

      // Scatter-specific elements should not be present
      expect(screen.queryByText('Urgency →')).not.toBeInTheDocument()
    })

    it('should show grid view when toggled', () => {
      renderWithProvider(<EisenhowerMatrix onAddTask={mockOnAddTask} />)

      // Scatter mode initially - check for scatter elements
      expect(screen.getByText('Urgency →')).toBeInTheDocument()

      // Switch to grid mode
      const gridButton = screen.getByDisplayValue('grid')
      fireEvent.click(gridButton)

      // Grid mode should show quadrant labels
      expect(screen.getByText('Do First')).toBeInTheDocument()
      expect(screen.getByText('Schedule')).toBeInTheDocument()
      expect(screen.getByText('Delegate')).toBeInTheDocument()
      expect(screen.getByText('Eliminate')).toBeInTheDocument()
    })
  })

  describe('Task Data Management', () => {
    it('should pass filtered tasks to child components', () => {
      renderWithProvider(<EisenhowerMatrix onAddTask={mockOnAddTask} />)

      // Switch to grid view for easier text-based assertions
      const gridButton = screen.getByDisplayValue('grid')
      fireEvent.click(gridButton)

      // Should show incomplete tasks
      expect(screen.getByText('Urgent Important Task')).toBeInTheDocument()
      expect(screen.getByText('Important Not Urgent')).toBeInTheDocument()

      // Should not show completed task
      expect(screen.queryByText('Completed Task')).not.toBeInTheDocument()
    })

    it('should handle task selection from child components', () => {
      renderWithProvider(<EisenhowerMatrix onAddTask={mockOnAddTask} />)

      // Switch to grid view for easier text-based assertions
      const gridButton = screen.getByDisplayValue('grid')
      fireEvent.click(gridButton)

      const taskElement = screen.getByText('Urgent Important Task')
      fireEvent.click(taskElement)

      expect(mockSelectTask).toHaveBeenCalledWith('task-1')
    })

    it('should handle add task action from child components', () => {
      renderWithProvider(<EisenhowerMatrix onAddTask={mockOnAddTask} />)

      // Switch to grid view for consistent add button rendering
      const gridButton = screen.getByDisplayValue('grid')
      fireEvent.click(gridButton)

      // Find add button by its plus icon
      const buttons = screen.getAllByRole('button')
      const addButton = buttons.find(btn => btn.querySelector('.arco-icon-plus'))

      expect(addButton).toBeDefined()
      fireEvent.click(addButton!)

      expect(mockOnAddTask).toHaveBeenCalled()
    })
  })
})
