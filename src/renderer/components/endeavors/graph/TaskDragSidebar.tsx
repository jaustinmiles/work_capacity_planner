/**
 * TaskDragSidebar - Collapsible sidebar for dragging tasks/workflows onto endeavor regions
 *
 * Displays all non-archived tasks that are not yet assigned to any visible endeavor.
 * Users drag items from here and drop them onto endeavor region nodes in the graph.
 */

import { useState, useMemo } from 'react'
import { Card, Typography, Input, Space, Tag, Badge, Empty } from '@arco-design/web-react'
import { IconLeft, IconRight, IconSearch, IconBranch } from '@arco-design/web-react/icon'
import type { Task } from '@shared/types'
import type { EndeavorWithTasks } from '@shared/types'
import type { UserTaskType } from '@shared/user-task-types'
import { getTypeColor, getTypeEmoji, getTypeName } from '@shared/user-task-types'
import { formatMinutes } from '@shared/time-utils'
import { useTaskStore } from '../../../store/useTaskStore'

const { Text } = Typography

/** Data transferred during drag */
export const DRAG_DATA_TYPE = 'application/x-endeavor-task'

interface TaskDragSidebarProps {
  endeavors: EndeavorWithTasks[]
  userTypes: UserTaskType[]
}

export function TaskDragSidebar({ endeavors, userTypes }: TaskDragSidebarProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [searchText, setSearchText] = useState('')
  const { tasks } = useTaskStore()

  // Collect all task IDs already assigned to visible endeavors
  const assignedTaskIds = useMemo(() => {
    const ids = new Set<string>()
    for (const endeavor of endeavors) {
      for (const item of endeavor.items) {
        ids.add(item.taskId)
      }
    }
    return ids
  }, [endeavors])

  // Available tasks: non-archived, not already in a visible endeavor
  const availableTasks = useMemo(() => {
    const filtered = tasks.filter(
      (task: Task) => !task.archived && !task.completed && !assignedTaskIds.has(task.id),
    )

    if (searchText.trim()) {
      const lower = searchText.toLowerCase()
      return filtered.filter((task: Task) => task.name.toLowerCase().includes(lower))
    }

    return filtered
  }, [tasks, assignedTaskIds, searchText])

  // Separate workflows (hasSteps) from simple tasks
  const workflows = useMemo(
    () => availableTasks.filter((t: Task) => t.hasSteps),
    [availableTasks],
  )
  const simpleTasks = useMemo(
    () => availableTasks.filter((t: Task) => !t.hasSteps),
    [availableTasks],
  )

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, taskId: string): void => {
    e.dataTransfer.setData(DRAG_DATA_TYPE, taskId)
    e.dataTransfer.effectAllowed = 'copy'
  }

  if (collapsed) {
    return (
      <div
        style={{
          position: 'absolute',
          top: 16,
          left: 16,
          zIndex: 10,
        }}
      >
        <Card
          size="small"
          style={{
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.12)',
            borderRadius: 8,
            cursor: 'pointer',
            width: 40,
            height: 40,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          bodyStyle={{ padding: 8 }}
          onClick={() => setCollapsed(false)}
        >
          <Badge count={availableTasks.length} maxCount={99} dotStyle={{ fontSize: 10 }}>
            <IconRight style={{ fontSize: 16 }} />
          </Badge>
        </Card>
      </div>
    )
  }

  return (
    <div
      style={{
        position: 'absolute',
        top: 16,
        left: 16,
        bottom: 16,
        width: 260,
        zIndex: 10,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <Card
        size="small"
        style={{
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.12)',
          borderRadius: 8,
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
        }}
        bodyStyle={{
          padding: '8px 12px',
          flex: 1,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
        title={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ fontSize: 12, fontWeight: 600 }}>
              Tasks & Workflows
            </Text>
            <IconLeft
              style={{ fontSize: 14, cursor: 'pointer' }}
              onClick={() => setCollapsed(true)}
            />
          </div>
        }
      >
        <Input
          size="small"
          placeholder="Search..."
          prefix={<IconSearch />}
          value={searchText}
          onChange={setSearchText}
          allowClear
          style={{ marginBottom: 8, flexShrink: 0 }}
        />

        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
          {availableTasks.length === 0 ? (
            <Empty
              description={
                searchText
                  ? 'No matching tasks'
                  : 'All tasks are assigned to endeavors'
              }
              style={{ marginTop: 20 }}
            />
          ) : (
            <Space direction="vertical" size={4} style={{ width: '100%' }}>
              {workflows.length > 0 && (
                <>
                  <Text type="secondary" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 1 }}>
                    Workflows ({workflows.length})
                  </Text>
                  {workflows.map((task: Task) => (
                    <DraggableTaskItem
                      key={task.id}
                      task={task}
                      userTypes={userTypes}
                      onDragStart={handleDragStart}
                    />
                  ))}
                </>
              )}
              {simpleTasks.length > 0 && (
                <>
                  <Text
                    type="secondary"
                    style={{
                      fontSize: 10,
                      textTransform: 'uppercase',
                      letterSpacing: 1,
                      marginTop: workflows.length > 0 ? 8 : 0,
                    }}
                  >
                    Tasks ({simpleTasks.length})
                  </Text>
                  {simpleTasks.map((task: Task) => (
                    <DraggableTaskItem
                      key={task.id}
                      task={task}
                      userTypes={userTypes}
                      onDragStart={handleDragStart}
                    />
                  ))}
                </>
              )}
            </Space>
          )}
        </div>

        <div style={{ flexShrink: 0, paddingTop: 6, borderTop: '1px solid #e5e6eb' }}>
          <Text type="secondary" style={{ fontSize: 10 }}>
            Drag onto an endeavor to assign
          </Text>
        </div>
      </Card>
    </div>
  )
}

interface DraggableTaskItemProps {
  task: Task
  userTypes: UserTaskType[]
  onDragStart: (e: React.DragEvent<HTMLDivElement>, taskId: string) => void
}

function DraggableTaskItem({ task, userTypes, onDragStart }: DraggableTaskItemProps) {
  const typeColor = task.type ? getTypeColor(userTypes, task.type) : '#808080'
  const typeEmoji = task.type ? getTypeEmoji(userTypes, task.type) : ''
  const typeName = task.type ? getTypeName(userTypes, task.type) : ''
  const stepCount = task.hasSteps && task.steps ? task.steps.length : 0

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, task.id)}
      style={{
        padding: '6px 8px',
        borderRadius: 6,
        border: '1px solid #e5e6eb',
        background: '#fff',
        cursor: 'grab',
        fontSize: 12,
        transition: 'box-shadow 0.15s, border-color 0.15s',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = typeColor
        e.currentTarget.style.boxShadow = `0 1px 4px ${typeColor}33`
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = '#e5e6eb'
        e.currentTarget.style.boxShadow = 'none'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
        {task.hasSteps && <IconBranch style={{ fontSize: 11, color: '#86909c' }} />}
        <Text style={{ fontSize: 12, fontWeight: 500 }} ellipsis>
          {task.name}
        </Text>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
        {typeName && (
          <Tag size="small" style={{ fontSize: 10, lineHeight: '16px', height: 18 }} color={typeColor}>
            {typeEmoji} {typeName}
          </Tag>
        )}
        <Text type="secondary" style={{ fontSize: 10 }}>
          {formatMinutes(task.duration)}
        </Text>
        {stepCount > 0 && (
          <Text type="secondary" style={{ fontSize: 10 }}>
            · {stepCount} steps
          </Text>
        )}
      </div>
    </div>
  )
}
