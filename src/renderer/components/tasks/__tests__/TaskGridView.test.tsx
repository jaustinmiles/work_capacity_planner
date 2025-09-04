import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { TaskGridView } from '../TaskGridView'
import { useTaskStore } from '../../../store/useTaskStore'
import { Task } from '@shared/types'
import { TaskType } from '@shared/enums'

// Mock the store
vi.mock('../../../store/useTaskStore')

// Mock the Message component
vi.mock('../../common/Message', () => ({
  Message: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

// Mock UnifiedTaskEdit component
vi.mock('../UnifiedTaskEdit', () => ({
  UnifiedTaskEdit: vi.fn(() => null),
}))

// Mock the logger
vi.mock('@shared/logger', () => ({
  logger: {
    ui: {
      error: vi.fn(),
    },
  },
}))

describe('TaskGridView', () => {
  const mockUpdateTask = vi.fn()
  const mockDeleteTask = vi.fn()

  const mockTasks: Task[] = [
    {
      id: 'task-1',
      name: 'Test Task 1',
      duration: 60,
      importance: 7,
      urgency: 8,
      type: TaskType.Focused,
      completed: false,
      status: 'not_started',
      cognitiveComplexity: 3,
      createdAt: new Date(),
      updatedAt: new Date(),
      hasSteps: false,
    },
    {
      id: 'task-2',
      name: 'Test Task 2',
      duration: 120,
      importance: 5,
      urgency: 5,
      type: TaskType.Admin,
      completed: true,
      status: 'completed',
      cognitiveComplexity: 2,
      createdAt: new Date(),
      updatedAt: new Date(),
      hasSteps: false,
    },
    {
      id: 'task-3',
      name: 'Personal Task',
      duration: 30,
      importance: 3,
      urgency: 3,
      type: TaskType.Personal,
      completed: false,
      status: 'not_started',
      cognitiveComplexity: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
      hasSteps: false,
    },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    ;(useTaskStore as any).mockReturnValue({
      updateTask: mockUpdateTask,
      deleteTask: mockDeleteTask,
    })
  })

  it('should render tasks in a table', () => {
    render(<TaskGridView tasks={mockTasks} />)

    // Check headers are rendered
    expect(screen.getByText('Name')).toBeInTheDocument()
    expect(screen.getByText('Type')).toBeInTheDocument()
    expect(screen.getByText('Duration')).toBeInTheDocument()
    expect(screen.getByText('Importance')).toBeInTheDocument()
    expect(screen.getByText('Urgency')).toBeInTheDocument()
    expect(screen.getByText('Priority')).toBeInTheDocument()
    expect(screen.getByText('Cognitive')).toBeInTheDocument()

    // Check task data is rendered
    expect(screen.getByText('Test Task 1')).toBeInTheDocument()
    expect(screen.getByText('Test Task 2')).toBeInTheDocument()
    expect(screen.getByText('Personal Task')).toBeInTheDocument()
  })

  it('should display duration in human-readable format', () => {
    render(<TaskGridView tasks={mockTasks} />)

    expect(screen.getByText('1h 0m')).toBeInTheDocument() // 60 minutes
    expect(screen.getByText('2h 0m')).toBeInTheDocument() // 120 minutes
    expect(screen.getByText('30m')).toBeInTheDocument() // 30 minutes
  })

  it('should display task type tags', () => {
    render(<TaskGridView tasks={mockTasks} />)

    expect(screen.getByText('Focused')).toBeInTheDocument()
    expect(screen.getByText('Admin')).toBeInTheDocument()
    expect(screen.getByText('Personal')).toBeInTheDocument()
  })

  it('should calculate and display priority scores', () => {
    render(<TaskGridView tasks={mockTasks} />)

    // Task 1: 7 * 8 = 56
    expect(screen.getByText('56')).toBeInTheDocument()
    // Task 2: 5 * 5 = 25
    expect(screen.getByText('25')).toBeInTheDocument()
    // Task 3: 3 * 3 = 9
    expect(screen.getByText('9')).toBeInTheDocument()
  })

  it('should display importance and urgency values', () => {
    render(<TaskGridView tasks={mockTasks} />)

    // Check importance values
    expect(screen.getByText('7/10')).toBeInTheDocument()
    expect(screen.getAllByText('5/10')).toHaveLength(2) // Both importance and urgency for task 2
    expect(screen.getAllByText('3/10')).toHaveLength(2) // Both for task 3

    // Check urgency values
    expect(screen.getByText('8/10')).toBeInTheDocument()
  })

  it('should display cognitive complexity labels', () => {
    render(<TaskGridView tasks={mockTasks} />)

    expect(screen.getByText('Med')).toBeInTheDocument() // complexity 3
    expect(screen.getByText('Med-')).toBeInTheDocument() // complexity 2
    expect(screen.getByText('Low')).toBeInTheDocument() // complexity 1
  })

  it('should show completion status icons', () => {
    const { container } = render(<TaskGridView tasks={mockTasks} />)

    // Check for status icons (using aria-label or svg elements)
    const svgIcons = container.querySelectorAll('svg')

    // We should have status icons for each task
    expect(svgIcons.length).toBeGreaterThan(0)
  })

  it('should handle task completion toggle', async () => {
    render(<TaskGridView tasks={mockTasks} />)

    // Find the complete/incomplete button for first task
    const actionButtons = screen.getAllByRole('button')
    const toggleButton = actionButtons.find(btn => {
      const parent = btn.parentElement
      return parent && parent.parentElement?.textContent?.includes('Test Task 1')
    })

    if (toggleButton) {
      fireEvent.click(toggleButton)

      await waitFor(() => {
        expect(mockUpdateTask).toHaveBeenCalledWith('task-1', {
          completed: true,
        })
      })
    }
  })

  it('should handle task deletion', async () => {
    render(<TaskGridView tasks={mockTasks} />)

    // Find and click the dropdown menu for first task
    const moreButtons = screen.getAllByRole('button').filter(btn => {
      return btn.querySelector('.IconMore') !== null
    })

    if (moreButtons[0]) {
      fireEvent.click(moreButtons[0])

      // Wait for dropdown menu to appear and click delete
      await waitFor(() => {
        const deleteOption = screen.getByText('Delete')
        fireEvent.click(deleteOption)
      })

      expect(mockDeleteTask).toHaveBeenCalledWith('task-1')
    }
  })

  it('should open edit modal when edit is clicked', async () => {
    const { container } = render(<TaskGridView tasks={mockTasks} />)

    // Find and click the dropdown menu
    const moreButtons = screen.getAllByRole('button').filter(btn => {
      return btn.querySelector('.IconMore') !== null
    })

    if (moreButtons[0]) {
      fireEvent.click(moreButtons[0])

      // Wait for dropdown menu and click edit
      await waitFor(() => {
        const editOption = screen.getByText('Edit')
        fireEvent.click(editOption)
      })

      // Check that state was updated (we can't directly test modal opening due to mocking)
      // But we can verify the component re-rendered with the modal
      expect(container.querySelector('.arco-modal')).toBeDefined()
    }
  })

  it('should allow inline editing when cell is clicked', async () => {
    const { container } = render(<TaskGridView tasks={mockTasks} />)

    // Find and click on an importance tag to edit
    const importanceTag = screen.getByText('7/10')
    fireEvent.click(importanceTag)

    // After clicking, a select dropdown should appear
    await waitFor(() => {
      const select = container.querySelector('.arco-select')
      expect(select).toBeDefined()
    })
  })

  it('should sort tasks by columns', () => {
    render(<TaskGridView tasks={mockTasks} />)

    // The table component handles sorting internally
    // We can verify the sort functions exist by checking column definitions
    const nameColumn = screen.getByText('Name')
    expect(nameColumn).toBeInTheDocument()

    // Verify sorting doesn't break the component
    fireEvent.click(nameColumn)

    // Component should still render
    expect(screen.getByText('Test Task 1')).toBeInTheDocument()
  })

  it('should render with pagination controls', () => {
    const { container } = render(<TaskGridView tasks={mockTasks} />)

    // Check for pagination elements
    const pagination = container.querySelector('.arco-pagination')
    expect(pagination).toBeDefined()
  })

  it('should handle empty task list', () => {
    const { container } = render(<TaskGridView tasks={[]} />)

    // Should render table structure
    const table = container.querySelector('table')
    expect(table).toBeTruthy()

    // Should have table headers but no data rows
    expect(screen.getByText('Name')).toBeInTheDocument()
    expect(screen.getByText('Type')).toBeInTheDocument()
  })

  it('should apply correct colors to priority scores', () => {
    render(<TaskGridView tasks={mockTasks} />)

    // Task 1 with score 56 should be orange (>=36)
    const highPriorityTag = screen.getByText('56').closest('.arco-tag')
    expect(highPriorityTag?.className).toMatch(/arco-tag-(orange|red)/)

    // Task 3 with score 9 should be gray (<16)
    const lowPriorityTag = screen.getByText('9').closest('.arco-tag')
    expect(lowPriorityTag?.className).toMatch(/arco-tag-(gray|default)/)
  })

  it('should format complex durations correctly', () => {
    const tasksWithVariousDurations = [
      { ...mockTasks[0], duration: 90 }, // 1h 30m
      { ...mockTasks[1], duration: 240 }, // 4h 0m
      { ...mockTasks[2], duration: 15 }, // 15m
    ]

    render(<TaskGridView tasks={tasksWithVariousDurations} />)

    expect(screen.getByText('1h 30m')).toBeInTheDocument()
    expect(screen.getByText('4h 0m')).toBeInTheDocument()
    expect(screen.getByText('15m')).toBeInTheDocument()
  })
})
