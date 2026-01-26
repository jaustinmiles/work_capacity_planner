/**
 * SprintColumn
 *
 * A droppable column container for the Kanban board.
 * Renders task cards and accepts drops from other columns.
 */

import React from 'react'
import { useDroppable } from '@dnd-kit/core'
import { Typography, Card } from '@arco-design/web-react'
import { SprintTaskCard } from './SprintTaskCard'
import type { Task } from '@shared/types'

const { Title, Text } = Typography

export type SprintColumnId = 'backlog' | 'sprint' | 'completed'

interface SprintColumnProps {
  id: SprintColumnId
  title: string
  tasks: Task[]
  activeId: string | null
}

// Column header colors
const columnColors: Record<SprintColumnId, string> = {
  backlog: '#86909C',   // Gray
  sprint: '#165DFF',    // Blue
  completed: '#00B42A', // Green
}

export function SprintColumn({ id, title, tasks, activeId }: SprintColumnProps): React.ReactElement {
  const { isOver, setNodeRef } = useDroppable({ id })

  // Calculate total hours for the column
  const totalMinutes = tasks.reduce((sum, task) => sum + task.duration, 0)
  const hours = Math.floor(totalMinutes / 60)
  const mins = totalMinutes % 60
  const timeDisplay = hours > 0
    ? (mins > 0 ? `${hours}h ${mins}m` : `${hours}h`)
    : `${mins}m`

  return (
    <Card
      ref={setNodeRef}
      style={{
        flex: 1,
        minWidth: 280,
        maxWidth: 400,
        minHeight: 400,
        background: isOver ? '#F2F3F5' : '#FAFAFA',
        border: isOver ? '2px dashed #165DFF' : '1px solid #E5E6EB',
        transition: 'background 0.2s, border 0.2s',
      }}
      bodyStyle={{ padding: 12 }}
    >
      {/* Column header */}
      <div style={{
        marginBottom: 12,
        paddingBottom: 8,
        borderBottom: `2px solid ${columnColors[id]}`,
      }}>
        <Title heading={6} style={{ margin: 0, color: columnColors[id] }}>
          {title}
        </Title>
        <Text type="secondary" style={{ fontSize: 12 }}>
          {tasks.length} {tasks.length === 1 ? 'task' : 'tasks'} • {timeDisplay}
        </Text>
      </div>

      {/* Task cards */}
      <div style={{ minHeight: 100 }}>
        {tasks.length === 0 ? (
          <Text type="secondary" style={{
            display: 'block',
            textAlign: 'center',
            padding: '20px 0',
            color: '#C9CDD4',
          }}>
            {id === 'sprint'
              ? 'Drag tasks here to add to sprint'
              : id === 'completed'
              ? 'Completed tasks appear here'
              : 'No tasks in backlog'}
          </Text>
        ) : (
          tasks.map(task => (
            <SprintTaskCard
              key={task.id}
              task={task}
              isDragging={activeId === task.id}
            />
          ))
        )}
      </div>
    </Card>
  )
}
