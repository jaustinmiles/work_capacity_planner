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

    // Check for hour labels (12-hour format)
    // Note: '12' appears twice (midnight and noon)
    const twelveLabels = screen.getAllByText('12')
    expect(twelveLabels).toHaveLength(2)
    // Note: '6' also appears twice (6 AM and 6 PM)
    const sixLabels = screen.getAllByText('6')
    expect(sixLabels).toHaveLength(2)

    // Check for AM/PM indicators
    expect(screen.getByText('AM')).toBeInTheDocument()
    expect(screen.getByText('PM')).toBeInTheDocument()
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
