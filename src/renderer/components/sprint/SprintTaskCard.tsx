/**
 * SprintTaskCard
 *
 * Compact draggable card for Kanban columns.
 * Shows task name, type indicator, and duration estimate.
 */

import React from 'react'
import { useDraggable } from '@dnd-kit/core'
import { Card, Typography, Space, Tag } from '@arco-design/web-react'
import { IconDragDotVertical, IconClockCircle, IconBranch } from '@arco-design/web-react/icon'
import type { Task } from '@shared/types'
import { useSortedUserTaskTypes } from '../../store/useUserTaskTypeStore'

const { Text } = Typography

interface SprintTaskCardProps {
  task: Task
  isDragging?: boolean
}

export function SprintTaskCard({ task, isDragging = false }: SprintTaskCardProps): React.ReactElement {
  const userTypes = useSortedUserTaskTypes()

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
  } = useDraggable({ id: task.id })

  const style: React.CSSProperties = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    opacity: isDragging ? 0.5 : 1,
  }

  // Find the user task type for display
  const taskType = userTypes.find(t => t.id === task.type)
  const typeEmoji = taskType?.emoji || ''
  const typeName = taskType?.name || task.type

  // Format duration for display
  const formatDuration = (minutes: number): string => {
    if (minutes < 60) return `${minutes}m`
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`
  }

  // Priority color based on importance × urgency
  const priorityScore = task.importance * task.urgency
  const priorityColor = priorityScore >= 64 ? '#F53F3F' :
    priorityScore >= 36 ? '#FF7D00' :
    '#00B42A'

  return (
    <div ref={setNodeRef} style={style}>
      <Card
        size="small"
        style={{
          marginBottom: 8,
          cursor: 'grab',
          borderLeft: `3px solid ${priorityColor}`,
          background: isDragging ? '#F7F8FA' : '#FFFFFF',
        }}
        bodyStyle={{ padding: '10px 12px' }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          {/* Drag handle */}
          <div
            {...attributes}
            {...listeners}
            style={{
              cursor: 'grab',
              color: '#C9CDD4',
              display: 'flex',
              alignItems: 'center',
              paddingTop: 2,
            }}
          >
            <IconDragDotVertical />
          </div>

          {/* Card content */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Task name */}
            <Text
              style={{
                display: 'block',
                fontWeight: 500,
                marginBottom: 6,
                lineHeight: 1.4,
              }}
              ellipsis={{ rows: 2 }}
            >
              {task.name}
            </Text>

            {/* Meta info row */}
            <Space size={8} style={{ flexWrap: 'wrap' }}>
              {/* Type indicator */}
              <Tag size="small" style={{ margin: 0 }}>
                {typeEmoji && <span style={{ marginRight: 4 }}>{typeEmoji}</span>}
                {typeName}
              </Tag>

              {/* Duration */}
              <Text type="secondary" style={{ fontSize: 12 }}>
                <IconClockCircle style={{ marginRight: 4 }} />
                {formatDuration(task.duration)}
              </Text>

              {/* Workflow indicator */}
              {task.hasSteps && (
                <Text type="secondary" style={{ fontSize: 12 }}>
                  <IconBranch style={{ marginRight: 4 }} />
                  Workflow
                </Text>
              )}
            </Space>
          </div>
        </div>
      </Card>
    </div>
  )
}
