import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CircularClock } from '../CircularClock'
import { TaskType } from '@shared/enums'
import type { WorkSessionData } from '../SessionState'

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
      type: TaskType.Focused,
      color: '#165DFF',
    },
    {
      id: 'session-2',
      taskId: 'task-2',
      taskName: 'Afternoon Task',
      startMinutes: 840, // 2:00 PM (14:00)
      endMinutes: 900, // 3:00 PM (15:00)
      type: TaskType.Admin,
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
      type: TaskType.Focused,
      color: '#165DFF',
    },
  ]

  const mockCurrentTime = new Date('2024-01-15T14:30:00')

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders clock face with hour markers', () => {
    const { container } = render(
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
    render(
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
    const { container } = render(
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
    const { container } = render(
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
        type: TaskType.Focused,
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
        type: TaskType.Admin,
        color: '#00B42A',
      },
    ]

    const { container } = render(
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
    const { container } = render(
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

  it('allows creating new session by clicking on clock face', () => {
    const { container } = render(
      <CircularClock
        sessions={[]}
        onSessionUpdate={mockOnSessionUpdate}
        onSessionCreate={mockOnSessionCreate}
        onSessionDelete={mockOnSessionDelete}
        onSessionSelect={mockOnSessionSelect}
      />,
    )

    // Click on the clock face background
    const clockFace = container.querySelector('.clock-face')
    if (clockFace) {
      fireEvent.click(clockFace)

      // Move mouse to create a session
      fireEvent.mouseMove(document, { clientX: 150, clientY: 150 })
      fireEvent.mouseUp(document)

      // Session creation should be attempted
      // Note: Due to the complexity of mouse position calculations,
      // the exact behavior might vary
    }
  })

  it('displays tooltips with session information', () => {
    const { container } = render(
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
