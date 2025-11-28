/**
 * Brainstorm Chat Component
 * Unified conversational interface for task/workflow management
 */

import React, { useState, useEffect, useRef } from 'react'
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
import { IconSend, IconRobot, IconUser, IconRefresh } from '@arco-design/web-react/icon'
import { useBrainstormChatStore, ChatStatus } from '../../store/useBrainstormChatStore'
import { ChatMessageRole, AmendmentType } from '@shared/enums'
import { Amendment, WorkflowCreation } from '@shared/amendment-types'
import { WorkflowAmendmentPreview } from '../shared/WorkflowAmendmentPreview'
import { sendChatMessage, generateAmendments } from '../../services/brainstorm-chat-ai'
import { applyAmendments, ApplyAmendmentsResult } from '../../utils/amendment-applicator'
import { IconCheck, IconClose } from '@arco-design/web-react/icon'
import { getDatabase } from '../../services/database'
import { JobContextData } from '../../services/chat-context-provider'
import { formatDateStringForDisplay } from '@shared/time-utils'
import { logger } from '@/logger'

const { TextArea } = Input
const { Option } = Select

interface BrainstormChatProps {
  visible: boolean
  onClose: () => void
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
  const [jobContexts, setJobContexts] = useState<Array<{ id: string; name: string; data: JobContextData }>>([])
  const [selectedContextId, setSelectedContextId] = useState<string | null>(null)
  const [applyResults, setApplyResults] = useState<ApplyAmendmentsResult | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

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
    const contexts = await db.getJobContexts()
    setJobContexts(
      contexts.map(ctx => ({
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
    const activeContext = await db.getActiveJobContext()
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
      style={{ width: '80vw', maxWidth: 1200 }}
      footer={null}
    >
      <Space direction="vertical" style={{ width: '100%' }} size="large">
        {/* Job Context Selector */}
        <Space style={{ width: '100%' }}>
          <Select
            placeholder="Select job context (optional)"
            style={{ width: 300 }}
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
            height: '50vh',
            overflowY: 'auto',
            border: '1px solid var(--color-border)',
            borderRadius: 4,
            padding: 16,
            backgroundColor: 'var(--color-bg-1)',
          }}
        >
          {messages.length === 0 && (
            <div style={{ textAlign: 'center', padding: 32, color: 'var(--color-text-3)' }}>
              <IconRobot style={{ fontSize: 48, marginBottom: 16 }} />
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
                <div style={{ whiteSpace: 'pre-wrap' }}>{message.content}</div>

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

          <Space>
            <Button
              type="primary"
              icon={<IconSend />}
              onClick={handleSendMessage}
              disabled={!inputValue.trim() || status !== ChatStatus.Idle}
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
        style={{ width: 600 }}
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
              <Tag color="green" style={{ fontSize: 14, padding: '4px 12px' }}>
                ✓ {applyResults.successCount} Succeeded
              </Tag>
              {applyResults.errorCount > 0 && (
                <Tag color="red" style={{ fontSize: 14, padding: '4px 12px' }}>
                  ✗ {applyResults.errorCount} Failed
                </Tag>
              )}
            </div>

            {/* Detailed Results */}
            <div
              style={{
                maxHeight: 400,
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
    case AmendmentType.WorkPatternModification:
      return `Modify work pattern for ${amendment.date instanceof Date ? amendment.date.toLocaleDateString() : formatDateStringForDisplay(amendment.date)}`
    case AmendmentType.WorkSessionEdit:
      return `${amendment.operation} work session`
    case AmendmentType.QueryResponse:
      return amendment.response
  }
}
