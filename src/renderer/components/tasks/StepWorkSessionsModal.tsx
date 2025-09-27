import { useState, useEffect } from 'react'
import { TaskType } from '@shared/enums'
import {
  Modal,
  Table,
  Button,
  Space,
  Typography,
  Tag,
  Popconfirm,
  Form,
  InputNumber,
  Input,
  DatePicker,
} from '@arco-design/web-react'
import {
  IconEdit,
  IconDelete,
  IconClockCircle,
} from '@arco-design/web-react/icon'
import { getDatabase } from '../../services/database'
import { Message } from '../common/Message'
import { formatDuration } from '../../utils/dateUtils'
import dayjs from 'dayjs'
import { logger } from '@/shared/logger'


const { Text } = Typography

interface StepWorkSessionsModalProps {
  visible: boolean
  onClose: () => void
  stepId: string
  stepName: string
  taskId: string
  onSessionsUpdated?: () => void
}

interface WorkSession {
  id: string
  taskId: string
  stepId?: string
  type: string
  startTime: Date
  endTime?: Date
  plannedMinutes: number
  actualMinutes?: number
  notes?: string
}

export function StepWorkSessionsModal({
  visible,
  onClose,
  stepId,
  stepName,
  taskId,
  onSessionsUpdated,
}: StepWorkSessionsModalProps) {
  const [sessions, setSessions] = useState<WorkSession[]>([])
  const [loading, setLoading] = useState(false)
  const [editingSession, setEditingSession] = useState<WorkSession | null>(null)
  const [form] = Form.useForm()

  const loadSessions = async () => {
    setLoading(true)
    try {
      const data = await getDatabase().getStepWorkSessions(stepId)
      setSessions(data)
    } catch (error) {
      logger.ui.error('Failed to load work sessions:', error)
      Message.error('Failed to load work sessions')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (visible && stepId) {
      loadSessions()
    }
  }, [visible, stepId])

  const handleDelete = async (sessionId: string) => {
    try {
      await getDatabase().deleteWorkSession(sessionId)
      Message.success('Work session deleted')
      loadSessions()
      onSessionsUpdated?.()
    } catch (error) {
      logger.ui.error('Failed to delete work session:', error)
      Message.error('Failed to delete work session')
    }
  }

  const handleEdit = (session: WorkSession) => {
    setEditingSession(session)
    form.setFieldsValue({
      plannedMinutes: session.plannedMinutes,
      actualMinutes: session.actualMinutes || session.plannedMinutes,
      notes: session.notes,
      startTime: dayjs(session.startTime),
    })
  }

  const handleSaveEdit = async () => {
    try {
      const values = await form.validate()

      await getDatabase().updateWorkSession(editingSession!.id, {
        plannedMinutes: values.plannedMinutes,
        actualMinutes: values.actualMinutes,
        notes: values.notes,
        startTime: values.startTime?.toDate(),
      })

      Message.success('Work session updated')
      setEditingSession(null)
      form.resetFields()
      loadSessions()
      onSessionsUpdated?.()
    } catch (error) {
      logger.ui.error('Failed to update work session:', error)
      Message.error('Failed to update work session')
    }
  }

  const handleAddSession = async () => {
    try {
      const values = await form.validate()

      // Handle the date properly - it might already be a Date object or a dayjs object
      const startTime = values.startTime
        ? (typeof values.startTime.toDate === 'function' ? values.startTime.toDate() : new Date(values.startTime))
        : new Date()

      await getDatabase().createStepWorkSession({
        taskStepId: stepId,
        taskId: taskId,
        startTime: startTime,
        duration: values.plannedMinutes,
        notes: values.notes || '',
      })

      Message.success('Work session added')
      setEditingSession(null)
      form.resetFields()
      loadSessions()
      onSessionsUpdated?.()
    } catch (error) {
      logger.ui.error('Failed to add work session:', error)
      Message.error('Failed to add work session')
    }
  }

  const columns = [
    {
      title: 'Date',
      dataIndex: 'startTime',
      render: (time: string | Date) => dayjs(time).format('MMM D, h:mm A'),
      width: 150,
    },
    {
      title: 'Type',
      dataIndex: 'type',
      render: (type: string) => (
        <Tag color={type === TaskType.Focused ? 'blue' : 'green'}>
          {type}
        </Tag>
      ),
      width: 100,
    },
    {
      title: 'Planned',
      dataIndex: 'plannedMinutes',
      render: (minutes: number) => formatDuration(minutes),
      width: 100,
    },
    {
      title: 'Actual',
      dataIndex: 'actualMinutes',
      render: (minutes?: number) => minutes ? formatDuration(minutes) : '-',
      width: 100,
    },
    {
      title: 'Notes',
      dataIndex: 'notes',
      ellipsis: true,
    },
    {
      title: 'Actions',
      render: (_: any, record: WorkSession) => (
        <Space>
          <Button
            type="text"
            size="small"
            icon={<IconEdit />}
            onClick={() => handleEdit(record)}
          />
          <Popconfirm
            title="Delete this work session?"
            onOk={() => handleDelete(record.id)}
          >
            <Button
              type="text"
              size="small"
              status="danger"
              icon={<IconDelete />}
            />
          </Popconfirm>
        </Space>
      ),
      width: 100,
    },
  ]

  const totalPlanned = sessions.reduce((sum, s) => sum + s.plannedMinutes, 0)
  const totalActual = sessions.reduce((sum, s) => sum + (s.actualMinutes || 0), 0)

  return (
    <>
      <Modal
        title={
          <Space>
            <IconClockCircle />
            <span>Work Sessions: {stepName}</span>
          </Space>
        }
        visible={visible}
        onCancel={onClose}
        footer={
          <Space>
            <Button onClick={onClose}>Close</Button>
            <Button
              type="primary"
              onClick={() => {
                form.resetFields()
                form.setFieldsValue({
                  startTime: dayjs(),
                  plannedMinutes: 30,
                  notes: '',
                })
                setEditingSession({} as WorkSession) // Signal new session
              }}
            >
              Add Session
            </Button>
          </Space>
        }
        style={{ width: 800 }}
      >
        <Space direction="vertical" style={{ width: '100%' }} size="large">
          <Space>
            <Text>Total Planned: {formatDuration(totalPlanned)}</Text>
            <Text>•</Text>
            <Text>Total Logged: {formatDuration(totalActual)}</Text>
          </Space>

          <Table
            columns={columns}
            data={sessions}
            loading={loading}
            pagination={false}
            rowKey="id"
            scroll={{ y: 400 }}
          />
        </Space>
      </Modal>

      <Modal
        title={editingSession?.id ? 'Edit Work Session' : 'Add Work Session'}
        visible={!!editingSession}
        onOk={editingSession?.id ? handleSaveEdit : handleAddSession}
        onCancel={() => {
          setEditingSession(null)
          form.resetFields()
        }}
        autoFocus={false}
        focusLock={true}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            label="Start Time"
            field="startTime"
            rules={[{ required: true, message: 'Start time is required' }]}
          >
            <DatePicker
              showTime
              format="MMM D, YYYY h:mm A"
              style={{ width: '100%' }}
            />
          </Form.Item>

          <Form.Item
            label="Minutes Worked"
            field="plannedMinutes"
            rules={[
              { required: true, message: 'Time is required' },
              { type: 'number', min: 1, message: 'Must be at least 1 minute' },
            ]}
          >
            <InputNumber
              min={1}
              placeholder="Enter minutes worked"
              style={{ width: '100%' }}
            />
          </Form.Item>

          {editingSession?.id && (
            <Form.Item
              label="Actual Minutes"
              field="actualMinutes"
              rules={[
                { type: 'number', min: 0, message: 'Cannot be negative' },
              ]}
            >
              <InputNumber
                min={0}
                placeholder="Enter actual minutes (optional)"
                style={{ width: '100%' }}
              />
            </Form.Item>
          )}

          <Form.Item label="Notes" field="notes">
            <Input.TextArea
              placeholder="Add notes (optional)"
              rows={3}
            />
          </Form.Item>
        </Form>
      </Modal>
    </>
  )
}
