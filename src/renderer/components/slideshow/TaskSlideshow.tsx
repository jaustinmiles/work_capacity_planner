import { useState, useEffect, useMemo } from 'react'
import { Modal, Button, Space, Typography, Tag, Card, Progress, Badge, Divider } from '@arco-design/web-react'
import { IconLeft, IconRight, IconClockCircle, IconBranch, IconList, IconCheckCircleFill } from '@arco-design/web-react/icon'
import { useTaskStore } from '../../store/useTaskStore'
import { Task } from '@shared/types'
import { SequencedTask } from '@shared/sequencing-types'

const { Title, Text, Paragraph } = Typography

interface TaskSlideshowProps {
  visible: boolean
  onClose: () => void
}

type SlideshowItem = {
  id: string
  type: 'task' | 'workflow'
  data: Task | SequencedTask
}

export function TaskSlideshow({ visible, onClose }: TaskSlideshowProps) {
  const { tasks, sequencedTasks } = useTaskStore()
  const [currentIndex, setCurrentIndex] = useState(0)

  // Combine and filter tasks and workflows
  const items = useMemo<SlideshowItem[]>(() => {
    const taskItems: SlideshowItem[] = tasks
      .filter(t => !t.archived)
      .map(task => ({
        id: task.id,
        type: 'task' as const,
        data: task,
      }))

    const workflowItems: SlideshowItem[] = sequencedTasks
      .filter(w => !w.archived)
      .map(workflow => ({
        id: workflow.id,
        type: 'workflow' as const,
        data: workflow,
      }))

    // Combine all items and sort by priority
    const allItems = [...taskItems, ...workflowItems]

    // Sort by:
    // 1. Incomplete items first
    // 2. Within incomplete, workflows before tasks (they're more complex)
    // 3. Within each type, sort by importance/urgency for tasks
    return allItems.sort((a, b) => {
      const aCompleted = a.data.completed || false
      const bCompleted = b.data.completed || false

      // Incomplete items first
      if (aCompleted !== bCompleted) {
        return aCompleted ? 1 : -1
      }

      // Within same completion status, workflows before tasks
      if (a.type !== b.type) {
        return a.type === 'workflow' ? -1 : 1
      }

      // For tasks, sort by importance/urgency (higher values = higher priority)
      if (a.type === 'task' && b.type === 'task') {
        const aTask = a.data as Task
        const bTask = b.data as Task

        // Higher numbers = higher priority, so we want to sort descending
        const aScore = (aTask.importance || 0) + (aTask.urgency || 0)
        const bScore = (bTask.importance || 0) + (bTask.urgency || 0)

        return bScore - aScore // Higher scores first
      }

      return 0
    })

  }, [tasks, sequencedTasks])

  // Navigation functions
  const goToPrevious = () => {
    setCurrentIndex(prev => (prev > 0 ? prev - 1 : items.length - 1))
  }

  const goToNext = () => {
    setCurrentIndex(prev => (prev < items.length - 1 ? prev + 1 : 0))
  }

  // Keyboard navigation
  useEffect(() => {
    if (!visible) return

    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        goToPrevious()
      } else if (e.key === 'ArrowRight') {
        goToNext()
      } else if (e.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyPress)
    return () => window.removeEventListener('keydown', handleKeyPress)
  }, [visible, items.length])

  // Reset index when modal opens
  useEffect(() => {
    if (visible) {
      setCurrentIndex(0)
    }
  }, [visible])

  if (items.length === 0) {
    return (
      <Modal
        title="Task & Workflow Slideshow"
        visible={visible}
        onCancel={onClose}
        footer={null}
        style={{ width: 800 }}
      >
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <Text type="secondary">No tasks or workflows to display</Text>
        </div>
      </Modal>
    )
  }

  const currentItem = items[currentIndex]
  const isTask = currentItem?.type === 'task'
  const itemData = currentItem?.data

  // Type guards for better type safety
  const isRegularTask = (data: Task | SequencedTask): data is Task => {
    return 'importance' in data && 'urgency' in data
  }

  const isWorkflow = (data: Task | SequencedTask): data is SequencedTask => {
    return 'steps' in data && Array.isArray(data.steps)
  }

  return (
    <Modal
      title={
        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
          <Space>
            {isTask ? <IconList /> : <IconBranch />}
            <span>Task & Workflow Slideshow</span>
          </Space>
          <Tag>{`${currentIndex + 1} of ${items.length}`}</Tag>
        </Space>
      }
      visible={visible}
      onCancel={onClose}
      footer={
        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
          <Button
            icon={<IconLeft />}
            onClick={goToPrevious}
            disabled={items.length <= 1}
          >
            Previous
          </Button>
          <Text type="secondary">Use arrow keys to navigate</Text>
          <Button
            onClick={goToNext}
            disabled={items.length <= 1}
          >
            Next
            <IconRight style={{ marginLeft: 4 }} />
          </Button>
        </Space>
      }
      style={{ width: 900, maxWidth: '90vw' }}
      maskClosable={false}
    >
      {currentItem && itemData && (
        <Card style={{ minHeight: 400 }}>
          <Space direction="vertical" style={{ width: '100%' }} size="large">
            {/* Header */}
            <div>
              <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 8 }}>
                <Title heading={4} style={{ margin: 0 }}>
                  {itemData.name}
                </Title>
                <Space>
                  <Tag color={isTask ? 'arcoblue' : 'purple'}>
                    {isTask ? 'Task' : 'Workflow'}
                  </Tag>
                  {itemData.completed && (
                    <Tag color="green" icon={<IconCheckCircleFill />}>
                      Completed
                    </Tag>
                  )}
                </Space>
              </Space>

              {/* Task-specific details */}
              {isTask && isRegularTask(itemData) && (
                <Space style={{ marginTop: 12 }}>
                  <Badge
                    color={itemData.importance >= 7 ? 'red' : itemData.importance >= 4 ? 'orange' : 'gray'}
                    text={`Importance: ${itemData.importance}/10`}
                  />
                  <Badge
                    color={itemData.urgency >= 7 ? 'red' : itemData.urgency >= 4 ? 'orange' : 'gray'}
                    text={`Urgency: ${itemData.urgency}/10`}
                  />
                </Space>
              )}
            </div>

            <Divider style={{ margin: '12px 0' }} />

            {/* Main content */}
            <div style={{ flex: 1 }}>
              {/* Duration */}
              <Space style={{ marginBottom: 16 }}>
                <IconClockCircle />
                <Text>Duration: {itemData.duration || 0} minutes</Text>
                {isWorkflow(itemData) && itemData.steps && (
                  <Text type="secondary">
                    ({itemData.steps.length} steps)
                  </Text>
                )}
              </Space>

              {/* Workflow steps */}
              {isWorkflow(itemData) && itemData.steps && itemData.steps.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <Text style={{ fontWeight: 600, display: 'block', marginBottom: 12 }}>
                    Workflow Steps:
                  </Text>
                  <div style={{ maxHeight: 200, overflow: 'auto' }}>
                    {itemData.steps.map((step, index) => (
                      <div
                        key={step.id}
                        style={{
                          padding: '8px 12px',
                          background: index % 2 === 0 ? '#f7f8fa' : 'white',
                          borderRadius: 4,
                        }}
                      >
                        <Space>
                          <Text>{index + 1}.</Text>
                          <Text>{step.name}</Text>
                          <Tag size="small" color={step.status === 'completed' ? 'green' : 'gray'}>
                            {step.status}
                          </Tag>
                          <Text type="secondary">({step.duration} min)</Text>
                        </Space>
                      </div>
                    ))}
                  </div>

                  {/* Progress for workflows */}
                  <div style={{ marginTop: 16 }}>
                    <Text type="secondary">Overall Progress</Text>
                    <Progress
                      percent={Math.round(
                        (itemData.steps.filter(s => s.status === 'completed').length /
                         itemData.steps.length) * 100,
                      )}
                      style={{ marginTop: 8 }}
                    />
                  </div>
                </div>
              )}

              {/* Notes */}
              {itemData.notes && (
                <div style={{ marginTop: 16 }}>
                  <Text style={{ fontWeight: 600, display: 'block', marginBottom: 8 }}>
                    Notes:
                  </Text>
                  <Paragraph
                    style={{
                      background: '#f7f8fa',
                      padding: 12,
                      borderRadius: 4,
                      maxHeight: 100,
                      overflow: 'auto',
                    }}
                  >
                    {itemData.notes}
                  </Paragraph>
                </div>
              )}
            </div>
          </Space>
        </Card>
      )}
    </Modal>
  )
}
