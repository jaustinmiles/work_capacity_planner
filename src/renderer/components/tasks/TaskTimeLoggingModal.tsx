import { useState } from 'react'
import { Modal, Form, InputNumber, Typography, Space, Message, DatePicker, Input } from '@arco-design/web-react'
import { Task } from '@shared/types'
import { useTaskStore } from '../../store/useTaskStore'
import { getDatabase } from '../../services/database'
import { appEvents, EVENTS } from '../../utils/events'
import dayjs from 'dayjs'

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
      const workDate = values.date || new Date()
      
      // Validate time is at least 1 minute
      if (!timeSpent || timeSpent < 1) {
        Message.error('Please enter at least 1 minute')
        setLoading(false)
        return
      }
      
      // Create a work session record
      const startTime = new Date(workDate)
      startTime.setHours(12, 0, 0, 0) // Default to noon if not specified
      
      await getDatabase().createWorkSession({
        taskId: task.id,
        type: task.type as 'focused' | 'admin',
        startTime: startTime,
        plannedMinutes: timeSpent,
        actualMinutes: timeSpent,
        notes: values.notes || ''
      })
      
      // Update the task with the new actual duration
      const currentLoggedTime = await getDatabase().getTaskTotalLoggedTime(task.id)
      
      await updateTask(task.id, {
        actualDuration: currentLoggedTime
      })
      
      // Emit event to update other components
      appEvents.emit(EVENTS.TIME_LOGGED)
      
      // Check if we need to prompt for re-estimation
      if (currentLoggedTime >= task.duration && !task.completed) {
        Message.warning({
          content: `You've logged ${currentLoggedTime} minutes on a ${task.duration} minute task. Consider re-estimating the remaining time.`,
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
        initialValues={{ 
          timeSpent: 15,
          date: dayjs().format('YYYY-MM-DD')
        }}
      >
        <Space direction="vertical" style={{ width: '100%' }} size="large">
          <div>
            <Text type="secondary">Estimated duration: </Text>
            <Text style={{ fontWeight: 600 }}>{formatTime(task.duration)}</Text>
          </div>
          
          {task.actualDuration && (
            <div>
              <Text type="secondary">Time already logged: </Text>
              <Text style={{ fontWeight: 600 }}>{formatTime(task.actualDuration)}</Text>
            </div>
          )}
          
          <Form.Item
            field="date"
            label="When did you do this work?"
            rules={[{ required: true, message: 'Please select a date' }]}
          >
            <DatePicker
              style={{ width: '100%' }}
              format="YYYY-MM-DD"
              allowClear={false}
              disabledDate={(current) => dayjs(current).isAfter(dayjs())}
            />
          </Form.Item>

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
          
          <Form.Item
            field="notes"
            label="Notes (optional)"
          >
            <Input.TextArea
              placeholder="What did you work on?"
              rows={2}
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