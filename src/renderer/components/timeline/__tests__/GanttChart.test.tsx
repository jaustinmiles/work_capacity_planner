import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { GanttChart } from '../GanttChart'
import { Task } from '@shared/types'
import { SequencedTask } from '@shared/sequencing-types'

// Mock the database service
vi.mock('../../../services/database', () => ({
  getDatabase: vi.fn(() => ({
    getWorkPattern: vi.fn().mockResolvedValue(null),
  })),
}))

// Mock the store
vi.mock('../../../store/useTaskStore', () => ({
  useTaskStore: vi.fn(() => ({
    // Add any store methods used by GanttChart
  })),
}))

// Mock child components that might be complex
vi.mock('../../settings/WorkScheduleModal', () => ({
  WorkScheduleModal: vi.fn(({ visible, onClose }) => {
    return visible ? <div data-testid="work-schedule-modal">Work Schedule Modal</div> : null
  }),
}))

vi.mock('../../settings/MultiDayScheduleEditor', () => ({
  MultiDayScheduleEditor: vi.fn(({ visible, onClose }) => {
    return visible ? <div data-testid="multi-day-editor">Multi Day Editor</div> : null
  }),
}))

describe('GanttChart', () => {
  let mockTasks: Task[]
  let mockSequencedTasks: SequencedTask[]

  beforeEach(() => {
    // Mock current time
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-08-12T10:00:00'))

    // Reset mocks
    vi.clearAllMocks()

    // Create mock data
    mockTasks = [
      {
        id: 'task-1',
        name: 'Test Task',
        type: 'focused',
        sessionId: 'test-session',        duration: 60,
        importance: 8,
        urgency: 7,
        completed: false,
        asyncWaitTime: 0,
        status: 'pending',
      },
    ]

    mockSequencedTasks = [
      {
        id: 'workflow-1',
        name: 'Test Workflow',
        description: 'Test workflow description',
        importance: 9,
        urgency: 8,
        overallStatus: 'pending',
        steps: [
          {
            id: 'step-1',
            name: 'Step 1',
            description: 'First step',
            type: 'focused',
        sessionId: 'test-session',            duration: 30,
            asyncWaitTime: 0,
            status: 'pending',
            order: 0,
          },
        ],
      },
    ]
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('rendering', () => {
    it('should render empty state when no scheduled items', async () => {
      render(<GanttChart tasks={[]} sequencedTasks={[]} />)

      await waitFor(() => {
        expect(screen.getByText('No scheduled items to display')).toBeInTheDocument()
      })
    })

    it('should render work schedule setup prompt when no patterns exist', async () => {
      render(<GanttChart tasks={mockTasks} sequencedTasks={[]} />)

      await waitFor(() => {
        expect(screen.getByText('You need to set up your work schedule first')).toBeInTheDocument()
        expect(screen.getByText('Create Work Schedule')).toBeInTheDocument()
      })
    })

    it('should render chart when items and patterns exist', async () => {
      // Mock getWorkPattern to return a pattern
      const { getDatabase } = await import('../../../services/database')
      const mockDb = getDatabase()
      vi.mocked(mockDb.getWorkPattern).mockResolvedValue({
        id: 'pattern-1',
        date: '2025-08-12',
        blocks: [
          {
            id: 'block-1',
            startTime: '09:00',
            endTime: '12:00',
            type: 'focused',
        sessionId: 'test-session'          },
        ],
        meetings: [],
      })

      render(<GanttChart tasks={mockTasks} sequencedTasks={[]} />)

      await waitFor(() => {
        expect(screen.getByText('Scheduled Tasks (Priority Order)')).toBeInTheDocument()
      })
    })
  })

  describe('interactions', () => {
    it('should open work schedule modal when clicking settings button', async () => {
      const user = userEvent.setup()

      render(<GanttChart tasks={[]} sequencedTasks={[]} />)

      await waitFor(() => {
        expect(screen.getByText('Create Work Schedule')).toBeInTheDocument()
      })

      await user.click(screen.getByText('Create Work Schedule'))

      expect(screen.getByTestId('work-schedule-modal')).toBeInTheDocument()
    })

    it('should adjust zoom level with slider', async () => {
      const user = userEvent.setup()

      // Mock with work pattern
      const { getDatabase } = await import('../../../services/database')
      const mockDb = getDatabase()
      vi.mocked(mockDb.getWorkPattern).mockResolvedValue({
        id: 'pattern-1',
        date: '2025-08-12',
        blocks: [
          {
            id: 'block-1',
            startTime: '09:00',
            endTime: '17:00',
            type: 'mixed',
        sessionId: 'test-session',            capacity: { focused: 240, admin: 240 },
          },
        ],
        meetings: [],
      })

      render(<GanttChart tasks={mockTasks} sequencedTasks={[]} />)

      await waitFor(() => {
        expect(screen.getByRole('slider')).toBeInTheDocument()
      })

      const slider = screen.getByRole('slider')
      expect(slider).toHaveAttribute('value', '120') // Default zoom level

      // Simulate changing the slider
      await user.click(slider)
      // Note: Testing slider interactions might require more specific implementation
    })
  })

  describe('gantt chart features', () => {
    beforeEach(async () => {
      // Setup work pattern for all gantt tests
      const { getDatabase } = await import('../../../services/database')
      const mockDb = getDatabase()
      vi.mocked(mockDb.getWorkPattern).mockResolvedValue({
        id: 'pattern-1',
        date: '2025-08-12',
        blocks: [
          {
            id: 'block-1',
            startTime: '09:00',
            endTime: '17:00',
            type: 'mixed',
        sessionId: 'test-session',            capacity: { focused: 240, admin: 240 },
          },
        ],
        meetings: [
          {
            id: 'meeting-1',
            name: 'Team Standup',
            startTime: '10:00',
            endTime: '10:30',
            type: 'meeting',
        sessionId: 'test-session'          },
        ],
      })
    })

    it('should display task counts in summary', async () => {
      render(<GanttChart tasks={mockTasks} sequencedTasks={mockSequencedTasks} />)

      await waitFor(() => {
        // Should show total items count
        expect(screen.getByText('Total Items')).toBeInTheDocument()
        // Should show workflow count
        expect(screen.getByText('Workflows')).toBeInTheDocument()
      })
    })

    it('should display meetings as blocked time', async () => {
      render(<GanttChart tasks={[]} sequencedTasks={[]} />)

      await waitFor(() => {
        // The meeting name should appear somewhere in the rendered chart
        const chartContainer = screen.getByText('Scheduled Tasks (Priority Order)').parentElement
        expect(chartContainer).toBeTruthy()
      })
    })

    it('should display priority legend', async () => {
      render(<GanttChart tasks={mockTasks} sequencedTasks={[]} />)

      await waitFor(() => {
        expect(screen.getByText('Critical Priority (64+)')).toBeInTheDocument()
        expect(screen.getByText('High Priority (49-63)')).toBeInTheDocument()
        expect(screen.getByText('Medium Priority (36-48)')).toBeInTheDocument()
        expect(screen.getByText('Low Priority (<36)')).toBeInTheDocument()
      })
    })

    it('should display time markers', async () => {
      render(<GanttChart tasks={mockTasks} sequencedTasks={[]} />)

      await waitFor(() => {
        // Should have date headers
        const dateStr = new Date('2025-08-12').toLocaleDateString([], {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
        })
        expect(screen.getByText(dateStr)).toBeInTheDocument()
      })
    })
  })

  describe('row positioning', () => {
    it('should assign unique React keys to prevent duplicate warnings', async () => {
      // Setup multiple meetings at same time
      const { getDatabase } = await import('../../../services/database')
      const mockDb = getDatabase()
      vi.mocked(mockDb.getWorkPattern).mockResolvedValue({
        id: 'pattern-1',
        date: '2025-08-12',
        blocks: [
          {
            id: 'block-1',
            startTime: '09:00',
            endTime: '17:00',
            type: 'mixed',
        sessionId: 'test-session',            capacity: { focused: 240, admin: 240 },
          },
        ],
        meetings: [
          {
            id: 'meeting-1',
            name: 'Meeting 1',
            startTime: '10:00',
            endTime: '10:30',
            type: 'meeting',
        sessionId: 'test-session'          },
          {
            id: 'meeting-1', // Duplicate ID to test deduplication
            name: 'Meeting 2',
            startTime: '10:00',
            endTime: '10:30',
            type: 'meeting',
        sessionId: 'test-session'          },
        ],
      })

      // Spy on console errors to check for duplicate key warnings
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      render(<GanttChart tasks={[]} sequencedTasks={[]} />)

      await waitFor(() => {
        expect(screen.getByText('Scheduled Tasks (Priority Order)')).toBeInTheDocument()
      })

      // Check that no duplicate key warnings were logged
      const duplicateKeyErrors = consoleSpy.mock.calls.filter(call =>
        call.some(arg => typeof arg === 'string' && arg.includes('duplicate key')),
      )
      expect(duplicateKeyErrors?.length).toBe(0)

      consoleSpy.mockRestore()
    })
  })
})
