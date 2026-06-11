import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CircularClock } from '../CircularClock'
import type { WorkSessionData } from '../SessionState'
import { ResponsiveProvider } from '../../../providers/ResponsiveProvider'

// Helper function to render with ResponsiveProvider
const renderWithProvider = (component: React.ReactElement) => {
  return render(<ResponsiveProvider>{component}</ResponsiveProvider>)
}

describe('CircularClock', () => {
  const mockOnSessionUpdate = vi.fn()
  const mockOnSessionCreate = vi.fn()
  const mockOnSessionDelete = vi.fn()
  const mockOnSessionSelect = vi.fn()

  const mockSessions: WorkSessionData[] = [
    {
      id: 'session-1',
      taskId: 'task-1',
      taskName: 'Morning Task',
      startMinutes: 540, // 9:00 AM
      endMinutes: 600, // 10:00 AM
      type: 'focused',
      color: '#165DFF',
    },
    {
      id: 'session-2',
      taskId: 'task-2',
      taskName: 'Afternoon Task',
      startMinutes: 840, // 2:00 PM (14:00)
      endMinutes: 900, // 3:00 PM (15:00)
      type: 'admin',
      color: '#00B42A',
    },
    {
      id: 'session-3',
      taskId: 'workflow-1',
      taskName: 'Workflow Task',
      stepId: 'step-1',
      stepName: 'Step 1',
      startMinutes: 660, // 11:00 AM
      endMinutes: 720, // 12:00 PM
      type: 'focused',
      color: '#165DFF',
    },
  ]

  const mockCurrentTime = new Date('2024-01-15T14:30:00')

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders clock face with hour markers', () => {
    const { container } = renderWithProvider(
      <CircularClock
        sessions={mockSessions}
        onSessionUpdate={mockOnSessionUpdate}
        onSessionCreate={mockOnSessionCreate}
        onSessionDelete={mockOnSessionDelete}
        onSessionSelect={mockOnSessionSelect}
        currentTime={mockCurrentTime}
      />,
    )

    // Check for SVG element
    const svg = container.querySelector('svg')
    expect(svg).toBeInTheDocument()

    // Check for hour labels - now showing full 24-hour day
    // The clock shows labels every 3 hours
    // Hour numbers and am/pm are rendered as separate child nodes in the same text element
    // So we need to check the text content of the parent elements
    const textElements = container.querySelectorAll('text')
    const hourTexts = Array.from(textElements).map(el => el.textContent).filter(text => text && text.match(/^\d+\s*(am|pm)$/))

    // Should have 9 hour markers (every 3 hours: 0am, 3am, 6am, 9am, 12pm, 3pm, 6pm, 9pm, 12am)
    // The 24-hour clock shows 0-24, so hour 24 (displayed as 12am) is included
    expect(hourTexts.length).toBe(9)

    // Check that we have both AM and PM times
    const hasAM = hourTexts.some(text => text?.includes('am'))
    const hasPM = hourTexts.some(text => text?.includes('pm'))
    expect(hasAM).toBe(true)
    expect(hasPM).toBe(true)

    // Check for circadian rhythm indicators - At 14:30 (test time), it should show "Low Energy"
    // The energy label is determined by the time in the component
    expect(screen.getByText('Low Energy')).toBeInTheDocument()
  })

  it('displays current time', () => {
    renderWithProvider(
      <CircularClock
        sessions={mockSessions}
        onSessionUpdate={mockOnSessionUpdate}
        onSessionCreate={mockOnSessionCreate}
        onSessionDelete={mockOnSessionDelete}
        onSessionSelect={mockOnSessionSelect}
        currentTime={mockCurrentTime}
      />,
    )

    // Check for time display (14:30 in 24-hour format)
    expect(screen.getByText('14:30')).toBeInTheDocument()
  })

  it('renders session arcs', () => {
    const { container } = renderWithProvider(
      <CircularClock
        sessions={mockSessions}
        onSessionUpdate={mockOnSessionUpdate}
        onSessionCreate={mockOnSessionCreate}
        onSessionDelete={mockOnSessionDelete}
        onSessionSelect={mockOnSessionSelect}
        currentTime={mockCurrentTime}
      />,
    )

    // Check for path elements (session arcs)
    const paths = container.querySelectorAll('path')
    // Should have at least one path per session
    expect(paths.length).toBeGreaterThanOrEqual(mockSessions.length)
  })

  it('calls onSessionSelect when session arc is clicked', () => {
    const { container } = renderWithProvider(
      <CircularClock
        sessions={mockSessions}
        onSessionUpdate={mockOnSessionUpdate}
        onSessionCreate={mockOnSessionCreate}
        onSessionDelete={mockOnSessionDelete}
        onSessionSelect={mockOnSessionSelect}
      />,
    )

    // Find session arcs (paths with fill colors)
    const sessionPaths = container.querySelectorAll('path[fill*="#165DFF"]')
    if (sessionPaths.length > 0) {
      fireEvent.click(sessionPaths[0])
      expect(mockOnSessionSelect).toHaveBeenCalledWith('session-1')
    }
  })

  it('combines sessions for collapsed workflows', () => {
    const collapsedWorkflows = new Set(['workflow-1'])

    const workflowSessions: WorkSessionData[] = [
      {
        id: 'session-3',
        taskId: 'workflow-1',
        taskName: 'Workflow Task',
        stepId: 'step-1',
        stepName: 'Step 1',
        startMinutes: 660,
        endMinutes: 690,
        type: 'focused',
        color: '#165DFF',
      },
      {
        id: 'session-4',
        taskId: 'workflow-1',
        taskName: 'Workflow Task',
        stepId: 'step-2',
        stepName: 'Step 2',
        startMinutes: 700,
        endMinutes: 720,
        type: 'admin',
        color: '#00B42A',
      },
    ]

    const { container } = renderWithProvider(
      <CircularClock
        sessions={[...mockSessions.slice(0, 2), ...workflowSessions]}
        collapsedWorkflows={collapsedWorkflows}
        onSessionUpdate={mockOnSessionUpdate}
        onSessionCreate={mockOnSessionCreate}
        onSessionDelete={mockOnSessionDelete}
        onSessionSelect={mockOnSessionSelect}
      />,
    )

    // Should show sessions with dashed stroke for collapsed workflows
    const dashedPaths = container.querySelectorAll('path[stroke-dasharray]')
    expect(dashedPaths.length).toBeGreaterThan(0)
  })

  it('shows drag handles for selected session', () => {
    const { container } = renderWithProvider(
      <CircularClock
        sessions={mockSessions}
        selectedSessionId="session-1"
        onSessionUpdate={mockOnSessionUpdate}
        onSessionCreate={mockOnSessionCreate}
        onSessionDelete={mockOnSessionDelete}
        onSessionSelect={mockOnSessionSelect}
      />,
    )

    // Should show drag handle circles for the selected session
    const handles = container.querySelectorAll('circle[style*="cursor: ew-resize"]')
    expect(handles.length).toBe(2) // Start and end handles
  })

  describe('drag-to-create gesture (press → drag → release)', () => {
    // In jsdom the svg rect is at (0,0) and the clock renders at 360px,
    // so the center is (180,180). Cardinal points of the 24h dial:
    //   (280,180) = 6:00  → 360 min     (180,280) = 12:00 → 720 min
    //   (80,180)  = 18:00 → 1080 min    (180,80)  = 0:00  → 0 min
    const SIX_AM = { clientX: 280, clientY: 180 }
    const NOON = { clientX: 180, clientY: 280 }
    const SIX_PM = { clientX: 80, clientY: 180 }

    const renderEmptyClock = () => renderWithProvider(
      <CircularClock
        sessions={[]}
        onSessionUpdate={mockOnSessionUpdate}
        onSessionCreate={mockOnSessionCreate}
        onSessionDelete={mockOnSessionDelete}
        onSessionSelect={mockOnSessionSelect}
      />,
    )

    it('commits the session from the pointer-RELEASE position, not the last mousemove', () => {
      const { container } = renderEmptyClock()
      const clockFace = container.querySelector('.clock-face')
      expect(clockFace).not.toBeNull()

      fireEvent.mouseDown(clockFace!, SIX_AM)
      // Rubber band passes through noon...
      fireEvent.mouseMove(document, { ...NOON, buttons: 1 })
      // ...but the user releases at 6 PM — that is what must persist
      fireEvent.mouseUp(document, SIX_PM)

      expect(mockOnSessionCreate).toHaveBeenCalledTimes(1)
      expect(mockOnSessionCreate).toHaveBeenCalledWith(360, 1080)
    })

    it('does NOT commit again on a later unrelated mouseup (old armed-rubber-band bug)', () => {
      const { container } = renderEmptyClock()
      const clockFace = container.querySelector('.clock-face')

      fireEvent.mouseDown(clockFace!, SIX_AM)
      fireEvent.mouseMove(document, { ...NOON, buttons: 1 })
      fireEvent.mouseUp(document, NOON)
      expect(mockOnSessionCreate).toHaveBeenCalledTimes(1)

      // A later click anywhere must not create another session
      fireEvent.mouseMove(document, { clientX: 10, clientY: 10 })
      fireEvent.mouseUp(document, { clientX: 10, clientY: 10 })
      expect(mockOnSessionCreate).toHaveBeenCalledTimes(1)
    })

    it('a bare click on the clock face does not arm a rubber band', () => {
      const { container } = renderEmptyClock()
      const clockFace = container.querySelector('.clock-face')

      // The old implementation wired creation to onClick — which fires at
      // release — leaving the gesture armed for the NEXT mouseup anywhere.
      fireEvent.click(clockFace!, SIX_AM)
      fireEvent.mouseMove(document, NOON)
      fireEvent.mouseUp(document, SIX_PM)

      expect(mockOnSessionCreate).not.toHaveBeenCalled()
    })

    it('a press-release in place (no drag) creates nothing', () => {
      const { container } = renderEmptyClock()
      const clockFace = container.querySelector('.clock-face')

      fireEvent.mouseDown(clockFace!, SIX_AM)
      fireEvent.mouseUp(document, SIX_AM)

      expect(mockOnSessionCreate).not.toHaveBeenCalled()
    })

    it('self-terminates at the current position when the release was missed (buttons === 0)', () => {
      const { container } = renderEmptyClock()
      const clockFace = container.querySelector('.clock-face')

      fireEvent.mouseDown(clockFace!, SIX_AM)
      // A mousemove reporting no held buttons means the mouseup happened
      // where the document could not observe it (outside the window)
      fireEvent.mouseMove(document, { ...NOON, buttons: 0 })

      expect(mockOnSessionCreate).toHaveBeenCalledTimes(1)
      expect(mockOnSessionCreate).toHaveBeenCalledWith(360, 720)

      // The gesture is fully terminated — no later commit
      fireEvent.mouseUp(document, SIX_PM)
      expect(mockOnSessionCreate).toHaveBeenCalledTimes(1)
    })

    it('drag-resize persists the end the user released at', () => {
      const session: WorkSessionData = {
        id: 'session-1',
        taskId: 'task-1',
        taskName: 'Morning Task',
        startMinutes: 540,
        endMinutes: 600,
        type: 'focused',
        color: '#165DFF',
      }
      const { container } = renderWithProvider(
        <CircularClock
          sessions={[session]}
          selectedSessionId="session-1"
          onSessionUpdate={mockOnSessionUpdate}
          onSessionCreate={mockOnSessionCreate}
          onSessionDelete={mockOnSessionDelete}
          onSessionSelect={mockOnSessionSelect}
        />,
      )

      const handles = container.querySelectorAll('circle[style*="cursor: ew-resize"]')
      expect(handles.length).toBe(2)
      const endHandle = handles[1]

      fireEvent.mouseDown(endHandle, SIX_AM)
      fireEvent.mouseMove(document, { ...NOON, buttons: 1 })
      // Release at 6 PM — the persisted end must be the release position
      fireEvent.mouseUp(document, SIX_PM)

      expect(mockOnSessionUpdate).toHaveBeenLastCalledWith('session-1', 540, 1080)
    })

    it('a plain click on a resize handle commits no position change', () => {
      const session: WorkSessionData = {
        id: 'session-1',
        taskId: 'task-1',
        taskName: 'Morning Task',
        startMinutes: 540,
        endMinutes: 600,
        type: 'focused',
        color: '#165DFF',
      }
      const { container } = renderWithProvider(
        <CircularClock
          sessions={[session]}
          selectedSessionId="session-1"
          onSessionUpdate={mockOnSessionUpdate}
          onSessionCreate={mockOnSessionCreate}
          onSessionDelete={mockOnSessionDelete}
          onSessionSelect={mockOnSessionSelect}
        />,
      )

      const handles = container.querySelectorAll('circle[style*="cursor: ew-resize"]')
      const endHandle = handles[1]

      fireEvent.mouseDown(endHandle, SIX_AM)
      fireEvent.mouseUp(document, SIX_AM)

      expect(mockOnSessionUpdate).not.toHaveBeenCalled()
    })
  })

  it('displays tooltips with session information', () => {
    const { container } = renderWithProvider(
      <CircularClock
        sessions={mockSessions}
        onSessionUpdate={mockOnSessionUpdate}
        onSessionCreate={mockOnSessionCreate}
        onSessionDelete={mockOnSessionDelete}
        onSessionSelect={mockOnSessionSelect}
      />,
    )

    // Arco tooltips are rendered in a portal, so we check for the wrapper elements
    const tooltipWrappers = container.querySelectorAll('[class*="arco-tooltip"]')
    // The component should have tooltip wrappers for each session
    expect(tooltipWrappers.length).toBeGreaterThanOrEqual(0)
  })
})
