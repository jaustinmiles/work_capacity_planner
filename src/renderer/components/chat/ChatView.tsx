/**
 * ChatView Component
 *
 * Displays the message list and input area for an active conversation.
 * Handles message rendering, streaming content, and amendment cards.
 */

import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react'
import { Input, Button, Spin, Typography, Alert, Switch, Tag } from '@arco-design/web-react'
import { IconSend, IconVoice, IconPause, IconRobot } from '@arco-design/web-react/icon'
import { useConversationStore, ConversationStatus } from '../../store/useConversationStore'
import { useTaskStore } from '../../store/useTaskStore'
import { ChatMessageRecord, AmendmentCard as AmendmentCardType } from '@shared/conversation-types'
import { ChatMessageRole, ViewType, ToolExecutionStatus } from '@shared/enums'
import { AmendmentCard } from './AmendmentCard'
import { ProposedActionCard } from './ProposedActionCard'
import { ToolStatusIndicator } from './ToolStatusIndicator'
import { sendChatMessage } from '../../services/brainstorm-chat-ai'
import {
  sendAgentMessage,
  approveAgentAction,
  rejectAgentAction,
} from '../../services/agent-stream-handler'
import { generatePreview } from '../../services/chat-response-parser'
import { generateUniqueId } from '@shared/step-id-utils'
import { AmendmentCard as AmendmentCardData } from '@shared/conversation-types'
import { AmendmentCardStatus } from '@shared/enums'
import { MarkdownContent } from '../common/MarkdownContent'
import { applyAmendments } from '../../utils/amendment-applicator'
import {
  buildConversationHistory,
  isValidUserInput,
  shouldSendOnKeyDown,
} from '../../utils/chat-message-utils'
import { shouldAutoScroll, scrollToBottom } from '../../utils/chat-scroll-utils'
import { ScrollBehavior } from '@shared/enums'
import { useVoiceRecording } from '../../hooks/useVoiceRecording'
import {
  useGlobalHotkeys,
  formatHotkey,
  HotkeyConfig,
} from '../../hooks/useGlobalHotkeys'
import { logger } from '@/logger'

const { TextArea } = Input
const { Text } = Typography

// =============================================================================
// Hotkey Configuration
// =============================================================================

/** Voice recording hotkey: Ctrl+Shift+R */
const VOICE_HOTKEY_CONFIG = {
  key: 'r',
  ctrl: true,
  shift: true,
  description: 'Toggle voice recording',
} as const

// =============================================================================
// Component
// =============================================================================

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
    isAgentMode,
    setAgentMode,
    pendingActions,
    activeToolStatuses,
    addPendingAction,
    removePendingAction,
    appendStreamingContent,
    setStreamingContent,
    setActiveToolStatus,
    clearActiveToolStatus,
    clearAgentState,
    activeConversationId,
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

  // Global hotkey for voice recording - uses config from top of file
  const voiceHotkey: HotkeyConfig = useMemo(() => ({
    ...VOICE_HOTKEY_CONFIG,
    handler: toggleVoiceRecording,
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
      scrollToBottom(messagesContainerRef.current, ScrollBehavior.Smooth)
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

      // Convert amendments from result to AmendmentCard format
      // sendChatMessage extracts and validates amendments from AI response
      const amendments: AmendmentCardData[] = (result.amendments || []).map((amendment) => ({
        id: generateUniqueId('amend'),
        amendment,
        status: AmendmentCardStatus.Pending,
        preview: generatePreview(amendment),
      }))

      // Clean up any remaining empty amendment tags from the response
      const responseContent = result.response.replace(/<amendments>\s*<\/amendments>/gi, '').trim()

      if (amendments.length > 0) {
        logger.ui.info('Extracted amendments from response', {
          count: amendments.length,
        }, 'amendment-extraction')
      }

      // Add assistant message with amendments
      await addAssistantMessage(responseContent, amendments)

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

  // Agent mode send handler
  // The SERVER handles all DB persistence for agent mode (user message + assistant message).
  // The client only manages local UI state (streaming text, pending cards, tool indicators).
  // On completion, we reload messages from DB to get canonical state.
  const handleAgentSend = useCallback(async () => {
    const content = inputValue.trim()
    if (!isValidUserInput(content) || isSending || !activeConversationId) return

    wasAtBottomRef.current = true
    setInputValue('')
    setStatus(ConversationStatus.Sending)
    clearAgentState()

    try {
      // Add user message to LOCAL state only — server saves to DB
      const { messages: currentMessages } = useConversationStore.getState()
      useConversationStore.setState({
        messages: [
          ...currentMessages,
          {
            id: `pending-${Date.now()}` as any,
            conversationId: activeConversationId,
            role: ChatMessageRole.User,
            content,
            amendments: null,
            createdAt: new Date(),
          },
        ],
      })

      // Start SSE connection to agent
      setStreamingContent('')
      const controller = sendAgentMessage(
        content,
        activeConversationId as string,
        {
          onTextDelta: (text) => {
            appendStreamingContent(text)
          },
          onToolStatus: (event) => {
            if (event.status === ToolExecutionStatus.Executing) {
              setActiveToolStatus(event.toolCallId, event.toolName, event.label)
            } else {
              clearActiveToolStatus(event.toolCallId)
            }
          },
          onProposedAction: (event) => {
            addPendingAction(event)
          },
          onActionResult: (event) => {
            removePendingAction(event.proposalId)
          },
          onDone: (toolCallCount) => {
            // Reload conversation messages from DB
            const { selectConversation } = useConversationStore.getState()
            selectConversation(activeConversationId)
            // Agent operates server-side — if it made tool calls, the DB has
            // changed independently of client stores. Reload to sync.
            if (toolCallCount > 0) {
              useTaskStore.getState().refreshAllData()
            }
            clearAgentState()
            setStatus(ConversationStatus.Idle)
          },
          onError: (message) => {
            // Still reload — server may have partially saved
            const { selectConversation } = useConversationStore.getState()
            selectConversation(activeConversationId)
            useTaskStore.getState().refreshAllData()
            setError(message)
            clearAgentState()
          },
        },
      )

      // Controller available for potential cancellation in future
      void controller
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to send message')
      clearAgentState()
    }
  }, [
    inputValue,
    isSending,
    activeConversationId,
    setStatus,
    setError,
    clearAgentState,
    setStreamingContent,
    appendStreamingContent,
    setActiveToolStatus,
    clearActiveToolStatus,
    addPendingAction,
    removePendingAction,
  ])

  // Route to appropriate send handler based on mode
  const handleSendMessage = isAgentMode ? handleAgentSend : handleSend

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (shouldSendOnKeyDown(e.nativeEvent)) {
      e.preventDefault()
      handleSendMessage()
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
      {/* Agent mode toggle */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          padding: '6px 16px',
          borderBottom: '1px solid var(--color-border)',
          gap: 8,
          fontSize: 12,
          color: 'var(--color-text-3)',
        }}
      >
        <IconRobot style={{ fontSize: 14 }} />
        <span>Agent</span>
        <Switch
          size="small"
          checked={isAgentMode}
          onChange={setAgentMode}
        />
      </div>

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
                {isAgentMode ? (
                  <MarkdownContent content={streamingContent} />
                ) : (
                  <Text>{streamingContent}</Text>
                )}
                <span className="streaming-cursor" />
              </div>
            )}

            {/* Agent: tool status indicators */}
            {isAgentMode && activeToolStatuses.length > 0 && (
              <ToolStatusIndicator statuses={activeToolStatuses} />
            )}

            {/* Agent: pending action cards */}
            {isAgentMode && pendingActions.map((action) => (
              <div key={action.proposalId} style={{ marginBottom: 8 }}>
                <ProposedActionCard
                  action={action}
                  onApprove={async (proposalId) => {
                    await approveAgentAction(proposalId)
                  }}
                  onReject={async (proposalId) => {
                    await rejectAgentAction(proposalId)
                  }}
                />
              </div>
            ))}

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
            onClick={handleSendMessage}
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
      await updateAmendmentStatus(message.id, card.id, AmendmentCardStatus.Applied)

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
    await updateAmendmentStatus(message.id, card.id, AmendmentCardStatus.Skipped)
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

      {/* Amendment cards (legacy) or agent tool call summaries */}
      {message.amendments && Array.isArray(message.amendments) && message.amendments.length > 0 && (
        <div
          style={{
            marginTop: 8,
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          {message.amendments.map((card, index) => {
            // StoredToolCall objects (from agent mode) have toolName but no amendment
            if (!card.amendment) {
              const toolCall = card as unknown as Record<string, unknown>
              if (!toolCall.toolName) return null

              const isWrite = toolCall.category === 'write'
              const wasApproved = toolCall.approvalStatus === 'approved'
              const statusColor = wasApproved ? 'green' : toolCall.approvalStatus === 'rejected' ? 'gray' : 'arcoblue'
              const statusLabel = isWrite
                ? (wasApproved ? 'Applied' : toolCall.approvalStatus === 'rejected' ? 'Skipped' : 'Read')
                : 'Read'

              return (
                <div
                  key={toolCall.toolCallId as string || `tool-${index}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '4px 10px',
                    borderRadius: 6,
                    background: 'var(--color-fill-1)',
                    fontSize: 12,
                    color: 'var(--color-text-3)',
                    borderLeft: `3px solid var(--color-${statusColor}-6)`,
                  }}
                >
                  <Tag size="small" color={statusColor} style={{ fontSize: 10 }}>
                    {statusLabel}
                  </Tag>
                  <span style={{ fontFamily: 'monospace' }}>
                    {(toolCall.toolName as string).replace(/_/g, ' ')}
                  </span>
                </div>
              )
            }

            return (
              <AmendmentCard
                key={card.id || `amendment-${index}`}
                card={card}
                onApply={() => handleApplyAmendment(card)}
                onSkip={() => handleSkipAmendment(card)}
              />
            )
          })}
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
