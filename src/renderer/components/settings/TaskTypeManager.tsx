/**
 * TaskTypeManager - CRUD UI for user-defined task types
 *
 * This component allows users to create, edit, delete, and reorder their
 * custom task types. Each type has a name, emoji, and color.
 *
 * Types are session-scoped - each session has its own set of types.
 */

import { useState, useEffect } from 'react'
import {
  Card,
  Button,
  Space,
  Typography,
  Input,
  Empty,
  Popconfirm,
  Modal,
  Form,
  Grid,
  Tag,
  List,
  Spin,
  Alert,
} from '@arco-design/web-react'
import {
  IconPlus,
  IconDelete,
  IconEdit,
  IconCheck,
} from '@arco-design/web-react/icon'
import {
  useUserTaskTypeStore,
  useSortedUserTaskTypes,
} from '@/renderer/store/useUserTaskTypeStore'
import { UserTaskType } from '@/shared/user-task-types'
import { Message } from '../common/Message'
import { logger } from '@/logger'

const { Title, Text } = Typography
const { Row, Col } = Grid

// Predefined color palette for users to choose from
const COLOR_PALETTE = [
  '#3B82F6', // Blue
  '#10B981', // Green
  '#F59E0B', // Amber
  '#EF4444', // Red
  '#8B5CF6', // Purple
  '#EC4899', // Pink
  '#06B6D4', // Cyan
  '#84CC16', // Lime
  '#F97316', // Orange
  '#6366F1', // Indigo
  '#14B8A6', // Teal
  '#A855F7', // Violet
]

// Common emoji options for task types
const EMOJI_OPTIONS = [
  '🎯', '💼', '📝', '🏠', '🎨', '📚', '💪', '🧠',
  '🔧', '📊', '🎮', '🛒', '🏃', '🍳', '🌱', '💰',
  '📧', '🤝', '📞', '✍️', '🔬', '🎵', '🚗', '⚡',
]

interface TaskTypeManagerProps {
  /** Whether to show as a card (for embedding) or standalone */
  embedded?: boolean
  /** Callback when types change (for parent components) */
  onTypesChange?: () => void
}

interface TypeFormData {
  name: string
  emoji: string
  color: string
}

export function TaskTypeManager({ embedded = false, onTypesChange }: TaskTypeManagerProps) {
  const userTaskTypes = useSortedUserTaskTypes()
  const {
    isLoading,
    error,
    isInitialized,
    loadTypes,
    createType,
    updateType,
    deleteType,
  } = useUserTaskTypeStore()

  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingType, setEditingType] = useState<UserTaskType | null>(null)
  const [form] = Form.useForm()

  // Load types on mount if not initialized
  useEffect(() => {
    if (!isInitialized) {
      loadTypes()
    }
  }, [isInitialized, loadTypes])

  const handleCreate = async () => {
    try {
      const values = await form.validate() as TypeFormData

      if (!values.name?.trim()) {
        Message.error('Please enter a type name')
        return
      }

      await createType({
        name: values.name.trim(),
        emoji: values.emoji || '📌',
        color: values.color || COLOR_PALETTE[0],
      })

      Message.success(`Created type "${values.name}"`)
      setShowCreateModal(false)
      form.resetFields()
      onTypesChange?.()
    } catch (err) {
      logger.ui.error('Failed to create type', {
        error: err instanceof Error ? err.message : String(err),
      }, 'type-create-error')
      Message.error('Failed to create type')
    }
  }

  const handleUpdate = async () => {
    if (!editingType) return

    try {
      const values = await form.validate() as TypeFormData

      if (!values.name?.trim()) {
        Message.error('Please enter a type name')
        return
      }

      await updateType(editingType.id, {
        name: values.name.trim(),
        emoji: values.emoji,
        color: values.color,
      })

      Message.success(`Updated type "${values.name}"`)
      setEditingType(null)
      form.resetFields()
      onTypesChange?.()
    } catch (err) {
      logger.ui.error('Failed to update type', {
        error: err instanceof Error ? err.message : String(err),
        typeId: editingType.id,
      }, 'type-update-error')
      Message.error('Failed to update type')
    }
  }

  const handleDelete = async (type: UserTaskType) => {
    try {
      await deleteType(type.id)
      Message.success(`Deleted type "${type.name}"`)
      onTypesChange?.()
    } catch (err) {
      logger.ui.error('Failed to delete type', {
        error: err instanceof Error ? err.message : String(err),
        typeId: type.id,
      }, 'type-delete-error')
      Message.error('Failed to delete type')
    }
  }

  const openEditModal = (type: UserTaskType) => {
    setEditingType(type)
    form.setFieldsValue({
      name: type.name,
      emoji: type.emoji,
      color: type.color,
    })
  }

  const closeModal = () => {
    setShowCreateModal(false)
    setEditingType(null)
    form.resetFields()
  }

  const renderTypeForm = () => (
    <Form form={form} layout="vertical">
      <Form.Item
        label="Type Name"
        field="name"
        rules={[
          { required: true, message: 'Please enter a name' },
          { maxLength: 50, message: 'Name must be 50 characters or less' },
        ]}
      >
        <Input placeholder="e.g., Deep Work, Meetings, Errands" maxLength={50} />
      </Form.Item>

      <Form.Item
        label="Emoji"
        field="emoji"
        initialValue="📌"
      >
        <Space wrap>
          {EMOJI_OPTIONS.map((emoji) => (
            <Button
              key={emoji}
              type={form.getFieldValue('emoji') === emoji ? 'primary' : 'secondary'}
              size="small"
              onClick={() => form.setFieldValue('emoji', emoji)}
              style={{ fontSize: 18, padding: '4px 8px' }}
            >
              {emoji}
            </Button>
          ))}
        </Space>
      </Form.Item>

      <Form.Item
        label="Color"
        field="color"
        initialValue={COLOR_PALETTE[0]}
      >
        <Space wrap>
          {COLOR_PALETTE.map((color) => (
            <Button
              key={color}
              size="small"
              onClick={() => form.setFieldValue('color', color)}
              style={{
                backgroundColor: color,
                border: form.getFieldValue('color') === color ? '3px solid #000' : '1px solid #ccc',
                width: 32,
                height: 32,
                padding: 0,
                borderRadius: 4,
              }}
            >
              {form.getFieldValue('color') === color && (
                <IconCheck style={{ color: '#fff' }} />
              )}
            </Button>
          ))}
        </Space>
      </Form.Item>
    </Form>
  )

  const renderTypeList = () => {
    if (isLoading) {
      return (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <Spin size={24} />
          <Text style={{ display: 'block', marginTop: 8 }}>Loading types...</Text>
        </div>
      )
    }

    if (error) {
      return (
        <Alert
          type="error"
          title="Failed to load types"
          content={error}
          style={{ marginBottom: 16 }}
        />
      )
    }

    if (userTaskTypes.length === 0) {
      return (
        <Empty
          description={
            <Space direction="vertical" align="center">
              <Text>No task types defined yet</Text>
              <Text type="secondary">
                Create your first type to start organizing your work
              </Text>
              <Button
                type="primary"
                icon={<IconPlus />}
                onClick={() => setShowCreateModal(true)}
                style={{ marginTop: 8 }}
              >
                Create Your First Type
              </Button>
            </Space>
          }
        />
      )
    }

    return (
      <List
        dataSource={userTaskTypes}
        render={(type: UserTaskType) => (
          <List.Item
            key={type.id}
            style={{
              padding: '12px 16px',
              borderLeft: `4px solid ${type.color}`,
              marginBottom: 8,
              backgroundColor: '#fafafa',
              borderRadius: 4,
            }}
            actions={[
              <Button
                key="edit"
                type="text"
                icon={<IconEdit />}
                onClick={() => openEditModal(type)}
              />,
              <Popconfirm
                key="delete"
                title="Delete this type?"
                content="Tasks using this type may become orphaned."
                onOk={() => handleDelete(type)}
              >
                <Button type="text" status="danger" icon={<IconDelete />} />
              </Popconfirm>,
            ]}
          >
            <List.Item.Meta
              avatar={
                <span style={{ fontSize: 24 }}>{type.emoji}</span>
              }
              title={
                <Space>
                  <Text style={{ fontWeight: 600 }}>{type.name}</Text>
                  <Tag
                    style={{
                      backgroundColor: type.color,
                      color: '#fff',
                      border: 'none',
                    }}
                  >
                    {type.color}
                  </Tag>
                </Space>
              }
              description={
                <Text type="secondary" style={{ fontSize: 12 }}>
                  ID: {type.id}
                </Text>
              }
            />
          </List.Item>
        )}
      />
    )
  }

  const content = (
    <>
      <Row justify="space-between" align="center" style={{ marginBottom: 16 }}>
        <Col>
          <Title heading={5} style={{ margin: 0 }}>
            Task Types ({userTaskTypes.length})
          </Title>
        </Col>
        <Col>
          {userTaskTypes.length > 0 && (
            <Button
              type="primary"
              icon={<IconPlus />}
              onClick={() => setShowCreateModal(true)}
            >
              Add Type
            </Button>
          )}
        </Col>
      </Row>

      {renderTypeList()}

      {/* Create Modal */}
      <Modal
        title="Create New Task Type"
        visible={showCreateModal}
        onOk={handleCreate}
        onCancel={closeModal}
        okText="Create"
        style={{ width: 500 }}
      >
        {renderTypeForm()}
      </Modal>

      {/* Edit Modal */}
      <Modal
        title={`Edit Type: ${editingType?.name || ''}`}
        visible={!!editingType}
        onOk={handleUpdate}
        onCancel={closeModal}
        okText="Save Changes"
        style={{ width: 500 }}
      >
        {renderTypeForm()}
      </Modal>
    </>
  )

  if (embedded) {
    return content
  }

  return (
    <Card style={{ maxWidth: 800, margin: '0 auto' }}>
      {content}
    </Card>
  )
}

/**
 * Preset templates for common workflows
 */
export const TYPE_TEMPLATES = {
  knowledgeWorker: [
    { name: 'Deep Work', emoji: '🎯', color: '#3B82F6' },
    { name: 'Meetings', emoji: '🤝', color: '#F59E0B' },
    { name: 'Admin', emoji: '📝', color: '#10B981' },
    { name: 'Personal', emoji: '🏠', color: '#8B5CF6' },
  ],
  creative: [
    { name: 'Create', emoji: '🎨', color: '#EC4899' },
    { name: 'Research', emoji: '🔬', color: '#06B6D4' },
    { name: 'Admin', emoji: '📊', color: '#F59E0B' },
    { name: 'Breaks', emoji: '☕', color: '#84CC16' },
  ],
  freelancer: [
    { name: 'Client Work', emoji: '💼', color: '#3B82F6' },
    { name: 'Business', emoji: '📈', color: '#10B981' },
    { name: 'Learning', emoji: '📚', color: '#8B5CF6' },
    { name: 'Personal', emoji: '🏃', color: '#F97316' },
  ],
}
