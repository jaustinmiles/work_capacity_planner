import { useState, useMemo } from 'react'
import { Card, Typography, Space, Radio } from '@arco-design/web-react'
import { IconApps, IconDragDot } from '@arco-design/web-react/icon'
import { useTaskStore } from '../../store/useTaskStore'
import { Task } from '@shared/types'
import { useContainerQuery } from '../../hooks/useContainerQuery'
import { EisenhowerGrid } from './EisenhowerGrid'
import { EisenhowerScatter } from './EisenhowerScatter'

const { Title, Text } = Typography

interface EisenhowerMatrixProps {
  onAddTask: () => void
}

export function EisenhowerMatrix({ onAddTask }: EisenhowerMatrixProps) {
  const { tasks, sequencedTasks, selectTask } = useTaskStore()
  const [viewMode, setViewMode] = useState<'grid' | 'scatter'>('grid')
  const { ref: containerRef, width: containerWidth } = useContainerQuery<HTMLDivElement>()
  const [containerSize, setContainerSize] = useState({ width: 500, height: 500 })

  // Combine regular tasks and sequenced tasks (workflows)
  // Deduplicate by ID - sequenced tasks take precedence
  const sequencedTaskIds = new Set(sequencedTasks.map(st => st.id))
  const dedupedTasks = tasks.filter(t => !sequencedTaskIds.has(t.id))

  const allTasks = [
    ...dedupedTasks,
    ...sequencedTasks.map(st => ({
      ...st,
      duration: st.duration, // Use totalDuration for sequenced tasks
    })),
  ]

  // Only show incomplete tasks in the matrix
  const incompleteTasks = allTasks.filter(task => !task.completed)

  // For scatter plot, also include workflow steps as individual items
  const allItemsForScatter = useMemo(() => {
    const items: Array<Task & { isStep?: boolean; parentWorkflow?: string; stepName?: string; stepIndex?: number }> = []

    // Add regular tasks and workflows
    incompleteTasks.forEach(task => {
      items.push(task)

      // If it's a workflow, also add its steps
      const sequencedTask = sequencedTasks.find(st => st.id === task.id)
      if (sequencedTask?.steps) {
        sequencedTask.steps.forEach((step, index) => {
          // Create a task-like object for each step
          items.push({
            ...task, // Inherit parent task properties
            id: step.id,
            name: `${task.name} - ${step.name}`,
            duration: step.duration,
            importance: step.importance ?? task.importance,
            urgency: step.urgency ?? task.urgency,
            completed: step.status === 'completed',
            isStep: true,
            parentWorkflow: task.id,
            stepName: step.name,
            stepIndex: index,
          })
        })
      }
    })

    // Filter out completed steps
    return items.filter(item => !item.completed)
  }, [incompleteTasks, sequencedTasks])

  return (
    <Space
      direction="vertical"
      style={{
        width: '100%',
        minWidth: 400, // Prevent catastrophic narrowing that breaks text rendering
      }}
      size="large"
    >
      {/* Header with Add Task Button and View Controls */}
      <Card>
        <Space style={{ width: '100%', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{
            minWidth: 300, // Prevent extreme narrowing that causes character wrapping
            flex: '1 1 auto', // Allow growth but maintain minimum width
          }}>
            <Title
              heading={5}
              style={{
                margin: 0,
                whiteSpace: 'nowrap', // Force single line
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                minWidth: 200, // Ensure adequate space for title
              }}
            >
              Eisenhower Priority Matrix
            </Title>
            <Text
              type="secondary"
              style={{
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                display: 'block',
                maxWidth: 400, // Prevent subtitle from getting too wide
              }}
            >
              Organize tasks by importance and urgency to focus on what matters most
            </Text>
          </div>
          <Space wrap style={{ width: '100%', justifyContent: 'flex-end' }}>
            <Radio.Group
              type="button"
              value={viewMode}
              onChange={setViewMode}
              size="small"
            >
              <Radio value="grid">
                <IconApps /> {containerWidth > 500 ? 'Grid' : ''}
              </Radio>
              <Radio value="scatter">
                <IconDragDot /> {containerWidth > 500 ? 'Scatter' : ''}
              </Radio>
            </Radio.Group>
          </Space>
        </Space>
      </Card>

      {/* Matrix View */}
      <div ref={containerRef}>
        {viewMode === 'grid' ? (
          <EisenhowerGrid
            tasks={incompleteTasks}
            onAddTask={onAddTask}
            onSelectTask={(task) => selectTask(task.id)}
            containerWidth={containerWidth}
          />
        ) : (
          <EisenhowerScatter
            tasks={incompleteTasks}
            allItemsForScatter={allItemsForScatter}
            onSelectTask={(task) => selectTask(task.id)}
            containerSize={containerSize}
            setContainerSize={setContainerSize}
          />
        )}
      </div>

      {/* Info Footer */}
      <Card style={{ background: '#F7F8FA' }}>
        <Text type="secondary">
          Tasks are automatically categorized based on their importance and urgency scores.
          Scores of 7 or higher are considered high priority.
        </Text>
      </Card>
    </Space>
  )
}
