/**
 * DeepWorkTaskNode — Custom ReactFlow node for tasks on the Deep Work Board.
 *
 * Renders a task or step as a styled card with connection handles on all 4 sides.
 * Visual state (border, fill, text) changes based on task/step status.
 * Used for both standalone tasks and workflow steps (differentiated by data).
 */

import { memo, useCallback, useState } from 'react'
import { Handle, Position } from 'reactflow'
import type { NodeProps } from 'reactflow'
import { Button, Popconfirm, Tag, Tooltip, Typography } from '@arco-design/web-react'
import { IconCheck, IconClockCircle, IconDelete, IconLock } from '@arco-design/web-react/icon'
import { DeepWorkNodeStatus } from '@shared/deep-work-board-types'
import type { DeepWorkNodeWithData } from '@shared/deep-work-board-types'
import { getTypeColor, getTypeEmoji, getTypeName } from '@shared/user-task-types'
import { formatMinutes } from '@shared/time-utils'
import { deriveDeepWorkDisplayStatus, STATUS_STYLES } from '@shared/deep-work-node-utils'
import { logger } from '@/logger'
import { useSortedUserTaskTypes } from '../../../store/useUserTaskTypeStore'
import { useDeepWorkBoardStore } from '../../../store/useDeepWorkBoardStore'
import { useTaskStore } from '../../../store/useTaskStore'

const { Text } = Typography

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
  const removeNode = useDeepWorkBoardStore((s) => s.removeNode)
  const deleteTask = useTaskStore((s) => s.deleteTask)
  const [isHovered, setIsHovered] = useState(false)

  const isActionable = actionableNodeIds.has(nodeWithData.id)
  const status = deriveDeepWorkDisplayStatus(nodeWithData, isActionable)
  const styles = STATUS_STYLES[status]

  // Get display data from either task or step
  const name = nodeWithData.task?.name ?? nodeWithData.step?.name ?? 'Untitled'
  const duration = nodeWithData.task?.duration ?? nodeWithData.step?.duration ?? 0
  const typeId = nodeWithData.task?.type ?? nodeWithData.step?.type ?? ''

  const typeColor = getTypeColor(userTypes, typeId)
  const typeEmoji = getTypeEmoji(userTypes, typeId)
  const typeName = getTypeName(userTypes, typeId)

  const isStandaloneTask = !!nodeWithData.task && !nodeWithData.step
  const showDeleteButton = isHovered && isStandaloneTask
  const borderColor = status === DeepWorkNodeStatus.Pending ? typeColor : undefined

  const handleDoubleClick = useCallback(() => {
    expandNode(nodeWithData.id)
  }, [expandNode, nodeWithData.id])

  return (
    <div
      onDoubleClick={handleDoubleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
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

      {/* Delete button (hover-only, standalone tasks only) */}
      {showDeleteButton && (
        <div style={{ position: 'absolute', top: 4, left: 4 }}>
          <Popconfirm
            title="Delete Task"
            content="This will permanently delete the task. Are you sure?"
            onOk={async () => {
              const taskId = nodeWithData.taskId
              const taskName = nodeWithData.task?.name
              logger.ui.debug('Delete task confirmed from Deep Work Board', {
                nodeId: nodeWithData.id, taskId, taskName,
              })
              try {
                if (taskId) {
                  await deleteTask(taskId)
                }
                await removeNode(nodeWithData.id)
                logger.ui.warn('Task deleted from Deep Work Board', {
                  nodeId: nodeWithData.id, taskId, taskName,
                })
              } catch (error) {
                logger.ui.error('Failed to delete task from Deep Work Board', {
                  error: error instanceof Error ? error.message : String(error),
                  nodeId: nodeWithData.id, taskId,
                })
              }
            }}
            okText="Delete"
            okButtonProps={{ status: 'danger' }}
          >
            <Tooltip content="Delete task">
              <Button
                type="text"
                size="small"
                status="danger"
                icon={<IconDelete />}
                style={{ padding: '2px 4px', minWidth: 'auto', height: 'auto' }}
              />
            </Tooltip>
          </Popconfirm>
        </div>
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
          paddingLeft: showDeleteButton ? 20 : 0,
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
