import React from 'react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { EisenhowerMatrix } from '../EisenhowerMatrix'
import { useTaskStore } from '../../../store/useTaskStore'
import { ResponsiveProvider } from '../../../providers/ResponsiveProvider'

// Helper function to render with ResponsiveProvider
const renderWithProvider = (component: React.ReactElement) => {
  return render(<ResponsiveProvider>{component}</ResponsiveProvider>)
}

// Mock child components for focused testing
vi.mock('../EisenhowerGrid', () => ({
  EisenhowerGrid: () => <div data-testid="eisenhower-grid">Grid View</div>,
}))

vi.mock('../EisenhowerScatter', () => ({
  EisenhowerScatter: ({ onSelectTask }: any) => (
    <div data-testid="eisenhower-scatter">
      <div data-testid="scatter-view">Scatter View</div>
      <button 
        data-testid="diagonal-scan-button"
        aria-label="Start diagonal scan"
      >
        Scan
      </button>
    </div>
  ),
}))

vi.mock('../EisenhowerDiagonalScan', () => ({
  EisenhowerDiagonalScan: ({ isScanning, onToggleScan }: any) => (
    <button 
      data-testid="diagonal-scan-button" 
      onClick={onToggleScan}
      aria-label={isScanning ? 'Stop scanning' : 'Start diagonal scan'}
    >
      {isScanning ? 'Scanning...' : 'Scan'}
    </button>
  ),
}))

vi.mock('../../../store/useTaskStore')

describe('EisenhowerMatrix - Diagonal Scan Feature', () => {
  const mockSelectTask = vi.fn()
  const mockOnAddTask = vi.fn()

  const mockTasks = [
    { id: '1', name: 'Task 1', importance: 9, urgency: 9, completed: false, duration: 60, type: 'focused' },
    { id: '2', name: 'Task 2', importance: 8, urgency: 3, completed: false, duration: 45, type: 'focused' },
    { id: '3', name: 'Task 3', importance: 3, urgency: 8, completed: false, duration: 30, type: 'admin' },
    { id: '4', name: 'Task 4', importance: 2, urgency: 2, completed: false, duration: 15, type: 'personal' },
    { id: '5', name: 'Task 5', importance: 7, urgency: 7, completed: false, duration: 90, type: 'focused' },
    { id: '6', name: 'Task 6', importance: 5, urgency: 5, completed: false, duration: 60, type: 'admin' },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useTaskStore).mockReturnValue({
      tasks: mockTasks,
      sequencedTasks: [],
      selectTask: mockSelectTask,
    } as any)
  })

  describe('Diagonal Scan Integration', () => {
    it('should show scan button only in scatter view', () => {
      renderWithProvider(<EisenhowerMatrix onAddTask={mockOnAddTask} />)

      // Grid view - no scan button
      expect(screen.queryByTestId('diagonal-scan-button')).not.toBeInTheDocument()

      // Switch to scatter view
      const scatterRadio = screen.getByDisplayValue('scatter')
      fireEvent.click(scatterRadio)

      // Scatter view - scan button appears
      expect(screen.getByTestId('diagonal-scan-button')).toBeInTheDocument()
      expect(screen.getByLabelText('Start diagonal scan')).toBeInTheDocument()
    })

    it('should have scan button functionality delegated to scatter component', () => {
      renderWithProvider(<EisenhowerMatrix onAddTask={mockOnAddTask} />)

      // Switch to scatter view first
      const scatterRadio = screen.getByDisplayValue('scatter')
      fireEvent.click(scatterRadio)

      const scanButton = screen.getByTestId('diagonal-scan-button')
      
      // Scan button should be present and functional
      expect(scanButton).toBeInTheDocument()
      expect(scanButton).toHaveTextContent('Scan')

      // Should be clickable (implementation details tested in EisenhowerScatter)
      fireEvent.click(scanButton)
      expect(scanButton).toBeInTheDocument()
    })
  })
})