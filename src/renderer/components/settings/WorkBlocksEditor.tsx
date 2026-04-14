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
  isAnyBlock,
  AccumulatedTimeByType,
} from '@shared/user-task-types'
import { WorkBlockType, BlockConfigKind, MeetingType } from '@shared/enums'
import { getCurrentTime } from '@shared/time-provider'
import { formatTimeFromParts } from '@shared/time-utils'
import { generateUniqueId } from '@shared/step-id-utils'
import { useSortedUserTaskTypes, useUserTaskTypeStore } from '@/renderer/store/useUserTaskTypeStore'
import { useResponsive } from '../../providers/ResponsiveProvider'
import { Message } from '../common/Message'
import { ClockTimePicker } from '../common/ClockTimePicker'
import { TimelineVisualizer } from '../schedule/TimelineVisualizer'


const { Text } = Typography
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
  date: _date,
  pattern,
  accumulated = {},
  onSave,
  onClose: _onClose,
}: WorkBlocksEditorProps) {
  const [blocks, setBlocks] = useState<WorkBlock[]>(pattern?.blocks || [])
  const [meetings, setMeetings] = useState<WorkMeeting[]>(pattern?.meetings || [])
  const [showMeetingModal, setShowMeetingModal] = useState(false)
  const [editingMeeting, setEditingMeeting] = useState<WorkMeeting | null>(null)
  const [form] = Form.useForm()

  // Load user-defined task types from the store
  // Use separate selectors to avoid unnecessary re-renders
  const userTaskTypes = useSortedUserTaskTypes()
  const typesInitialized = useUserTaskTypeStore(state => state.isInitialized)
  const loadTypes = useUserTaskTypeStore(state => state.loadTypes)

  // Responsive breakpoints for layout
  const { isMobile } = useResponsive()

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

  // Calculate capacity using new helper functions
  const totalCapacity = calculateTotalCapacityByType(blocks)
  const remainingCapacity = calculateRemainingCapacity(totalCapacity, accumulated)

  const handleAddBlock = () => {
    const defaultTypeId = userTaskTypes[0]?.id ?? 'focused'
    const typeConfig: BlockTypeConfig = {
      kind: BlockConfigKind.Single,
      typeId: defaultTypeId,
    }

    const DEFAULT_DURATION_MINUTES = 60

    // Find a good start time: current time rounded to next 15-min mark
    const now = getCurrentTime()
    const currentMinutes = now.getHours() * 60 + now.getMinutes()
    const roundedMinutes = Math.ceil(currentMinutes / 15) * 15

    // Parse existing blocks into minute ranges for overlap detection
    const occupied = blocks.map(b => {
      const sParts = b.startTime.split(':')
      const eParts = b.endTime.split(':')
      const sh = parseInt(sParts[0] ?? '0', 10)
      const sm = parseInt(sParts[1] ?? '0', 10)
      const eh = parseInt(eParts[0] ?? '0', 10)
      const em = parseInt(eParts[1] ?? '0', 10)
      return { start: sh * 60 + sm, end: eh * 60 + em }
    }).sort((a, b) => a.start - b.start)

    // Find first gap >= 15 minutes starting from rounded current time
    let startMinutes = roundedMinutes
    for (const block of occupied) {
      if (startMinutes >= block.start && startMinutes < block.end) {
        // Current position overlaps — jump to end of this block
        startMinutes = block.end
      }
    }

    // Clamp end time to not overlap the next block
    let endMinutes = startMinutes + DEFAULT_DURATION_MINUTES
    for (const block of occupied) {
      if (block.start > startMinutes && block.start < endMinutes) {
        endMinutes = block.start
      }
    }

    // Ensure at least 15 minutes
    if (endMinutes - startMinutes < 15) {
      endMinutes = startMinutes + 15
    }

    // Clamp to 24 hours
    if (endMinutes > 1440) endMinutes = 1440
    if (startMinutes >= 1440) startMinutes = 1380

    const startTime = formatTimeFromParts(Math.floor(startMinutes / 60), startMinutes % 60)
    const endTime = formatTimeFromParts(Math.floor(endMinutes / 60), endMinutes % 60)

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

  const handleAddMeeting = () => {
    setEditingMeeting({
      id: `meeting-${Date.now()}`,
      name: '',
      startTime: '14:00',
      endTime: '15:00',
      type: MeetingType.Meeting,
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

  const formatMinutes = (minutes: number) => {
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`
  }

  return (
    <div style={{ height: '100%' }}>
      {/* Header — compact */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 8,
          marginBottom: 12,
        }}
      >
        <Button type="primary" onClick={handleSave}>
          Save
        </Button>
        {blocks.length > 0 && (
          <Popconfirm
            title="Clear entire schedule?"
            content="This will remove all work blocks and meetings for this day."
            onOk={async () => {
              setBlocks([])
              setMeetings([])
              await onSave([], [])
              Message.success('Schedule cleared')
            }}
          >
            <Button status="danger" size="small">
              Clear Day
            </Button>
          </Popconfirm>
        )}
      </div>

      {/* Main layout - stacks on mobile */}
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={24} md={12} lg={12}>
          <Space direction="vertical" style={{ width: '100%' }} size="large">
            {/* Capacity Summary - stacks columns on mobile */}
            <Card>
              <Row gutter={[16, 16]}>
                <Col xs={24} sm={8} md={8}>
                  <Space direction="vertical">
                    <Text type="secondary">Total Capacity</Text>
                    <Space wrap>
                      {Object.entries(totalCapacity).map(([typeId, minutes]) => {
                        const userType = userTaskTypes.find(t => t.id === typeId)
                        return (
                          <Tag key={typeId} color={userType?.color || 'blue'} size={isMobile ? 'small' : 'default'}>
                            {userType?.emoji} {formatMinutes(minutes)} {userType?.name || 'Unknown'}
                          </Tag>
                        )
                      })}
                      {Object.keys(totalCapacity).length === 0 && (
                        <Text type="secondary">No blocks defined</Text>
                      )}
                    </Space>
                  </Space>
                </Col>
                <Col xs={24} sm={8} md={8}>
                  <Space direction="vertical">
                    <Text type="secondary">Used Today</Text>
                    <Space wrap>
                      {Object.entries(accumulated).map(([typeId, minutes]) => {
                        const userType = userTaskTypes.find(t => t.id === typeId)
                        return (
                          <Tag key={typeId} color={userType?.color || 'orange'} size={isMobile ? 'small' : 'default'}>
                            {userType?.emoji} {formatMinutes(minutes)} {userType?.name || 'Unknown'}
                          </Tag>
                        )
                      })}
                      {Object.keys(accumulated).length === 0 && (
                        <Text type="secondary">None used</Text>
                      )}
                    </Space>
                  </Space>
                </Col>
                <Col xs={24} sm={8} md={8}>
                  <Space direction="vertical">
                    <Text type="secondary">Remaining</Text>
                    <Space wrap>
                      {Object.entries(remainingCapacity).map(([typeId, minutes]) => {
                        const userType = userTaskTypes.find(t => t.id === typeId)
                        return (
                          <Tag key={typeId} color={minutes > 0 ? (userType?.color || 'green') : 'red'} size={isMobile ? 'small' : 'default'}>
                            {userType?.emoji} {formatMinutes(minutes)} {userType?.name || 'Unknown'}
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
          <Empty description="No work blocks. Click Add Block to get started." />
        ) : (
          <Space direction="vertical" style={{ width: '100%' }} size={4}>
            {blocks.map((block) => (
              <div
                key={block.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '6px 8px',
                  background: 'var(--color-fill-1)',
                  borderRadius: 6,
                  flexWrap: 'wrap',
                }}
              >
                {/* Time range — stays on one line */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                  <ClockTimePicker
                    value={block.startTime}
                    onChange={(value) => handleUpdateBlock(block.id, { startTime: value })}
                    style={{ width: 70 }}
                  />
                  <span style={{ color: 'var(--color-text-4)', fontSize: 12 }}>→</span>
                  <ClockTimePicker
                    value={block.endTime}
                    onChange={(value) => handleUpdateBlock(block.id, { endTime: value })}
                    style={{ width: 70 }}
                  />
                </div>

                {/* Type selector — grows to fill */}
                <Select
                  size="small"
                  value={
                    isSystemBlock(block.typeConfig) ? 'system' :
                    isAnyBlock(block.typeConfig) ? 'any' :
                    isComboBlock(block.typeConfig) ? 'combo' :
                    isSingleTypeBlock(block.typeConfig) ? block.typeConfig.typeId :
                    userTaskTypes[0]?.id ?? 'unknown'
                  }
                  onChange={(value) => {
                    let newTypeConfig: BlockTypeConfig
                    if (value === 'any') {
                      newTypeConfig = { kind: BlockConfigKind.Any }
                    } else if (value === 'combo') {
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
                      newTypeConfig = { kind: BlockConfigKind.Single, typeId: value }
                    }
                    handleUpdateBlock(block.id, {
                      typeConfig: newTypeConfig,
                      capacity: calculateBlockCapacity(newTypeConfig, block.startTime, block.endTime),
                    })
                  }}
                  style={{ flex: 1, minWidth: 100 }}
                >
                  {userTaskTypes.map(type => (
                    <Select.Option key={type.id} value={type.id}>
                      {type.emoji} {type.name}
                    </Select.Option>
                  ))}
                  <Select.Option value="any">📋 Any Task</Select.Option>
                  {userTaskTypes.length >= 2 && (
                    <Select.Option value="combo">🔀 Combo</Select.Option>
                  )}
                  <Select.Option value="system">🚫 Blocked</Select.Option>
                </Select>

                {/* Capacity badge */}
                <Text type="secondary" style={{ fontSize: 11, flexShrink: 0, whiteSpace: 'nowrap' }}>
                  {block.capacity?.totalMinutes || 0}m
                </Text>

                {/* Delete */}
                <Popconfirm
                  title="Delete this block?"
                  onOk={() => handleDeleteBlock(block.id)}
                >
                  <Button
                    type="text"
                    status="danger"
                    size="mini"
                    icon={<IconDelete />}
                    style={{ flexShrink: 0 }}
                  />
                </Popconfirm>
              </div>
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
                type: MeetingType.Blocked,
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

          </Space>
        </Col>
        <Col xs={24} sm={24} md={12} lg={12}>
          <div style={{
            height: isMobile ? 'auto' : 'calc(100vh - 200px)',
            position: isMobile ? 'relative' : 'sticky',
            top: isMobile ? 0 : 16,
            marginTop: isMobile ? 16 : 0,
          }}>
            <TimelineVisualizer
              blocks={blocks}
              meetings={meetings}
              onBlockUpdate={(id, updates) => handleUpdateBlock(id, updates)}
              onMeetingUpdate={(id, updates) => handleUpdateMeeting(id, updates)}
              startHour={0}
              endHour={24}
              height={isMobile ? 400 : Math.max(600, window.innerHeight - 250)}
            />
          </div>
        </Col>
      </Row>
    </div>
  )
}
