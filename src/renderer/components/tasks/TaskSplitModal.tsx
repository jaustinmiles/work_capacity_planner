import { useState } from 'react'
import { Task } from '@shared/types'
import {
  Modal,
  Form,
  Input,
  Typography,
  Space,
  Slider,
  Alert,
  Grid,
} from '@arco-design/web-react'
import { IconScissor } from '@arco-design/web-react/icon'
import { useTaskStore } from '../../store/useTaskStore'
import { Message } from '../common/Message'
import { logger } from '@/logger'


const { Title, Text } = Typography
const { Row, Col } = Grid
const FormItem = Form.Item

interface TaskSplitModalProps {
  task: Task
  visible: boolean
  onClose: () => void
  onSplit?: (task1: Task, task2: Task) => void
}

export function TaskSplitModal({ task, visible, onClose, onSplit }: TaskSplitModalProps) {
  const { addTask, updateTask } = useTaskStore()
  const [form] = Form.useForm()
  const [splitRatio, setSplitRatio] = useState(50)
  const [loading, setLoading] = useState(false)

  // Calculate durations based on split ratio
  const duration1 = Math.round(task.duration * (splitRatio / 100))
  const duration2 = task.duration - duration1

  const handleSplit = async () => {
    try {
      setLoading(true)
      const values = await form.validate()

      // Create first task (update existing)
      const task1Updates: Partial<Task> = {
        name: values.name1,
        duration: duration1,
        notes: values.notes1 || task.notes,
      }

      // Create second task (new)
      const task2: Task = {
        id: `${task.id}-split-${Date.now()}`,
        name: values.name2,
        duration: duration2,
        importance: task.importance,
        urgency: task.urgency,
        type: task.type,
        asyncWaitTime: 0,
        dependencies: task.dependencies || [],
        completed: false,
        sessionId: task.sessionId,
        createdAt: new Date(),
        updatedAt: new Date(),
        notes: values.notes2,
        deadline: task.deadline,
        cognitiveComplexity: task.cognitiveComplexity,
        hasSteps: task.hasSteps,
        overallStatus: task.overallStatus,
        criticalPathDuration: task.criticalPathDuration,
        worstCaseDuration: task.worstCaseDuration,
        archived: false,
        inActiveSprint: false,
      }

      // Update the original task
      await updateTask(task.id, task1Updates)

      // Add the new task
      await addTask(task2)

      logger.ui.info('Task split successfully', {})

      Message.success('Task split successfully')

      // Call onSplit callback if provided
      if (onSplit) {
        onSplit({ ...task, ...task1Updates } as Task, task2)
      }

      form.resetFields()
      onClose()
    } catch (error) {
      logger.ui.error('Failed to split task', {
        error: error instanceof Error ? error.message : String(error),
        taskId: task.id,
        taskName: task.name,
      }, 'task-split-error')
      Message.error('Failed to split task')
    } finally {
      setLoading(false)
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

  return (
    <Modal
      title={
        <Space>
          <IconScissor />
          <span>Split Task</span>
        </Space>
      }
      visible={visible}
      onCancel={onClose}
      onOk={handleSplit}
      confirmLoading={loading}
      okText="Split Task"
      cancelText="Cancel"
      style={{ width: 600 }}
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={{
          name1: task.name,
          name2: `${task.name} (continued)`,
        }}
      >
        <Space direction="vertical" style={{ width: '100%' }} size="large">
          <Alert
            type="info"
            content={`This will split "${task.name}" (${formatDuration(task.duration)}) into two separate tasks.`}
          />

          <div>
            <Title heading={6}>Duration Split</Title>
            <Slider
              value={splitRatio}
              onChange={(value) => setSplitRatio(value as number)}
              marks={{
                0: '0%',
                25: '25%',
                50: '50%',
                75: '75%',
                100: '100%',
              }}
              min={10}
              max={90}
              step={5}
              formatTooltip={(value) => `${value}%`}
            />
            <Row gutter={16} style={{ marginTop: 16 }}>
              <Col span={12}>
                <Text type="secondary">First task: </Text>
                <Text style={{ fontWeight: 600 }}>{formatDuration(duration1)}</Text>
              </Col>
              <Col span={12}>
                <Text type="secondary">Second task: </Text>
                <Text style={{ fontWeight: 600 }}>{formatDuration(duration2)}</Text>
              </Col>
            </Row>
          </div>

          <Row gutter={16}>
            <Col span={12}>
              <FormItem
                field="name1"
                label="First Task Name"
                rules={[{ required: true, message: 'Please enter a name' }]}
              >
                <Input placeholder="Enter name for first part" />
              </FormItem>
              <FormItem field="notes1" label="Notes (optional)">
                <Input.TextArea
                  rows={2}
                  placeholder="Optional notes for first part"
                />
              </FormItem>
            </Col>
            <Col span={12}>
              <FormItem
                field="name2"
                label="Second Task Name"
                rules={[{ required: true, message: 'Please enter a name' }]}
              >
                <Input placeholder="Enter name for second part" />
              </FormItem>
              <FormItem field="notes2" label="Notes (optional)">
                <Input.TextArea
                  rows={2}
                  placeholder="Optional notes for second part"
                />
              </FormItem>
            </Col>
          </Row>

          <Alert
            type="warning"
            content="Both tasks will inherit the same importance, urgency, and deadline from the original task."
          />
        </Space>
      </Form>
    </Modal>
  )
}
