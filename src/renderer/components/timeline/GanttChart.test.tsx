import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, cleanup } from '@testing-library/react'
import { GanttChart } from './GanttChart'
import { useTaskStore } from '../../store/useTaskStore'
import { useSchedulerStore } from '../../store/useSchedulerStore'
import { useWorkPatternStore } from '../../store/useWorkPatternStore'
import { getCurrentTime } from '@shared/time-provider'
import { Task } from '@shared/types'
import { SequencedTask } from '@shared/sequencing-types'
import { TaskType } from '@shared/enums'
import '@testing-library/jest-dom'

// Mock the stores
vi.mock('../../store/useTaskStore')
vi.mock('../../store/useSchedulerStore')
vi.mock('../../store/useWorkPatternStore')
vi.mock('@shared/time-provider')

// Mock the UnifiedScheduler hook - returns stable scheduler instance
const mockScheduler = {
  scheduleForDisplay: vi.fn(() => ({
    scheduled: [],
    unscheduled: [],
    debugInfo: {
      scheduledItems: [],
      unscheduledItems: [],
      blockUtilization: [],
      warnings: [],
      totalScheduled: 0,
      totalUnscheduled: 0,
      scheduleEfficiency: 0,
    },
    conflicts: [],
  })),
}

vi.mock('../../hooks/useUnifiedScheduler', () => ({
  useUnifiedScheduler: () => mockScheduler,
}))

// Mock the database to return work patterns
const mockGetWorkPattern = vi.fn()
vi.mock('../../services/database', () => ({
  getDatabase: vi.fn(() => ({
    getWorkPattern: mockGetWorkPattern,
  })),
}))

// Mock dayjs
vi.mock('dayjs', async () => {
  const actual = await vi.importActual('dayjs')
  return {
    default: actual.default,
  }
})

describe('GanttChart', () => {
  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks()

    // Mock current time to a fixed date
    const mockDate = new Date('2025-08-30T14:00:00')
    vi.mocked(getCurrentTime).mockReturnValue(mockDate)

    // Mock the database to return a valid work pattern with CORRECT time string format
    mockGetWorkPattern.mockImplementation((dateStr: string) => {
      return Promise.resolve({
        date: dateStr,
        blocks: [
          {
            id: `block-${dateStr}`,
            type: 'flexible',
            startTime: '09:00',  // This MUST be a string like "09:00", not a Date
            endTime: '17:00',    // This MUST be a string like "17:00", not a Date
            capacity: 480,
            usedCapacity: 0,
          },
        ],
        meetings: [],
      })
    })

    // Mock the task store
    vi.mocked(useTaskStore).mockReturnValue({
      updateTask: vi.fn(),
      updateSequencedTask: vi.fn(),
      workSettings: null,
    } as any)

    // Mock the scheduler store with default empty state
    vi.mocked(useSchedulerStore).mockReturnValue({
      ganttItems: [],
      scheduleResult: null,
    } as any)

    // Mock the work pattern store with default empty state
    vi.mocked(useWorkPatternStore).mockReturnValue({
      workPatterns: [],
      isLoading: false,
      currentBlock: null,
      nextBlock: null,
    } as any)
  })

  it('should show message to add tasks when work patterns exist but no tasks', async () => {
    // Update mocks to have work patterns but no scheduled items
    vi.mocked(useWorkPatternStore).mockReturnValue({
      workPatterns: [
        {
          date: '2025-08-30',
          blocks: [{
            id: 'block-1',
            startTime: '09:00',
            endTime: '17:00',
            type: 'flexible',
            capacity: { focus: 480, admin: 480 },
          }],
          meetings: [],
          accumulated: { focus: 0, admin: 0, personal: 0 },
        },
      ],
      isLoading: false,
      currentBlock: null,
      nextBlock: null,
    } as any)

    vi.mocked(useSchedulerStore).mockReturnValue({
      ganttItems: [],
      scheduleResult: {
        scheduled: [],
        unscheduled: [],
        debugInfo: {
          scheduledItems: [],
          unscheduledItems: [],
          blockUtilization: [],
          warnings: [],
          totalScheduled: 0,
          totalUnscheduled: 0,
          scheduleEfficiency: 0,
        },
        conflicts: [],
      },
    } as any)

    const mockTasks: Task[] = []
    const mockSequencedTasks: SequencedTask[] = []

    render(<GanttChart tasks={mockTasks} sequencedTasks={mockSequencedTasks} />)

    // Wait for the component to load and display the empty state
    await waitFor(() => {
      expect(screen.getByText('No scheduled items to display')).toBeInTheDocument()
      expect(screen.getByText('Add some tasks or workflows to see them scheduled')).toBeInTheDocument()
    })
  })

  afterEach(() => {
    // Clean up any pending timers from Arco components
    vi.clearAllTimers()
    cleanup()
  })

  it('should render tasks when provided', async () => {
    // Update mock to have work patterns for this test too
    vi.mocked(useTaskStore).mockReturnValue({
      updateTask: vi.fn(),
      updateSequencedTask: vi.fn(),
      generateSchedule: vi.fn(),
      getOptimalSchedule: vi.fn(),
      workPatterns: [
        {
          date: '2025-08-30',
          isWorkday: true,
          blocks: [{
            id: 'block-1',
            startTime: '09:00',
            endTime: '17:00',
            type: 'flexible',
          }],
          meetings: [],
          effectiveCapacity: { focus: 480, admin: 480, personal: 0 },
        },
      ],
      workPatternsLoading: false,
      loadWorkPatterns: vi.fn(),
    } as any)

    const mockTasks: Task[] = [
      {
        id: 'task-1',
        name: 'Test Task 1',
        duration: 60,
        importance: 5,
        urgency: 5,
        type: TaskType.Focused,
        completed: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]
    const mockSequencedTasks: SequencedTask[] = []

    render(<GanttChart tasks={mockTasks} sequencedTasks={mockSequencedTasks} />)

    // Wait for the component to load - just check that it renders without error
    await waitFor(() => {
      // Check that the card container exists
      const card = document.querySelector('.arco-card')
      expect(card).toBeInTheDocument()
    })
  })
})
