import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
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

  it('should have filter dropdown with all options', () => {
    render(<TaskList onAddTask={vi.fn()} />)

    // Check that the filter dropdown exists
    expect(screen.getByPlaceholderText('Select task type')).toBeInTheDocument()

    // Check that filter label is shown
    expect(screen.getByText('Filter by Type:')).toBeInTheDocument()
  })

  it('should display correct task counts based on mock data', () => {
    render(<TaskList onAddTask={vi.fn()} />)

    // We have 5 total tasks in mock data:
    // - 2 Focused (both incomplete)
    // - 1 Admin (incomplete)
    // - 2 Personal (1 incomplete, 1 complete)
    // Total incomplete: 4

    const activeTag = screen.getByText(/4 Active/)
    expect(activeTag).toBeInTheDocument()

    const completedTag = screen.getByText(/1 Completed/)
    expect(completedTag).toBeInTheDocument()
  })

  it('should display title without filter indicator when showing all tasks', () => {
    render(<TaskList onAddTask={vi.fn()} />)

    // When filter is 'all', title should just say "Active Tasks"
    const title = screen.getByRole('heading', { name: /^Active Tasks$/ })
    expect(title).toBeInTheDocument()
  })

  it('should show progress bar with correct completion percentage', () => {
    render(<TaskList onAddTask={vi.fn()} />)

    // 1 completed out of 5 total = 20%
    const progressText = screen.getByText('20% Complete')
    expect(progressText).toBeInTheDocument()
  })
})
