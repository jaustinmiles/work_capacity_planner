import { useState, useEffect } from 'react'
import {
  Modal,
  Button,
  Space,
  Typography,
  Card,
  Form,
  Input,
  Tag,
  Popconfirm,
  Empty,
  List,
} from '@arco-design/web-react'
import {
  IconPlus,
  IconSwap,
  IconEdit,
  IconDelete,
  IconUserGroup,
  IconCalendar,
} from '@arco-design/web-react/icon'
import { Session } from '@shared/types'
import { getDatabase } from '../../services/database'
import { Message } from '../common/Message'
import dayjs from 'dayjs'

const { Title, Text } = Typography
const { TextArea } = Input

interface SessionManagerProps {
  visible: boolean
  onClose: () => void
  onSessionChange?: () => void
}

export function SessionManager({ visible, onClose, onSessionChange }: SessionManagerProps) {
  const [sessions, setSessions] = useState<Session[]>([])
  const [activeSession, setActiveSession] = useState<Session | null>(null)
  const [, setLoading] = useState(false)
  const [createModalVisible, setCreateModalVisible] = useState(false)
  const [editingSession, setEditingSession] = useState<Session | null>(null)
  const [form] = Form.useForm()

  useEffect(() => {
    if (visible) {
      loadSessions()
    }
  }, [visible])

  const loadSessions = async () => {
    setLoading(true)
    try {
      const db = getDatabase()
      const sessionList = await db.getSessions()
      setSessions(sessionList)
      setActiveSession(sessionList.find(s => s.isActive) || null)
    } catch (error) {
      console.error('Failed to load sessions:', error)
      Message.error('Failed to load sessions')
    } finally {
      setLoading(false)
    }
  }

  const handleCreateSession = async () => {
    try {
      const values = await form.validate()
      const db = getDatabase()
      await db.createSession(values.name, values.description)

      Message.success('Session created and activated')
      form.resetFields()
      setCreateModalVisible(false)
      await loadSessions()
      onSessionChange?.()
    } catch (error) {
      console.error('Failed to create session:', error)
      Message.error('Failed to create session')
    }
  }

  const handleSwitchSession = async (sessionId: string) => {
    try {
      const db = getDatabase()
      await db.switchSession(sessionId)

      Message.success('Switched to session')
      await loadSessions()
      onSessionChange?.()
    } catch (error) {
      console.error('Failed to switch session:', error)
      Message.error('Failed to switch session')
    }
  }

  const handleUpdateSession = async () => {
    if (!editingSession) return

    try {
      const values = await form.validate()
      const db = getDatabase()
      await db.updateSession(editingSession.id, values)

      Message.success('Session updated')
      form.resetFields()
      setEditingSession(null)
      await loadSessions()
    } catch (error) {
      console.error('Failed to update session:', error)
      Message.error('Failed to update session')
    }
  }

  const handleDeleteSession = async (sessionId: string) => {
    try {
      const db = getDatabase()
      await db.deleteSession(sessionId)

      Message.success('Session deleted')
      await loadSessions()
    } catch (error) {
      console.error('Failed to delete session:', error)
      if (error instanceof Error && error.message.includes('active')) {
        Message.error('Cannot delete the active session')
      } else {
        Message.error('Failed to delete session')
      }
    }
  }

  return (
    <>
      <Modal
        title={
          <Space>
            <IconUserGroup />
            <Text>Session Management</Text>
          </Space>
        }
        visible={visible}
        onCancel={onClose}
        footer={null}
        width={800}
        maskClosable={false}
      >
        <Space direction="vertical" style={{ width: '100%' }} size="large">
          {/* Active Session */}
          {activeSession && (
            <Card
              title="Active Session"
              extra={
                <Tag color="green" icon={<IconUserGroup />}>
                  Active
                </Tag>
              }
            >
              <Space direction="vertical" style={{ width: '100%' }}>
                <Title heading={5}>{activeSession.name}</Title>
                {activeSession.description && (
                  <Text type="secondary">{activeSession.description}</Text>
                )}
                <Space>
                  <Text type="secondary">
                    <IconCalendar /> Created: {dayjs(activeSession.createdAt).format('MMM D, YYYY')}
                  </Text>
                  <Text type="secondary">
                    Last used: {dayjs(activeSession.updatedAt).fromNow()}
                  </Text>
                </Space>
              </Space>
            </Card>
          )}

          {/* Session List */}
          <Card
            title="All Sessions"
            extra={
              <Button
                type="primary"
                icon={<IconPlus />}
                onClick={() => setCreateModalVisible(true)}
              >
                New Session
              </Button>
            }
          >
            {sessions.length === 0 ? (
              <Empty description="No sessions found" />
            ) : (
              <List
                dataSource={sessions}
                render={(session) => (
                  <List.Item
                    key={session.id}
                    actions={[
                      !session.isActive && (
                        <Button
                          type="text"
                          icon={<IconSwap />}
                          onClick={() => handleSwitchSession(session.id)}
                        >
                          Switch
                        </Button>
                      ),
                      <Button
                        type="text"
                        icon={<IconEdit />}
                        onClick={() => {
                          setEditingSession(session)
                          form.setFieldsValue({
                            name: session.name,
                            description: session.description,
                          })
                        }}
                      />,
                      !session.isActive && (
                        <Popconfirm
                          title="Delete Session"
                          content="Are you sure? All tasks and data in this session will be permanently deleted."
                          onOk={() => handleDeleteSession(session.id)}
                          okText="Delete"
                          okButtonProps={{ status: 'danger' }}
                        >
                          <Button
                            type="text"
                            status="danger"
                            icon={<IconDelete />}
                          />
                        </Popconfirm>
                      ),
                    ].filter(Boolean)}
                  >
                    <List.Item.Meta
                      title={
                        <Space>
                          {session.name}
                          {session.isActive && (
                            <Tag color="green" size="small">Active</Tag>
                          )}
                        </Space>
                      }
                      description={session.description || 'No description'}
                    />
                  </List.Item>
                )}
              />
            )}
          </Card>
        </Space>
      </Modal>

      {/* Create Session Modal */}
      <Modal
        title="Create New Session"
        visible={createModalVisible}
        onOk={handleCreateSession}
        onCancel={() => {
          setCreateModalVisible(false)
          form.resetFields()
        }}
        okText="Create Session"
      >
        <Form form={form} layout="vertical">
          <Form.Item
            label="Session Name"
            field="name"
            rules={[{ required: true, message: 'Please enter a session name' }]}
          >
            <Input placeholder="e.g., Project Alpha, Q4 Planning" />
          </Form.Item>
          <Form.Item
            label="Description"
            field="description"
          >
            <TextArea
              placeholder="Describe what this session is for..."
              rows={3}
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* Edit Session Modal */}
      <Modal
        title="Edit Session"
        visible={!!editingSession}
        onOk={handleUpdateSession}
        onCancel={() => {
          setEditingSession(null)
          form.resetFields()
        }}
        okText="Update Session"
      >
        <Form form={form} layout="vertical">
          <Form.Item
            label="Session Name"
            field="name"
            rules={[{ required: true, message: 'Please enter a session name' }]}
          >
            <Input />
          </Form.Item>
          <Form.Item
            label="Description"
            field="description"
          >
            <TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  )
}
