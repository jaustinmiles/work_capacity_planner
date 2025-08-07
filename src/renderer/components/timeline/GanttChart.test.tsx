import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { GanttChart } from './GanttChart'
import { Task } from '@shared/types'
import { SequencedTask } from '@shared/sequencing-types'

// Mock the database service
vi.mock('../../services/database', () => ({
  getDatabase: () => ({
    getWorkPattern: vi.fn().mockResolvedValue(null),
  }),
}))

describe('GanttChart', () => {
  const mockTasks: Task[] = []
  const mockSequencedTasks: SequencedTask[] = []

  it('renders without crashing', () => {
    render(<GanttChart tasks={mockTasks} sequencedTasks={mockSequencedTasks} />)
    expect(screen.getByText(/No scheduled items to display/i)).toBeInTheDocument()
  })

  it('shows empty state when no work patterns exist', () => {
    render(<GanttChart tasks={mockTasks} sequencedTasks={mockSequencedTasks} />)
    expect(screen.getByText(/You need to set up your work schedule first/i)).toBeInTheDocument()
  })

  it('maintains consistent hook order across renders', () => {
    const { rerender } = render(
      <GanttChart tasks={mockTasks} sequencedTasks={mockSequencedTasks} />,
    )

    // Re-render with same props - should not throw hooks error
    expect(() => {
      rerender(<GanttChart tasks={mockTasks} sequencedTasks={mockSequencedTasks} />)
    }).not.toThrow()
  })
})
