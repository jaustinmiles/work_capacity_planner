import React, { useState, useEffect } from 'react'
import {
  List,
  Button,
  Tag,
  Space,
  Typography,
  Card,
  Radio,
  Checkbox,
  Empty,
  Spin,
  Notification,
  Modal,
  Input,
  Select,
} from '@arco-design/web-react'
import {
  IconCheck,
  IconRefresh,
  IconBug,
  IconBulb,
  IconPlus,
  IconQuestionCircleFill,
  IconEdit,
} from '@arco-design/web-react/icon'

const { Text, Paragraph } = Typography
const { TextArea } = Input

interface FeedbackItem {
  type: 'bug' | 'feature' | 'improvement' | 'other'
  priority: 'low' | 'medium' | 'high' | 'critical'
  title: string
  description: string
  components?: string[]
  steps?: string
  expected?: string
  actual?: string
  timestamp: string
  sessionId: string
  resolved?: boolean
}

interface FeedbackViewerProps {
  onClose?: () => void
}

export function FeedbackViewer({ onClose: _onClose }: FeedbackViewerProps) {
  const [feedback, setFeedback] = useState<FeedbackItem[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'pending' | 'resolved'>('pending')
  const [typeFilter, setTypeFilter] = useState<string[]>([])
  const [priorityFilter, setPriorityFilter] = useState<string[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [editingItem, setEditingItem] = useState<FeedbackItem | null>(null)
  const [editForm, setEditForm] = useState<Partial<FeedbackItem>>({})

  useEffect(() => {
    loadFeedback()
  }, [])

  const loadFeedback = async () => {
    setLoading(true)
    try {
      if (window.electronAPI?.loadFeedback) {
        const data = await window.electronAPI.loadFeedback()
        const flattenedData = flattenFeedback(data)
        setFeedback(flattenedData)
      } else if (typeof window !== 'undefined' && window.localStorage) {
        const stored = window.localStorage.getItem('task-planner-feedback')
        if (stored) {
          const data = JSON.parse(stored)
          const flattenedData = flattenFeedback(data)
          setFeedback(flattenedData)
        }
      }
    } catch (error) {
      console.error('Failed to load feedback:', error)
      Notification.error({
        title: 'Failed to load feedback',
        content: String(error),
      })
    } finally {
      setLoading(false)
    }
  }

  const flattenFeedback = (data: any): FeedbackItem[] => {
    const items: FeedbackItem[] = []
    const processItem = (item: any) => {
      if (Array.isArray(item)) {
        item.forEach(processItem)
      } else if (item && typeof item === 'object' && 'type' in item) {
        items.push(item as FeedbackItem)
      }
    }
    if (Array.isArray(data)) {
      data.forEach(processItem)
    }
    return items
  }

  const markAsResolved = async (itemIds: string[]) => {
    try {
      const updatedFeedback = feedback.map(item => {
        if (itemIds.some(id => `${item.timestamp}-${item.sessionId}` === id)) {
          return { ...item, resolved: true }
        }
        return item
      })

      if (window.electronAPI?.updateFeedback) {
        await window.electronAPI.updateFeedback(updatedFeedback)
      } else if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem('task-planner-feedback', JSON.stringify(updatedFeedback))
      }

      setFeedback(updatedFeedback)
      setSelectedIds(new Set())
      Notification.success({
        title: 'Feedback marked as resolved',
        content: `${itemIds.length} item(s) marked as resolved`,
      })
    } catch (error) {
      console.error('Failed to update feedback:', error)
      Notification.error({
        title: 'Failed to update feedback',
        content: String(error),
      })
    }
  }

  const markAsUnresolved = async (itemIds: string[]) => {
    try {
      const updatedFeedback = feedback.map(item => {
        if (itemIds.some(id => `${item.timestamp}-${item.sessionId}` === id)) {
          return { ...item, resolved: false }
        }
        return item
      })

      if (window.electronAPI?.updateFeedback) {
        await window.electronAPI.updateFeedback(updatedFeedback)
      } else if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem('task-planner-feedback', JSON.stringify(updatedFeedback))
      }

      setFeedback(updatedFeedback)
      setSelectedIds(new Set())
      Notification.success({
        title: 'Feedback marked as pending',
        content: `${itemIds.length} item(s) marked as pending`,
      })
    } catch (error) {
      console.error('Failed to update feedback:', error)
      Notification.error({
        title: 'Failed to update feedback',
        content: String(error),
      })
    }
  }

  const getIcon = (type: string) => {
    switch (type) {
      case 'bug':
        return <IconBug />
      case 'feature':
        return <IconPlus />
      case 'improvement':
        return <IconBulb />
      default:
        return <IconQuestionCircleFill />
    }
  }

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'critical':
        return 'red'
      case 'high':
        return 'orange'
      case 'medium':
        return 'gold'
      case 'low':
        return 'green'
      default:
        return 'default'
    }
  }

  const filteredFeedback = feedback.filter(item => {
    if (filter === 'pending' && item.resolved) return false
    if (filter === 'resolved' && !item.resolved) return false
    if (typeFilter.length > 0 && !typeFilter.includes(item.type)) return false
    if (priorityFilter.length > 0 && !priorityFilter.includes(item.priority)) return false
    return true
  })

  const handleSelectAll = () => {
    if (selectedIds.size === filteredFeedback.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filteredFeedback.map(item => `${item.timestamp}-${item.sessionId}`)))
    }
  }

  const handleToggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds)
    if (newSelected.has(id)) {
      newSelected.delete(id)
    } else {
      newSelected.add(id)
    }
    setSelectedIds(newSelected)
  }

  const handleEditItem = (item: FeedbackItem) => {
    setEditingItem(item)
    setEditForm({ ...item })
  }

  const handleSaveEdit = async () => {
    if (!editingItem || !editForm) return

    try {
      const updatedFeedback = feedback.map(item => {
        const itemId = `${item.timestamp}-${item.sessionId}`
        const editingId = `${editingItem.timestamp}-${editingItem.sessionId}`
        if (itemId === editingId) {
          return { ...item, ...editForm }
        }
        return item
      })

      if (window.electronAPI?.updateFeedback) {
        await window.electronAPI.updateFeedback(updatedFeedback)
      } else if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem('task-planner-feedback', JSON.stringify(updatedFeedback))
      }

      setFeedback(updatedFeedback)
      setEditingItem(null)
      setEditForm({})
      Notification.success({
        title: 'Feedback updated',
        content: 'The feedback item has been updated successfully',
      })
    } catch (error) {
      console.error('Failed to update feedback:', error)
      Notification.error({
        title: 'Failed to update feedback',
        content: String(error),
      })
    }
  }

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 60 }}>
        <Spin size={40} />
      </div>
    )
  }

  return (
    <div style={{ padding: 16 }}>
      <Space direction="vertical" style={{ width: '100%' }} size="large">
        <Card>
          <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 16 }}>
            <Space>
              <Radio.Group value={filter} onChange={setFilter}>
                <Radio value="all">All ({feedback.length})</Radio>
                <Radio value="pending">Pending ({feedback.filter(f => !f.resolved).length})</Radio>
                <Radio value="resolved">Resolved ({feedback.filter(f => f.resolved).length})</Radio>
              </Radio.Group>
            </Space>
            <Space>
              <Button icon={<IconRefresh />} onClick={loadFeedback}>
                Refresh
              </Button>
              {selectedIds.size > 0 && (
                <>
                  <Button
                    type="primary"
                    icon={<IconCheck />}
                    onClick={() => markAsResolved(Array.from(selectedIds))}
                  >
                    Mark as Resolved ({selectedIds.size})
                  </Button>
                  <Button
                    onClick={() => markAsUnresolved(Array.from(selectedIds))}
                  >
                    Mark as Pending ({selectedIds.size})
                  </Button>
                </>
              )}
            </Space>
          </Space>

          <Space style={{ marginBottom: 16 }}>
            <Text>Type Filter:</Text>
            <Checkbox.Group value={typeFilter} onChange={setTypeFilter}>
              <Checkbox value="bug">Bug</Checkbox>
              <Checkbox value="feature">Feature</Checkbox>
              <Checkbox value="improvement">Improvement</Checkbox>
              <Checkbox value="other">Other</Checkbox>
            </Checkbox.Group>
          </Space>

          <Space style={{ marginBottom: 16 }}>
            <Text>Priority Filter:</Text>
            <Checkbox.Group value={priorityFilter} onChange={setPriorityFilter}>
              <Checkbox value="critical">Critical</Checkbox>
              <Checkbox value="high">High</Checkbox>
              <Checkbox value="medium">Medium</Checkbox>
              <Checkbox value="low">Low</Checkbox>
            </Checkbox.Group>
          </Space>

          {filteredFeedback.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <Checkbox
                checked={selectedIds.size === filteredFeedback.length && filteredFeedback.length > 0}
                indeterminate={selectedIds.size > 0 && selectedIds.size < filteredFeedback.length}
                onChange={handleSelectAll}
              >
                Select All
              </Checkbox>
            </div>
          )}
        </Card>

        {filteredFeedback.length === 0 ? (
          <Empty description="No feedback items found" />
        ) : (
          <List
            dataSource={filteredFeedback}
            render={(item, _index) => {
              const itemId = `${item.timestamp}-${item.sessionId}`
              const isSelected = selectedIds.has(itemId)

              return (
                <List.Item
                  key={itemId}
                  style={{
                    background: isSelected ? '#f2f3f5' : undefined,
                    padding: 12,
                    marginBottom: 8,
                    borderRadius: 4,
                    border: '1px solid #e5e6eb',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', width: '100%' }}>
                    <Checkbox
                      checked={isSelected}
                      onChange={() => handleToggleSelect(itemId)}
                      style={{ marginRight: 12, marginTop: 4 }}
                    />
                    <div style={{ flex: 1 }}>
                      <Space style={{ marginBottom: 8 }}>
                        {getIcon(item.type)}
                        <Text style={{ fontWeight: 600 }}>{item.title}</Text>
                        <Tag color={getPriorityColor(item.priority)} size="small">
                          {item.priority}
                        </Tag>
                        <Tag color={item.type === 'bug' ? 'red' : item.type === 'feature' ? 'blue' : 'green'} size="small">
                          {item.type}
                        </Tag>
                        {item.resolved && (
                          <Tag color="green" size="small">
                            <IconCheck /> Resolved
                          </Tag>
                        )}
                        <Button
                          type="text"
                          size="small"
                          icon={<IconEdit />}
                          onClick={() => handleEditItem(item)}
                        >
                          Edit
                        </Button>
                      </Space>

                      <Paragraph style={{ marginBottom: 8 }}>{item.description}</Paragraph>

                      {item.components && item.components.length > 0 && (
                        <div style={{ marginBottom: 8 }}>
                          <Text type="secondary">Components: </Text>
                          {item.components.map(comp => (
                            <Tag key={comp} size="small" style={{ marginRight: 4 }}>
                              {comp}
                            </Tag>
                          ))}
                        </div>
                      )}

                      {item.steps && (
                        <div style={{ marginBottom: 8 }}>
                          <Text type="secondary">Steps to reproduce: </Text>
                          <Text>{item.steps}</Text>
                        </div>
                      )}

                      {item.expected && (
                        <div style={{ marginBottom: 8 }}>
                          <Text type="secondary">Expected: </Text>
                          <Text>{item.expected}</Text>
                        </div>
                      )}

                      {item.actual && (
                        <div style={{ marginBottom: 8 }}>
                          <Text type="secondary">Actual: </Text>
                          <Text>{item.actual}</Text>
                        </div>
                      )}

                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {new Date(item.timestamp).toLocaleString()} • {item.sessionId}
                      </Text>
                    </div>
                  </div>
                </List.Item>
              )
            }}
          />
        )}
      </Space>

      {/* Edit Modal */}
      <Modal
        title="Edit Feedback"
        visible={!!editingItem}
        onOk={handleSaveEdit}
        onCancel={() => {
          setEditingItem(null)
          setEditForm({})
        }}
        style={{ width: 600 }}
      >
        {editingItem && (
          <Space direction="vertical" style={{ width: '100%' }} size="large">
            <div>
              <Text style={{ marginBottom: 8, display: 'block' }}>Title</Text>
              <Input
                value={editForm.title}
                onChange={(value) => setEditForm({ ...editForm, title: value })}
              />
            </div>

            <div>
              <Text style={{ marginBottom: 8, display: 'block' }}>Description</Text>
              <TextArea
                value={editForm.description}
                onChange={(value) => setEditForm({ ...editForm, description: value })}
                rows={4}
              />
            </div>

            <div>
              <Text style={{ marginBottom: 8, display: 'block' }}>Type</Text>
              <Select
                value={editForm.type}
                onChange={(value) => setEditForm({ ...editForm, type: value })}
                style={{ width: '100%' }}
              >
                <Select.Option value="bug">Bug</Select.Option>
                <Select.Option value="feature">Feature</Select.Option>
                <Select.Option value="improvement">Improvement</Select.Option>
                <Select.Option value="other">Other</Select.Option>
              </Select>
            </div>

            <div>
              <Text style={{ marginBottom: 8, display: 'block' }}>Priority</Text>
              <Select
                value={editForm.priority}
                onChange={(value) => setEditForm({ ...editForm, priority: value })}
                style={{ width: '100%' }}
              >
                <Select.Option value="critical">Critical</Select.Option>
                <Select.Option value="high">High</Select.Option>
                <Select.Option value="medium">Medium</Select.Option>
                <Select.Option value="low">Low</Select.Option>
              </Select>
            </div>

            {editForm.steps && (
              <div>
                <Text style={{ marginBottom: 8, display: 'block' }}>Steps to Reproduce</Text>
                <TextArea
                  value={editForm.steps}
                  onChange={(value) => setEditForm({ ...editForm, steps: value })}
                  rows={3}
                />
              </div>
            )}

            {editForm.expected && (
              <div>
                <Text style={{ marginBottom: 8, display: 'block' }}>Expected Behavior</Text>
                <TextArea
                  value={editForm.expected}
                  onChange={(value) => setEditForm({ ...editForm, expected: value })}
                  rows={2}
                />
              </div>
            )}

            {editForm.actual && (
              <div>
                <Text style={{ marginBottom: 8, display: 'block' }}>Actual Behavior</Text>
                <TextArea
                  value={editForm.actual}
                  onChange={(value) => setEditForm({ ...editForm, actual: value })}
                  rows={2}
                />
              </div>
            )}

            <div>
              <Checkbox
                checked={editForm.resolved}
                onChange={(checked) => setEditForm({ ...editForm, resolved: checked })}
              >
                Mark as Resolved
              </Checkbox>
            </div>
          </Space>
        )}
      </Modal>
    </div>
  )
}
