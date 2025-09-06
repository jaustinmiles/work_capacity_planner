import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ResponsiveProvider } from '../../../providers/ResponsiveProvider'
import { EisenhowerMatrix } from '../EisenhowerMatrix'
import { useTaskStore } from '../../../store/useTaskStore'
import { TaskType } from '@shared/enums'

// Mock child components that will be extracted during refactor
vi.mock('../EisenhowerGrid', () => ({
  EisenhowerGrid: ({ tasks, onAddTask, onSelectTask }: any) => (
    <div data-testid="eisenhower-grid">
      <button onClick={onAddTask}>Add Task</button>
      {tasks.map((task: any) => (
        <div key={task.id} onClick={() => onSelectTask(task)}>
          {task.name}
        </div>
      ))}
    </div>
  ),
}))

vi.mock('../EisenhowerScatter', () => ({
  EisenhowerScatter: ({ tasks, onSelectTask }: any) => (
    <div data-testid="eisenhower-scatter">
      {tasks.map((task: any) => (
        <div key={task.id} onClick={() => onSelectTask(task)}>
          {task.name}
        </div>
      ))}
    </div>
  ),
}))

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
    it('should render grid view by default', () => {
      renderWithProvider(<EisenhowerMatrix onAddTask={mockOnAddTask} />)

      expect(screen.getByTestId('eisenhower-grid')).toBeInTheDocument()
      expect(screen.queryByTestId('eisenhower-scatter')).not.toBeInTheDocument()
    })

    it('should switch to scatter view when toggled', () => {
      renderWithProvider(<EisenhowerMatrix onAddTask={mockOnAddTask} />)

      // Find scatter toggle button
      const scatterButton = screen.getByDisplayValue('scatter')
      fireEvent.click(scatterButton)

      expect(screen.queryByTestId('eisenhower-grid')).not.toBeInTheDocument()
      expect(screen.getByTestId('eisenhower-scatter')).toBeInTheDocument()
    })

    it('should show scatter view when toggled', () => {
      renderWithProvider(<EisenhowerMatrix onAddTask={mockOnAddTask} />)

      // Grid mode initially
      expect(screen.getByTestId('eisenhower-grid')).toBeInTheDocument()

      // Switch to scatter mode
      const scatterButton = screen.getByDisplayValue('scatter')
      fireEvent.click(scatterButton)

      // Scatter mode should show
      expect(screen.getByTestId('eisenhower-scatter')).toBeInTheDocument()
    })
  })

  describe('Task Data Management', () => {
    it('should pass filtered tasks to child components', () => {
      renderWithProvider(<EisenhowerMatrix onAddTask={mockOnAddTask} />)

      // Should show incomplete tasks
      expect(screen.getByText('Urgent Important Task')).toBeInTheDocument()
      expect(screen.getByText('Important Not Urgent')).toBeInTheDocument()

      // Should not show completed task
      expect(screen.queryByText('Completed Task')).not.toBeInTheDocument()
    })

    it('should handle task selection from child components', () => {
      renderWithProvider(<EisenhowerMatrix onAddTask={mockOnAddTask} />)

      const taskElement = screen.getByText('Urgent Important Task')
      fireEvent.click(taskElement)

      expect(mockSelectTask).toHaveBeenCalledWith('task-1')
    })

    it('should handle add task action from child components', () => {
      renderWithProvider(<EisenhowerMatrix onAddTask={mockOnAddTask} />)

      const addButton = screen.getByText('Add Task')
      fireEvent.click(addButton)

      expect(mockOnAddTask).toHaveBeenCalled()
    })
  })
})
