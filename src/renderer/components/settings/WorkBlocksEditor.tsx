import { useState, useEffect } from 'react'
import {
  Card,
  Space,
  Button,
  Typography,
  Grid,
  Select,
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
  BlockTypeConfig,
} from '@shared/work-blocks-types'
import { calculateBlockCapacity } from '@shared/capacity-calculator'
import {
  isSingleTypeBlock,
  isComboBlock,
  isSystemBlock,
  AccumulatedTimeByType,
} from '@shared/user-task-types'
import { WorkBlockType, BlockConfigKind } from '@shared/enums'
import { getCurrentTime } from '@shared/time-provider'
import { generateUniqueId } from '@shared/step-id-utils'
import { useSortedUserTaskTypes, useUserTaskTypeStore } from '@/renderer/store/useUserTaskTypeStore'
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
  accumulated?: AccumulatedTimeByType
  onSave: (__blocks: WorkBlock[], meetings: WorkMeeting[]) => void | Promise<void>
  onClose?: () => void
}

// Helper to calculate total capacity by type from blocks
const calculateTotalCapacityByType = (blocks: WorkBlock[]): AccumulatedTimeByType => {
  const result: AccumulatedTimeByType = {}
  for (const block of blocks) {
    if (!block.capacity) continue
    const { typeConfig, capacity } = block

    if (isSystemBlock(typeConfig)) continue

    if (isSingleTypeBlock(typeConfig)) {
      result[typeConfig.typeId] = (result[typeConfig.typeId] || 0) + capacity.totalMinutes
    } else if (isComboBlock(typeConfig)) {
      for (const alloc of typeConfig.allocations) {
        const minutes = Math.floor(capacity.totalMinutes * alloc.ratio)
        result[alloc.typeId] = (result[alloc.typeId] || 0) + minutes
      }
    }
  }
  return result
}

// Helper to calculate remaining capacity
const calculateRemainingCapacity = (
  totalCapacity: AccumulatedTimeByType,
  accumulated: AccumulatedTimeByType,
): AccumulatedTimeByType => {
  const result: AccumulatedTimeByType = {}
  const allTypes = new Set([...Object.keys(totalCapacity), ...Object.keys(accumulated)])
  for (const typeId of allTypes) {
    result[typeId] = (totalCapacity[typeId] || 0) - (accumulated[typeId] || 0)
  }
  return result
}

export function WorkBlocksEditor({
  date,
  pattern,
  accumulated = {},
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

  // Load user-defined task types from the store
  // Use separate selectors to avoid unnecessary re-renders
  const userTaskTypes = useSortedUserTaskTypes()
  const typesInitialized = useUserTaskTypeStore(state => state.isInitialized)
  const loadTypes = useUserTaskTypeStore(state => state.loadTypes)

  // Load types on mount if not initialized (run only once)
  useEffect(() => {
    if (!typesInitialized) {
      loadTypes()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Empty deps - only run on mount

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

  // Calculate capacity using new helper functions
  const totalCapacity = calculateTotalCapacityByType(blocks)
  const remainingCapacity = calculateRemainingCapacity(totalCapacity, accumulated)

  const handleAddBlock = () => {
    // Default to first user type if available, otherwise fallback to 'focused'
    const defaultTypeId = userTaskTypes.length > 0 ? userTaskTypes[0].id : 'focused'
    const typeConfig: BlockTypeConfig = {
      kind: BlockConfigKind.Single,
      typeId: defaultTypeId,
    }
    // Use current time (rounded to nearest hour) as default start time
    const now = getCurrentTime()
    const startTime = dayjs(now).startOf('hour').format('HH:mm')
    const endTime = dayjs(now).startOf('hour').add(3, 'hour').format('HH:mm')
    const newBlock: WorkBlock = {
      id: generateUniqueId('block'),
      startTime,
      endTime,
      typeConfig,
      capacity: calculateBlockCapacity(typeConfig, startTime, endTime),
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
    // Find user template
    const userTemplate = userTemplates.find(t => t.id === templateId)
    if (!userTemplate) return

    const newBlocks = userTemplate.blocks.map((b: WorkBlock) => ({
      ...b,
      id: generateUniqueId('block'),
    }))
    setBlocks(newBlocks)

    // Also apply meetings if present
    if (userTemplate.meetings) {
      const newMeetings = userTemplate.meetings.map((m: any, index: number) => ({
        ...m,
        id: `meeting-${Date.now()}-${index}-${Math.random().toString(36).substr(2, 9)}`,
      }))
      setMeetings(newMeetings)
    }

    Message.success(`Applied template: ${userTemplate.templateName || 'Custom Template'}`)
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
                disabled={userTemplates.length === 0}
              >
                {userTemplates.map(template => (
                  <Select.Option key={template.id} value={template.id}>
                    {template.templateName || 'Unnamed Template'}
                  </Select.Option>
                ))}
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
                <Col span={8}>
                  <Space direction="vertical">
                    <Text type="secondary">Total Capacity</Text>
                    <Space wrap>
                      {Object.entries(totalCapacity).map(([typeId, minutes]) => {
                        const userType = userTaskTypes.find(t => t.id === typeId)
                        return (
                          <Tag key={typeId} color={userType?.color || 'blue'}>
                            {userType?.emoji} {formatMinutes(minutes)} {userType?.name || typeId}
                          </Tag>
                        )
                      })}
                      {Object.keys(totalCapacity).length === 0 && (
                        <Text type="secondary">No blocks defined</Text>
                      )}
                    </Space>
                  </Space>
                </Col>
                <Col span={8}>
                  <Space direction="vertical">
                    <Text type="secondary">Used Today</Text>
                    <Space wrap>
                      {Object.entries(accumulated).map(([typeId, minutes]) => {
                        const userType = userTaskTypes.find(t => t.id === typeId)
                        return (
                          <Tag key={typeId} color={userType?.color || 'orange'}>
                            {userType?.emoji} {formatMinutes(minutes)} {userType?.name || typeId}
                          </Tag>
                        )
                      })}
                      {Object.keys(accumulated).length === 0 && (
                        <Text type="secondary">None used</Text>
                      )}
                    </Space>
                  </Space>
                </Col>
                <Col span={8}>
                  <Space direction="vertical">
                    <Text type="secondary">Remaining</Text>
                    <Space wrap>
                      {Object.entries(remainingCapacity).map(([typeId, minutes]) => {
                        const userType = userTaskTypes.find(t => t.id === typeId)
                        return (
                          <Tag key={typeId} color={minutes > 0 ? (userType?.color || 'green') : 'red'}>
                            {userType?.emoji} {formatMinutes(minutes)} {userType?.name || typeId}
                          </Tag>
                        )
                      })}
                      {Object.keys(remainingCapacity).length === 0 && (
                        <Text type="secondary">--</Text>
                      )}
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
                      value={
                        isSystemBlock(block.typeConfig) ? 'system' :
                        isComboBlock(block.typeConfig) ? 'combo' :
                        isSingleTypeBlock(block.typeConfig) ? block.typeConfig.typeId :
                        userTaskTypes[0]?.id ?? 'unknown'
                      }
                      onChange={(value) => {
                        let newTypeConfig: BlockTypeConfig
                        if (value === 'combo') {
                          // Combo block - use first two types if available
                          const firstType = userTaskTypes[0]?.id ?? 'focused'
                          const secondType = userTaskTypes[1]?.id ?? userTaskTypes[0]?.id ?? 'admin'
                          newTypeConfig = {
                            kind: BlockConfigKind.Combo,
                            allocations: [
                              { typeId: firstType, ratio: 0.7 },
                              { typeId: secondType, ratio: 0.3 },
                            ],
                          }
                        } else if (value === 'system') {
                          newTypeConfig = { kind: BlockConfigKind.System, systemType: WorkBlockType.Blocked }
                        } else {
                          // Single type block using the selected user type ID
                          newTypeConfig = { kind: BlockConfigKind.Single, typeId: value }
                        }
                        handleUpdateBlock(block.id, {
                          typeConfig: newTypeConfig,
                          capacity: calculateBlockCapacity(newTypeConfig, block.startTime, block.endTime),
                        })
                      }}
                      style={{ width: '100%' }}
                    >
                      {/* Render user-defined types as options */}
                      {userTaskTypes.map(type => (
                        <Select.Option key={type.id} value={type.id}>
                          {type.emoji} {type.name}
                        </Select.Option>
                      ))}
                      {/* Special options */}
                      {userTaskTypes.length >= 2 && (
                        <Select.Option value="combo">🔀 Combo</Select.Option>
                      )}
                      <Select.Option value="system">🚫 Blocked</Select.Option>
                    </Select>
                  </Col>
                  <Col span={6}>
                    {isComboBlock(block.typeConfig) ? (
                      <Space direction="vertical" size="small" style={{ width: '100%' }}>
                        <Text type="secondary" style={{ fontSize: 11 }}>
                          Total: {block.capacity?.totalMinutes || 0} mins
                        </Text>
                        <Text type="secondary" style={{ fontSize: 11 }}>
                          {block.typeConfig.allocations.map(a => {
                            const userType = userTaskTypes.find(t => t.id === a.typeId)
                            return `${Math.round(a.ratio * 100)}% ${userType?.name || a.typeId}`
                          }).join(' / ')}
                        </Text>
                      </Space>
                    ) : isSystemBlock(block.typeConfig) ? (
                      <Text type="secondary">
                        Blocked time
                      </Text>
                    ) : isSingleTypeBlock(block.typeConfig) ? (() => {
                      const typeId = block.typeConfig.typeId
                      const userType = userTaskTypes.find(t => t.id === typeId)
                      return (
                        <Text type="secondary">
                          All {userType?.emoji} {userType?.name || typeId} time ({block.capacity?.totalMinutes || 0}min)
                        </Text>
                      )
                    })() : (
                      <Text type="secondary">Unknown block type</Text>
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
