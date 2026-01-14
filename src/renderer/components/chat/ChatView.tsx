/**
 * ChatView Component
 *
 * Displays the message list and input area for an active conversation.
 * Handles message rendering, streaming content, and amendment cards.
 */

import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react'
import { Input, Button, Spin, Typography, Alert } from '@arco-design/web-react'
import { IconSend, IconVoice, IconPause } from '@arco-design/web-react/icon'
import { useConversationStore, ConversationStatus } from '../../store/useConversationStore'
import { ChatMessageRecord, AmendmentCard as AmendmentCardType } from '@shared/conversation-types'
import { ChatMessageRole, ViewType } from '@shared/enums'
import { AmendmentCard } from './AmendmentCard'
import { sendChatMessage } from '../../services/brainstorm-chat-ai'
import { parseAIResponse } from '../../services/chat-response-parser'
import { MarkdownContent } from '../common/MarkdownContent'
import { applyAmendments } from '../../utils/amendment-applicator'
import {
  buildConversationHistory,
  isValidUserInput,
  shouldSendOnKeyDown,
} from '../../utils/chat-message-utils'
import { shouldAutoScroll, scrollToBottom } from '../../utils/chat-scroll-utils'
import { useVoiceRecording } from '../../hooks/useVoiceRecording'
import {
  useGlobalHotkeys,
  formatHotkey,
  HotkeyConfig,
} from '../../hooks/useGlobalHotkeys'
import { logger } from '@/logger'

const { TextArea } = Input
const { Text } = Typography

interface ChatViewProps {
  onNavigateToView?: (view: ViewType) => void
}

export function ChatView({ onNavigateToView }: ChatViewProps): React.ReactElement {
  const {
    messages,
    status,
    streamingContent,
    isStreaming,
    currentJobContext,
    addUserMessage,
    addAssistantMessage,
    setStatus,
    setError,
  } = useConversationStore()

  const [inputValue, setInputValue] = useState('')
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const wasAtBottomRef = useRef(true)

  const isSending = status === ConversationStatus.Sending

  // Voice recording integration
  const {
    recordingState,
    isTranscribing,
    recordingDuration,
    error: voiceError,
    startRecording,
    stopRecording,
  } = useVoiceRecording({
    transcriptionPrompt: 'Task planning brainstorm conversation',
    onTranscriptionComplete: (text: string): void => {
      setInputValue((prev) => (prev ? prev + ' ' + text : text))
      logger.ui.info('Voice transcription complete', { textLength: text.length }, 'voice-transcription')
    },
    onError: (error: string): void => {
      logger.ui.error('Voice recording error', { error }, 'voice-error')
    },
  })

  // Toggle voice recording handler for hotkey
  const toggleVoiceRecording = useCallback((): void => {
    if (recordingState === 'recording') {
      stopRecording()
    } else if (!isTranscribing && !isSending) {
      startRecording()
    }
  }, [recordingState, isTranscribing, isSending, startRecording, stopRecording])

  // Global hotkey for voice recording (Ctrl+Shift+R)
  const voiceHotkey: HotkeyConfig = useMemo(() => ({
    key: 'r',
    ctrl: true,
    shift: true,
    handler: toggleVoiceRecording,
    description: 'Toggle voice recording',
  }), [toggleVoiceRecording])

  useGlobalHotkeys([voiceHotkey])

  // Track scroll position before new messages arrive
  useEffect(() => {
    const container = messagesContainerRef.current
    if (!container) return

    const handleScroll = (): void => {
      wasAtBottomRef.current = shouldAutoScroll(container)
    }

    container.addEventListener('scroll', handleScroll)
    return () => container.removeEventListener('scroll', handleScroll)
  }, [])

  // Smart auto-scroll: only scroll if user was already at bottom
  useEffect(() => {
    if (wasAtBottomRef.current && messagesContainerRef.current) {
      scrollToBottom(messagesContainerRef.current, 'smooth')
    }
  }, [messages])

  const handleSend = useCallback(async () => {
    const content = inputValue.trim()
    if (!isValidUserInput(content) || isSending) return

    // Ensure we scroll to bottom after sending
    wasAtBottomRef.current = true
    setInputValue('')
    setStatus(ConversationStatus.Sending)

    try {
      // Add user message
      await addUserMessage(content)

      // Get conversation history for context
      const conversationHistory = buildConversationHistory(messages)

      // Call AI
      const result = await sendChatMessage({
        userMessage: content,
        conversationHistory,
        jobContext: currentJobContext || undefined,
      })

      // Parse response for amendments
      const parsed = parseAIResponse(result.response)

      // Add assistant message with amendments
      await addAssistantMessage(parsed.content, parsed.amendments)

      setStatus(ConversationStatus.Idle)
    } catch (error) {
      console.error('Failed to send message:', error)
      setError(error instanceof Error ? error.message : 'Failed to send message')
    }
  }, [
    inputValue,
    isSending,
    messages,
    currentJobContext,
    addUserMessage,
    addAssistantMessage,
    setStatus,
    setError,
  ])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (shouldSendOnKeyDown(e.nativeEvent)) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
      }}
    >
      {/* Messages */}
      <div
        ref={messagesContainerRef}
        style={{
          flex: 1,
          overflow: 'auto',
          padding: '16px',
        }}
      >
        {messages.length === 0 && !isStreaming ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              color: 'var(--color-text-3)',
              textAlign: 'center',
              padding: 20,
            }}
          >
            <Text style={{ fontSize: 14 }}>
              Start a conversation by typing a message below.
            </Text>
            <Text style={{ fontSize: 12, marginTop: 8 }}>
              You can ask questions, create tasks, or manage your schedule.
            </Text>
          </div>
        ) : (
          <>
            {messages.map((message) => (
              <MessageBubble
                key={message.id as string}
                message={message}
                onNavigateToView={onNavigateToView}
              />
            ))}

            {/* Streaming content */}
            {isStreaming && streamingContent && (
              <div
                style={{
                  padding: '12px 16px',
                  background: 'var(--color-bg-2)',
                  borderRadius: 8,
                  marginBottom: 12,
                }}
              >
                <Text>{streamingContent}</Text>
                <span className="streaming-cursor" />
              </div>
            )}

            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input Area */}
      <div
        style={{
          padding: '12px 16px',
          borderTop: '1px solid var(--color-border)',
          background: 'var(--color-bg-2)',
        }}
      >
        {/* Voice recording indicator */}
        {(recordingState === 'recording' || isTranscribing) && (
          <div style={{ marginBottom: 8, color: 'var(--color-text-2)', fontSize: 12 }}>
            {isTranscribing
              ? 'Transcribing audio...'
              : `Recording: ${recordingDuration}s - Click stop when done`}
          </div>
        )}

        {/* Voice error display */}
        {voiceError && (
          <Alert type="error" content={voiceError} closable style={{ marginBottom: 8 }} />
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          <TextArea
            value={inputValue}
            onChange={setInputValue}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            autoSize={{ minRows: 1, maxRows: 4 }}
            disabled={isSending}
            style={{ flex: 1 }}
          />
          <Button
            type={recordingState === 'recording' ? 'primary' : 'default'}
            status={recordingState === 'recording' ? 'danger' : undefined}
            icon={recordingState === 'recording' ? <IconPause /> : <IconVoice />}
            onClick={toggleVoiceRecording}
            loading={isTranscribing}
            disabled={isSending}
            title={`${recordingState === 'recording' ? 'Stop recording' : 'Start voice input'} (${formatHotkey(voiceHotkey)})`}
          />
          <Button
            type="primary"
            icon={isSending ? <Spin size={16} /> : <IconSend />}
            onClick={handleSend}
            disabled={!inputValue.trim() || isSending || recordingState === 'recording'}
          />
        </div>
      </div>
    </div>
  )
}

// =============================================================================
// MessageBubble Sub-component
// =============================================================================

interface MessageBubbleProps {
  message: ChatMessageRecord
  onNavigateToView?: (view: ViewType) => void
}

function MessageBubble({ message, onNavigateToView }: MessageBubbleProps): React.ReactElement {
  const isUser = message.role === ChatMessageRole.User
  const { updateAmendmentStatus } = useConversationStore()

  const handleApplyAmendment = async (card: AmendmentCardType) => {
    // Actually apply the amendment to the database
    const result = await applyAmendments([card.amendment])

    if (result.successCount > 0) {
      // Update status to applied only if it succeeded
      await updateAmendmentStatus(message.id, card.id, 'applied')

      // Navigate to target view if specified (for visual feedback)
      if (card.preview.targetView && onNavigateToView) {
        onNavigateToView(card.preview.targetView)
      }
    } else {
      // Amendment failed - don't mark as applied
      // The applyAmendments function already shows error messages
    }
  }

  const handleSkipAmendment = async (card: AmendmentCardType) => {
    await updateAmendmentStatus(message.id, card.id, 'skipped')
  }

  return (
    <div
      style={{
        marginBottom: 16,
        display: 'flex',
        flexDirection: 'column',
        alignItems: isUser ? 'flex-end' : 'flex-start',
      }}
    >
      {/* Message content */}
      <div
        style={{
          maxWidth: '85%',
          padding: '10px 14px',
          borderRadius: isUser ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
          background: isUser ? 'var(--color-primary-light-4)' : 'var(--color-bg-3)',
          color: 'var(--color-text-1)',
        }}
      >
        {isUser ? (
          <Text style={{ whiteSpace: 'pre-wrap' }}>{message.content}</Text>
        ) : (
          <MarkdownContent content={message.content} />
        )}
      </div>

      {/* Amendment cards */}
      {message.amendments && message.amendments.length > 0 && (
        <div
          style={{
            marginTop: 8,
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          {message.amendments.map((card) => (
            <AmendmentCard
              key={card.id}
              card={card}
              onApply={() => handleApplyAmendment(card)}
              onSkip={() => handleSkipAmendment(card)}
            />
          ))}
        </div>
      )}

      {/* Timestamp */}
      <Text
        style={{
          fontSize: 11,
          color: 'var(--color-text-4)',
          marginTop: 4,
        }}
      >
        {new Date(message.createdAt).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        })}
      </Text>
    </div>
  )
}
