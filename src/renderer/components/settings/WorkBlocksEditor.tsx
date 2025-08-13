import { useState, useEffect } from 'react'
import {
  Card,
  Space,
  Button,
  Typography,
  Grid,
  Select,
  InputNumber,
  Empty,
  Tag,
  Popconfirm,
  Modal,
  Form,
  Input,
  TimePicker,
} from '@arco-design/web-react'
import {
  IconPlus,
  IconDelete,
  IconEdit,
  IconSchedule,
  IconCalendar,
  IconMoon,
} from '@arco-design/web-react/icon'
import {
  WorkBlock,
  WorkMeeting,
  DEFAULT_WORK_TEMPLATES,
  getTotalCapacity,
  getRemainingCapacity,
} from '@shared/work-blocks-types'
import { Message } from '../common/Message'
import { ClockTimePicker } from '../common/ClockTimePicker'
import { getDatabase } from '../../services/database'
import dayjs from 'dayjs'

const { Title, Text } = Typography
const { Row, Col } = Grid

interface WorkBlocksEditorProps {
  date: string
  pattern?: {
    id?: string
    blocks: WorkBlock[]
    meetings: WorkMeeting[]
    templateName?: string
  }
  accumulated?: {
    focusMinutes: number
    adminMinutes: number
  }
  onSave: (blocks: WorkBlock[], meetings: WorkMeeting[]) => void | Promise<void>
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
  const [showSaveAsTemplate, setShowSaveAsTemplate] = useState(false)
  const [templateName, setTemplateName] = useState('')
  const [userTemplates, setUserTemplates] = useState<any[]>([])

  // Update local state when pattern prop changes
  useEffect(() => {
    if (pattern) {
      setBlocks(pattern.blocks || [])
      setMeetings(pattern.meetings || [])
    }
  }, [pattern])

  // Load user templates
  useEffect(() => {
    loadUserTemplates()
  }, [])

  const loadUserTemplates = async () => {
    try {
      const templates = await getDatabase().getWorkTemplates()
      setUserTemplates(templates)
    } catch (error) {
      console.error('Failed to load user templates:', error)
    }
  }

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
    // Check default templates first
    let template = DEFAULT_WORK_TEMPLATES.find(t => t.id === templateId)
    let isUserTemplate = false

    // If not found in defaults, check user templates
    if (!template) {
      const userTemplate = userTemplates.find(t => t.id === templateId)
      if (userTemplate) {
        template = {
          id: userTemplate.id,
          name: userTemplate.templateName || 'Custom Template',
          blocks: userTemplate.blocks,
        }
        isUserTemplate = true
      }
    }

    if (template) {
      const newBlocks = template.blocks.map((b, index) => ({
        ...b,
        id: `block-${Date.now()}-${index}`,
      }))
      setBlocks(newBlocks)

      // If it's a user template, also apply meetings
      if (isUserTemplate) {
        const userTemplate = userTemplates.find(t => t.id === templateId)
        if (userTemplate?.meetings) {
          const newMeetings = userTemplate.meetings.map((m: any, index: number) => ({
            ...m,
            id: `meeting-${Date.now()}-${index}-${Math.random().toString(36).substr(2, 9)}`,
          }))
          setMeetings(newMeetings)
        }
      }

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

  const handleSave = async () => {
    // Allow saving empty schedule for clearing purposes
    // The user was explicitly warned when clicking "Clear Schedule"
    await onSave(blocks, meetings)
  }

  const handleSaveAsTemplate = async () => {
    if (!templateName.trim()) {
      Message.error('Please enter a template name')
      return
    }

    try {
      // First save the current schedule
      await handleSave()

      // Then save it as a template
      await getDatabase().saveAsTemplate(date, templateName.trim())

      Message.success(`Template "${templateName}" saved successfully`)
      setShowSaveAsTemplate(false)
      setTemplateName('')

      // Reload templates
      loadUserTemplates()
    } catch (error) {
      console.error('Failed to save template:', error)
      Message.error('Failed to save template. Please save the schedule first.')
    }
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
            <Space direction="vertical" size="small">
              <Space>
                <IconCalendar style={{ fontSize: 24 }} />
                <Title heading={4} style={{ margin: 0 }}>
                  Work Schedule for {dayjs(date).format('MMMM D, YYYY')}
                </Title>
              </Space>
              {pattern?.templateName && (
                <Text type="secondary" style={{ marginLeft: 32 }}>
                  Template: {pattern.templateName}
                </Text>
              )}
            </Space>
          </Col>
          <Col>
            <Space>
              <Select
                placeholder="Apply template"
                value={selectedTemplate}
                onChange={(value) => {
                  handleApplyTemplate(value)
                  setSelectedTemplate('') // Clear selection after applying
                }}
                style={{ width: 200 }}
              >
                <Select.OptGroup label="Default Templates">
                  {DEFAULT_WORK_TEMPLATES.map(template => (
                    <Select.Option key={template.id} value={template.id}>
                      {template.name}
                    </Select.Option>
                  ))}
                </Select.OptGroup>
                {userTemplates.length > 0 && (
                  <Select.OptGroup label="My Templates">
                    {userTemplates.map(template => (
                      <Select.Option key={template.id} value={template.id}>
                        {template.templateName || 'Unnamed Template'}
                      </Select.Option>
                    ))}
                  </Select.OptGroup>
                )}
              </Select>
              <Button type="primary" onClick={handleSave}>
                Save Schedule
              </Button>
              <Button onClick={() => setShowSaveAsTemplate(true)}>
                Save as Template
              </Button>
              {blocks.length > 0 && (
                <Popconfirm
                  title="Clear entire schedule?"
                  content="This will remove all work blocks and meetings for this day."
                  onOk={async () => {
                    setBlocks([])
                    setMeetings([])
                    // Save the cleared schedule immediately
                    await onSave([], [])
                    Message.success('Schedule cleared successfully')
                  }}
                >
                  <Button status="danger">
                    Clear Schedule
                  </Button>
                </Popconfirm>
              )}
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
          <Col span={4}>
            <Space direction="vertical">
              <Text type="secondary">Focus Time</Text>
              <Title heading={5}>{formatMinutes(totalCapacity.focusMinutes)}</Title>
            </Space>
          </Col>
          <Col span={4}>
            <Space direction="vertical">
              <Text type="secondary">Admin Time</Text>
              <Title heading={5}>{formatMinutes(totalCapacity.adminMinutes)}</Title>
            </Space>
          </Col>
          <Col span={4}>
            <Space direction="vertical">
              <Text type="secondary">Personal Time</Text>
              <Title heading={5}>{formatMinutes(totalCapacity.personalMinutes)}</Title>
            </Space>
          </Col>
          <Col span={4}>
            <Space direction="vertical">
              <Text type="secondary">Used Today</Text>
              <Title heading={5}>
                {formatMinutes(accumulated.focusMinutes)} / {formatMinutes(accumulated.adminMinutes)}
              </Title>
            </Space>
          </Col>
          <Col span={8}>
            <Space direction="vertical">
              <Text type="secondary">Remaining</Text>
              <Space wrap>
                <Tag color={remainingCapacity.focusMinutes > 0 ? 'green' : 'red'}>
                  {formatMinutes(remainingCapacity.focusMinutes)} focus
                </Tag>
                <Tag color={remainingCapacity.adminMinutes > 0 ? 'green' : 'red'}>
                  {formatMinutes(remainingCapacity.adminMinutes)} admin
                </Tag>
                <Tag color={remainingCapacity.personalMinutes > 0 ? 'purple' : 'red'}>
                  {formatMinutes(remainingCapacity.personalMinutes)} personal
                </Tag>
              </Space>
            </Space>
          </Col>
        </Row>
      </Card>

      {/* Work Blocks */}
      <Card
        title={
          <Space>
            <IconSchedule />
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
          <Space direction="vertical" style={{ width: '100%' }} size="medium">
            {blocks.map((block, index) => (
              <Card key={block.id} size="small" style={{ background: '#fafafa' }}>
                <Row gutter={16} align="center">
                  <Col span={2}>
                    <Text style={{ fontWeight: 'bold' }}>#{index + 1}</Text>
                  </Col>
                  <Col span={4}>
                    <ClockTimePicker
                      value={block.startTime}
                      onChange={(value) => handleUpdateBlock(block.id, { startTime: value })}
                      style={{ width: '100%' }}
                    />
                  </Col>
                  <Col span={1}>
                    <Text>to</Text>
                  </Col>
                  <Col span={4}>
                    <ClockTimePicker
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
                      <Select.Option value="personal">Personal</Select.Option>
                    </Select>
                  </Col>
                  <Col span={6}>
                    {block.type === 'mixed' ? (
                      <Space>
                        <InputNumber
                          placeholder="Focus mins"
                          value={block.capacity?.focusMinutes}
                          onChange={(value) =>
                            handleUpdateBlock(block.id, {
                              capacity: { ...block.capacity, focusMinutes: value || 0 },
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
                              capacity: { ...block.capacity, adminMinutes: value || 0 },
                            })
                          }
                          min={0}
                          style={{ width: 100 }}
                        />
                      </Space>
                    ) : (
                      <Text type="secondary">
                        {block.type === 'focused' ? 'All focus time' : 'All admin time'}
                      </Text>
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
          <Space>
            <Button icon={<IconMoon />} onClick={() => {
              const sleepBlock: WorkMeeting = {
                id: `sleep-${Date.now()}`,
                name: 'Sleep',
                startTime: '22:00',
                endTime: '06:00',
                type: 'blocked',
              }
              setMeetings([...meetings, sleepBlock])
            }}>
              Add Sleep Block
            </Button>
            <Button icon={<IconPlus />} onClick={handleAddMeeting}>
              Add Meeting
            </Button>
          </Space>
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
                    <Text style={{ fontWeight: 'bold' }}>{meeting.name}</Text>
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
                    {meeting.recurring && meeting.recurring !== 'none' && (
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
                          form.setFieldsValue({
                            ...meeting,
                            recurring: meeting.recurring || 'none',
                          })
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

      {/* Save as Template Modal */}
      <Modal
        title="Save Schedule as Template"
        visible={showSaveAsTemplate}
        onOk={handleSaveAsTemplate}
        onCancel={() => {
          setShowSaveAsTemplate(false)
          setTemplateName('')
        }}
      >
        <Form layout="vertical">
          <Form.Item label="Template Name">
            <Input
              placeholder="e.g., My Productive Day, Meeting Heavy Tuesday"
              value={templateName}
              onChange={setTemplateName}
              onPressEnter={handleSaveAsTemplate}
            />
          </Form.Item>
          <Text type="secondary">
            This will save your current schedule configuration as a reusable template
          </Text>
        </Form>
      </Modal>
    </Space>
  )
}
