import React, { useState } from 'react'
import { Modal, Form, InputNumber, Typography, Space, Button, Message } from '@arco-design/web-react'
import { Task } from '@shared/types'
import { useTaskStore } from '../../store/useTaskStore'

const { Text } = Typography

interface TaskTimeLoggingModalProps {
  task: Task
  visible: boolean
  onClose: () => void
}

export function TaskTimeLoggingModal({ task, visible, onClose }: TaskTimeLoggingModalProps) {
  const [form] = Form.useForm()
  const { updateTask } = useTaskStore()
  const [loading, setLoading] = useState(false)

  const handleSubmit = async () => {
    try {
      setLoading(true)
      const values = await form.validate()
      const timeSpent = values.timeSpent
      
      // Update the task with the new actual duration
      const currentActualDuration = task.actualDuration || 0
      const newActualDuration = currentActualDuration + timeSpent
      
      await updateTask(task.id, {
        actualDuration: newActualDuration
      })
      
      // Check if we need to prompt for re-estimation
      if (newActualDuration >= task.duration && !task.completed) {
        Message.warning({
          content: `You've logged ${newActualDuration} minutes on a ${task.duration} minute task. Consider re-estimating the remaining time.`,
          duration: 5000
        })
      }
      
      Message.success('Time logged successfully')
      form.resetFields()
      onClose()
    } catch (error) {
      console.error('Error logging time:', error)
      Message.error('Failed to log time')
    } finally {
      setLoading(false)
    }
  }

  const formatTime = (minutes: number) => {
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    if (hours > 0) {
      return `${hours}h ${mins > 0 ? `${mins}m` : ''}`
    }
    return `${mins}m`
  }

  return (
    <Modal
      title={`Log Time: ${task.name}`}
      visible={visible}
      onCancel={onClose}
      onOk={handleSubmit}
      confirmLoading={loading}
      okText="Log Time"
      cancelText="Cancel"
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={{ timeSpent: 15 }}
      >
        <Space direction="vertical" style={{ width: '100%' }} size="large">
          <div>
            <Text type="secondary">Estimated duration: </Text>
            <Text strong>{formatTime(task.duration)}</Text>
          </div>
          
          {task.actualDuration && (
            <div>
              <Text type="secondary">Time already logged: </Text>
              <Text strong>{formatTime(task.actualDuration)}</Text>
            </div>
          )}
          
          <Form.Item
            field="timeSpent"
            label="Time spent (minutes)"
            rules={[
              { required: true, message: 'Please enter time spent' },
              { type: 'number', min: 1, message: 'Time must be at least 1 minute' }
            ]}
          >
            <InputNumber
              min={1}
              max={480}
              step={5}
              style={{ width: '100%' }}
              suffix="minutes"
            />
          </Form.Item>
          
          <Text type="secondary" style={{ fontSize: 12 }}>
            Tip: Use arrow keys or type a number. Common values: 15, 30, 45, 60, 90, 120
          </Text>
        </Space>
      </Form>
    </Modal>
  )
}