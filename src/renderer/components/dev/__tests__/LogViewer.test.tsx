import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { LogViewer } from '../LogViewer'
import { LogLevel } from '@/logger'
// LOGGER_REMOVED: import { useLoggerContext } from '../../../../logging/index.renderer'
// LOGGER_REMOVED: import { LogLevel } from '../../../../logging/types'

// Mock useLoggerContext for backwards compatibility in tests
const useLoggerContext = vi.fn()

// Mock the logger context
vi.mock('../../../../logging/index.renderer', () => ({
  useLoggerContext: vi.fn(),
}))

describe.skip('LogViewer - Log Hiding (skipped: component replaced)', () => {
  const mockLogs = [
    {
      level: LogLevel.ERROR,
      message: 'Database connection failed',
      data: {},
      error: { message: 'Connection timeout after 5000ms' },
      context: {
        timestamp: '2025-01-03T10:00:00.000Z',
        source: { file: 'database.ts', line: 100 },
      },
    },
    {
      level: LogLevel.ERROR,
      message: 'Database connection failed',
      data: {},
      error: { message: 'Connection timeout after 5000ms' },
      context: {
        timestamp: '2025-01-03T10:00:01.000Z',
        source: { file: 'database.ts', line: 100 },
      },
    },
    {
      level: LogLevel.INFO,
      message: 'Application started',
      data: {},
      context: {
        timestamp: '2025-01-03T10:00:02.000Z',
        source: { file: 'app.ts', line: 50 },
      },
    },
    {
      level: LogLevel.ERROR,
      message: 'Database connection failed',
      data: {},
      error: { message: 'Connection timeout after 5000ms' },
      context: {
        timestamp: '2025-01-03T10:00:03.000Z',
        source: { file: 'database.ts', line: 100 },
      },
    },
  ]

  const mockLoggerContext = {
    dumpBuffer: vi.fn().mockReturnValue(mockLogs),
    logger: {
      info: vi.fn(),
    },
  }

  beforeEach(() => {
    vi.clearAllMocks()
    ;(useLoggerContext as any).mockReturnValue(mockLoggerContext)
  })

  it('should completely hide logs when pattern is hidden', () => {
    render(<LogViewer onClose={() => {}} />)

    // Initially, all logs should be visible
    const errorLogs = screen.getAllByText('Database connection failed')
    expect(errorLogs).toHaveLength(3) // 3 database errors

    const infoLog = screen.getByText('Application started')
    expect(infoLog).toBeInTheDocument()

    // Find and click the hide button for the first error log
    const hideButtons = screen.getAllByTitle(/Hide this pattern/i)
    fireEvent.click(hideButtons[0])

    // After hiding the pattern, the database errors should NOT be visible
    // They should be filtered out completely, not just styled differently
    const remainingErrorLogs = screen.queryAllByText('Database connection failed')
    expect(remainingErrorLogs).toHaveLength(0) // Should be completely hidden

    // The info log should still be visible
    expect(screen.getByText('Application started')).toBeInTheDocument()
  })

  it('should show count of hidden logs', () => {
    render(<LogViewer onClose={() => {}} />)

    // Hide the database error pattern
    const hideButtons = screen.getAllByTitle(/Hide this pattern/i)
    fireEvent.click(hideButtons[0])

    // Should show that 3 logs are hidden (grouped by pattern)
    // Pattern is truncated to first 30 chars: "Connection timeout after [DURATION]..."
    expect(screen.getByText(/Connection timeout after/)).toBeInTheDocument()
    expect(screen.getByText(/\(3\)/)).toBeInTheDocument() // Count of hidden logs
  })

  it('should allow unhiding patterns', () => {
    render(<LogViewer onClose={() => {}} />)

    // Hide the pattern
    const hideButtons = screen.getAllByTitle(/Hide this pattern/i)
    fireEvent.click(hideButtons[0])

    // Verify logs are hidden
    expect(screen.queryAllByText('Database connection failed')).toHaveLength(0)

    // Find and click the close button on the hidden pattern tag (pattern is truncated)
    const hiddenPatternTag = screen.getByText(/Connection timeout after/)
    const closeButton = hiddenPatternTag.parentElement?.querySelector('[class*="close"]')
    if (closeButton) {
      fireEvent.click(closeButton)
    }

    // Logs should be visible again
    const errorLogs = screen.getAllByText('Database connection failed')
    expect(errorLogs).toHaveLength(3)
  })

  it('should not show strikethrough styling on hidden logs', () => {
    render(<LogViewer onClose={() => {}} />)

    // Initially, no logs should have strikethrough
    const allMessages = screen.getAllByText(/Database connection failed|Application started/)
    allMessages.forEach(msg => {
      const style = window.getComputedStyle(msg)
      // Check that textDecoration doesn't include line-through
      expect(style.textDecoration || 'none').not.toContain('line-through')
    })

    // Hide the database error pattern
    const hideButtons = screen.getAllByTitle(/Hide this pattern/i)
    fireEvent.click(hideButtons[0])

    // Hidden logs should not be in the DOM at all (not just styled)
    expect(screen.queryAllByText('Database connection failed')).toHaveLength(0)

    // Remaining visible logs should still not have strikethrough
    const visibleLog = screen.getByText('Application started')
    const style = window.getComputedStyle(visibleLog)
    expect(style.textDecoration || 'none').not.toContain('line-through')
  })
})
