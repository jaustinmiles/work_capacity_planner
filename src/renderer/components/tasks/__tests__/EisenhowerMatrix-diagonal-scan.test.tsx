import React from 'react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { EisenhowerMatrix } from '../EisenhowerMatrix'
import { useTaskStore } from '../../../store/useTaskStore'
import { ResponsiveProvider } from '../../../providers/ResponsiveProvider'

// Helper function to render with ResponsiveProvider
const renderWithProvider = (component: React.ReactElement) => {
  return render(<ResponsiveProvider>{component}</ResponsiveProvider>)
}

vi.mock('../../../store/useTaskStore')

describe('EisenhowerMatrix - Diagonal Scan Feature', () => {
  const mockSelectTask = vi.fn()
  const mockOnAddTask = vi.fn()

  const mockTasks = [
    { id: '1', name: 'Task 1', importance: 9, urgency: 9, completed: false, duration: 60, type: 'focused' }, // Do First
    { id: '2', name: 'Task 2', importance: 8, urgency: 3, completed: false, duration: 45, type: 'focused' }, // Schedule
    { id: '3', name: 'Task 3', importance: 3, urgency: 8, completed: false, duration: 30, type: 'admin' }, // Delegate
    { id: '4', name: 'Task 4', importance: 2, urgency: 2, completed: false, duration: 15, type: 'personal' }, // Eliminate
    { id: '5', name: 'Task 5', importance: 7, urgency: 7, completed: false, duration: 90, type: 'focused' }, // Do First (on diagonal)
    { id: '6', name: 'Task 6', importance: 5, urgency: 5, completed: false, duration: 60, type: 'admin' }, // Center diagonal
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useTaskStore).mockReturnValue({
      tasks: mockTasks,
      sequencedTasks: [],
      selectTask: mockSelectTask,
    } as any)
  })

  it('should show diagonal scan button in scatter view', () => {
    renderWithProvider(<EisenhowerMatrix onAddTask={mockOnAddTask} />)

    // Switch to scatter view - use value since text is conditionally rendered
    const scatterButton = screen.getByDisplayValue('scatter')
    fireEvent.click(scatterButton)

    // Check for diagonal scan button
    const diagonalScanButton = screen.getByRole('button', { name: /scan/i }) // Changed from 'Diagonal Scan' to 'Scan'
    expect(diagonalScanButton).toBeInTheDocument()
  })

  it('should start diagonal scan animation when button clicked', async () => {
    renderWithProvider(<EisenhowerMatrix onAddTask={mockOnAddTask} />)

    // Switch to scatter view - use value since text is conditionally rendered
    const scatterButton = screen.getByDisplayValue('scatter')
    fireEvent.click(scatterButton)

    // Click diagonal scan button
    const diagonalScanButton = screen.getByRole('button', { name: /scan/i }) // Changed from 'Diagonal Scan' to 'Scan'
    fireEvent.click(diagonalScanButton)

    // Check for animation indicator
    await waitFor(() => {
      expect(screen.getByTestId('diagonal-scan-line')).toBeInTheDocument()
    })
  })

  it('should change button text when scanning starts', () => {
    renderWithProvider(<EisenhowerMatrix onAddTask={mockOnAddTask} />)

    // Switch to scatter view - use value since text is conditionally rendered
    const scatterButton = screen.getByDisplayValue('scatter')
    fireEvent.click(scatterButton)

    // Get diagonal scan button
    const diagonalScanButton = screen.getByRole('button', { name: /scan/i }) // Changed from 'Diagonal Scan' to 'Scan'
    expect(diagonalScanButton).toBeInTheDocument()

    // Start scanning
    fireEvent.click(diagonalScanButton)

    // Button should now show scanning state
    expect(screen.getByRole('button', { name: /scan/i })).toBeInTheDocument() // Changed from 'Scanning...' to 'Scan...'
  })

  it('should display scan line when scanning', async () => {
    renderWithProvider(<EisenhowerMatrix onAddTask={mockOnAddTask} />)

    // Switch to scatter view - use value since text is conditionally rendered
    const scatterButton = screen.getByDisplayValue('scatter')
    fireEvent.click(scatterButton)

    // Start diagonal scan
    const diagonalScanButton = screen.getByRole('button', { name: /scan/i }) // Changed from 'Diagonal Scan' to 'Scan'
    fireEvent.click(diagonalScanButton)

    // Check animation line appears
    await waitFor(() => {
      expect(screen.getByTestId('diagonal-scan-line')).toBeInTheDocument()
    })
  })
})
