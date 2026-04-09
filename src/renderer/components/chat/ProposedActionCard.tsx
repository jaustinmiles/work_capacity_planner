/**
 * ProposedActionCard Component
 *
 * Displays a proposed write tool action from the AI agent.
 * Users can apply (approve) or skip (reject) each proposed action.
 * Follows the same visual pattern as AmendmentCard.
 */

import React, { useState } from 'react'
import { Card, Button, Tag, Typography } from '@arco-design/web-react'
import {
  IconCheck,
  IconPlus,
  IconEdit,
  IconCalendar,
  IconClockCircle,
  IconDelete,
  IconBulb,
  IconThunderbolt,
} from '@arco-design/web-react/icon'
import type { AgentProposedActionEvent } from '@shared/agent-types'
import { ProposedActionStatus } from '@shared/enums'

const { Text, Title } = Typography

interface ProposedActionCardProps {
  action: AgentProposedActionEvent
  onApprove: (proposalId: string) => Promise<void>
  onReject: (proposalId: string) => Promise<void>
}

/**
 * Get icon for a tool name
 */
function getToolIcon(toolName: string): React.ReactNode {
  switch (toolName) {
    case 'create_task':
    case 'create_workflow':
    case 'create_endeavor':
    case 'create_task_type':
      return <IconPlus />
    case 'update_task':
      return <IconEdit />
    case 'complete_task':
      return <IconCheck />
    case 'archive_task':
      return <IconDelete />
    case 'add_workflow_step':
      return <IconPlus />
    case 'log_work_session':
      return <IconClockCircle />
    case 'create_schedule':
      return <IconCalendar />
    case 'link_task_to_endeavor':
      return <IconPlus />
    case 'manage_sprint':
      return <IconThunderbolt />
    default:
      return <IconBulb />
  }
}

/**
 * Get color for a tool name
 */
function getToolColor(toolName: string): string {
  switch (toolName) {
    case 'create_task':
    case 'create_workflow':
    case 'create_endeavor':
      return 'arcoblue'
    case 'complete_task':
      return 'green'
    case 'archive_task':
      return 'gray'
    case 'create_schedule':
      return 'purple'
    case 'log_work_session':
      return 'orangered'
    case 'manage_sprint':
      return 'gold'
    default:
      return 'arcoblue'
  }
}

export function ProposedActionCard({
  action,
  onApprove,
  onReject,
}: ProposedActionCardProps): React.ReactElement {
  const [status, setStatus] = useState(ProposedActionStatus.Pending)

  const { preview, toolName, proposalId } = action

  const handleApprove = async (): Promise<void> => {
    setStatus(ProposedActionStatus.Applying)
    try {
      await onApprove(proposalId)
      setStatus(ProposedActionStatus.Applied)
    } catch {
      setStatus(ProposedActionStatus.Error)
    }
  }

  const handleReject = async (): Promise<void> => {
    try {
      await onReject(proposalId)
      setStatus(ProposedActionStatus.Rejected)
    } catch {
      // Still mark as rejected locally even if the server call fails
      setStatus(ProposedActionStatus.Rejected)
    }
  }

  const isPending = status === ProposedActionStatus.Pending
  const isApplied = status === ProposedActionStatus.Applied
  const isRejected = status === ProposedActionStatus.Rejected
  const isApplying = status === ProposedActionStatus.Applying
  const color = getToolColor(toolName)

  return (
    <Card
      size="small"
      style={{
        borderRadius: 8,
        borderLeft: `3px solid var(--color-${color}-6)`,
        border: `1px solid ${
          isApplied
            ? 'var(--color-success-light-4)'
            : isRejected
            ? 'var(--color-border-2)'
            : `var(--color-${color}-3)`
        }`,
        borderLeftWidth: 3,
        borderLeftColor: `var(--color-${color}-6)`,
        background: isApplied
          ? 'var(--color-success-light-1)'
          : isRejected
          ? 'var(--color-fill-2)'
          : 'var(--color-bg-1)',
        opacity: isRejected ? 0.7 : 1,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 8,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Tag
            size="small"
            color={color}
            style={{ fontSize: 10, padding: '0 4px', lineHeight: '18px' }}
          >
            AGENT
          </Tag>
          <span style={{ color: `var(--color-${color}-6)` }}>
            {getToolIcon(toolName)}
          </span>
          <Title heading={6} style={{ margin: 0, fontSize: 14 }}>
            {preview.title}
          </Title>
        </div>

        {isApplied && (
          <Tag color="green" size="small">
            <IconCheck /> Applied
          </Tag>
        )}
        {isRejected && (
          <Tag color="gray" size="small">
            Skipped
          </Tag>
        )}
        {status === ProposedActionStatus.Error && (
          <Tag color="red" size="small">
            Error
          </Tag>
        )}
        {status === ProposedActionStatus.Timeout && (
          <Tag color="orangered" size="small">
            Timed Out
          </Tag>
        )}
      </div>

      {/* Preview description */}
      <Text style={{ color: 'var(--color-text-2)', fontSize: 13 }}>
        {preview.description}
      </Text>

      {/* Action buttons */}
      {isPending && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 8,
            marginTop: 12,
          }}
        >
          <Button
            size="small"
            onClick={handleReject}
            disabled={isApplying}
          >
            Skip
          </Button>
          <Button
            type="primary"
            size="small"
            icon={<IconCheck />}
            onClick={handleApprove}
            loading={isApplying}
          >
            Apply
          </Button>
        </div>
      )}
    </Card>
  )
}
