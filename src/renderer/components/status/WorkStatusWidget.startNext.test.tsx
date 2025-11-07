/**
 * Tests for Start Next Task button in WorkStatusWidget
 * Simplified test to verify button exists and functions
 */

import { beforeEach, describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { WorkStatusWidget } from './WorkStatusWidget'

// Mock all dependencies with simple implementations
vi.mock('../../services/database', () => ({
  getDatabase: vi.fn(() => ({
    getWorkPattern: vi.fn().mockResolvedValue(null),
    getTodayAccumulated: vi.fn().mockResolvedValue({ focused: 0, admin: 0, personal: 0 }),
  })),
}))

const mockStoreState = {
  isLoading: false,
  activeWorkSessions: new Map(),
  startNextTask: vi.fn(),
  getNextScheduledItem: vi.fn().mockResolvedValue(null),
  tasks: [],
  sequencedTasks: [],
  workPatterns: [
    {
      date: '2024-01-15',
      blocks: [
        {
          id: '1',
          startTime: '09:00',
          endTime: '12:00',
          type: 'focused',
        },
      ],
    },
  ],
  workPatternsLoading: false,
  loadWorkPatterns: vi.fn().mockResolvedValue(undefined),
  incrementNextTaskSkipIndex: vi.fn(),
}

vi.mock('../../store/useTaskStore', () => ({
  useTaskStore: Object.assign(
    vi.fn((selector?: any) => {
      if (selector) {
        return selector(mockStoreState)
      }
      return mockStoreState
    }),
    {
      getState: () => mockStoreState,
    },
  ),
}))

vi.mock('dayjs', () => ({
  default: vi.fn(() => ({
    format: vi.fn(() => '2024-01-15'),
  })),
}))

vi.mock('../../utils/events', () => ({
  appEvents: { on: vi.fn(), off: vi.fn() },
  EVENTS: { TIME_LOGGED: 'timeLogged', WORKFLOW_UPDATED: 'workflowUpdated', SESSION_CHANGED: 'sessionChanged', DATA_REFRESH_NEEDED: 'dataRefresh' },
}))

vi.mock('@/shared/logger', () => ({
  logger: { ui: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } },
}))

vi.mock('@shared/work-blocks-types', () => ({
  getCurrentBlock: vi.fn(() => null),
  getNextBlock: vi.fn(() => null),
  getTotalCapacity: vi.fn(() => ({ focus: 0, admin: 0, personal: 0 })),
}))

vi.mock('@shared/time-utils', () => ({
  calculateDuration: vi.fn(() => 60),
  formatMinutes: vi.fn((mins) => `${mins}m`),
}))

vi.mock('@shared/time-provider', () => ({
  getCurrentTime: vi.fn(() => new Date('2024-01-15T10:00:00')),
}))

describe('WorkStatusWidget Start Next Task Button', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should render Start Next Task button', async () => {
    // Act
    render(<WorkStatusWidget />)

    // Assert - Wait for async operations to complete and look for the button specifically
    await waitFor(() => {
      const button = screen.getByRole('button', { name: /Start Next Task/i })
      expect(button).toBeInTheDocument()
      expect(button).toBeDisabled() // Should be disabled when no tasks available
    })
  })

  it('should show appropriate message when no tasks are available', async () => {
    // Act
    render(<WorkStatusWidget />)

    // Assert - Since getNextScheduledItem returns null, should show no tasks message
    await waitFor(() => {
      expect(screen.getByText('No tasks available')).toBeInTheDocument()
    })
  })
})
