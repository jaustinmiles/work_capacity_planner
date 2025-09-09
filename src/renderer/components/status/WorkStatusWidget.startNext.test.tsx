/**
 * Tests for Start Next Task button in WorkStatusWidget
 * Simplified test to verify button exists and functions
 */

import { beforeEach, describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { WorkStatusWidget } from './WorkStatusWidget'

// Mock all dependencies with simple implementations
vi.mock('../../services/database', () => ({
  getDatabase: vi.fn(() => ({
    getWorkPattern: vi.fn().mockResolvedValue(null),
    getTodayAccumulated: vi.fn().mockResolvedValue({ focused: 0, admin: 0, personal: 0 }),
  })),
}))

vi.mock('../../store/useTaskStore', () => ({
  useTaskStore: {
    getState: vi.fn(() => ({
      startNextTask: vi.fn(),
      getNextScheduledItem: vi.fn().mockResolvedValue(null),
    })),
    subscribe: vi.fn(() => () => {}),
  },
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

vi.mock('../../utils/logger', () => ({
  logger: { ui: { warn: vi.fn(), error: vi.fn() } },
}))

vi.mock('@shared/work-blocks-types', () => ({
  getCurrentBlock: vi.fn(() => null),
  getNextBlock: vi.fn(() => null),
}))

vi.mock('@shared/time-utils', () => ({
  calculateDuration: vi.fn(() => 60),
}))

describe('WorkStatusWidget Start Next Task Button', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should render Start Next Task button', () => {
    // Act
    render(<WorkStatusWidget />)

    // Assert - This should FAIL since button doesn't exist yet
    expect(screen.getByText('Start Next Task')).toBeInTheDocument()
  })

  it('should show next task preview when available', () => {
    // Act
    render(<WorkStatusWidget />)

    // Assert - This should FAIL since next task display doesn't exist yet
    expect(screen.getByText(/Next:/)).toBeInTheDocument()
  })
})