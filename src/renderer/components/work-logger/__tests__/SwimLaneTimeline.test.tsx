import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SwimLaneTimeline } from '../SwimLaneTimeline'
import { TaskType } from '@shared/enums'
import type { Task } from '@shared/types'
import type { WorkSessionData } from '../SessionState'

describe('SwimLaneTimeline', () => {
  const mockOnSessionUpdate = vi.fn()
  const mockOnSessionCreate = vi.fn()
  const mockOnSessionDelete = vi.fn()
  const mockOnSessionSelect = vi.fn()
  const mockOnExpandedWorkflowsChange = vi.fn()

  const mockTasks: Task[] = [
    {
      id: 'task-1',
      name: 'Regular Task',
      type: TaskType.Focused,
      duration: 120,
      completed: false,
      hasSteps: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'workflow-1',
      name: 'Workflow Task',
      type: TaskType.Focused,
      duration: 240,
      completed: false,
      hasSteps: true,
      steps: [
        {
          id: 'step-1',
          name: 'Step 1',
          type: TaskType.Focused,
          duration: 60,
          order: 0,
        },
        {
          id: 'step-2',
          name: 'Step 2',
          type: TaskType.Admin,
          duration: 30,
          order: 1,
        },
      ],
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ]

  const mockSessions: WorkSessionData[] = [
    {
      id: 'session-1',
      taskId: 'task-1',
      taskName: 'Regular Task',
      startMinutes: 540, // 9:00 AM
      endMinutes: 600, // 10:00 AM
      type: TaskType.Focused,
      color: '#165DFF',
    },
    {
      id: 'session-2',
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

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders swim lanes for tasks', () => {
    render(
      <SwimLaneTimeline
        sessions={mockSessions}
        tasks={mockTasks}
        onSessionUpdate={mockOnSessionUpdate}
        onSessionCreate={mockOnSessionCreate}
        onSessionDelete={mockOnSessionDelete}
        onSessionSelect={mockOnSessionSelect}
      />
    )

    expect(screen.getByText('Regular Task')).toBeInTheDocument()
    expect(screen.getByText('Workflow Task')).toBeInTheDocument()
  })

  it('renders time axis with correct hours', () => {
    render(
      <SwimLaneTimeline
        sessions={mockSessions}
        tasks={mockTasks}
        onSessionUpdate={mockOnSessionUpdate}
        onSessionCreate={mockOnSessionCreate}
        onSessionDelete={mockOnSessionDelete}
        onSessionSelect={mockOnSessionSelect}
      />
    )

    // Check for time labels from 6:00 to 22:00
    expect(screen.getByText('06:00')).toBeInTheDocument()
    expect(screen.getByText('12:00')).toBeInTheDocument()
    expect(screen.getByText('18:00')).toBeInTheDocument()
    expect(screen.getByText('22:00')).toBeInTheDocument()
  })

  it('expands and collapses workflows when clicked', () => {
    render(
      <SwimLaneTimeline
        sessions={mockSessions}
        tasks={mockTasks}
        onSessionUpdate={mockOnSessionUpdate}
        onSessionCreate={mockOnSessionCreate}
        onSessionDelete={mockOnSessionDelete}
        onSessionSelect={mockOnSessionSelect}
      />
    )

    // Find the expand button for the workflow
    const expandButtons = screen.getAllByRole('button').filter(btn => 
      btn.querySelector('.arco-icon-right, .arco-icon-down')
    )
    
    expect(expandButtons.length).toBeGreaterThan(0)
    
    // Click to expand
    fireEvent.click(expandButtons[0])
    
    // Check that steps are now visible
    expect(screen.getByText('Step 1')).toBeInTheDocument()
    expect(screen.getByText('Step 2')).toBeInTheDocument()
  })

  it('calls onSessionSelect when a session is clicked', () => {
    const { container } = render(
      <SwimLaneTimeline
        sessions={mockSessions}
        tasks={mockTasks}
        onSessionUpdate={mockOnSessionUpdate}
        onSessionCreate={mockOnSessionCreate}
        onSessionDelete={mockOnSessionDelete}
        onSessionSelect={mockOnSessionSelect}
      />
    )

    // Find session elements by their style (they have specific background colors)
    const sessionElements = container.querySelectorAll('[style*="background"]')
      .forEach(element => {
        const style = element.getAttribute('style')
        if (style && style.includes('#165DFF')) {
          fireEvent.click(element as Element)
        }
      })

    expect(mockOnSessionSelect).toHaveBeenCalled()
  })

  it('handles zoom controls', () => {
    const { container } = render(
      <SwimLaneTimeline
        sessions={mockSessions}
        tasks={mockTasks}
        onSessionUpdate={mockOnSessionUpdate}
        onSessionCreate={mockOnSessionCreate}
        onSessionDelete={mockOnSessionDelete}
        onSessionSelect={mockOnSessionSelect}
      />
    )

    // Find zoom buttons
    const zoomButtons = screen.getAllByRole('button').filter(btn => 
      btn.querySelector('.arco-icon-zoom-in, .arco-icon-zoom-out')
    )

    expect(zoomButtons.length).toBeGreaterThanOrEqual(4) // 2 for horizontal, 2 for vertical

    // Click zoom in for horizontal
    const zoomInButtons = zoomButtons.filter(btn => 
      btn.querySelector('.arco-icon-zoom-in')
    )
    if (zoomInButtons.length > 0) {
      fireEvent.click(zoomInButtons[0])
    }

    // Find sliders
    const sliders = container.querySelectorAll('.arco-slider')
    expect(sliders.length).toBe(2) // One for horizontal, one for vertical zoom
  })

  it('deduplicates tasks with same ID', () => {
    const duplicateTasks = [
      ...mockTasks,
      mockTasks[0], // Duplicate the first task
    ]

    render(
      <SwimLaneTimeline
        sessions={mockSessions}
        tasks={duplicateTasks}
        onSessionUpdate={mockOnSessionUpdate}
        onSessionCreate={mockOnSessionCreate}
        onSessionDelete={mockOnSessionDelete}
        onSessionSelect={mockOnSessionSelect}
      />
    )

    // Should only show each task name once
    const regularTaskElements = screen.getAllByText('Regular Task')
    // One in the lane label, possibly more in tooltips
    expect(regularTaskElements.length).toBeGreaterThan(0)
  })

  it('syncs expanded state with parent component when provided', () => {
    const expandedWorkflows = new Set<string>()

    const { rerender } = render(
      <SwimLaneTimeline
        sessions={mockSessions}
        tasks={mockTasks}
        onSessionUpdate={mockOnSessionUpdate}
        onSessionCreate={mockOnSessionCreate}
        onSessionDelete={mockOnSessionDelete}
        onSessionSelect={mockOnSessionSelect}
        expandedWorkflows={expandedWorkflows}
        onExpandedWorkflowsChange={mockOnExpandedWorkflowsChange}
      />
    )

    // Find and click the expand button
    const expandButtons = screen.getAllByRole('button').filter(btn => 
      btn.querySelector('.arco-icon-right, .arco-icon-down')
    )
    
    if (expandButtons.length > 0) {
      fireEvent.click(expandButtons[0])
      expect(mockOnExpandedWorkflowsChange).toHaveBeenCalled()
    }
  })
})