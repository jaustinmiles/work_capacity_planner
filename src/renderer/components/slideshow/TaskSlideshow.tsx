import { useState, useEffect, useMemo } from 'react'
import { Modal, Button, Space, Typography, Tag, Card, Badge, Divider } from '@arco-design/web-react'
import { IconLeft, IconRight, IconClockCircle, IconBranch, IconList, IconCheckCircleFill } from '@arco-design/web-react/icon'
import { useTaskStore } from '../../store/useTaskStore'
import { useResponsive } from '../../providers/ResponsiveProvider'
import { Task } from '@shared/types'
import { SequencedTask } from '@shared/sequencing-types'
import { EntityType } from '@shared/enums'

const { Title, Text, Paragraph } = Typography

interface TaskSlideshowProps {
  visible: boolean
  onClose: () => void
}

type SlideshowItem = {
  id: string
  type: EntityType.Task | EntityType.Workflow
  data: Task | SequencedTask
}

export function TaskSlideshow({ visible, onClose }: TaskSlideshowProps) {
  const { tasks, sequencedTasks } = useTaskStore()
  const { isCompact, isMobile } = useResponsive()
  const [currentIndex, setCurrentIndex] = useState(0)

  // Combine and filter tasks and workflows (exclude completed and archived)
  const items = useMemo<SlideshowItem[]>(() => {
    const taskItems: SlideshowItem[] = tasks
      .filter(t => !t.archived && !t.completed)
      .map(task => ({
        id: task.id,
        type: EntityType.Task,
        data: task,
      }))

    const workflowItems: SlideshowItem[] = sequencedTasks
      .filter(w => !w.archived && !w.completed)
      .map(workflow => ({
        id: workflow.id,
        type: EntityType.Workflow,
        data: workflow,
      }))

    // Simply combine all items without sorting
    return [...taskItems, ...workflowItems]

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
  const isTask = currentItem?.type === EntityType.Task
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
      style={{
        width: isCompact ? '98vw' : isMobile ? '95vw' : 900,
        maxWidth: isCompact ? '98vw' : isMobile ? '95vw' : '90vw',
      }}
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
