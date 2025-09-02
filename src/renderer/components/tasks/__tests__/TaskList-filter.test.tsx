import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { TaskList } from '../TaskList'
import { useTaskStore } from '../../../store/useTaskStore'
import { TaskType } from '@shared/enums'

// Mock the store
vi.mock('../../../store/useTaskStore')

// Mock the database
vi.mock('../../../services/database', () => ({
  getDatabase: vi.fn(() => ({
    deleteAllTasks: vi.fn(),
  })),
}))

// Mock the logger
vi.mock('../../../utils/logger', () => ({
  logger: {
    ui: {
      error: vi.fn(),
    },
  },
}))

// Mock the logging context
vi.mock('../../../../logging/index.renderer', () => ({
  useLoggerContext: () => ({
    logger: {
      interaction: vi.fn(),
      info: vi.fn(),
      error: vi.fn(),
    },
  }),
  getRendererLogger: () => ({
    interaction: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    state: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
  }),
}))

// Mock Message component
vi.mock('../../common/Message', () => ({
  Message: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

// Mock other components
vi.mock('../TaskItem', () => ({
  TaskItem: vi.fn(() => null),
}))

vi.mock('../../schedule/ScheduleGenerator', () => ({
  ScheduleGenerator: vi.fn(() => null),
}))

vi.mock('../TaskQuickEditModal', () => ({
  TaskQuickEditModal: vi.fn(() => null),
}))

describe('TaskList - Task Type Filter', () => {
  // Mock getComputedStyle for Arco components
  beforeAll(() => {
    Object.defineProperty(window, 'getComputedStyle', {
      value: () => ({
        getPropertyValue: () => {
          return '0'
        },
        paddingTop: '0',
        paddingBottom: '0',
        padding: '0',
      }),
    })
  })

  const mockTasks = [
    {
      id: '1',
      name: 'Focus Task 1',
      type: TaskType.Focused,
      duration: 60,
      importance: 5,
      urgency: 5,
      completed: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: '2',
      name: 'Admin Task 1',
      type: TaskType.Admin,
      duration: 30,
      importance: 3,
      urgency: 3,
      completed: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: '3',
      name: 'Personal Task 1',
      type: TaskType.Personal,
      duration: 45,
      importance: 2,
      urgency: 2,
      completed: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: '4',
      name: 'Focus Task 2',
      type: TaskType.Focused,
      duration: 90,
      importance: 4,
      urgency: 4,
      completed: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: '5',
      name: 'Personal Task 2',
      type: TaskType.Personal,
      duration: 20,
      importance: 1,
      urgency: 1,
      completed: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    ;(useTaskStore as any).mockReturnValue({
      tasks: mockTasks,
      loadTasks: vi.fn(),
      sequencedTasks: [],
    })
  })

  it('should render task type filter dropdown', () => {
    render(<TaskList onAddTask={vi.fn()} />)

    expect(screen.getByText('Filter by Type:')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Select task type')).toBeInTheDocument()
  })

  it('should show all tasks by default', () => {
    render(<TaskList onAddTask={vi.fn()} />)

    // Check that the active task count shows all incomplete tasks (4)
    const activeTag = screen.getByText(/4 Active/)
    expect(activeTag).toBeInTheDocument()
  })

  it('should filter tasks by Focused type', async () => {
    render(<TaskList onAddTask={vi.fn()} />)

    const select = screen.getByPlaceholderText('Select task type')
    fireEvent.click(select)

    await waitFor(() => {
      const focusedOption = screen.getByText('Focused Tasks')
      fireEvent.click(focusedOption)
    })

    // Should show filtering text
    expect(screen.getByText('Showing 2 of 5 tasks')).toBeInTheDocument()

    // Title should indicate filtered type
    expect(screen.getByText(/Active Tasks.*focused/i)).toBeInTheDocument()
  })

  it('should filter tasks by Personal type', async () => {
    render(<TaskList onAddTask={vi.fn()} />)

    const select = screen.getByPlaceholderText('Select task type')
    fireEvent.click(select)

    await waitFor(() => {
      const personalOption = screen.getByText('Personal Tasks')
      fireEvent.click(personalOption)
    })

    // Should show 2 personal tasks (1 active, 1 completed)
    expect(screen.getByText('Showing 2 of 5 tasks')).toBeInTheDocument()

    // Title should indicate filtered type
    expect(screen.getByText(/Active Tasks.*personal/i)).toBeInTheDocument()
  })

  it('should filter tasks by Admin type', async () => {
    render(<TaskList onAddTask={vi.fn()} />)

    const select = screen.getByPlaceholderText('Select task type')
    fireEvent.click(select)

    await waitFor(() => {
      const adminOption = screen.getByText('Admin Tasks')
      fireEvent.click(adminOption)
    })

    // Should show 1 admin task
    expect(screen.getByText('Showing 1 of 5 tasks')).toBeInTheDocument()

    // Title should indicate filtered type
    expect(screen.getByText(/Active Tasks.*admin/i)).toBeInTheDocument()
  })

  it('should reset to show all tasks when "All Tasks" is selected', async () => {
    render(<TaskList onAddTask={vi.fn()} />)

    const select = screen.getByPlaceholderText('Select task type')

    // First filter by Personal
    fireEvent.click(select)
    await waitFor(() => {
      const personalOption = screen.getByText('Personal Tasks')
      fireEvent.click(personalOption)
    })

    expect(screen.getByText('Showing 2 of 5 tasks')).toBeInTheDocument()

    // Then reset to All
    fireEvent.click(select)
    await waitFor(() => {
      const allOption = screen.getByText('All Tasks')
      fireEvent.click(allOption)
    })

    // Should no longer show filtering text
    expect(screen.queryByText(/Showing \d+ of \d+ tasks/)).not.toBeInTheDocument()

    // Title should not have filter type
    expect(screen.queryByText(/Active Tasks.*\(.*\)/)).not.toBeInTheDocument()
  })
})
