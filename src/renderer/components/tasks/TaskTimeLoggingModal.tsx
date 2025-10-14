import { useState } from 'react'
import { TaskType } from '@shared/enums'
import { Modal, Form, InputNumber, Typography, Space, DatePicker, Input } from '@arco-design/web-react'
import { Task } from '@shared/types'
import { useTaskStore } from '../../store/useTaskStore'
import { getDatabase } from '../../services/database'
import { appEvents, EVENTS } from '../../utils/events'
import { Message } from '../common/Message'
import dayjs from 'dayjs'
// LOGGER_REMOVED: import { logger } from '@/shared/logger'


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
      const workDateValue = values.date

      // Better date handling
      let workDate: Date
      if (workDateValue && typeof workDateValue === 'string') {
        workDate = new Date(workDateValue)
      } else if (workDateValue && dayjs.isDayjs(workDateValue)) {
        workDate = workDateValue.toDate()
      } else {
        workDate = new Date()
      }

      // Validate time is at least 1 minute
      if (!timeSpent || timeSpent < 1) {
        Message.error('Please enter at least 1 minute')
        setLoading(false)
        return
      }

      // Create a work session record
      const startTime = new Date(workDate)
      startTime.setHours(12, 0, 0, 0) // Default to noon if not specified

      // Calculate endTime for completed work session
      const endTime = new Date(startTime)
      endTime.setMinutes(endTime.getMinutes() + timeSpent)

      // LOGGER_REMOVED: logger.ui.info('[WorkLogging] Creating work session', {
        // taskId: task.id,
        // taskName: task.name,
        // taskType: task.type,
        // timeSpent,
        // date: workDate.toISOString(),
        // startTime: startTime.toISOString(),
        // endTime: endTime.toISOString(),
        // notes: values.notes || '',
      // })

      const workSessionResult = await getDatabase().createWorkSession({
        taskId: task.id,
        type: task.type as TaskType,
        startTime: startTime,
        endTime: endTime,
        plannedMinutes: timeSpent,
        actualMinutes: timeSpent,
        notes: values.notes || '',
      })

      // LOGGER_REMOVED: logger.ui.info('[WorkLogging] Work session created', {
        // LOGGER_REMOVED: taskId: task.id,
        // LOGGER_REMOVED: workSessionId: workSessionResult?.id,
        // LOGGER_REMOVED: success: !!workSessionResult,
      // LOGGER_REMOVED: })

      // Update the task with the new actual duration
      const currentLoggedTime = await getDatabase().getTaskTotalLoggedTime(task.id)

      // LOGGER_REMOVED: logger.ui.info('[WorkLogging] Retrieved total logged time', {
        // LOGGER_REMOVED: taskId: task.id,
        // LOGGER_REMOVED: currentLoggedTime,
        // LOGGER_REMOVED: previousLoggedTime: task.actualDuration,
        // LOGGER_REMOVED: estimatedDuration: task.duration,
      // LOGGER_REMOVED: })

      await updateTask(task.id, {
        actualDuration: currentLoggedTime,
      })

      // LOGGER_REMOVED: logger.ui.info('[WorkLogging] Task updated with new logged time', {
        // LOGGER_REMOVED: taskId: task.id,
        // LOGGER_REMOVED: actualDuration: currentLoggedTime,
      // LOGGER_REMOVED: })

      // Emit events to update other components
      appEvents.emit(EVENTS.TIME_LOGGED)
      appEvents.emit(EVENTS.DATA_REFRESH_NEEDED)

      // LOGGER_REMOVED: logger.ui.info('[WorkLogging] Events emitted', {
        // LOGGER_REMOVED: events: ['TIME_LOGGED', 'DATA_REFRESH_NEEDED'],
        // LOGGER_REMOVED: taskId: task.id,
      // LOGGER_REMOVED: })

      // Check if we need to prompt for re-estimation
      if (currentLoggedTime >= task.duration && !task.completed) {
        Message.warning(
          `You've logged ${currentLoggedTime} minutes on a ${task.duration} minute task. Consider re-estimating the remaining time.`,
          5000,
        )
      }

      Message.success('Time logged successfully')
      // LOGGER_REMOVED: logger.ui.info('[WorkLogging] Time logging complete', {
        // taskId: task.id,
        // taskName: task.name,
        // totalLogged: currentLoggedTime,
        // estimatedDuration: task.duration,
        // percentComplete: Math.round((currentLoggedTime / task.duration) * 100),
      // })
      form.resetFields()
      onClose()
    } catch (error) {
      // LOGGER_REMOVED: logger.ui.error('[WorkLogging] Error logging time:', error, {
        // taskId: task.id,
        // taskName: task.name,
        // errorMessage: error instanceof Error ? error.message : String(error),
        // stack: error instanceof Error ? error.stack : undefined,
      // })
      Message.error(`Failed to log time: ${error instanceof Error ? error.message : 'Unknown error'}`)
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
          date: dayjs().format('YYYY-MM-DD'),
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
              { type: 'number', min: 1, message: 'Time must be at least 1 minute' },
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
