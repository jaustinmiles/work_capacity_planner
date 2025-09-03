import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { EisenhowerMatrix } from '../EisenhowerMatrix'
import { useTaskStore } from '../../../store/useTaskStore'

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
    render(<EisenhowerMatrix onAddTask={mockOnAddTask} />)

    // Switch to scatter view
    const scatterButton = screen.getByRole('radio', { name: /scatter/i })
    fireEvent.click(scatterButton)

    // Check for diagonal scan button
    const diagonalScanButton = screen.getByRole('button', { name: /diagonal scan/i })
    expect(diagonalScanButton).toBeInTheDocument()
  })

  it('should start diagonal scan animation when button clicked', async () => {
    render(<EisenhowerMatrix onAddTask={mockOnAddTask} />)

    // Switch to scatter view
    const scatterButton = screen.getByRole('radio', { name: /scatter/i })
    fireEvent.click(scatterButton)

    // Click diagonal scan button
    const diagonalScanButton = screen.getByRole('button', { name: /diagonal scan/i })
    fireEvent.click(diagonalScanButton)

    // Check for animation indicator
    await waitFor(() => {
      expect(screen.getByTestId('diagonal-scan-line')).toBeInTheDocument()
    })
  })

  it('should change button text when scanning starts', () => {
    render(<EisenhowerMatrix onAddTask={mockOnAddTask} />)

    // Switch to scatter view
    const scatterButton = screen.getByRole('radio', { name: /scatter/i })
    fireEvent.click(scatterButton)

    // Get diagonal scan button
    const diagonalScanButton = screen.getByRole('button', { name: /diagonal scan/i })
    expect(diagonalScanButton).toBeInTheDocument()

    // Start scanning
    fireEvent.click(diagonalScanButton)

    // Button should now show scanning state
    expect(screen.getByRole('button', { name: /scanning/i })).toBeInTheDocument()
  })

  it('should display scan line when scanning', async () => {
    render(<EisenhowerMatrix onAddTask={mockOnAddTask} />)

    // Switch to scatter view
    const scatterButton = screen.getByRole('radio', { name: /scatter/i })
    fireEvent.click(scatterButton)

    // Start diagonal scan
    const diagonalScanButton = screen.getByRole('button', { name: /diagonal scan/i })
    fireEvent.click(diagonalScanButton)

    // Check animation line appears
    await waitFor(() => {
      expect(screen.getByTestId('diagonal-scan-line')).toBeInTheDocument()
    })
  })
})
