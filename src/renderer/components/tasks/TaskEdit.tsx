import { useState } from 'react'
import {
  Card,
  Space,
  Typography,
  Button,
  InputNumber,
  Select,
  Input,
  Grid,
  Tag,
  DatePicker,
} from '@arco-design/web-react'
import {
  IconEdit,
  IconSave,
  IconClose,
  IconCalendar,
} from '@arco-design/web-react/icon'
import { Task } from '@shared/types'
import { useTaskStore } from '../../store/useTaskStore'
import { Message } from '../common/Message'

const { Title, Text } = Typography
const { TextArea } = Input
const { Row, Col } = Grid

interface TaskEditProps {
  task: Task
  onClose?: () => void
}

export function TaskEdit({ task, onClose }: TaskEditProps) {
  const { updateTask } = useTaskStore()
  const [editedTask, setEditedTask] = useState<Task>({ ...task })
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  const handleSave = async () => {
    setIsSaving(true)
    try {
      await updateTask(task.id, editedTask)
      Message.success('Task updated successfully')
      setIsEditing(false)
      if (onClose) onClose()
    } catch (error) {
      Message.error('Failed to update task')
      console.error('Error updating task:', error)
    } finally {
      setIsSaving(false)
    }
  }

  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    if (hours > 0) {
      return `${hours}h ${mins > 0 ? `${mins}m` : ''}`
    }
    return `${mins}m`
  }

  const getPriorityLabel = (importance: number, urgency: number) => {
    const score = importance * urgency
    if (score >= 64) return 'Critical'
    if (score >= 49) return 'High'
    if (score >= 36) return 'Medium'
    return 'Low'
  }

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="large">
      {/* Header */}
      <Card>
        <Row gutter={16} align="center">
          <Col flex="auto">
            <Space direction="vertical" size="small">
              <Title heading={4}>{editedTask.name}</Title>
              <Space>
                <Tag color="blue">
                  {editedTask.type === 'focused' ? 'Focused Work' : 'Admin Task'}
                </Tag>
                <Tag color="orange">
                  {getPriorityLabel(editedTask.importance, editedTask.urgency)} Priority
                </Tag>
                {editedTask.completed && (
                  <Tag color="green">Completed</Tag>
                )}
              </Space>
            </Space>
          </Col>
          <Col>
            <Space>
              {!isEditing ? (
                <Button
                  type="primary"
                  icon={<IconEdit />}
                  onClick={() => setIsEditing(true)}
                >
                  Edit Task
                </Button>
              ) : (
                <>
                  <Button
                    type="primary"
                    icon={<IconSave />}
                    onClick={handleSave}
                    loading={isSaving}
                  >
                    Save Changes
                  </Button>
                  <Button
                    icon={<IconClose />}
                    onClick={() => {
                      setEditedTask({ ...task })
                      setIsEditing(false)
                    }}
                  >
                    Cancel
                  </Button>
                </>
              )}
              {onClose && (
                <Button onClick={onClose}>
                  Close
                </Button>
              )}
            </Space>
          </Col>
        </Row>
      </Card>

      {/* Task Properties Edit */}
      {isEditing && (
        <Card title="Task Properties">
          <Space direction="vertical" style={{ width: '100%' }} size="large">
            <Row gutter={16}>
              <Col span={24}>
                <Space direction="vertical" style={{ width: '100%' }}>
                  <Text>Task Name</Text>
                  <Input
                    value={editedTask.name}
                    onChange={(value) => setEditedTask({ ...editedTask, name: value })}
                    placeholder="Task name"
                  />
                </Space>
              </Col>
            </Row>

            <Row gutter={16}>
              <Col span={6}>
                <Space direction="vertical" style={{ width: '100%' }}>
                  <Text>Importance (1-10)</Text>
                  <InputNumber
                    value={editedTask.importance}
                    min={1}
                    max={10}
                    onChange={(value) => setEditedTask({ ...editedTask, importance: value || 5 })}
                    style={{ width: '100%' }}
                  />
                </Space>
              </Col>
              <Col span={6}>
                <Space direction="vertical" style={{ width: '100%' }}>
                  <Text>Urgency (1-10)</Text>
                  <InputNumber
                    value={editedTask.urgency}
                    min={1}
                    max={10}
                    onChange={(value) => setEditedTask({ ...editedTask, urgency: value || 5 })}
                    style={{ width: '100%' }}
                  />
                </Space>
              </Col>
              <Col span={6}>
                <Space direction="vertical" style={{ width: '100%' }}>
                  <Text>Duration (minutes)</Text>
                  <InputNumber
                    value={editedTask.duration}
                    min={5}
                    max={480}
                    step={5}
                    onChange={(value) => setEditedTask({ ...editedTask, duration: value || 30 })}
                    style={{ width: '100%' }}
                  />
                </Space>
              </Col>
              <Col span={6}>
                <Space direction="vertical" style={{ width: '100%' }}>
                  <Text>Priority Score</Text>
                  <Tag color="orange" style={{ fontSize: 16, padding: '4px 12px' }}>
                    {editedTask.importance * editedTask.urgency} - {getPriorityLabel(editedTask.importance, editedTask.urgency)}
                  </Tag>
                </Space>
              </Col>
            </Row>

            <Row gutter={16}>
              <Col span={8}>
                <Space direction="vertical" style={{ width: '100%' }}>
                  <Text>Type</Text>
                  <Select
                    value={editedTask.type}
                    onChange={(value) => setEditedTask({ ...editedTask, type: value })}
                    style={{ width: '100%' }}
                  >
                    <Select.Option value="focused">Focused Work</Select.Option>
                    <Select.Option value="admin">Admin Task</Select.Option>
                  </Select>
                </Space>
              </Col>
              <Col span={8}>
                <Space direction="vertical" style={{ width: '100%' }}>
                  <Text>Async Wait Time (minutes)</Text>
                  <InputNumber
                    value={editedTask.asyncWaitTime}
                    min={0}
                    max={1440}
                    step={5}
                    onChange={(value) => setEditedTask({ ...editedTask, asyncWaitTime: value || 0 })}
                    style={{ width: '100%' }}
                  />
                </Space>
              </Col>
              <Col span={8}>
                <Space direction="vertical" style={{ width: '100%' }}>
                  <Text>Status</Text>
                  <Select
                    value={editedTask.completed ? 'completed' : 'pending'}
                    onChange={(value) => setEditedTask({ ...editedTask, completed: value === 'completed' })}
                    style={{ width: '100%' }}
                  >
                    <Select.Option value="pending">Pending</Select.Option>
                    <Select.Option value="completed">Completed</Select.Option>
                  </Select>
                </Space>
              </Col>
            </Row>

            <Row gutter={16}>
              <Col span={12}>
                <Space direction="vertical" style={{ width: '100%' }}>
                  <Text>
                    <IconCalendar /> Deadline (Optional)
                  </Text>
                  <DatePicker
                    value={editedTask.deadline}
                    onChange={(dateString) => setEditedTask({ ...editedTask, deadline: dateString })}
                    showTime
                    placeholder="Select deadline"
                    style={{ width: '100%' }}
                    disabledDate={(current) => {
                      // Disable dates before today
                      return current && current.isBefore(new Date(), 'day')
                    }}
                  />
                </Space>
              </Col>
            </Row>

            <Row gutter={16}>
              <Col span={24}>
                <Space direction="vertical" style={{ width: '100%' }}>
                  <Text>Notes</Text>
                  <TextArea
                    value={editedTask.notes || ''}
                    onChange={(value) => setEditedTask({ ...editedTask, notes: value })}
                    placeholder="Add any additional notes or context..."
                    autoSize={{ minRows: 3, maxRows: 6 }}
                  />
                </Space>
              </Col>
            </Row>
          </Space>
        </Card>
      )}

      {/* Task Summary (when not editing) */}
      {!isEditing && (
        <Card title="Task Details">
          <Space direction="vertical" style={{ width: '100%' }} size="small">
            <Row gutter={16}>
              <Col span={6}>
                <Space direction="vertical">
                  <Text type="secondary">Duration</Text>
                  <Text strong>{formatDuration(editedTask.duration)}</Text>
                </Space>
              </Col>
              <Col span={6}>
                <Space direction="vertical">
                  <Text type="secondary">Async Wait Time</Text>
                  <Text strong>{formatDuration(editedTask.asyncWaitTime)}</Text>
                </Space>
              </Col>
              <Col span={6}>
                <Space direction="vertical">
                  <Text type="secondary">Total Time</Text>
                  <Text strong>{formatDuration(editedTask.duration + editedTask.asyncWaitTime)}</Text>
                </Space>
              </Col>
              <Col span={6}>
                <Space direction="vertical">
                  <Text type="secondary">Type</Text>
                  <Text strong>{editedTask.type === 'focused' ? 'Focused Work' : 'Admin Task'}</Text>
                </Space>
              </Col>
            </Row>

            {editedTask.notes && (
              <div style={{ marginTop: 16 }}>
                <Text type="secondary">Notes:</Text>
                <div style={{ marginTop: 8 }}>
                  <Text>{editedTask.notes}</Text>
                </div>
              </div>
            )}
          </Space>
        </Card>
      )}
    </Space>
  )
}
