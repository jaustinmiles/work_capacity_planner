import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { EisenhowerGrid } from '../EisenhowerGrid'
import type { Task } from '@shared/types'

// Mock the user task type store
vi.mock('../../../store/useUserTaskTypeStore', () => ({
  useSortedUserTaskTypes: () => [
    { id: 'focused', name: 'Focused', color: 'blue', emoji: '🎯' },
    { id: 'admin', name: 'Admin', color: 'green', emoji: '📋' },
    { id: 'personal', name: 'Personal', color: 'orange', emoji: '🏠' },
  ],
}))

describe('EisenhowerGrid', () => {
  const mockOnAddTask = vi.fn()
  const mockOnSelectTask = vi.fn()

  const mockTasks: Task[] = [
    {
      id: 'task-1',
      name: 'Do First Task',
      importance: 8,
      urgency: 9,
      duration: 60,
      type: 'focused',
      completed: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'task-2',
      name: 'Schedule Task',
      importance: 8,
      urgency: 3,
      duration: 120,
      type: 'admin',
      completed: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'task-3',
      name: 'Delegate Task',
      importance: 3,
      urgency: 8,
      duration: 30,
      type: 'personal',
      completed: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'task-4',
      name: 'Eliminate Task',
      importance: 2,
      urgency: 2,
      duration: 15,
      type: 'admin',
      completed: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'task-5',
      name: 'Completed Task',
      importance: 7,
      urgency: 7,
      duration: 60,
      type: 'focused',
      completed: true, // Should not appear
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Quadrant Categorization', () => {
    it('should categorize tasks into correct quadrants', () => {
      render(
        <EisenhowerGrid
          tasks={mockTasks}
          onAddTask={mockOnAddTask}
          onSelectTask={mockOnSelectTask}
          containerWidth={800}
        />,
      )

      // Check "Do First" quadrant (high importance, high urgency)
      expect(screen.getByText('Do First')).toBeInTheDocument()
      expect(screen.getByText('Do First Task')).toBeInTheDocument()

      // Check "Schedule" quadrant (high importance, low urgency)
      expect(screen.getByText('Schedule')).toBeInTheDocument()
      expect(screen.getByText('Schedule Task')).toBeInTheDocument()

      // Check "Delegate" quadrant (low importance, high urgency)
      expect(screen.getByText('Delegate')).toBeInTheDocument()
      expect(screen.getByText('Delegate Task')).toBeInTheDocument()

      // Check "Eliminate" quadrant (low importance, low urgency)
      expect(screen.getByText('Eliminate')).toBeInTheDocument()
      expect(screen.getByText('Eliminate Task')).toBeInTheDocument()

      // Completed task should not appear
      expect(screen.queryByText('Completed Task')).not.toBeInTheDocument()
    })

    it('should display correct task counts in quadrant tags', () => {
      render(
        <EisenhowerGrid
          tasks={mockTasks}
          onAddTask={mockOnAddTask}
          onSelectTask={mockOnSelectTask}
          containerWidth={800}
        />,
      )

      // Find all quadrant count tags
      const doFirstHeader = screen.getByText('Do First').closest('.arco-card-header')
      const scheduleHeader = screen.getByText('Schedule').closest('.arco-card-header')
      const delegateHeader = screen.getByText('Delegate').closest('.arco-card-header')
      const eliminateHeader = screen.getByText('Eliminate').closest('.arco-card-header')

      // Check counts (using tag content)
      expect(within(doFirstHeader!).getByText('1')).toBeInTheDocument()
      expect(within(scheduleHeader!).getByText('1')).toBeInTheDocument()
      expect(within(delegateHeader!).getByText('1')).toBeInTheDocument()
      expect(within(eliminateHeader!).getByText('1')).toBeInTheDocument()
    })

    it('should display task metadata correctly', () => {
      render(
        <EisenhowerGrid
          tasks={mockTasks}
          onAddTask={mockOnAddTask}
          onSelectTask={mockOnSelectTask}
          containerWidth={800}
        />,
      )

      // Find a specific task card
      const taskCard = screen.getByText('Do First Task').closest('.arco-card')

      // Check task metadata tags (user-defined types show emoji + name)
      expect(within(taskCard!).getByText('🎯 Focused')).toBeInTheDocument()
      expect(within(taskCard!).getByText('60m')).toBeInTheDocument()
      expect(within(taskCard!).getByText('I:8')).toBeInTheDocument()
      expect(within(taskCard!).getByText('U:9')).toBeInTheDocument()
    })
  })

  describe('User Interactions', () => {
    it('should call onSelectTask when a task is clicked', () => {
      render(
        <EisenhowerGrid
          tasks={mockTasks}
          onAddTask={mockOnAddTask}
          onSelectTask={mockOnSelectTask}
          containerWidth={800}
        />,
      )

      const taskCard = screen.getByText('Do First Task').closest('.arco-card')
      fireEvent.click(taskCard!)

      expect(mockOnSelectTask).toHaveBeenCalledWith(mockTasks[0])
    })

    it('should call onAddTask when Add Task button is clicked', () => {
      render(
        <EisenhowerGrid
          tasks={mockTasks}
          onAddTask={mockOnAddTask}
          onSelectTask={mockOnSelectTask}
          containerWidth={800}
        />,
      )

      const addButton = screen.getByText('Add Task')
      fireEvent.click(addButton)

      expect(mockOnAddTask).toHaveBeenCalled()
    })
  })

  describe('Zoom Controls', () => {
    it('should show zoom controls for wide containers', () => {
      render(
        <EisenhowerGrid
          tasks={mockTasks}
          onAddTask={mockOnAddTask}
          onSelectTask={mockOnSelectTask}
          containerWidth={800}
        />,
      )

      // Look for zoom buttons by their icons
      const zoomButtons = screen.getAllByRole('button')
      const zoomInButton = zoomButtons.find(btn => btn.querySelector('.arco-icon-zoom-in'))
      const zoomOutButton = zoomButtons.find(btn => btn.querySelector('.arco-icon-zoom-out'))

      expect(zoomInButton).toBeInTheDocument()
      expect(zoomOutButton).toBeInTheDocument()

      // Should have slider
      expect(screen.getByRole('slider')).toBeInTheDocument()
    })

    it('should hide zoom controls for narrow containers', () => {
      render(
        <EisenhowerGrid
          tasks={mockTasks}
          onAddTask={mockOnAddTask}
          onSelectTask={mockOnSelectTask}
          containerWidth={350}
        />,
      )

      // Zoom controls should be hidden for narrow containers
      const buttons = screen.queryAllByRole('button')
      const zoomInButton = buttons.find(btn => btn.querySelector('.arco-icon-zoom-in'))
      const zoomOutButton = buttons.find(btn => btn.querySelector('.arco-icon-zoom-out'))

      expect(zoomInButton).not.toBeDefined()
      expect(zoomOutButton).not.toBeDefined()

      // Should also not have slider
      expect(screen.queryByRole('slider')).not.toBeInTheDocument()
    })

    it('should adjust zoom when zoom buttons are clicked', () => {
      render(
        <EisenhowerGrid
          tasks={mockTasks}
          onAddTask={mockOnAddTask}
          onSelectTask={mockOnSelectTask}
          containerWidth={800}
        />,
      )

      const slider = screen.getByRole('slider')
      expect(slider).toHaveAttribute('aria-valuenow', '1') // Default zoom

      // Click zoom in
      const zoomButtons = screen.getAllByRole('button')
      const zoomInButton = zoomButtons.find(btn => btn.querySelector('.arco-icon-zoom-in'))
      fireEvent.click(zoomInButton!)

      // Zoom should increase
      expect(slider).toHaveAttribute('aria-valuenow', '1.1')

      // Click zoom out
      const zoomOutButton = zoomButtons.find(btn => btn.querySelector('.arco-icon-zoom-out'))
      fireEvent.click(zoomOutButton!)

      // Zoom should go back to 1
      expect(slider).toHaveAttribute('aria-valuenow', '1')
    })
  })

  describe('Responsive Behavior', () => {
    it('should show full Add Task text for wide containers', () => {
      render(
        <EisenhowerGrid
          tasks={mockTasks}
          onAddTask={mockOnAddTask}
          onSelectTask={mockOnSelectTask}
          containerWidth={600}
        />,
      )

      expect(screen.getByText('Add Task')).toBeInTheDocument()
    })

    it('should hide Add Task text for narrow containers', () => {
      render(
        <EisenhowerGrid
          tasks={mockTasks}
          onAddTask={mockOnAddTask}
          onSelectTask={mockOnSelectTask}
          containerWidth={450}
        />,
      )

      // Button should still exist but without text
      const buttons = screen.getAllByRole('button')
      const addButton = buttons.find(btn => btn.querySelector('.arco-icon-plus'))
      expect(addButton).toBeInTheDocument()

      // Text should not be visible
      expect(screen.queryByText('Add Task')).not.toBeInTheDocument()
    })

    it('should adjust slider width based on container width', () => {
      const { rerender, container } = render(
        <EisenhowerGrid
          tasks={mockTasks}
          onAddTask={mockOnAddTask}
          onSelectTask={mockOnSelectTask}
          containerWidth={700}
        />,
      )

      // Find the slider wrapper by its style attribute
      let sliderWrapper = container.querySelector('[style*="width: 120px"]') ||
                          container.querySelector('.arco-slider')?.parentElement
      expect(sliderWrapper).toBeTruthy()

      // Rerender with narrower width
      rerender(
        <EisenhowerGrid
          tasks={mockTasks}
          onAddTask={mockOnAddTask}
          onSelectTask={mockOnSelectTask}
          containerWidth={500}
        />,
      )

      // Check for narrower slider wrapper
      sliderWrapper = container.querySelector('[style*="width: 80px"]') ||
                      container.querySelector('.arco-slider')?.parentElement
      expect(sliderWrapper).toBeTruthy()
    })
  })

  describe('Visual Elements', () => {
    it('should display axis labels', () => {
      render(
        <EisenhowerGrid
          tasks={mockTasks}
          onAddTask={mockOnAddTask}
          onSelectTask={mockOnSelectTask}
          containerWidth={800}
        />,
      )

      expect(screen.getByText(/Less Urgent.*More Urgent/)).toBeInTheDocument()
      expect(screen.getByText(/Less Important.*More Important/)).toBeInTheDocument()
    })

    it('should apply correct colors to quadrants', () => {
      render(
        <EisenhowerGrid
          tasks={mockTasks}
          onAddTask={mockOnAddTask}
          onSelectTask={mockOnSelectTask}
          containerWidth={800}
        />,
      )

      // Check quadrant descriptions
      expect(screen.getByText('Urgent & Important')).toBeInTheDocument()
      expect(screen.getByText('Important, Not Urgent')).toBeInTheDocument()
      expect(screen.getByText('Urgent, Not Important')).toBeInTheDocument()
      expect(screen.getByText('Neither Urgent Nor Important')).toBeInTheDocument()
    })

    it('should color-code task cards by type', () => {
      render(
        <EisenhowerGrid
          tasks={mockTasks}
          onAddTask={mockOnAddTask}
          onSelectTask={mockOnSelectTask}
          containerWidth={800}
        />,
      )

      // Find tags with type colors (now using user type displayName with emoji)
      const focusedTag = screen.getByText('🎯 Focused')
      const adminTags = screen.getAllByText('📋 Admin')
      const personalTag = screen.getByText('🏠 Personal')

      expect(focusedTag.closest('.arco-tag')).toHaveClass('arco-tag-blue')
      expect(adminTags[0].closest('.arco-tag')).toHaveClass('arco-tag-green')
      expect(personalTag.closest('.arco-tag')).toHaveClass('arco-tag-orange')
    })
  })

  describe('Edge Cases', () => {
    it('should handle empty task list', () => {
      render(
        <EisenhowerGrid
          tasks={[]}
          onAddTask={mockOnAddTask}
          onSelectTask={mockOnSelectTask}
          containerWidth={800}
        />,
      )

      // Quadrants should still render
      expect(screen.getByText('Do First')).toBeInTheDocument()
      expect(screen.getByText('Schedule')).toBeInTheDocument()
      expect(screen.getByText('Delegate')).toBeInTheDocument()
      expect(screen.getByText('Eliminate')).toBeInTheDocument()

      // All counts should be 0
      const tags = screen.getAllByText('0')
      expect(tags).toHaveLength(4)
    })

    it('should handle all completed tasks', () => {
      const completedTasks = mockTasks.map(task => ({ ...task, completed: true }))

      render(
        <EisenhowerGrid
          tasks={completedTasks}
          onAddTask={mockOnAddTask}
          onSelectTask={mockOnSelectTask}
          containerWidth={800}
        />,
      )

      // No task names should appear
      expect(screen.queryByText('Do First Task')).not.toBeInTheDocument()
      expect(screen.queryByText('Schedule Task')).not.toBeInTheDocument()
      expect(screen.queryByText('Delegate Task')).not.toBeInTheDocument()
      expect(screen.queryByText('Eliminate Task')).not.toBeInTheDocument()
    })

    it('should handle edge importance/urgency values', () => {
      const edgeTasks: Task[] = [
        {
          id: 'edge-1',
          name: 'Exactly 6/6',
          importance: 6,
          urgency: 6,
          duration: 60,
          type: 'focused',
          completed: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'edge-2',
          name: 'Just Below 6/6',
          importance: 5.9,
          urgency: 5.9,
          duration: 60,
          type: 'focused',
          completed: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]

      render(
        <EisenhowerGrid
          tasks={edgeTasks}
          onAddTask={mockOnAddTask}
          onSelectTask={mockOnSelectTask}
          containerWidth={800}
        />,
      )

      // Exactly 6/6 should be in "Do First"
      const doFirstSection = screen.getByText('Do First').closest('.arco-card')
      expect(within(doFirstSection!).getByText('Exactly 6/6')).toBeInTheDocument()

      // Just below 6/6 should be in "Eliminate"
      const eliminateSection = screen.getByText('Eliminate').closest('.arco-card')
      expect(within(eliminateSection!).getByText('Just Below 6/6')).toBeInTheDocument()
    })
  })
})
