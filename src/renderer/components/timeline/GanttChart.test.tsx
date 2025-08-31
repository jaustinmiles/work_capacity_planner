import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { GanttChart } from './GanttChart'
import { useTaskStore } from '../../store/useTaskStore'
import { getCurrentTime } from '@shared/time-provider'
import { Task } from '@shared/types'
import { SequencedTask } from '@shared/sequencing-types'
import { TaskType } from '@shared/enums'
import '@testing-library/jest-dom'

// Mock the store
vi.mock('../../store/useTaskStore')
vi.mock('@shared/time-provider')

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

    // Mock the store
    vi.mocked(useTaskStore).mockReturnValue({
      updateTask: vi.fn(),
      updateSequencedTask: vi.fn(),
      generateSchedule: vi.fn(),
      getOptimalSchedule: vi.fn(),
    } as any)
  })

  it('should show message to add tasks when work patterns exist but no tasks', async () => {
    const mockTasks: Task[] = []
    const mockSequencedTasks: SequencedTask[] = []

    render(<GanttChart tasks={mockTasks} sequencedTasks={mockSequencedTasks} />)

    // Wait for the component to load and display the empty state
    await waitFor(() => {
      expect(screen.getByText('No scheduled items to display')).toBeInTheDocument()
      expect(screen.getByText('Add some tasks or workflows to see them scheduled')).toBeInTheDocument()
    })
  })

  it('should render the chart title when tasks exist', async () => {
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

    // Wait for the component to load and display the chart
    await waitFor(() => {
      expect(screen.getByText('Scheduled Tasks (Priority Order)')).toBeInTheDocument()
    })
  })
})
