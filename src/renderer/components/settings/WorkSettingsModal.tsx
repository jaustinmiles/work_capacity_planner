import { useState } from 'react'
import {
  Modal,
  Form,
  InputNumber,
  Button,
  Space,
  Typography,
  Grid,
  Divider,
  Card,
  Tag,
  Select,
  Input,
  List,
  Popconfirm,
  Checkbox,
} from '@arco-design/web-react'
import { IconPlus, IconDelete, IconEdit, IconSettings } from '@arco-design/web-react/icon'
import { WorkSettings, BlockedTime, DEFAULT_WORK_SETTINGS } from '@shared/work-settings-types'
import { useTaskStore } from '../../store/useTaskStore'
import { Message } from '../common/Message'
import { ClockTimePicker } from '../common/ClockTimePicker'

const { Title, Text } = Typography
const { Row, Col } = Grid
const FormItem = Form.Item

interface WorkSettingsModalProps {
  visible: boolean
  onClose: () => void
}

export function WorkSettingsModal({ visible, onClose }: WorkSettingsModalProps) {
  const { workSettings, updateWorkSettings } = useTaskStore()
  const [form] = Form.useForm()
  const [blockedTimes, setBlockedTimes] = useState<BlockedTime[]>(
    workSettings?.defaultCapacity.blockedTimes || [],
  )
  const [editingBlockedTime, setEditingBlockedTime] = useState<BlockedTime | null>(null)
  const [showBlockedTimeForm, setShowBlockedTimeForm] = useState(false)
  const [enableSaturday, setEnableSaturday] = useState(
    workSettings?.customWorkHours?.[6] !== undefined,
  )
  const [enableSunday, setEnableSunday] = useState(
    workSettings?.customWorkHours?.[0] !== undefined,
  )

  const handleSave = async () => {
    try {
      await form.validate()
      const values = form.getFields()

      // Build custom work hours for weekends if enabled
      const customWorkHours = { ...(workSettings?.customWorkHours || {}) }
      
      if (enableSaturday) {
        customWorkHours[6] = {
          startTime: values.saturdayStartTime?.format('HH:mm') || values.startTime.format('HH:mm'),
          endTime: values.saturdayEndTime?.format('HH:mm') || values.endTime.format('HH:mm'),
          lunchStart: values.saturdayLunchStart?.format('HH:mm'),
          lunchDuration: values.saturdayLunchDuration || 60,
        }
      } else {
        delete customWorkHours[6]
      }
      
      if (enableSunday) {
        customWorkHours[0] = {
          startTime: values.sundayStartTime?.format('HH:mm') || values.startTime.format('HH:mm'),
          endTime: values.sundayEndTime?.format('HH:mm') || values.endTime.format('HH:mm'),
          lunchStart: values.sundayLunchStart?.format('HH:mm'),
          lunchDuration: values.sundayLunchDuration || 60,
        }
      } else {
        delete customWorkHours[0]
      }

      const newSettings: WorkSettings = {
        defaultWorkHours: {
          startTime: values.startTime.format('HH:mm'),
          endTime: values.endTime.format('HH:mm'),
          lunchStart: values.lunchStart?.format('HH:mm'),
          lunchDuration: values.lunchDuration || 60,
        },
        customWorkHours,
        defaultCapacity: {
          maxFocusHours: values.maxFocusHours || 4,
          maxAdminHours: values.maxAdminHours || 3,
          blockedTimes,
        },
        customCapacity: workSettings?.customCapacity || {},
        timeZone: workSettings?.timeZone || DEFAULT_WORK_SETTINGS.timeZone,
      }

      await updateWorkSettings(newSettings)
      Message.success('Work settings updated successfully')
      onClose()
    } catch (error) {
      Message.error('Please fill in all required fields')
    }
  }

  const handleAddBlockedTime = () => {
    setEditingBlockedTime({
      id: `blocked-${Date.now()}`,
      name: '',
      startTime: '14:00',
      endTime: '15:00',
      recurring: 'none',
    })
    setShowBlockedTimeForm(true)
  }

  const handleSaveBlockedTime = (blockedTime: BlockedTime) => {
    if (editingBlockedTime && blockedTimes.find(bt => bt.id === editingBlockedTime.id)) {
      // Update existing
      setBlockedTimes(blockedTimes.map(bt =>
        bt.id === blockedTime.id ? blockedTime : bt,
      ))
    } else {
      // Add new
      setBlockedTimes([...blockedTimes, blockedTime])
    }
    setShowBlockedTimeForm(false)
    setEditingBlockedTime(null)
  }

  const handleDeleteBlockedTime = (id: string) => {
    setBlockedTimes(blockedTimes.filter(bt => bt.id !== id))
  }

  const formatBlockedTimeRecurrence = (recurring: string) => {
    switch (recurring) {
      case 'daily': return 'Every day'
      case 'weekly': return 'Weekly'
      case 'custom': return 'Custom days'
      default: return 'One time'
    }
  }

  return (
    <Modal
      title={
        <Space>
          <IconSettings />
          Work Settings
        </Space>
      }
      visible={visible}
      onOk={handleSave}
      onCancel={onClose}
      style={{ width: 600 }}
      okText="Save Settings"
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={{
          startTime: workSettings?.defaultWorkHours.startTime || '09:00',
          endTime: workSettings?.defaultWorkHours.endTime || '18:00',
          lunchStart: workSettings?.defaultWorkHours.lunchStart || '12:00',
          lunchDuration: workSettings?.defaultWorkHours.lunchDuration || 60,
          maxFocusHours: workSettings?.defaultCapacity.maxFocusHours || 4,
          maxAdminHours: workSettings?.defaultCapacity.maxAdminHours || 3,
        }}
      >
        <Title heading={6}>Work Hours</Title>
        <Row gutter={16}>
          <Col span={12}>
            <FormItem
              label="Start Time"
              field="startTime"
              rules={[{ required: true, message: 'Please select start time' }]}
            >
              <ClockTimePicker
                style={{ width: '100%' }}
              />
            </FormItem>
          </Col>
          <Col span={12}>
            <FormItem
              label="End Time"
              field="endTime"
              rules={[{ required: true, message: 'Please select end time' }]}
            >
              <ClockTimePicker
                style={{ width: '100%' }}
              />
            </FormItem>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={12}>
            <FormItem
              label="Lunch Start"
              field="lunchStart"
            >
              <ClockTimePicker
                style={{ width: '100%' }}
              />
            </FormItem>
          </Col>
          <Col span={12}>
            <FormItem
              label="Lunch Duration (minutes)"
              field="lunchDuration"
            >
              <InputNumber
                min={0}
                max={120}
                style={{ width: '100%' }}
              />
            </FormItem>
          </Col>
        </Row>

        <Divider />

        <Title heading={6}>Daily Capacity</Title>
        <Row gutter={16}>
          <Col span={12}>
            <FormItem
              label="Max Focus Hours per Day"
              field="maxFocusHours"
              rules={[{ required: true, message: 'Please enter max focus hours' }]}
            >
              <InputNumber
                min={1}
                max={12}
                precision={1}
                style={{ width: '100%' }}
                suffix="hours"
              />
            </FormItem>
          </Col>
          <Col span={12}>
            <FormItem
              label="Max Admin/Meeting Hours per Day"
              field="maxAdminHours"
              rules={[{ required: true, message: 'Please enter max admin hours' }]}
            >
              <InputNumber
                min={1}
                max={12}
                precision={1}
                style={{ width: '100%' }}
                suffix="hours"
              />
            </FormItem>
          </Col>
        </Row>

        <Divider />

        <Title heading={6}>Weekend Work Hours</Title>
        
        <Space direction="vertical" style={{ width: '100%', marginBottom: 16 }}>
          <Checkbox
            checked={enableSaturday}
            onChange={setEnableSaturday}
          >
            Enable Saturday Work
          </Checkbox>
          
          {enableSaturday && (
            <Row gutter={16} style={{ marginLeft: 24 }}>
              <Col span={12}>
                <FormItem
                  label="Saturday Start Time"
                  field="saturdayStartTime"
                >
                  <ClockTimePicker
                    style={{ width: '100%' }}
                  />
                </FormItem>
              </Col>
              <Col span={12}>
                <FormItem
                  label="Saturday End Time"
                  field="saturdayEndTime"
                >
                  <ClockTimePicker
                    style={{ width: '100%' }}
                  />
                </FormItem>
              </Col>
            </Row>
          )}
          
          <Checkbox
            checked={enableSunday}
            onChange={setEnableSunday}
          >
            Enable Sunday Work
          </Checkbox>
          
          {enableSunday && (
            <Row gutter={16} style={{ marginLeft: 24 }}>
              <Col span={12}>
                <FormItem
                  label="Sunday Start Time"
                  field="sundayStartTime"
                >
                  <ClockTimePicker
                    style={{ width: '100%' }}
                  />
                </FormItem>
              </Col>
              <Col span={12}>
                <FormItem
                  label="Sunday End Time"
                  field="sundayEndTime"
                >
                  <ClockTimePicker
                    style={{ width: '100%' }}
                  />
                </FormItem>
              </Col>
            </Row>
          )}
        </Space>

        <Divider />

        <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Title heading={6} style={{ margin: 0 }}>Blocked Time Slots</Title>
          <Button
            type="primary"
            size="small"
            icon={<IconPlus />}
            onClick={handleAddBlockedTime}
          >
            Add Blocked Time
          </Button>
        </div>

        {blockedTimes.length === 0 ? (
          <Card style={{ textAlign: 'center', color: '#86909c' }}>
            <Text type="secondary">No blocked time slots configured</Text>
          </Card>
        ) : (
          <List
            dataSource={blockedTimes}
            render={(item) => (
              <List.Item
                key={item.id}
                actions={[
                  <Button
                    key="edit"
                    type="text"
                    size="small"
                    icon={<IconEdit />}
                    onClick={() => {
                      setEditingBlockedTime(item)
                      setShowBlockedTimeForm(true)
                    }}
                  />,
                  <Popconfirm
                    key="delete"
                    title="Delete this blocked time?"
                    onOk={() => handleDeleteBlockedTime(item.id)}
                  >
                    <Button
                      type="text"
                      size="small"
                      status="danger"
                      icon={<IconDelete />}
                    />
                  </Popconfirm>,
                ]}
              >
                <List.Item.Meta
                  title={item.name}
                  description={
                    <Space>
                      <Tag size="small">{item.startTime} - {item.endTime}</Tag>
                      <Tag size="small" color="blue">
                        {formatBlockedTimeRecurrence(item.recurring)}
                      </Tag>
                    </Space>
                  }
                />
              </List.Item>
            )}
          />
        )}
      </Form>

      {/* Blocked Time Form Modal */}
      <Modal
        title={editingBlockedTime?.id.startsWith('blocked-') ? 'Add Blocked Time' : 'Edit Blocked Time'}
        visible={showBlockedTimeForm}
        onOk={() => {
          const values = form.getFields()
          if (editingBlockedTime) {
            handleSaveBlockedTime({
              ...editingBlockedTime,
              ...values,
            })
          }
        }}
        onCancel={() => {
          setShowBlockedTimeForm(false)
          setEditingBlockedTime(null)
        }}
      >
        <Form layout="vertical">
          <FormItem label="Name" required>
            <Input
              placeholder="e.g., Team Standup"
              value={editingBlockedTime?.name}
              onChange={(value) => {
                if (editingBlockedTime) {
                  setEditingBlockedTime({ ...editingBlockedTime, name: value })
                }
              }}
            />
          </FormItem>

          <Row gutter={16}>
            <Col span={12}>
              <FormItem label="Start Time" required>
                <ClockTimePicker
                  value={editingBlockedTime?.startTime}
                  onChange={(value) => {
                    if (editingBlockedTime && value) {
                      setEditingBlockedTime({
                        ...editingBlockedTime,
                        startTime: value,
                      })
                    }
                  }}
                  style={{ width: '100%' }}
                />
              </FormItem>
            </Col>
            <Col span={12}>
              <FormItem label="End Time" required>
                <ClockTimePicker
                  value={editingBlockedTime?.endTime}
                  onChange={(value) => {
                    if (editingBlockedTime && value) {
                      setEditingBlockedTime({
                        ...editingBlockedTime,
                        endTime: value,
                      })
                    }
                  }}
                  style={{ width: '100%' }}
                />
              </FormItem>
            </Col>
          </Row>

          <FormItem label="Recurrence">
            <Select
              value={editingBlockedTime?.recurring}
              onChange={(value) => {
                if (editingBlockedTime) {
                  setEditingBlockedTime({ ...editingBlockedTime, recurring: value })
                }
              }}
            >
              <Select.Option value="none">One time</Select.Option>
              <Select.Option value="daily">Every day</Select.Option>
              <Select.Option value="weekly">Weekly</Select.Option>
              <Select.Option value="custom" disabled>Custom days (coming soon)</Select.Option>
            </Select>
          </FormItem>
        </Form>
      </Modal>
    </Modal>
  )
}
