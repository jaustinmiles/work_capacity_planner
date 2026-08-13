import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { JournalEntryEditor } from '../JournalEntryEditor'
import type { UseVoiceRecordingOptions } from '../../../hooks/useVoiceRecording'

// Controllable stand-in for the shared voice pipeline. Captures the options the
// editor passes so tests can fire onTranscriptionComplete like the real hook.
const voiceMock = vi.hoisted(() => ({
  capturedOptions: null as UseVoiceRecordingOptions | null,
  recordingState: 'idle' as 'idle' | 'recording' | 'stopped',
  isTranscribing: false,
  startRecording: vi.fn(),
  stopRecording: vi.fn(),
}))

vi.mock('../../../hooks/useVoiceRecording', () => ({
  useVoiceRecording: (options: UseVoiceRecordingOptions) => {
    voiceMock.capturedOptions = options
    return {
      recordingState: voiceMock.recordingState,
      isTranscribing: voiceMock.isTranscribing,
      recordingDuration: 0,
      transcribedText: '',
      error: null,
      startRecording: voiceMock.startRecording,
      stopRecording: voiceMock.stopRecording,
      processAudioFile: vi.fn(),
      reset: vi.fn(),
    }
  },
}))

const journalStoreState = vi.hoisted(() => ({
  updateEntry: vi.fn(),
  deleteEntry: vi.fn(),
  processEntry: vi.fn(),
  setViewMode: vi.fn(),
  processing: false,
}))

vi.mock('../../../store/useJournalStore', () => ({
  useJournalStore: (selector: (state: typeof journalStoreState) => unknown) =>
    selector(journalStoreState),
}))

vi.mock('@arco-design/web-react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@arco-design/web-react')>()
  return {
    ...actual,
    Message: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
  }
})

const entry = {
  id: 'entry-1',
  title: 'My day',
  content: '<p>So far so good</p>',
  plainText: 'So far so good',
  entryDate: new Date('2026-08-13T00:00:00'),
  processedAt: null,
} as Parameters<typeof JournalEntryEditor>[0]['entry']

describe('JournalEntryEditor — voice dictation', () => {
  beforeEach(() => {
    voiceMock.capturedOptions = null
    voiceMock.recordingState = 'idle'
    voiceMock.isTranscribing = false
    voiceMock.startRecording.mockClear()
    voiceMock.stopRecording.mockClear()
  })

  it('starts recording from the toolbar mic button', () => {
    render(<JournalEntryEditor entry={entry} />)

    fireEvent.click(screen.getByTitle('Dictate into this entry'))

    expect(voiceMock.startRecording).toHaveBeenCalledTimes(1)
  })

  it('stops recording when already recording', () => {
    voiceMock.recordingState = 'recording'
    render(<JournalEntryEditor entry={entry} />)

    fireEvent.click(screen.getByTitle('Stop dictation and transcribe'))

    expect(voiceMock.stopRecording).toHaveBeenCalledTimes(1)
    expect(voiceMock.startRecording).not.toHaveBeenCalled()
  })

  it('passes a journal-specific transcription prompt', () => {
    render(<JournalEntryEditor entry={entry} />)
    expect(voiceMock.capturedOptions?.transcriptionPrompt).toContain('journal')
  })

  it('inserts the transcript into the editor and marks the draft dirty', () => {
    const { container } = render(<JournalEntryEditor entry={entry} />)
    const editor = container.querySelector('.journal-rich-text') as HTMLDivElement

    // Save starts disabled — no unsaved changes yet
    const saveButton = screen.getByText('Save').closest('button') as HTMLButtonElement
    expect(saveButton.disabled).toBe(true)

    act(() => {
      voiceMock.capturedOptions?.onTranscriptionComplete?.('I felt great today.')
    })

    expect(editor.textContent).toContain('I felt great today.')
    expect(screen.getByText('Unsaved changes')).toBeDefined()
    expect(saveButton.disabled).toBe(false)
  })

  it('ignores empty transcripts', () => {
    const { container } = render(<JournalEntryEditor entry={entry} />)
    const editor = container.querySelector('.journal-rich-text') as HTMLDivElement

    act(() => {
      voiceMock.capturedOptions?.onTranscriptionComplete?.('   ')
    })

    expect(editor.textContent).toBe('So far so good')
    expect(screen.queryByText('Unsaved changes')).toBeNull()
  })
})
