/**
 * TimeSinkManager Component
 *
 * UI for creating and managing time sinks (CRUD operations).
 * Used in settings panel to define time sink categories.
 */

import React, { useState } from 'react'
import {
  Card,
  Space,
  Typography,
  Button,
  Input,
  List,
  Modal,
  Form,
  Message,
  Popconfirm,
  Empty,
} from '@arco-design/web-react'
import { IconPlus, IconEdit, IconDelete } from '@arco-design/web-react/icon'
import { useTimeSinkStore, useSortedTimeSinks } from '../../store/useTimeSinkStore'
import { TimeSink, SUGGESTED_TIME_SINKS, validateSinkName, validateSinkColor, validateSinkEmoji } from '@shared/time-sink-types'

const { Title, Text } = Typography
const FormItem = Form.Item

// ============================================================================
// Types
// ============================================================================

interface TimeSinkFormValues {
  name: string
  emoji: string
  color: string
}

// ============================================================================
// Color Palette
// ============================================================================

const COLOR_PALETTE = [
  '#9B59B6', // Purple
  '#3498DB', // Blue
  '#27AE60', // Green
  '#E74C3C', // Red
  '#F39C12', // Orange
  '#1ABC9C', // Teal
  '#E67E22', // Dark Orange
  '#8B4513', // Brown
  '#2C3E50', // Dark Blue
  '#16A085', // Dark Teal
]

// ============================================================================
// Sub-Components
// ============================================================================

interface ColorPickerProps {
  value?: string
  onChange?: (color: string) => void
}

function ColorPicker({ value, onChange }: ColorPickerProps): React.ReactElement {
  return (
    <Space wrap>
      {COLOR_PALETTE.map((color) => (
        <div
          key={color}
          onClick={() => onChange?.(color)}
          style={{
            width: 28,
            height: 28,
            borderRadius: 4,
            backgroundColor: color,
            cursor: 'pointer',
            border: value === color ? '3px solid #165DFF' : '2px solid transparent',
            transition: 'border 0.2s',
          }}
        />
      ))}
    </Space>
  )
}

interface SinkFormModalProps {
  visible: boolean
  onClose: () => void
  onSubmit: (values: TimeSinkFormValues) => Promise<void>
  initialValues?: TimeSinkFormValues
  title: string
  submitText: string
}

function SinkFormModal({
  visible,
  onClose,
  onSubmit,
  initialValues,
  title,
  submitText,
}: SinkFormModalProps): React.ReactElement {
  const [form] = Form.useForm<TimeSinkFormValues>()
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (): Promise<void> => {
    try {
      const values = await form.validate()
      setIsSubmitting(true)

      // Validate
      const nameValidation = validateSinkName(values.name)
      if (!nameValidation.valid) {
        Message.error(nameValidation.error || 'Invalid name')
        return
      }

      const colorValidation = validateSinkColor(values.color)
      if (!colorValidation.valid) {
        Message.error(colorValidation.error || 'Invalid color')
        return
      }

      const emojiValidation = validateSinkEmoji(values.emoji)
      if (!emojiValidation.valid) {
        Message.error(emojiValidation.error || 'Invalid emoji')
        return
      }

      await onSubmit(values)
      form.resetFields()
      onClose()
    } catch {
      // Form validation failed
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Modal
      visible={visible}
      onCancel={onClose}
      title={title}
      onOk={handleSubmit}
      okText={submitText}
      confirmLoading={isSubmitting}
      unmountOnExit
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={initialValues || { emoji: '⏱️', color: COLOR_PALETTE[0] }}
      >
        <FormItem
          label="Name"
          field="name"
          rules={[{ required: true, message: 'Name is required' }]}
        >
          <Input placeholder="e.g., Phone calls, Coffee break" />
        </FormItem>

        <FormItem
          label="Emoji"
          field="emoji"
          rules={[{ required: true, message: 'Emoji is required' }]}
        >
          <Input placeholder="e.g., 📞, ☕" style={{ width: 100 }} />
        </FormItem>

        <FormItem
          label="Color"
          field="color"
          rules={[{ required: true, message: 'Color is required' }]}
        >
          <ColorPicker />
        </FormItem>
      </Form>
    </Modal>
  )
}

// ============================================================================
// Main Component
// ============================================================================

export function TimeSinkManager(): React.ReactElement {
  const sinks = useSortedTimeSinks()
  const createSink = useTimeSinkStore((state) => state.createSink)
  const updateSink = useTimeSinkStore((state) => state.updateSink)
  const deleteSink = useTimeSinkStore((state) => state.deleteSink)
  const isLoading = useTimeSinkStore((state) => state.isLoading)

  const [createModalVisible, setCreateModalVisible] = useState(false)
  const [editModalVisible, setEditModalVisible] = useState(false)
  const [editingSink, setEditingSink] = useState<TimeSink | null>(null)

  const handleCreate = async (values: TimeSinkFormValues): Promise<void> => {
    try {
      await createSink(values)
      Message.success('Time sink created')
    } catch {
      Message.error('Failed to create time sink')
    }
  }

  const handleUpdate = async (values: TimeSinkFormValues): Promise<void> => {
    if (!editingSink) return

    try {
      await updateSink(editingSink.id, values)
      Message.success('Time sink updated')
      setEditingSink(null)
    } catch {
      Message.error('Failed to update time sink')
    }
  }

  const handleDelete = async (id: string): Promise<void> => {
    try {
      await deleteSink(id)
      Message.success('Time sink deleted')
    } catch {
      Message.error('Failed to delete time sink')
    }
  }

  const handleEdit = (sink: TimeSink): void => {
    setEditingSink(sink)
    setEditModalVisible(true)
  }

  const handleAddSuggested = async (suggestion: { name: string; emoji: string; color: string }): Promise<void> => {
    try {
      await createSink(suggestion)
      Message.success(`Added "${suggestion.name}"`)
    } catch {
      Message.error('Failed to add time sink')
    }
  }

  return (
    <Card>
      <Space direction="vertical" style={{ width: '100%' }}>
        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
          <Title heading={6} style={{ margin: 0 }}>
            ⏱️ Time Sinks
          </Title>
          <Button
            type="primary"
            icon={<IconPlus />}
            onClick={() => setCreateModalVisible(true)}
          >
            Add Time Sink
          </Button>
        </Space>

        <Text type="secondary" style={{ fontSize: '12px' }}>
          Time sinks are activities that take time but never complete (e.g., phone calls, breaks).
        </Text>

        {sinks.length === 0 ? (
          <Space direction="vertical" align="center" style={{ width: '100%' }}>
            <Empty description="No time sinks defined" />
            <Space direction="vertical" align="center">
              <Text type="secondary">Quick add suggested time sinks:</Text>
              <Space wrap>
                {SUGGESTED_TIME_SINKS.slice(0, 4).map((suggestion) => (
                  <Button
                    key={suggestion.name}
                    size="small"
                    onClick={() => handleAddSuggested(suggestion)}
                  >
                    {suggestion.emoji} {suggestion.name}
                  </Button>
                ))}
              </Space>
            </Space>
          </Space>
        ) : (
          <List
            loading={isLoading}
            dataSource={sinks}
            render={(sink: TimeSink) => (
              <List.Item
                key={sink.id}
                actions={[
                  <Button
                    key="edit"
                    type="text"
                    icon={<IconEdit />}
                    onClick={() => handleEdit(sink)}
                  />,
                  <Popconfirm
                    key="delete"
                    title="Delete this time sink?"
                    content="All logged time for this sink will also be deleted."
                    onOk={() => handleDelete(sink.id)}
                  >
                    <Button type="text" icon={<IconDelete />} status="danger" />
                  </Popconfirm>,
                ]}
              >
                <List.Item.Meta
                  avatar={
                    <div
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 8,
                        backgroundColor: sink.color,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 20,
                      }}
                    >
                      {sink.emoji}
                    </div>
                  }
                  title={sink.name}
                />
              </List.Item>
            )}
          />
        )}

        {/* Quick add more if already have some */}
        {sinks.length > 0 && sinks.length < SUGGESTED_TIME_SINKS.length && (
          <div style={{ marginTop: 8 }}>
            <Text type="secondary" style={{ fontSize: '12px' }}>
              Quick add:
            </Text>
            <Space wrap style={{ marginTop: 4 }}>
              {SUGGESTED_TIME_SINKS.filter(
                (s) => !sinks.some((existing) => existing.name === s.name),
              )
                .slice(0, 3)
                .map((suggestion) => (
                  <Button
                    key={suggestion.name}
                    size="mini"
                    onClick={() => handleAddSuggested(suggestion)}
                  >
                    {suggestion.emoji} {suggestion.name}
                  </Button>
                ))}
            </Space>
          </div>
        )}
      </Space>

      {/* Create Modal */}
      <SinkFormModal
        visible={createModalVisible}
        onClose={() => setCreateModalVisible(false)}
        onSubmit={handleCreate}
        title="Create Time Sink"
        submitText="Create"
      />

      {/* Edit Modal */}
      <SinkFormModal
        visible={editModalVisible}
        onClose={() => {
          setEditModalVisible(false)
          setEditingSink(null)
        }}
        onSubmit={handleUpdate}
        initialValues={
          editingSink
            ? { name: editingSink.name, emoji: editingSink.emoji, color: editingSink.color }
            : undefined
        }
        title="Edit Time Sink"
        submitText="Save"
      />
    </Card>
  )
}
