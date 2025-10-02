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
vi.mock('@/shared/logger', () => ({
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

describe('TaskList - Filtering Logic', () => {
  // Mock getComputedStyle for Arco components
  beforeAll(() => {
    Object.defineProperty(window, 'getComputedStyle', {
      value: () => ({
        getPropertyValue: () => '0',
        paddingTop: '0',
        paddingBottom: '0',
        padding: '0',
      }),
    })
  })

  describe('Work Items filter', () => {
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
        name: 'Admin Task 2',
        type: TaskType.Admin,
        duration: 25,
        importance: 3,
        urgency: 3,
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

    it('should have work items filter option available', () => {
      render(<TaskList onAddTask={vi.fn()} />)

      // The dropdown should exist
      const dropdown = screen.getByPlaceholderText('Select task type')
      expect(dropdown).toBeInTheDocument()
    })

    it('should show correct counts for all task types', () => {
      render(<TaskList onAddTask={vi.fn()} />)

      // Total: 5 tasks
      // Focused: 2 (both incomplete)
      // Admin: 2 (1 incomplete, 1 complete)
      // Personal: 1 (incomplete)
      // Work Items (Focused + Admin): 4 total
      // Active (incomplete): 4
      // Completed: 1

      const activeTag = screen.getByText(/4 Active/)
      expect(activeTag).toBeInTheDocument()

      const completedTag = screen.getByText(/1 Completed/)
      expect(completedTag).toBeInTheDocument()
    })

    it('should correctly calculate task overview percentages', () => {
      render(<TaskList onAddTask={vi.fn()} />)

      // 1 completed out of 5 total = 20%
      const progressText = screen.getByText('20% Complete')
      expect(progressText).toBeInTheDocument()
    })

    it('should display filter UI elements', () => {
      render(<TaskList onAddTask={vi.fn()} />)

      // Filter label
      expect(screen.getByText('Filter by Type:')).toBeInTheDocument()

      // Dropdown placeholder
      expect(screen.getByPlaceholderText('Select task type')).toBeInTheDocument()
    })

    it('should render buttons for task actions', () => {
      render(<TaskList onAddTask={vi.fn()} />)

      // Quick Edit button
      expect(screen.getByRole('button', { name: /Quick Edit/i })).toBeInTheDocument()

      // Generate Schedule button
      expect(screen.getByRole('button', { name: /Generate Schedule/i })).toBeInTheDocument()

      // Add Task button
      expect(screen.getByRole('button', { name: /Add Task/i })).toBeInTheDocument()
    })
  })

  describe('Empty state', () => {
    beforeEach(() => {
      vi.clearAllMocks()
      ;(useTaskStore as any).mockReturnValue({
        tasks: [],
        loadTasks: vi.fn(),
        sequencedTasks: [],
      })
    })

    it('should show empty state when no tasks exist', () => {
      render(<TaskList onAddTask={vi.fn()} />)

      expect(screen.getByText('No active tasks')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Create Your First Task/i })).toBeInTheDocument()
    })

    it('should show 0% completion when no tasks', () => {
      render(<TaskList onAddTask={vi.fn()} />)

      const progressText = screen.getByText('0% Complete')
      expect(progressText).toBeInTheDocument()
    })
  })

  describe('Completed tasks section', () => {
    const mockTasksWithCompleted = [
      {
        id: '1',
        name: 'Active Task',
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
        name: 'Completed Task',
        type: TaskType.Admin,
        duration: 30,
        importance: 3,
        urgency: 3,
        completed: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]

    beforeEach(() => {
      vi.clearAllMocks()
      ;(useTaskStore as any).mockReturnValue({
        tasks: mockTasksWithCompleted,
        loadTasks: vi.fn(),
        sequencedTasks: [],
      })
    })

    it('should show completed tasks section when completed tasks exist', () => {
      render(<TaskList onAddTask={vi.fn()} />)

      // Should have a completed tasks heading
      const completedHeading = screen.getByRole('heading', { name: /Completed Tasks/i })
      expect(completedHeading).toBeInTheDocument()
    })
  })
})
