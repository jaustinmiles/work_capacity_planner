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
import { logger } from '@/logger'
import { useTaskStore } from '../../store/useTaskStore'
import { useWorkPatternStore } from '../../store/useWorkPatternStore'
import { useSchedulerStore } from '../../store/useSchedulerStore'
import { resetStoreConnectorState } from '../../store/storeConnector'


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
      logger.ui.error('Failed to load sessions', {
        error: error instanceof Error ? error.message : String(error),
      }, 'sessions-load-error')
      Message.error('Failed to load sessions')
    } finally {
      setLoading(false)
    }
  }

  const handleCreateSession = async () => {
    try {
      const values = await form.validate()
      const db = getDatabase()

      // CRITICAL: Clear all stores BEFORE creating/switching session
      // This ensures no stale data from old session leaks into the new one
      logger.ui.info('Clearing stores before session create', {
        newSessionName: values.name,
      }, 'session-create-clear')
      resetStoreConnectorState()
      useWorkPatternStore.getState().clearWorkPatterns()
      useSchedulerStore.getState().clearSchedule()

      await db.createSession(values.name, values.description)

      Message.success('Session created and activated')
      form.resetFields()
      setCreateModalVisible(false)
      await loadSessions()
      onSessionChange?.()

      // Refresh stores for new session
      await useTaskStore.getState().initializeData()
      await useWorkPatternStore.getState().loadWorkPatterns()
      // Schedule will automatically recompute via store subscriptions
    } catch (error) {
      logger.ui.error('Failed to create session', {
        error: error instanceof Error ? error.message : String(error),
      }, 'session-create-error')
      Message.error('Failed to create session')
    }
  }

  const handleSwitchSession = async (sessionId: string) => {
    try {
      const _session = sessions.find(s => s.id === sessionId)
      logger.ui.info('Switching session', {
        from: activeSession?.name || 'none',
        to: _session?.name || 'unknown',
        sessionId,
      })

      // CRITICAL: Clear all stores BEFORE switching session
      // This ensures no stale data from old session leaks into the new one
      logger.ui.info('Clearing stores before session switch', {
        fromSession: activeSession?.name,
        toSession: _session?.name,
      }, 'session-switch-clear')
      resetStoreConnectorState()
      useWorkPatternStore.getState().clearWorkPatterns()
      useSchedulerStore.getState().clearSchedule()

      const db = getDatabase()
      await db.switchSession(sessionId)

      Message.success('Switched to session')
      await loadSessions()
      onSessionChange?.()

      // Refresh stores for new session
      await useTaskStore.getState().initializeData()
      await useWorkPatternStore.getState().loadWorkPatterns()
      // Schedule will automatically recompute via store subscriptions
    } catch (error) {
      logger.ui.error('Failed to switch session', {
        error: error instanceof Error ? error.message : String(error),
        sessionId,
      }, 'session-switch-error')
      Message.error('Failed to switch session')
    }
  }

  const handleUpdateSession = async () => {
    if (!editingSession) return

    try {
      const values = await form.validate()
      logger.ui.info('Updating session', {
        sessionId: editingSession.id,
        oldName: editingSession.name,
        newName: values.name,
      })
      const db = getDatabase()
      await db.updateSession(editingSession.id, values)

      logger.ui.debug('Session updated successfully', { sessionId: editingSession.id })
      Message.success('Session updated')
      form.resetFields()
      setEditingSession(null)
      await loadSessions()
    } catch (error) {
      logger.ui.error('Failed to update session', {
        error: error instanceof Error ? error.message : String(error),
        sessionId: editingSession?.id,
      }, 'session-update-error')
      Message.error('Failed to update session')
    }
  }

  const handleDeleteSession = async (sessionId: string) => {
    try {
      logger.ui.info('Attempting to delete session', { sessionId })
      const db = getDatabase()
      await db.deleteSession(sessionId)

      logger.ui.info('Session deleted successfully', { sessionId })
      Message.success('Session deleted')
      await loadSessions()

      // Clear stores to ensure no stale data, then refresh
      resetStoreConnectorState()
      useWorkPatternStore.getState().clearWorkPatterns()
      useSchedulerStore.getState().clearSchedule()
      await useTaskStore.getState().initializeData()
      await useWorkPatternStore.getState().loadWorkPatterns()
      // Schedule will automatically recompute via reactive subscriptions
    } catch (error) {
      logger.ui.error('Failed to delete session', {
        error: error instanceof Error ? error.message : String(error),
        sessionId,
      })
      if (error instanceof Error && error.message.includes('active')) {
        Message.error('Cannot delete the active session')
      } else if (error instanceof Error && error.message.includes('not found')) {
        Message.error('Session not found')
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
        style={{ width: 800 }}
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
                        key="edit"
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
                          key="delete"
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
