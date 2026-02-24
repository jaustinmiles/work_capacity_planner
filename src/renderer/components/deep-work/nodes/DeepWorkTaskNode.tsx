/**
 * DeepWorkTaskNode — Custom ReactFlow node for tasks on the Deep Work Board.
 *
 * Renders a task or step as a styled card with connection handles on all 4 sides.
 * Visual state (border, fill, text) changes based on task/step status.
 * Used for both standalone tasks and workflow steps (differentiated by data).
 */

import { memo, useCallback } from 'react'
import { Handle, Position } from 'reactflow'
import type { NodeProps } from 'reactflow'
import { Tag, Typography } from '@arco-design/web-react'
import { IconCheck, IconLock, IconClockCircle } from '@arco-design/web-react/icon'
import { StepStatus } from '@shared/enums'
import { DeepWorkNodeStatus } from '@shared/deep-work-board-types'
import type { DeepWorkNodeWithData } from '@shared/deep-work-board-types'
import { getTypeColor, getTypeEmoji, getTypeName } from '@shared/user-task-types'
import { formatMinutes } from '@shared/time-utils'
import { useSortedUserTaskTypes } from '../../../store/useUserTaskTypeStore'
import { useDeepWorkBoardStore } from '../../../store/useDeepWorkBoardStore'

const { Text } = Typography

// =============================================================================
// Status Derivation
// =============================================================================

function deriveNodeStatus(node: DeepWorkNodeWithData, isActionable: boolean): DeepWorkNodeStatus {
  if (node.task && !node.task.hasSteps) {
    // Standalone task
    if (node.task.completed) return DeepWorkNodeStatus.Completed
    // Check if there's an active work session (TODO: wire to useTaskStore in Phase 5)
    if (!isActionable) return DeepWorkNodeStatus.Blocked
    return DeepWorkNodeStatus.Pending
  }

  if (node.step) {
    switch (node.step.status) {
      case StepStatus.Completed:
      case StepStatus.Skipped:
        return DeepWorkNodeStatus.Completed
      case StepStatus.InProgress:
        return DeepWorkNodeStatus.Active
      case StepStatus.Waiting:
        return DeepWorkNodeStatus.Waiting
      case StepStatus.Pending:
      default:
        return isActionable ? DeepWorkNodeStatus.Pending : DeepWorkNodeStatus.Blocked
    }
  }

  return DeepWorkNodeStatus.Pending
}

// =============================================================================
// Styles
// =============================================================================

const STATUS_STYLES: Record<DeepWorkNodeStatus, {
  border: string
  borderStyle: string
  background: string
  textDecoration: string
  opacity: number
}> = {
  [DeepWorkNodeStatus.Pending]: {
    border: '2px solid',
    borderStyle: 'solid',
    background: '#ffffff',
    textDecoration: 'none',
    opacity: 1,
  },
  [DeepWorkNodeStatus.Active]: {
    border: '2px solid #00b42a',
    borderStyle: 'solid',
    background: '#f0fff0',
    textDecoration: 'none',
    opacity: 1,
  },
  [DeepWorkNodeStatus.Waiting]: {
    border: '2px dashed #ff7d00',
    borderStyle: 'dashed',
    background: '#fff7e6',
    textDecoration: 'none',
    opacity: 1,
  },
  [DeepWorkNodeStatus.Completed]: {
    border: '2px solid #c9cdd4',
    borderStyle: 'solid',
    background: '#f7f8fa',
    textDecoration: 'line-through',
    opacity: 0.6,
  },
  [DeepWorkNodeStatus.Blocked]: {
    border: '2px dashed #f53f3f',
    borderStyle: 'dashed',
    background: '#fff2f0',
    textDecoration: 'none',
    opacity: 0.8,
  },
}

// =============================================================================
// Component
// =============================================================================

export interface DeepWorkTaskNodeData {
  nodeWithData: DeepWorkNodeWithData
}

function DeepWorkTaskNodeInner({ data, selected }: NodeProps<DeepWorkTaskNodeData>) {
  const { nodeWithData } = data
  const userTypes = useSortedUserTaskTypes()
  const actionableNodeIds = useDeepWorkBoardStore((s) => s.actionableNodeIds)
  const expandNode = useDeepWorkBoardStore((s) => s.expandNode)

  const isActionable = actionableNodeIds.has(nodeWithData.id)
  const status = deriveNodeStatus(nodeWithData, isActionable)
  const styles = STATUS_STYLES[status]

  // Get display data from either task or step
  const name = nodeWithData.task?.name ?? nodeWithData.step?.name ?? 'Untitled'
  const duration = nodeWithData.task?.duration ?? nodeWithData.step?.duration ?? 0
  const typeId = nodeWithData.task?.type ?? nodeWithData.step?.type ?? ''

  const typeColor = getTypeColor(userTypes, typeId)
  const typeEmoji = getTypeEmoji(userTypes, typeId)
  const typeName = getTypeName(userTypes, typeId)

  const borderColor = status === DeepWorkNodeStatus.Pending ? typeColor : undefined

  const handleDoubleClick = useCallback(() => {
    expandNode(nodeWithData.id)
  }, [expandNode, nodeWithData.id])

  return (
    <div
      onDoubleClick={handleDoubleClick}
      style={{
        padding: '10px 14px',
        borderRadius: 8,
        border: styles.border,
        borderStyle: styles.borderStyle,
        borderColor: borderColor ?? undefined,
        background: styles.background,
        opacity: styles.opacity,
        minWidth: 180,
        maxWidth: 260,
        boxShadow: selected
          ? '0 0 0 2px #165DFF'
          : status === DeepWorkNodeStatus.Active
            ? '0 0 12px rgba(0, 180, 42, 0.4)'
            : '0 1px 4px rgba(0, 0, 0, 0.08)',
        cursor: 'grab',
        transition: 'box-shadow 0.2s, opacity 0.2s',
        position: 'relative',
      }}
    >
      {/* Connection handles */}
      <Handle type="target" position={Position.Top} style={handleStyle} />
      <Handle type="target" position={Position.Left} style={handleStyle} />
      <Handle type="source" position={Position.Bottom} style={handleStyle} />
      <Handle type="source" position={Position.Right} style={handleStyle} />

      {/* Status icon in top-right */}
      {status === DeepWorkNodeStatus.Completed && (
        <IconCheck style={{ position: 'absolute', top: 6, right: 8, color: '#86909c', fontSize: 14 }} />
      )}
      {status === DeepWorkNodeStatus.Blocked && (
        <IconLock style={{ position: 'absolute', top: 6, right: 8, color: '#f53f3f', fontSize: 14 }} />
      )}
      {status === DeepWorkNodeStatus.Waiting && (
        <IconClockCircle style={{ position: 'absolute', top: 6, right: 8, color: '#ff7d00', fontSize: 14 }} />
      )}

      {/* Task name */}
      <Text
        style={{
          display: 'block',
          fontWeight: status === DeepWorkNodeStatus.Active ? 600 : 500,
          fontSize: 13,
          lineHeight: '18px',
          textDecoration: styles.textDecoration,
          color: status === DeepWorkNodeStatus.Completed ? '#86909c' : '#1d2129',
          marginBottom: 6,
          paddingRight: 20,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {name}
      </Text>

      {/* Metadata row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        {/* Type tag */}
        {typeId && (
          <Tag
            size="small"
            style={{
              backgroundColor: `${typeColor}20`,
              color: typeColor,
              border: `1px solid ${typeColor}40`,
              fontSize: 11,
              lineHeight: '16px',
              padding: '0 4px',
            }}
          >
            {typeEmoji} {typeName}
          </Tag>
        )}

        {/* Duration badge */}
        {duration > 0 && (
          <Text style={{ fontSize: 11, color: '#86909c' }}>
            {formatMinutes(duration)}
          </Text>
        )}

        {/* Step indicator */}
        {nodeWithData.step && (
          <Text style={{ fontSize: 10, color: '#c9cdd4' }}>
            Step
          </Text>
        )}
      </div>
    </div>
  )
}

const handleStyle: React.CSSProperties = {
  width: 8,
  height: 8,
  background: '#c9cdd4',
  border: '2px solid #fff',
  borderRadius: '50%',
}

export const DeepWorkTaskNode = memo(DeepWorkTaskNodeInner)
