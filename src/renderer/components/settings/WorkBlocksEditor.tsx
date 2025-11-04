import { useState, useEffect } from 'react'
import { TaskType, WorkBlockType } from '@shared/enums'
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
import { calculateBlockCapacity, getTotalCapacityForTaskType } from '@shared/capacity-calculator'
import { Message } from '../common/Message'
import { ClockTimePicker } from '../common/ClockTimePicker'
import { TimelineVisualizer } from '../schedule/TimelineVisualizer'
import { getDatabase } from '../../services/database'
import dayjs from 'dayjs'
import { logger } from '@/logger'


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
    focus: number
    admin: number
    personal: number
  }
  onSave: (__blocks: WorkBlock[], meetings: WorkMeeting[]) => void | Promise<void>
  onClose?: () => void
}

export function WorkBlocksEditor({
  date,
  pattern,
  accumulated = { focus: 0, admin: 0, personal: 0 },
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
      logger.ui.error('Failed to load user templates', {
        error: error instanceof Error ? error.message : String(error),
      }, 'templates-load-error')
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

  const handleUpdateMeeting = (id: string, updates: Partial<WorkMeeting>) => {
    setMeetings(meetings.map(m => m.id === id ? { ...m, ...updates } : m))
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
    } catch (__error) {
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
      logger.ui.error('Failed to save template', {
        error: error instanceof Error ? error.message : String(error),
        templateName,
        date,
      }, 'template-save-error')
      Message.error('Failed to save template. Please save the schedule first.')
    }
  }

  const formatMinutes = (minutes: number) => {
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`
  }

  return (
    <div style={{ height: '100%' }}>
      {/* Header */}
      <Card style={{ marginBottom: 16 }}>
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

      <Row gutter={16}>
        <Col span={14}>
          <Space direction="vertical" style={{ width: '100%' }} size="large">
            {/* Capacity Summary */}
            <Card>
        <Row gutter={16}>
          <Col span={4}>
            <Space direction="vertical">
              <Text type="secondary">Focus Time</Text>
              <Title heading={5}>{formatMinutes(totalCapacity.focus)}</Title>
            </Space>
          </Col>
          <Col span={4}>
            <Space direction="vertical">
              <Text type="secondary">Admin Time</Text>
              <Title heading={5}>{formatMinutes(totalCapacity.admin)}</Title>
            </Space>
          </Col>
          <Col span={4}>
            <Space direction="vertical">
              <Text type="secondary">Personal Time</Text>
              <Title heading={5}>{formatMinutes(totalCapacity.personal)}</Title>
            </Space>
          </Col>
          <Col span={4}>
            <Space direction="vertical">
              <Text type="secondary">Used Today</Text>
              <Title heading={5}>
                {formatMinutes(accumulated.focus)} / {formatMinutes(accumulated.admin)}
              </Title>
            </Space>
          </Col>
          <Col span={8}>
            <Space direction="vertical">
              <Text type="secondary">Remaining</Text>
              <Space wrap>
                <Tag color={remainingCapacity.focus > 0 ? 'green' : 'red'}>
                  {formatMinutes(remainingCapacity.focus)} focus
                </Tag>
                <Tag color={remainingCapacity.admin > 0 ? 'green' : 'red'}>
                  {formatMinutes(remainingCapacity.admin)} admin
                </Tag>
                <Tag color={remainingCapacity.personal > 0 ? 'purple' : 'red'}>
                  {formatMinutes(remainingCapacity.personal)} personal
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
                      onChange={(value) => {
                        // When changing to mixed, automatically split capacity 50/50
                        if (value === 'mixed' && block.type !== 'mixed') {
                          handleUpdateBlock(block.id, {
                            type: value,
                            capacity: calculateBlockCapacity(WorkBlockType.Mixed, block.startTime, block.endTime, { focus: 0.5, admin: 0.5 }),
                          })
                        } else if (value === 'flexible') {
                          // Flexible blocks don't have predetermined capacity split
                          handleUpdateBlock(block.id, {
                            type: value,
                            capacity: undefined, // No preset capacity for flexible blocks
                          })
                        } else if (value === 'personal') {
                          handleUpdateBlock(block.id, {
                            type: value,
                            capacity: calculateBlockCapacity(WorkBlockType.Personal, block.startTime, block.endTime),
                          })
                        } else if (value === TaskType.Focused) {
                          handleUpdateBlock(block.id, {
                            type: value,
                            capacity: calculateBlockCapacity(WorkBlockType.Focused, block.startTime, block.endTime),
                          })
                        } else if (value === TaskType.Admin) {
                          handleUpdateBlock(block.id, {
                            type: value,
                            capacity: calculateBlockCapacity(WorkBlockType.Admin, block.startTime, block.endTime),
                          })
                        }
                      }}
                      style={{ width: '100%' }}
                    >
                      <Select.Option value={TaskType.Focused}>Focused</Select.Option>
                      <Select.Option value={TaskType.Admin}>Admin</Select.Option>
                      <Select.Option value="mixed">Mixed</Select.Option>
                      <Select.Option value="flexible">Flexible</Select.Option>
                      <Select.Option value="personal">Personal</Select.Option>
                    </Select>
                  </Col>
                  <Col span={6}>
                    {block.type === 'mixed' ? (
                      <Space direction="vertical" size="small" style={{ width: '100%' }}>
                        <Text type="secondary" style={{ fontSize: 11 }}>
                          Total: {(() => {
                            const startTime = dayjs(`2000-01-01 ${block.startTime}`)
                            const endTime = dayjs(`2000-01-01 ${block.endTime}`)
                            return endTime.diff(startTime, 'minute')
                          })()} mins
                        </Text>
                        <Space>
                          <InputNumber
                            placeholder="Focus mins"
                            value={block.capacity ? getTotalCapacityForTaskType(block.capacity, TaskType.Focused) : 0}
                            onChange={(value) => {
                              // Calculate total block duration
                              const startTime = dayjs(`2000-01-01 ${block.startTime}`)
                              const endTime = dayjs(`2000-01-01 ${block.endTime}`)
                              const totalMinutes = endTime.diff(startTime, 'minute')

                            // Automatically adjust admin time to fill the rest
                            const focus = Math.min(value || 0, totalMinutes)
                            const admin = Math.max(0, totalMinutes - focus)

                            handleUpdateBlock(block.id, {
                              capacity: calculateBlockCapacity(WorkBlockType.Mixed, block.startTime, block.endTime, { focus: focus / totalMinutes, admin: admin / totalMinutes }),
                            })
                          }}
                          min={0}
                          style={{ width: 100 }}
                        />
                        <InputNumber
                          placeholder="Admin mins"
                          value={block.capacity ? getTotalCapacityForTaskType(block.capacity, TaskType.Admin) : 0}
                          onChange={(value) => {
                            // Calculate total block duration
                            const startTime = dayjs(`2000-01-01 ${block.startTime}`)
                            const endTime = dayjs(`2000-01-01 ${block.endTime}`)
                            const totalMinutes = endTime.diff(startTime, 'minute')

                            // Automatically adjust focus time to fill the rest
                            const admin = Math.min(value || 0, totalMinutes)
                            const focus = Math.max(0, totalMinutes - admin)

                            handleUpdateBlock(block.id, {
                              capacity: calculateBlockCapacity(WorkBlockType.Mixed, block.startTime, block.endTime, { focus: focus / totalMinutes, admin: admin / totalMinutes }),
                            })
                          }}
                          min={0}
                          style={{ width: 100 }}
                        />
                        </Space>
                      </Space>
                    ) : block.type === 'personal' ? (
                      <Text type="secondary">
                        All personal time
                      </Text>
                    ) : block.type === 'flexible' ? (
                      <Text type="secondary">
                        Flexible (any work type)
                      </Text>
                    ) : (
                      <Text type="secondary">
                        {block.type === TaskType.Focused ? 'All focus time' : 'All admin time'}
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
                <ClockTimePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                label="End Time"
                field="endTime"
                rules={[{ required: true }]}
              >
                <ClockTimePicker style={{ width: '100%' }} />
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
        </Col>
        <Col span={10}>
          <Card title="Visual Timeline" style={{ height: 'calc(100vh - 200px)', overflow: 'auto' }}>
            <TimelineVisualizer
              blocks={blocks}
              meetings={meetings}
              onBlockUpdate={(id, updates) => handleUpdateBlock(id, updates)}
              onMeetingUpdate={(id, updates) => handleUpdateMeeting(id, updates)}
              startHour={6}
              endHour={22}
              height={600}
            />
          </Card>
        </Col>
      </Row>
    </div>
  )
}
