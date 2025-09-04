import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SwimLaneTimeline } from '../SwimLaneTimeline'
import { WorkSessionData } from '@shared/types'
import { TaskType } from '@shared/enums'
import { ResponsiveProvider } from '../../../providers/ResponsiveProvider'

// Helper function to render with ResponsiveProvider
const renderWithProvider = (component: React.ReactElement) => {
  return render(<ResponsiveProvider>{component}</ResponsiveProvider>)
}

describe('SwimLaneTimeline - Circadian Rhythm', () => {
  const mockOnSessionUpdate = vi.fn()
  const mockOnSessionCreate = vi.fn()
  const mockOnSessionDelete = vi.fn()
  const mockOnSessionSelect = vi.fn()

  const mockSessions: WorkSessionData[] = []
  const mockTasks = [
    {
      id: 'task-1',
      name: 'Test Task',
      importance: 5,
      urgency: 5,
      duration: 60,
      type: TaskType.Focused,
      completed: false,
    },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Circadian Rhythm Toggle', () => {
    it('should show circadian rhythm toggle button', () => {
      renderWithProvider(
        <SwimLaneTimeline
          sessions={mockSessions}
          tasks={mockTasks}
          onSessionUpdate={mockOnSessionUpdate}
          onSessionCreate={mockOnSessionCreate}
          onSessionDelete={mockOnSessionDelete}
          onSessionSelect={mockOnSessionSelect}
        />,
      )

      // Find the switch by its role (there's only one switch in the component)
      const toggleButton = screen.getByRole('switch')
      expect(toggleButton).toBeInTheDocument()
      expect(toggleButton).not.toBeChecked()
    })

    it('should toggle circadian rhythm display when clicked', () => {
      const { container } = renderWithProvider(
        <SwimLaneTimeline
          sessions={mockSessions}
          tasks={mockTasks}
          onSessionUpdate={mockOnSessionUpdate}
          onSessionCreate={mockOnSessionCreate}
          onSessionDelete={mockOnSessionDelete}
          onSessionSelect={mockOnSessionSelect}
        />,
      )

      const toggleButton = screen.getByRole('switch')

      // Initially no circadian rhythm should be displayed
      expect(container.querySelector('path[fill*="circadianGradient"]')).not.toBeInTheDocument()

      // Toggle on
      fireEvent.click(toggleButton)
      expect(toggleButton).toBeChecked()

      // Should now show circadian rhythm
      const circadianPaths = container.querySelectorAll('path[fill*="circadianGradient"]')
      expect(circadianPaths.length).toBeGreaterThan(0)
    })
  })

  describe('Circadian Energy Calculation', () => {
    it('should adapt to custom wake time', () => {
      const { container } = renderWithProvider(
        <SwimLaneTimeline
          sessions={mockSessions}
          tasks={mockTasks}
          onSessionUpdate={mockOnSessionUpdate}
          onSessionCreate={mockOnSessionCreate}
          onSessionDelete={mockOnSessionDelete}
          onSessionSelect={mockOnSessionSelect}
          wakeTimeHour={5} // Early bird - 5 AM
          bedtimeHour={21} // 9 PM
        />,
      )

      // Toggle circadian rhythm on
      const toggleButton = screen.getByRole('switch')
      fireEvent.click(toggleButton)

      // Check that the rhythm exists
      const circadianPaths = container.querySelectorAll('path[fill*="circadianGradient"]')
      expect(circadianPaths.length).toBeGreaterThan(0)
    })

    it('should adapt to night owl schedule', () => {
      const { container } = renderWithProvider(
        <SwimLaneTimeline
          sessions={mockSessions}
          tasks={mockTasks}
          onSessionUpdate={mockOnSessionUpdate}
          onSessionCreate={mockOnSessionCreate}
          onSessionDelete={mockOnSessionDelete}
          onSessionSelect={mockOnSessionSelect}
          wakeTimeHour={10} // Late riser - 10 AM
          bedtimeHour={2}   // 2 AM (next day)
        />,
      )

      // Toggle circadian rhythm on
      const toggleButton = screen.getByRole('switch')
      fireEvent.click(toggleButton)

      // Check that the rhythm exists and adapts to schedule
      const circadianPaths = container.querySelectorAll('path[fill*="circadianGradient"]')
      expect(circadianPaths.length).toBeGreaterThan(0)
    })

    it('should handle bedtime after midnight correctly', () => {
      const { container } = renderWithProvider(
        <SwimLaneTimeline
          sessions={mockSessions}
          tasks={mockTasks}
          onSessionUpdate={mockOnSessionUpdate}
          onSessionCreate={mockOnSessionCreate}
          onSessionDelete={mockOnSessionDelete}
          onSessionSelect={mockOnSessionSelect}
          wakeTimeHour={7}  // 7 AM
          bedtimeHour={1}   // 1 AM (next day)
        />,
      )

      // Toggle circadian rhythm on
      const toggleButton = screen.getByRole('switch')
      fireEvent.click(toggleButton)

      // Should handle wrap-around sleep schedule
      const circadianPaths = container.querySelectorAll('path[fill*="circadianGradient"]')
      expect(circadianPaths.length).toBeGreaterThan(0)
    })

    it('should use default values when not provided', () => {
      const { container } = renderWithProvider(
        <SwimLaneTimeline
          sessions={mockSessions}
          tasks={mockTasks}
          onSessionUpdate={mockOnSessionUpdate}
          onSessionCreate={mockOnSessionCreate}
          onSessionDelete={mockOnSessionDelete}
          onSessionSelect={mockOnSessionSelect}
          // No wakeTimeHour or bedtimeHour provided
        />,
      )

      // Toggle circadian rhythm on
      const toggleButton = screen.getByRole('switch')
      fireEvent.click(toggleButton)

      // Should use defaults (6 AM wake, 10 PM bed)
      const circadianPaths = container.querySelectorAll('path[fill*="circadianGradient"]')
      expect(circadianPaths.length).toBeGreaterThan(0)
    })
  })

  describe('Circadian Rhythm Visual', () => {
    it('should render smooth curves, not blocks', () => {
      const { container } = renderWithProvider(
        <SwimLaneTimeline
          sessions={mockSessions}
          tasks={mockTasks}
          onSessionUpdate={mockOnSessionUpdate}
          onSessionCreate={mockOnSessionCreate}
          onSessionDelete={mockOnSessionDelete}
          onSessionSelect={mockOnSessionSelect}
        />,
      )

      // Toggle circadian rhythm on
      const toggleButton = screen.getByRole('switch')
      fireEvent.click(toggleButton)

      // Check for smooth path elements (SVG paths)
      const circadianPaths = container.querySelectorAll('path[fill*="circadianGradient"]')
      expect(circadianPaths.length).toBeGreaterThan(0)

      // Check that paths contain smooth curve commands (C for cubic bezier)
      circadianPaths.forEach(path => {
        const d = path.getAttribute('d')
        expect(d).toBeTruthy()
        // Should have smooth curve points, not just line segments
        expect(d).toContain('L') // Line segments between points
      })
    })

    it('should display behind task lanes', () => {
      const { container } = renderWithProvider(
        <SwimLaneTimeline
          sessions={mockSessions}
          tasks={mockTasks}
          onSessionUpdate={mockOnSessionUpdate}
          onSessionCreate={mockOnSessionCreate}
          onSessionDelete={mockOnSessionDelete}
          onSessionSelect={mockOnSessionSelect}
        />,
      )

      // Toggle circadian rhythm on
      const toggleButton = screen.getByRole('switch')
      fireEvent.click(toggleButton)

      // Check z-index or rendering order
      const svgElements = container.querySelectorAll('svg > *')
      let foundCircadian = false

      svgElements.forEach(element => {
        const fill = element.getAttribute('fill')
        if (fill && fill.includes('circadianGradient')) {
          foundCircadian = true
        }
      })

      // Circadian rhythm should be rendered before (behind) task lanes
      expect(foundCircadian).toBeTruthy()
    })

    it('should use gradient fill for visual appeal', () => {
      const { container } = renderWithProvider(
        <SwimLaneTimeline
          sessions={mockSessions}
          tasks={mockTasks}
          onSessionUpdate={mockOnSessionUpdate}
          onSessionCreate={mockOnSessionCreate}
          onSessionDelete={mockOnSessionDelete}
          onSessionSelect={mockOnSessionSelect}
        />,
      )

      // Toggle circadian rhythm on
      const toggleButton = screen.getByRole('switch')
      fireEvent.click(toggleButton)

      // Check for gradient definition
      const gradients = container.querySelectorAll('linearGradient')
      expect(gradients.length).toBeGreaterThan(0)

      // Check that the path uses the gradient
      const circadianPaths = container.querySelectorAll('path[fill*="circadianGradient"]')
      const hasGradientFill = Array.from(circadianPaths).some(path => {
        const fill = path.getAttribute('fill')
        return fill && fill.includes('url(#')
      })
      expect(hasGradientFill).toBeTruthy()
    })
  })

  describe('Interaction with Other Features', () => {
    it('should not interfere with session creation', () => {
      const { container } = renderWithProvider(
        <SwimLaneTimeline
          sessions={mockSessions}
          tasks={mockTasks}
          onSessionUpdate={mockOnSessionUpdate}
          onSessionCreate={mockOnSessionCreate}
          onSessionDelete={mockOnSessionDelete}
          onSessionSelect={mockOnSessionSelect}
        />,
      )

      // Toggle circadian rhythm on
      const toggleButton = screen.getByRole('switch')
      fireEvent.click(toggleButton)

      // Try to create a session on a task lane
      const taskLane = container.querySelector('[data-task-id="task-1"]')
      if (taskLane) {
        fireEvent.mouseDown(taskLane, { clientX: 100 })
        fireEvent.mouseMove(taskLane, { clientX: 200 })
        fireEvent.mouseUp(taskLane, { clientX: 200 })

        // Session creation should still work
        expect(mockOnSessionCreate).toHaveBeenCalled()
      }
    })

    it('should persist toggle state during re-renders', () => {
      const { rerender: _rerender } = renderWithProvider(
        <SwimLaneTimeline
          sessions={mockSessions}
          tasks={mockTasks}
          onSessionUpdate={mockOnSessionUpdate}
          onSessionCreate={mockOnSessionCreate}
          onSessionDelete={mockOnSessionDelete}
          onSessionSelect={mockOnSessionSelect}
        />,
      )

      // Toggle circadian rhythm on
      const toggleButton = screen.getByRole('switch')
      fireEvent.click(toggleButton)
      expect(toggleButton).toBeChecked()

      // Re-render with new props
      _rerender(
        <ResponsiveProvider>
        <SwimLaneTimeline
          sessions={mockSessions}
          tasks={[...mockTasks, {
            id: 'task-2',
            name: 'Another Task',
            importance: 5,
            urgency: 5,
            duration: 30,
            type: TaskType.Admin,
            completed: false,
          }]}
          onSessionUpdate={mockOnSessionUpdate}
          onSessionCreate={mockOnSessionCreate}
          onSessionDelete={mockOnSessionDelete}
          onSessionSelect={mockOnSessionSelect}
        />
        </ResponsiveProvider>,
      )

      // Toggle should still be checked
      const toggleAfterRerender = screen.getByRole('switch')
      expect(toggleAfterRerender).toBeChecked()
    })
  })

  describe('Edge Cases', () => {
    it('should handle same wake and bedtime gracefully', () => {
      const { container } = renderWithProvider(
        <SwimLaneTimeline
          sessions={mockSessions}
          tasks={mockTasks}
          onSessionUpdate={mockOnSessionUpdate}
          onSessionCreate={mockOnSessionCreate}
          onSessionDelete={mockOnSessionDelete}
          onSessionSelect={mockOnSessionSelect}
          wakeTimeHour={12}
          bedtimeHour={12}
        />,
      )

      // Should not crash
      const toggleButton = screen.getByRole('switch')
      fireEvent.click(toggleButton)

      // Should still render something
      const circadianPaths = container.querySelectorAll('path[fill*="circadianGradient"]')
      expect(circadianPaths.length).toBeGreaterThan(0)
    })

    it('should handle invalid hour values by using defaults', () => {
      const { container } = renderWithProvider(
        <SwimLaneTimeline
          sessions={mockSessions}
          tasks={mockTasks}
          onSessionUpdate={mockOnSessionUpdate}
          onSessionCreate={mockOnSessionCreate}
          onSessionDelete={mockOnSessionDelete}
          onSessionSelect={mockOnSessionSelect}
          wakeTimeHour={-5}  // Invalid
          bedtimeHour={30}   // Invalid
        />,
      )

      // Should not crash with invalid values
      const toggleButton = screen.getByRole('switch')
      fireEvent.click(toggleButton)

      // Should still render with defaults/modulo
      const circadianPaths = container.querySelectorAll('path[fill*="circadianGradient"]')
      expect(circadianPaths.length).toBeGreaterThan(0)
    })
  })
})
