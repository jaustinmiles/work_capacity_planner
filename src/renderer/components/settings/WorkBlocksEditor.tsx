import React, { useState, useEffect } from 'react'
import {
  Card,
  Space,
  Button,
  Typography,
  Grid,
  TimePicker,
  Select,
  InputNumber,
  Empty,
  Tag,
  Popconfirm,
  Divider,
  Modal,
  Form,
  Input,
} from '@arco-design/web-react'
import {
  IconPlus,
  IconDelete,
  IconEdit,
  IconClock,
  IconCalendar,
  IconTemplate,
} from '@arco-design/web-react/icon'
import {
  WorkBlock,
  WorkMeeting,
  WorkTemplate,
  DEFAULT_WORK_TEMPLATES,
  getTotalCapacity,
  getRemainingCapacity,
} from '@shared/work-blocks-types'
import { Message } from '../common/Message'
import dayjs from 'dayjs'

const { Title, Text } = Typography
const { Row, Col } = Grid

interface WorkBlocksEditorProps {
  date: string
  pattern?: {
    blocks: WorkBlock[]
    meetings: WorkMeeting[]
  }
  accumulated?: {
    focusMinutes: number
    adminMinutes: number
  }
  onSave: (blocks: WorkBlock[], meetings: WorkMeeting[]) => void
  onClose?: () => void
}

export function WorkBlocksEditor({
  date,
  pattern,
  accumulated = { focusMinutes: 0, adminMinutes: 0 },
  onSave,
  onClose,
}: WorkBlocksEditorProps) {
  const [blocks, setBlocks] = useState<WorkBlock[]>(pattern?.blocks || [])
  const [meetings, setMeetings] = useState<WorkMeeting[]>(pattern?.meetings || [])
  const [selectedTemplate, setSelectedTemplate] = useState<string>('')
  const [showMeetingModal, setShowMeetingModal] = useState(false)
  const [editingMeeting, setEditingMeeting] = useState<WorkMeeting | null>(null)
  const [form] = Form.useForm()

  // Calculate capacity
  const totalCapacity = getTotalCapacity(blocks)
  const remainingCapacity = getRemainingCapacity(blocks, accumulated)

  const handleAddBlock = () => {
    const newBlock: WorkBlock = {
      id: `block-${Date.now()}`,
      startTime: '09:00',
      endTime: '12:00',
      type: 'mixed',
    }
    setBlocks([...blocks, newBlock])
  }

  const handleUpdateBlock = (id: string, updates: Partial<WorkBlock>) => {
    setBlocks(blocks.map(b => b.id === id ? { ...b, ...updates } : b))
  }

  const handleDeleteBlock = (id: string) => {
    setBlocks(blocks.filter(b => b.id !== id))
  }

  const handleApplyTemplate = (templateId: string) => {
    const template = DEFAULT_WORK_TEMPLATES.find(t => t.id === templateId)
    if (template) {
      const newBlocks = template.blocks.map((b, index) => ({
        ...b,
        id: `block-${Date.now()}-${index}`,
      }))
      setBlocks(newBlocks)
      Message.success(`Applied template: ${template.name}`)
    }
  }

  const handleAddMeeting = () => {
    setEditingMeeting({
      id: `meeting-${Date.now()}`,
      name: '',
      startTime: '14:00',
      endTime: '15:00',
      type: 'meeting',
    })
    setShowMeetingModal(true)
  }

  const handleSaveMeeting = async () => {
    try {
      const values = await form.validate()
      const meeting: WorkMeeting = {
        ...editingMeeting!,
        ...values,
      }

      if (editingMeeting && meetings.find(m => m.id === editingMeeting.id)) {
        setMeetings(meetings.map(m => m.id === meeting.id ? meeting : m))
      } else {
        setMeetings([...meetings, meeting])
      }

      setShowMeetingModal(false)
      form.resetFields()
      Message.success('Meeting saved')
    } catch (error) {
      Message.error('Please fill in all required fields')
    }
  }

  const handleDeleteMeeting = (id: string) => {
    setMeetings(meetings.filter(m => m.id !== id))
  }

  const handleSave = () => {
    if (blocks.length === 0) {
      Message.error('Please add at least one work block')
      return
    }
    onSave(blocks, meetings)
  }

  const formatMinutes = (minutes: number) => {
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`
  }

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="large">
      {/* Header */}
      <Card>
        <Row justify="space-between" align="center">
          <Col>
            <Space>
              <IconCalendar style={{ fontSize: 24 }} />
              <Title heading={4} style={{ margin: 0 }}>
                Work Schedule for {dayjs(date).format('MMMM D, YYYY')}
              </Title>
            </Space>
          </Col>
          <Col>
            <Space>
              <Select
                placeholder="Apply template"
                value={selectedTemplate}
                onChange={handleApplyTemplate}
                style={{ width: 200 }}
              >
                {DEFAULT_WORK_TEMPLATES.map(template => (
                  <Select.Option key={template.id} value={template.id}>
                    <Space>
                      <IconTemplate />
                      {template.name}
                    </Space>
                  </Select.Option>
                ))}
              </Select>
              <Button type="primary" onClick={handleSave}>
                Save Schedule
              </Button>
              {onClose && (
                <Button onClick={onClose}>Cancel</Button>
              )}
            </Space>
          </Col>
        </Row>
      </Card>

      {/* Capacity Summary */}
      <Card>
        <Row gutter={16}>
          <Col span={6}>
            <Space direction="vertical">
              <Text type="secondary">Total Focus Time</Text>
              <Title heading={5}>{formatMinutes(totalCapacity.focusMinutes)}</Title>
            </Space>
          </Col>
          <Col span={6}>
            <Space direction="vertical">
              <Text type="secondary">Total Admin Time</Text>
              <Title heading={5}>{formatMinutes(totalCapacity.adminMinutes)}</Title>
            </Space>
          </Col>
          <Col span={6}>
            <Space direction="vertical">
              <Text type="secondary">Used Today</Text>
              <Title heading={5}>
                {formatMinutes(accumulated.focusMinutes)} / {formatMinutes(accumulated.adminMinutes)}
              </Title>
            </Space>
          </Col>
          <Col span={6}>
            <Space direction="vertical">
              <Text type="secondary">Remaining</Text>
              <Title heading={5}>
                <Tag color={remainingCapacity.focusMinutes > 0 ? 'green' : 'red'}>
                  {formatMinutes(remainingCapacity.focusMinutes)} focus
                </Tag>
                <Tag color={remainingCapacity.adminMinutes > 0 ? 'green' : 'red'}>
                  {formatMinutes(remainingCapacity.adminMinutes)} admin
                </Tag>
              </Title>
            </Space>
          </Col>
        </Row>
      </Card>

      {/* Work Blocks */}
      <Card
        title={
          <Space>
            <IconClock />
            <Text>Work Blocks</Text>
          </Space>
        }
        extra={
          <Button type="primary" icon={<IconPlus />} onClick={handleAddBlock}>
            Add Block
          </Button>
        }
      >
        {blocks.length === 0 ? (
          <Empty description="No work blocks defined. Add blocks or apply a template." />
        ) : (
          <Space direction="vertical" style={{ width: '100%' }}>
            {blocks.map((block, index) => (
              <Card key={block.id} size="small">
                <Row gutter={16} align="center">
                  <Col span={2}>
                    <Text strong>#{index + 1}</Text>
                  </Col>
                  <Col span={4}>
                    <TimePicker
                      format="HH:mm"
                      value={block.startTime}
                      onChange={(value) => handleUpdateBlock(block.id, { startTime: value })}
                      style={{ width: '100%' }}
                    />
                  </Col>
                  <Col span={1}>
                    <Text>to</Text>
                  </Col>
                  <Col span={4}>
                    <TimePicker
                      format="HH:mm"
                      value={block.endTime}
                      onChange={(value) => handleUpdateBlock(block.id, { endTime: value })}
                      style={{ width: '100%' }}
                    />
                  </Col>
                  <Col span={4}>
                    <Select
                      value={block.type}
                      onChange={(value) => handleUpdateBlock(block.id, { type: value })}
                      style={{ width: '100%' }}
                    >
                      <Select.Option value="focused">Focused</Select.Option>
                      <Select.Option value="admin">Admin</Select.Option>
                      <Select.Option value="mixed">Mixed</Select.Option>
                    </Select>
                  </Col>
                  <Col span={6}>
                    {block.type === 'mixed' && (
                      <Space>
                        <InputNumber
                          placeholder="Focus mins"
                          value={block.capacity?.focusMinutes}
                          onChange={(value) =>
                            handleUpdateBlock(block.id, {
                              capacity: { ...block.capacity, focusMinutes: value },
                            })
                          }
                          min={0}
                          style={{ width: 100 }}
                        />
                        <InputNumber
                          placeholder="Admin mins"
                          value={block.capacity?.adminMinutes}
                          onChange={(value) =>
                            handleUpdateBlock(block.id, {
                              capacity: { ...block.capacity, adminMinutes: value },
                            })
                          }
                          min={0}
                          style={{ width: 100 }}
                        />
                      </Space>
                    )}
                  </Col>
                  <Col span={2}>
                    <Popconfirm
                      title="Delete this block?"
                      onOk={() => handleDeleteBlock(block.id)}
                    >
                      <Button
                        type="text"
                        status="danger"
                        icon={<IconDelete />}
                      />
                    </Popconfirm>
                  </Col>
                </Row>
              </Card>
            ))}
          </Space>
        )}
      </Card>

      {/* Meetings/Blocked Time */}
      <Card
        title={
          <Space>
            <IconCalendar />
            <Text>Meetings & Blocked Time</Text>
          </Space>
        }
        extra={
          <Button icon={<IconPlus />} onClick={handleAddMeeting}>
            Add Meeting
          </Button>
        }
      >
        {meetings.length === 0 ? (
          <Empty description="No meetings or blocked time." />
        ) : (
          <Space direction="vertical" style={{ width: '100%' }}>
            {meetings.map((meeting) => (
              <Card key={meeting.id} size="small">
                <Row gutter={16} align="center">
                  <Col span={8}>
                    <Text strong>{meeting.name}</Text>
                  </Col>
                  <Col span={6}>
                    <Text>{meeting.startTime} - {meeting.endTime}</Text>
                  </Col>
                  <Col span={4}>
                    <Tag color={
                      meeting.type === 'meeting' ? 'blue' :
                      meeting.type === 'break' ? 'green' :
                      meeting.type === 'personal' ? 'orange' : 'red'
                    }>
                      {meeting.type}
                    </Tag>
                  </Col>
                  <Col span={3}>
                    {meeting.recurring !== 'none' && (
                      <Tag>{meeting.recurring}</Tag>
                    )}
                  </Col>
                  <Col span={3}>
                    <Space>
                      <Button
                        type="text"
                        icon={<IconEdit />}
                        onClick={() => {
                          setEditingMeeting(meeting)
                          form.setFieldsValue(meeting)
                          setShowMeetingModal(true)
                        }}
                      />
                      <Popconfirm
                        title="Delete this meeting?"
                        onOk={() => handleDeleteMeeting(meeting.id)}
                      >
                        <Button
                          type="text"
                          status="danger"
                          icon={<IconDelete />}
                        />
                      </Popconfirm>
                    </Space>
                  </Col>
                </Row>
              </Card>
            ))}
          </Space>
        )}
      </Card>

      {/* Meeting Modal */}
      <Modal
        title={editingMeeting?.id.startsWith('meeting-') ? 'Add Meeting' : 'Edit Meeting'}
        visible={showMeetingModal}
        onOk={handleSaveMeeting}
        onCancel={() => {
          setShowMeetingModal(false)
          form.resetFields()
        }}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            label="Name"
            field="name"
            rules={[{ required: true, message: 'Please enter meeting name' }]}
          >
            <Input placeholder="Team standup, Lunch break, etc." />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                label="Start Time"
                field="startTime"
                rules={[{ required: true }]}
              >
                <TimePicker format="HH:mm" style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                label="End Time"
                field="endTime"
                rules={[{ required: true }]}
              >
                <TimePicker format="HH:mm" style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item
            label="Type"
            field="type"
            initialValue="meeting"
          >
            <Select>
              <Select.Option value="meeting">Meeting</Select.Option>
              <Select.Option value="break">Break</Select.Option>
              <Select.Option value="personal">Personal</Select.Option>
              <Select.Option value="blocked">Blocked</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item
            label="Recurring"
            field="recurring"
            initialValue="none"
          >
            <Select>
              <Select.Option value="none">One-time</Select.Option>
              <Select.Option value="daily">Daily</Select.Option>
              <Select.Option value="weekly">Weekly</Select.Option>
            </Select>
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  )
}