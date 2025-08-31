import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { VoiceAmendmentModal } from './VoiceAmendmentModal'
import '@testing-library/jest-dom'

// Mock the database service
const mockTranscribeAudioBuffer = vi.fn()
const mockParseVoiceAmendment = vi.fn()
vi.mock('../../services/database', () => ({
  getDatabase: vi.fn(() => ({
    transcribeAudioBuffer: mockTranscribeAudioBuffer,
    parseVoiceAmendment: mockParseVoiceAmendment,
  })),
}))

// Mock the task store
vi.mock('../../store/useTaskStore', () => ({
  useTaskStore: vi.fn(() => ({
    tasks: [],
    sequencedTasks: [],
  })),
}))

describe('VoiceAmendmentModal', () => {
  const mockOnClose = vi.fn()
  const mockOnAmendmentsApplied = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should render the modal when visible', () => {
    render(
      <VoiceAmendmentModal
        visible={true}
        onClose={mockOnClose}
      />,
    )

    // The modal should show the voice recording interface
    expect(screen.getByRole('button', { name: /start recording/i })).toBeInTheDocument()
  })

  it('should not render when visible is false', () => {
    render(
      <VoiceAmendmentModal
        visible={false}
        onClose={mockOnClose}
      />,
    )

    // The modal should not be visible
    expect(screen.queryByRole('button', { name: /start recording/i })).not.toBeInTheDocument()
  })
})