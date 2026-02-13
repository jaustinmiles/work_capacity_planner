/**
 * TaskStepGraphNode - Custom ReactFlow node for workflow steps and simple tasks
 *
 * Displays title, duration, type with emoji/color.
 * Based on the WorkflowNode pattern from InteractiveWorkflowGraph.tsx.
 */

import React from 'react'
import { Tag, Space, Typography } from '@arco-design/web-react'
import { Handle, Position } from 'reactflow'
import type { NodeProps } from 'reactflow'
import type { UserTaskType } from '@shared/user-task-types'
import { getTypeColor } from '@shared/user-task-types'
import { hexToRgba } from './graph-layout-utils'

const { Text } = Typography

interface TaskStepData {
  label: string
  duration: number
  type: string
  status: string
  stepIndex: number
  taskId: string
  taskName: string
  endeavorId: string
  isSimpleTask?: boolean
  userTypes: UserTaskType[]
  isEditable?: boolean
  isOnCriticalPath?: boolean
}

function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  if (hours > 0) {
    return `${hours}h${mins > 0 ? ` ${mins}m` : ''}`
  }
  return `${mins}m`
}

export const TaskStepGraphNode = React.memo(({ data }: NodeProps<TaskStepData>) => {
  const userTypes = data.userTypes ?? []
  const userType = userTypes.find(t => t.id === data.type)
  const typeColor = userType?.color || getTypeColor(userTypes, data.type) || '#165DFF'
  const typeName = userType?.name || data.type || 'Task'
  const typeEmoji = userType?.emoji || ''

  const isCompleted = data.status === 'completed' || data.status === 'skipped'
  const isCritical = data.isOnCriticalPath && !isCompleted
  const bgColor = isCompleted ? '#F5F5F5' : hexToRgba(typeColor, 0.1)
  const borderColor = isCompleted ? '#BFBFBF' : isCritical ? '#FAAD14' : typeColor

  return (
    <div
      style={{
        background: bgColor,
        border: `2px solid ${borderColor}`,
        opacity: isCompleted ? 0.7 : 1,
        borderRadius: 8,
        padding: '10px 14px',
        minWidth: 180,
        maxWidth: 220,
        boxShadow: isCritical ? '0 0 10px rgba(250, 173, 20, 0.5)' : 'none',
        transition: 'box-shadow 0.3s, border-color 0.3s',
      }}
    >
      <Handle
        type="target"
        position={Position.Left}
        style={{
          background: '#86909c',
          width: 8,
          height: 8,
          visibility: data.isEditable ? 'visible' : 'hidden',
          pointerEvents: data.isEditable ? 'auto' : 'none',
        }}
      />

      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 4 }}>
        {data.stepIndex >= 0 && (
          <div
            style={{
              background: isCompleted ? '#8C8C8C' : typeColor,
              color: 'white',
              borderRadius: '50%',
              width: 22,
              height: 22,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 'bold',
              fontSize: 11,
              marginRight: 8,
              flexShrink: 0,
            }}
          >
            {data.stepIndex + 1}
          </div>
        )}
        <Text
          ellipsis
          style={{ fontWeight: 600, fontSize: 12, flex: 1, lineHeight: '16px' }}
        >
          {data.label}
        </Text>
      </div>

      <Space size={4} style={{ flexWrap: 'wrap' }}>
        <Text type="secondary" style={{ fontSize: 11 }}>
          {formatDuration(data.duration)}
        </Text>
        <Tag size="small" color={isCompleted ? 'gray' : typeColor} style={{ fontSize: 10 }}>
          {typeEmoji && `${typeEmoji} `}{typeName}
        </Tag>
      </Space>

      <Handle
        type="source"
        position={Position.Right}
        style={{
          background: '#86909c',
          width: 8,
          height: 8,
          visibility: data.isEditable ? 'visible' : 'hidden',
          pointerEvents: data.isEditable ? 'auto' : 'none',
        }}
      />
    </div>
  )
})

TaskStepGraphNode.displayName = 'TaskStepGraphNode'
