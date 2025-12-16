/**
 * Brainstorm Chat Component
 * Unified conversational interface for task/workflow management
 */

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import {
  Modal,
  Input,
  Button,
  Space,
  Spin,
  Alert,
  Select,
  Card,
  Tag,
} from '@arco-design/web-react'
import { IconSend, IconRobot, IconUser, IconRefresh, IconVoice, IconPause } from '@arco-design/web-react/icon'
import { useBrainstormChatStore, ChatStatus } from '../../store/useBrainstormChatStore'
import { ChatMessageRole, AmendmentType, WorkPatternOperation } from '@shared/enums'
import { useUserTaskTypeStore } from '../../store/useUserTaskTypeStore'
import { Amendment, WorkflowCreation, WorkPatternModification } from '@shared/amendment-types'
import { WorkflowAmendmentPreview } from '../shared/WorkflowAmendmentPreview'
import { sendChatMessage, generateAmendments } from '../../services/brainstorm-chat-ai'
import { applyAmendments, ApplyAmendmentsResult } from '../../utils/amendment-applicator'
import { IconCheck, IconClose } from '@arco-design/web-react/icon'
import { getDatabase } from '../../services/database'
import { JobContextData } from '../../services/chat-context-provider'
import { formatDateStringForDisplay, extractTimeFromISO } from '@shared/time-utils'
import { getBlockTypeName } from '@shared/user-task-types'
import { logger } from '@/logger'
import { useVoiceRecording } from '../../hooks/useVoiceRecording'
import { useGlobalHotkeys, formatHotkey, HotkeyConfig } from '../../hooks/useGlobalHotkeys'
import { MarkdownContent } from '../common/MarkdownContent'

const { TextArea } = Input
const { Option } = Select

// ============================================================================
// UI CONFIGURATION
// Edit these values to adjust the chat interface appearance
// ============================================================================
const CHAT_UI_CONFIG = {
  // Modal dimensions
  modal: {
    width: '80vw',
    maxWidth: 1200,
  },
  // Context selector
  contextSelector: {
    width: 300,
  },
  // Message list
  messageList: {
    height: '50vh',
    padding: 16,
  },
  // Empty state
  emptyState: {
    padding: 32,
    iconSize: 48,
    iconMarginBottom: 16,
  },
  // Message bubble
  messageBubble: {
    padding: '12px 16px',
    borderRadius: 8,
    gap: 12,
  },
  // Results modal
  resultsModal: {
    width: 600,
    maxHeight: 400,
  },
  // Tags
  tag: {
    fontSize: 14,
    padding: '4px 12px',
  },
} as const

interface BrainstormChatProps {
  visible: boolean
  onClose: () => void
}

/**
 * Job context item with ID, display name, and full data
 */
interface JobContextItem {
  id: string
  name: string
  data: JobContextData
}

export function BrainstormChat({ visible, onClose }: BrainstormChatProps): React.ReactElement {
  const {
    messages,
    status,
    currentJobContext,
    pendingAmendments,
    errorMessage,
    addMessage,
    clearMessages,
    setStatus,
    setJobContext,
    setPendingAmendments,
    clearPendingAmendments,
    setError,
    loadMessagesFromStorage,
  } = useBrainstormChatStore()

  const [inputValue, setInputValue] = useState('')
  const [jobContexts, setJobContexts] = useState<JobContextItem[]>([])
  const [selectedContextId, setSelectedContextId] = useState<string | null>(null)
  const [applyResults, setApplyResults] = useState<ApplyAmendmentsResult | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Voice recording integration - transcribed text goes to input
  const {
    recordingState,
    isTranscribing,
    recordingDuration,
    error: voiceError,
    startRecording,
    stopRecording,
  } = useVoiceRecording({
    transcriptionPrompt: 'Task planning brainstorm conversation',
    onTranscriptionComplete: (text) => {
      // Insert transcribed text into input field
      setInputValue(prev => prev ? `${prev} ${text}` : text)
      logger.ui.info('Voice transcription complete', { textLength: text.length }, 'voice-transcription')
    },
    onError: (error) => {
      setError(error)
      logger.ui.error('Voice recording error', { error }, 'voice-error')
    },
  })

  // Toggle voice recording handler for hotkey
  const toggleVoiceRecording = useCallback(() => {
    if (recordingState === 'recording') {
      stopRecording()
    } else if (!isTranscribing && status === ChatStatus.Idle) {
      startRecording()
    }
  }, [recordingState, isTranscribing, status, startRecording, stopRecording])

  // Global hotkey for voice recording (Ctrl+Shift+R)
  // Only active when modal is visible
  const voiceHotkey: HotkeyConfig = useMemo(() => ({
    key: 'r',
    ctrl: true,
    shift: true,
    handler: toggleVoiceRecording,
    description: 'Toggle voice recording',
    disabled: !visible, // Disable when modal is closed
  }), [toggleVoiceRecording, visible])

  useGlobalHotkeys([voiceHotkey])

  // Load job contexts on mount
  useEffect(() => {
    loadJobContexts()
    loadMessagesFromStorage()
  }, [])

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const loadJobContexts = async (): Promise<void> => {
    const db = getDatabase()
    const contexts = await db.getJobContexts() as any[]
    setJobContexts(
      contexts.map((ctx: any) => ({
        id: ctx.id,
        name: ctx.name,
        data: {
          name: ctx.name,
          description: ctx.description || '',
          context: ctx.context || '',
          asyncPatterns: ctx.asyncPatterns || '',
          reviewCycles: ctx.reviewCycles || '',
          tools: ctx.tools || '',
        },
      })),
    )

    // Load active context
    const activeContext = await db.getActiveJobContext() as any
    if (activeContext) {
      setSelectedContextId(activeContext.id)
      setJobContext({
        name: activeContext.name,
        description: activeContext.description || '',
        context: activeContext.context || '',
        asyncPatterns: activeContext.asyncPatterns || '',
        reviewCycles: activeContext.reviewCycles || '',
        tools: activeContext.tools || '',
      })
    }
  }

  const handleContextChange = (contextId: string): void => {
    const selectedContext = jobContexts.find(ctx => ctx.id === contextId)
    if (selectedContext) {
      setSelectedContextId(contextId)
      setJobContext(selectedContext.data)
    } else {
      setSelectedContextId(null)
      setJobContext(null)
    }
  }

  const handleSendMessage = async (): Promise<void> => {
    if (!inputValue.trim() || status !== ChatStatus.Idle) return

    const userMessage = inputValue.trim()
    setInputValue('')
    addMessage(ChatMessageRole.User, userMessage)

    setStatus(ChatStatus.Processing)

    try {
      const result = await sendChatMessage({
        userMessage,
        conversationHistory: messages.map(m => ({
          role: m.role,
          content: m.content,
        })),
        jobContext: currentJobContext || undefined,
      })

      addMessage(ChatMessageRole.Assistant, result.response, result.amendments)

      // If AI included amendments in chat mode, set them as pending
      if (result.amendments) {
        setPendingAmendments(result.amendments)
      }

      setStatus(ChatStatus.Idle)
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error))
      setStatus(ChatStatus.Idle)
    }
  }

  const handleGenerateAmendments = async (): Promise<void> => {
    setStatus(ChatStatus.GeneratingAmendments)

    try {
      const result = await generateAmendments({
        conversationHistory: messages.map(m => ({
          role: m.role,
          content: m.content,
        })),
        jobContext: currentJobContext || undefined,
        onProgress: (statusMsg) => {
          logger.ui.debug('Amendment generation progress', { statusMsg }, 'brainstorm-progress')
        },
        onRetry: (attempt, errors) => {
          logger.ui.debug('Amendment generation retry', { attempt, errors }, 'brainstorm-retry')
        },
      })

      if (result.amendments) {
        setPendingAmendments(result.amendments)
        addMessage(
          ChatMessageRole.Assistant,
          `I've generated ${result.amendments.length} amendment(s). Please review and click "Accept" to apply them, or continue chatting to refine.`,
          result.amendments,
        )
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error))
      setStatus(ChatStatus.Idle)
    }
  }

  const handleAcceptAmendments = async (): Promise<void> => {
    setStatus(ChatStatus.ApplyingAmendments)

    try {
      const results = await applyAmendments(pendingAmendments)
      setApplyResults(results)
      clearPendingAmendments()

      // Add summary message to chat
      if (results.errorCount === 0) {
        addMessage(ChatMessageRole.System, `✓ Successfully applied all ${results.successCount} amendment(s)`)
      } else if (results.successCount === 0) {
        addMessage(ChatMessageRole.System, `✗ Failed to apply all ${results.errorCount} amendment(s)`)
      } else {
        addMessage(
          ChatMessageRole.System,
          `Applied ${results.successCount} amendment(s), ${results.errorCount} failed. Click "View Details" for more info.`,
        )
      }

      setStatus(ChatStatus.Idle)
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error))
      setStatus(ChatStatus.Idle)
    }
  }

  const handleClearChat = (): void => {
    clearMessages()
    clearPendingAmendments()
    setError(null)
  }

  return (
    <Modal
      visible={visible}
      onCancel={onClose}
      title="Brainstorm Chat"
      style={{ width: CHAT_UI_CONFIG.modal.width, maxWidth: CHAT_UI_CONFIG.modal.maxWidth }}
      footer={null}
    >
      <Space direction="vertical" style={{ width: '100%' }} size="large">
        {/* Job Context Selector */}
        <Space style={{ width: '100%' }}>
          <Select
            placeholder="Select job context (optional)"
            style={{ width: CHAT_UI_CONFIG.contextSelector.width }}
            value={selectedContextId || undefined}
            onChange={handleContextChange}
            allowClear
          >
            {jobContexts.map(ctx => (
              <Option key={ctx.id} value={ctx.id}>
                {ctx.name}
              </Option>
            ))}
          </Select>
          <Button size="small" onClick={loadJobContexts} icon={<IconRefresh />}>
            Refresh
          </Button>
          <Button size="small" type="text" onClick={handleClearChat}>
            Clear Chat
          </Button>
        </Space>

        {/* Error Display */}
        {errorMessage && (
          <Alert
            type="error"
            content={errorMessage}
            closable
            onClose={() => setError(null)}
          />
        )}

        {/* Chat Messages */}
        <div
          style={{
            height: CHAT_UI_CONFIG.messageList.height,
            overflowY: 'auto',
            border: '1px solid var(--color-border)',
            borderRadius: 4,
            padding: CHAT_UI_CONFIG.messageList.padding,
            backgroundColor: 'var(--color-bg-1)',
          }}
        >
          {messages.length === 0 && (
            <div style={{ textAlign: 'center', padding: CHAT_UI_CONFIG.emptyState.padding, color: 'var(--color-text-3)' }}>
              <IconRobot style={{ fontSize: CHAT_UI_CONFIG.emptyState.iconSize, marginBottom: CHAT_UI_CONFIG.emptyState.iconMarginBottom }} />
              <div>Start a conversation to brainstorm tasks, workflows, or query your schedule</div>
            </div>
          )}

          {messages.map(message => (
            <div
              key={message.id}
              style={{
                marginBottom: 16,
                display: 'flex',
                alignItems: 'flex-start',
                gap: 12,
              }}
            >
              {/* Message Icon */}
              <div style={{ flexShrink: 0 }}>
                {message.role === ChatMessageRole.User && (
                  <IconUser style={{ fontSize: 24, color: 'var(--color-primary-light-4)' }} />
                )}
                {message.role === ChatMessageRole.Assistant && (
                  <IconRobot style={{ fontSize: 24, color: 'var(--color-success-light-4)' }} />
                )}
              </div>

              {/* Message Content */}
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-3)', marginBottom: 4 }}>
                  {message.role === ChatMessageRole.User ? 'You' : 'Assistant'} •{' '}
                  {message.timestamp.toLocaleTimeString()}
                </div>
                {/* Render markdown for assistant messages, plain text for user messages */}
                {message.role === ChatMessageRole.Assistant ? (
                  <MarkdownContent content={message.content} />
                ) : (
                  <div style={{ whiteSpace: 'pre-wrap' }}>{message.content}</div>
                )}

                {/* Amendment Preview */}
                {message.amendments && message.amendments.length > 0 && (
                  <Card
                    size="small"
                    title={`${message.amendments.length} Amendment(s)`}
                    style={{ marginTop: 12 }}
                  >
                    {message.amendments.map((amendment, idx) => (
                      <div key={idx} style={{ marginBottom: 12, paddingBottom: 8, borderBottom: idx < message.amendments!.length - 1 ? '1px solid var(--color-border-1)' : 'none' }}>
                        <Tag color="blue">{amendment.type}</Tag>
                        {amendment.type === AmendmentType.WorkflowCreation ? (
                          <WorkflowAmendmentPreview amendment={amendment as WorkflowCreation} />
                        ) : (
                          <span style={{ marginLeft: 8 }}>
                            {getAmendmentSummary(amendment)}
                          </span>
                        )}
                      </div>
                    ))}
                  </Card>
                )}
              </div>
            </div>
          ))}

          <div ref={messagesEndRef} />
        </div>

        {/* Pending Amendments Actions */}
        {pendingAmendments.length > 0 && status === ChatStatus.AwaitingReview && (
          <Space>
            <Button type="primary" onClick={handleAcceptAmendments}>
              Accept {pendingAmendments.length} Amendment(s)
            </Button>
            <Button onClick={() => clearPendingAmendments()}>
              Continue Refining
            </Button>
          </Space>
        )}

        {/* Input Area */}
        <Space direction="vertical" style={{ width: '100%' }}>
          <TextArea
            placeholder="Type your message... (e.g., 'I need to write a blog post' or 'What's my next task?')"
            value={inputValue}
            onChange={setInputValue}
            onPressEnter={(e) => {
              if (!e.shiftKey) {
                e.preventDefault()
                handleSendMessage()
              }
            }}
            disabled={status !== ChatStatus.Idle}
            autoSize={{ minRows: 2, maxRows: 6 }}
          />

          {/* Voice recording indicator */}
          {(recordingState === 'recording' || isTranscribing) && (
            <Alert
              type="info"
              content={
                isTranscribing
                  ? 'Transcribing audio...'
                  : `Recording: ${recordingDuration}s - Click stop when done`
              }
              style={{ marginBottom: 8 }}
            />
          )}

          {/* Voice error */}
          {voiceError && (
            <Alert type="error" content={voiceError} closable style={{ marginBottom: 8 }} />
          )}

          <Space>
            {/* Voice input toggle - Ctrl+Shift+R hotkey */}
            <Button
              type={recordingState === 'recording' ? 'primary' : 'default'}
              status={recordingState === 'recording' ? 'danger' : undefined}
              icon={recordingState === 'recording' ? <IconPause /> : <IconVoice />}
              onClick={toggleVoiceRecording}
              disabled={status !== ChatStatus.Idle || isTranscribing}
              loading={isTranscribing}
              title={`${recordingState === 'recording' ? 'Stop recording' : 'Start voice input'} (${formatHotkey(voiceHotkey)})`}
            >
              {recordingState === 'recording' ? 'Stop' : 'Voice'}
            </Button>

            <Button
              type="primary"
              icon={<IconSend />}
              onClick={handleSendMessage}
              disabled={!inputValue.trim() || status !== ChatStatus.Idle || recordingState === 'recording'}
              loading={status === ChatStatus.Processing}
            >
              Send
            </Button>
            <Button
              onClick={handleGenerateAmendments}
              disabled={messages.length === 0 || status !== ChatStatus.Idle}
              loading={status === ChatStatus.GeneratingAmendments}
            >
              Generate Amendments
            </Button>
          </Space>
        </Space>

        {/* Loading Indicator */}
        {status !== ChatStatus.Idle && (
          <Spin tip={getStatusMessage(status)} />
        )}
      </Space>

      {/* Results Modal */}
      <Modal
        visible={applyResults !== null}
        onCancel={() => setApplyResults(null)}
        title={
          applyResults?.errorCount === 0
            ? '✓ All Amendments Applied'
            : applyResults?.successCount === 0
              ? '✗ All Amendments Failed'
              : '⚠ Partial Success'
        }
        style={{ width: CHAT_UI_CONFIG.resultsModal.width }}
        footer={
          <Button type="primary" onClick={() => setApplyResults(null)}>
            Close
          </Button>
        }
      >
        {applyResults && (
          <Space direction="vertical" style={{ width: '100%' }} size="medium">
            {/* Summary */}
            <div style={{ display: 'flex', gap: 16, justifyContent: 'center' }}>
              <Tag color="green" style={{ fontSize: CHAT_UI_CONFIG.tag.fontSize, padding: CHAT_UI_CONFIG.tag.padding }}>
                ✓ {applyResults.successCount} Succeeded
              </Tag>
              {applyResults.errorCount > 0 && (
                <Tag color="red" style={{ fontSize: CHAT_UI_CONFIG.tag.fontSize, padding: CHAT_UI_CONFIG.tag.padding }}>
                  ✗ {applyResults.errorCount} Failed
                </Tag>
              )}
            </div>

            {/* Detailed Results */}
            <div
              style={{
                maxHeight: CHAT_UI_CONFIG.resultsModal.maxHeight,
                overflowY: 'auto',
                border: '1px solid var(--color-border)',
                borderRadius: 4,
              }}
            >
              {applyResults.results.map((result, idx) => (
                <div
                  key={idx}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 12,
                    padding: '12px 16px',
                    borderBottom:
                      idx < applyResults.results.length - 1
                        ? '1px solid var(--color-border-1)'
                        : 'none',
                    backgroundColor: result.success
                      ? 'var(--color-success-light-1)'
                      : 'var(--color-danger-light-1)',
                  }}
                >
                  <div style={{ flexShrink: 0, marginTop: 2 }}>
                    {result.success ? (
                      <IconCheck style={{ color: 'var(--color-success)' }} />
                    ) : (
                      <IconClose style={{ color: 'var(--color-danger)' }} />
                    )}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 500 }}>
                      <Tag size="small" color={result.success ? 'green' : 'red'}>
                        {result.amendment.type}
                      </Tag>
                    </div>
                    <div style={{ marginTop: 4, fontSize: 13, color: 'var(--color-text-2)' }}>
                      {result.message}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Space>
        )}
      </Modal>
    </Modal>
  )
}

/**
 * Get human-readable status message
 */
function getStatusMessage(status: ChatStatus): string {
  switch (status) {
    case ChatStatus.Processing:
      return 'Processing...'
    case ChatStatus.GeneratingAmendments:
      return 'Generating amendments...'
    case ChatStatus.ApplyingAmendments:
      return 'Applying amendments...'
    case ChatStatus.AwaitingReview:
      return 'Awaiting review'
    case ChatStatus.Idle:
      return ''
  }
}

/**
 * Get summary text for amendment
 */
function getAmendmentSummary(amendment: Amendment): string {
  switch (amendment.type) {
    case AmendmentType.TaskCreation:
      return `Create task: ${amendment.name}`
    case AmendmentType.WorkflowCreation:
      return `Create workflow: ${amendment.name} (${amendment.steps.length} steps)`
    case AmendmentType.StatusUpdate:
      return `Update ${amendment.target.name} → ${amendment.newStatus}`
    case AmendmentType.ArchiveToggle:
      return `${amendment.archive ? 'Archive' : 'Unarchive'} ${amendment.target.name}`
    case AmendmentType.TimeLog:
      return `Log ${amendment.duration}min on ${amendment.target.name}`
    case AmendmentType.NoteAddition:
      return `Add note to ${amendment.target.name}`
    case AmendmentType.DurationChange:
      return `Change ${amendment.target.name} duration to ${amendment.newDuration}min`
    case AmendmentType.StepAddition:
      return `Add step "${amendment.stepName}" to ${amendment.workflowTarget.name}`
    case AmendmentType.StepRemoval:
      return `Remove step "${amendment.stepName}" from ${amendment.workflowTarget.name}`
    case AmendmentType.DependencyChange:
      return `Update dependencies for ${amendment.target.name}`
    case AmendmentType.DeadlineChange:
      return `Set deadline for ${amendment.target.name}`
    case AmendmentType.PriorityChange:
      return `Update priority for ${amendment.target.name}`
    case AmendmentType.TypeChange:
      return `Change ${amendment.target.name} type to ${amendment.newType}`
    case AmendmentType.WorkPatternModification: {
      const mod = amendment as WorkPatternModification
      const dateStr = mod.date instanceof Date
        ? mod.date.toLocaleDateString()
        : formatDateStringForDisplay(String(mod.date))

      // Show specific operation details
      if (mod.operation === WorkPatternOperation.AddBlock && mod.blockData) {
        const start = extractTimeFromISO(mod.blockData.startTime)
        const end = extractTimeFromISO(mod.blockData.endTime)
        const typeName = getBlockTypeName(mod.blockData.type, useUserTaskTypeStore.getState().types)
        return `Add ${typeName} block ${start} - ${end} on ${dateStr}`
      }
      if (mod.operation === WorkPatternOperation.AddMeeting && mod.meetingData) {
        const start = extractTimeFromISO(mod.meetingData.startTime)
        const end = extractTimeFromISO(mod.meetingData.endTime)
        return `Add meeting "${mod.meetingData.name}" ${start} - ${end} on ${dateStr}`
      }
      if (mod.operation === WorkPatternOperation.RemoveBlock) {
        return `Remove block on ${dateStr}`
      }
      if (mod.operation === WorkPatternOperation.RemoveMeeting) {
        return `Remove meeting on ${dateStr}`
      }
      if (mod.operation === WorkPatternOperation.ModifyBlock) {
        return `Modify block on ${dateStr}`
      }
      if (mod.operation === WorkPatternOperation.ModifyMeeting) {
        return `Modify meeting on ${dateStr}`
      }
      return `Modify work pattern on ${dateStr}`
    }
    case AmendmentType.WorkSessionEdit:
      return `${amendment.operation} work session`
    case AmendmentType.QueryResponse:
      return amendment.response
    case AmendmentType.TaskTypeCreation:
      return `Create task type: ${amendment.emoji} ${amendment.name}`
  }
}
