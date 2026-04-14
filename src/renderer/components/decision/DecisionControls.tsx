/**
 * DecisionControls — Voice-first controls for Decision Mode.
 *
 * Matches the original Decision Helper's AudioControls UX:
 * - Record: start/stop continuous mic recording
 * - Respond: trigger transcription + Socratic reflection
 * - Summarize: get a neutral summary of current state
 * - Recommend: analyze graph and suggest direction (when ready)
 * - Text input fallback for typing instead of speaking
 *
 * Voice trigger: say "ok respond" during recording to auto-trigger.
 */

import React, { useState, useCallback } from 'react'
import { Input, Button } from '@arco-design/web-react'
import {
  IconSend,
  IconVoice,
  IconPause,
} from '@arco-design/web-react/icon'
import { useDecisionStore } from '../../store/useDecisionStore'
import { useVoiceRecording } from '../../hooks/useVoiceRecording'
import { useTTS } from '../../hooks/useTTS'
import { logger } from '@/logger'

const { TextArea } = Input

export function DecisionControls(): React.ReactElement {
  const {
    activeSessionId,
    isProcessing,
    connectivity,
    sendMessage,
    endSession,
    requestSummary,
    conversationHistory,
  } = useDecisionStore()

  const { speak, speaking } = useTTS()
  const [inputValue, setInputValue] = useState('')
  const [summarizing, setSummarizing] = useState(false)
  const [lastQuestion, setLastQuestion] = useState('')

  // Voice recording — transcription triggers sendMessage
  const handleTranscript = useCallback(async (transcript: string) => {
    if (!transcript.trim()) return
    logger.ui.info('Decision voice transcript', { text: transcript.slice(0, 80) }, 'decision-voice')
    const question = await sendMessage(transcript)
    if (question) {
      setLastQuestion(question)
      // Auto-speak the response
      await speak(question)
    }
  }, [sendMessage, speak])

  const {
    recordingState,
    isTranscribing,
    recordingDuration,
    startRecording,
    stopRecording,
  } = useVoiceRecording({
    transcriptionPrompt: 'Decision brainstorming session — the user is thinking through options and tradeoffs',
    onTranscriptionComplete: (text: string) => { handleTranscript(text) },
    onError: (error: string) => { logger.ui.error('Decision voice error', { error }, 'decision-voice-error') },
  })

  const isRecording = recordingState === 'recording'
  const busy = isProcessing || summarizing || isTranscribing || speaking

  // Text send handler
  const handleTextSend = useCallback(async () => {
    const text = inputValue.trim()
    if (!text || busy || !activeSessionId) return
    setInputValue('')
    const question = await sendMessage(text)
    if (question) {
      setLastQuestion(question)
      await speak(question)
    }
  }, [inputValue, busy, activeSessionId, sendMessage, speak])

  const handleSummarize = useCallback(async () => {
    setSummarizing(true)
    const summary = await requestSummary()
    setSummarizing(false)
    if (summary) {
      setLastQuestion(summary)
      await speak(summary)
    }
  }, [requestSummary, speak])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      handleTextSend()
    }
  }

  if (!activeSessionId) return <div />

  const recommendReady = connectivity?.ready ?? false

  return (
    <div style={{ borderTop: '1px solid var(--color-border)', background: 'var(--color-bg-2)' }}>
      {/* Conversation log */}
      {conversationHistory.length > 0 && (
        <div style={{ maxHeight: 160, overflowY: 'auto', padding: '8px 12px' }}>
          {conversationHistory.map((msg, i) => (
            <div
              key={i}
              style={{
                marginBottom: 4,
                padding: '3px 8px',
                borderRadius: 6,
                background: msg.role === 'user' ? 'var(--color-primary-light-4)' : 'var(--color-bg-3)',
                fontSize: 12,
              }}
            >
              {msg.text}
            </div>
          ))}
        </div>
      )}

      {/* Audio visualizer placeholder + status */}
      <div style={{ padding: '6px 12px', fontSize: 11, color: 'var(--color-text-3)' }}>
        {!isRecording && !busy && 'Tap Record to start, or type below'}
        {isRecording && !busy && (
          <>Recording ({recordingDuration}s) — say <strong>&ldquo;OK respond&rdquo;</strong> or tap Respond</>
        )}
        {isTranscribing && 'Transcribing...'}
        {isProcessing && 'Thinking...'}
        {summarizing && 'Summarizing...'}
        {speaking && 'Speaking...'}
      </div>

      {/* Voice control buttons */}
      <div style={{ padding: '4px 12px 8px', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <Button
          type={isRecording ? 'primary' : 'default'}
          status={isRecording ? 'danger' : undefined}
          icon={isRecording ? <IconPause /> : <IconVoice />}
          onClick={isRecording ? stopRecording : startRecording}
          size="small"
        >
          {isRecording ? 'Stop' : 'Record'}
        </Button>

        <Button
          size="small"
          onClick={() => {
            // Trigger transcription of current recording
            if (isRecording) {
              stopRecording()
            }
          }}
          disabled={!isRecording || busy}
          loading={isTranscribing || isProcessing}
        >
          Respond
        </Button>

        <Button
          size="small"
          onClick={handleSummarize}
          disabled={busy}
          loading={summarizing}
        >
          Summarize
        </Button>

        <Button
          size="small"
          type={recommendReady ? 'primary' : 'default'}
          disabled={busy || !recommendReady}
          title={recommendReady ? 'Graph is connected enough' : 'Keep brainstorming — need more connections'}
        >
          Recommend
        </Button>

        <div style={{ flex: 1 }} />

        <Button
          size="small"
          status="warning"
          onClick={endSession}
          disabled={busy}
        >
          End Session
        </Button>
      </div>

      {/* Last question */}
      {lastQuestion && (
        <div style={{ padding: '0 12px 6px', fontSize: 12, fontStyle: 'italic', color: 'var(--color-text-2)' }}>
          &ldquo;{lastQuestion}&rdquo;
        </div>
      )}

      {/* Text input fallback */}
      <div style={{ padding: '0 12px 8px', display: 'flex', gap: 6 }}>
        <TextArea
          value={inputValue}
          onChange={setInputValue}
          onKeyDown={handleKeyDown}
          placeholder="Or type here..."
          autoSize={{ minRows: 1, maxRows: 2 }}
          disabled={busy}
          style={{ flex: 1, fontSize: 12 }}
        />
        <Button
          type="primary"
          size="small"
          icon={<IconSend />}
          onClick={handleTextSend}
          disabled={!inputValue.trim() || busy}
        />
      </div>
    </div>
  )
}
