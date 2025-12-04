import { useState, useEffect } from 'react'
import { UnifiedWorkSession } from '@shared/unified-work-session-types'
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
import { logger } from '@/logger'


const { Text } = Typography

interface WorkSessionsModalProps {
  visible: boolean
  onClose: () => void
  taskId: string
  taskName: string
  onSessionsUpdated?: () => void
}

export function WorkSessionsModal({
  visible,
  onClose,
  taskId,
  taskName,
  onSessionsUpdated,
}: WorkSessionsModalProps) {
  const [sessions, setSessions] = useState<UnifiedWorkSession[]>([])
  const [loading, setLoading] = useState(false)
  const [editingSession, setEditingSession] = useState<UnifiedWorkSession | null>(null)
  const [form] = Form.useForm()

  const loadSessions = async () => {
    setLoading(true)
    try {
      const data = await getDatabase().getWorkSessionsForTask(taskId)
      setSessions(data)
    } catch (error) {
      logger.ui.error('Failed to load work sessions', {
        error: error instanceof Error ? error.message : String(error),
        taskId,
      }, 'task-sessions-load-error')
      Message.error('Failed to load work sessions')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (visible && taskId) {
      loadSessions()
    }
  }, [visible, taskId])

  const handleDelete = async (sessionId: string) => {
    try {
      await getDatabase().deleteWorkSession(sessionId)
      Message.success('Work session deleted')
      loadSessions()
      onSessionsUpdated?.()
    } catch (error) {
      logger.ui.error('Failed to delete work session', {
        error: error instanceof Error ? error.message : String(error),
        sessionId,
        taskId,
      }, 'task-session-delete-error')
      Message.error('Failed to delete work session')
    }
  }

  const handleEdit = (session: UnifiedWorkSession) => {
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
      logger.ui.error('Failed to update work session', {
        error: error instanceof Error ? error.message : String(error),
        sessionId: editingSession!.id,
        taskId,
      }, 'task-session-update-error')
      Message.error('Failed to update work session')
    }
  }

  const columns = [
    {
      title: 'Date',
      dataIndex: 'startTime',
      render: (time: Date) => dayjs(time).format('MMM D, h:mm A'),
      width: 150,
    },
    {
      title: 'Type',
      dataIndex: 'type',
      render: (type: string) => (
        <Tag color={sessions.find(s => s.type === type)?.color || 'blue'}>
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
      render: (_: any, record: UnifiedWorkSession) => (
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
            <span>Work Sessions for {taskName}</span>
          </Space>
        }
        visible={visible}
        onCancel={onClose}
        footer={null}
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
        title="Edit Work Session"
        visible={!!editingSession}
        onOk={handleSaveEdit}
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
            label="Planned Minutes"
            field="plannedMinutes"
            rules={[
              { required: true, message: 'Planned time is required' },
              { type: 'number', min: 1, message: 'Must be at least 1 minute' },
            ]}
          >
            <InputNumber
              min={1}
              placeholder="Enter planned minutes"
              style={{ width: '100%' }}
            />
          </Form.Item>

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
