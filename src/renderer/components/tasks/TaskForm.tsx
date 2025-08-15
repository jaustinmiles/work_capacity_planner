import React from 'react'
import { Modal, Form, Input, Select, Slider, InputNumber, Space, Grid, DatePicker, Checkbox, Radio, Typography } from '@arco-design/web-react'
import { IconClockCircle, IconCalendar, IconLock, IconBulb } from '@arco-design/web-react/icon'
import { useTaskStore } from '../../store/useTaskStore'

const { TextArea } = Input
const { Row, Col } = Grid

interface TaskFormProps {
  visible: boolean
  onClose: () => void
}

export function TaskForm({ visible, onClose }: TaskFormProps) {
  const { addTask } = useTaskStore()
  const [form] = Form.useForm()
  const [isLocked, setIsLocked] = React.useState(false)
  const [hasDeadline, setHasDeadline] = React.useState(false)

  const handleSubmit = async () => {
    try {
      const values = await form.validate()

      // Convert deadline and lockedStartTime to ISO string if present
      const taskData = {
        ...values,
        deadline: values.deadline ? values.deadline.toISOString() : undefined,
        deadlineType: values.deadline ? (values.deadlineType || 'soft') : undefined,
        lockedStartTime: values.lockedStartTime ? values.lockedStartTime.toISOString() : undefined,
        isLocked: values.isLocked || false,
        cognitiveComplexity: values.cognitiveComplexity || undefined,
        dependencies: [],
        completed: false,
      }

      await addTask(taskData)

      form.resetFields()
      onClose()
    } catch (error) {
      // Form validation failed or database error
      // Error already handled by store
    }
  }

  return (
    <Modal
      title="Create New Task"
      visible={visible}
      onOk={handleSubmit}
      onCancel={onClose}
      autoFocus={false}
      focusLock={true}
      okText="Add Task"
      style={{ width: 600 }}
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={{
          duration: 60,
          importance: 5,
          urgency: 5,
          type: 'focused',
          category: 'work',
          asyncWaitTime: 0,
        }}
      >
        <Form.Item
          label="Task Name"
          field="name"
          rules={[{ required: true, message: 'Please enter a task name' }]}
        >
          <Input placeholder="Enter task name" />
        </Form.Item>

        <Row gutter={16}>
          <Col span={8}>
            <Form.Item
              label="Category"
              field="category"
              rules={[{ required: true }]}
            >
              <Select>
                <Select.Option value="work">Work</Select.Option>
                <Select.Option value="personal">Personal</Select.Option>
              </Select>
            </Form.Item>
          </Col>

          <Col span={8}>
            <Form.Item
              label="Type"
              field="type"
              rules={[{ required: true }]}
            >
              <Select>
                <Select.Option value="focused">Focused Work</Select.Option>
                <Select.Option value="admin">Admin/Meetings</Select.Option>
              </Select>
            </Form.Item>
          </Col>

          <Col span={8}>
            <Form.Item
              label={
                <Space>
                  <IconClockCircle />
                  <span>Duration (minutes)</span>
                </Space>
              }
              field="duration"
              rules={[{ required: true, min: 5 }]}
            >
              <InputNumber
                min={5}
                step={5}
                placeholder="60"
                style={{ width: '100%' }}
              />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              label="Importance (1-10)"
              field="importance"
              rules={[{ required: true }]}
            >
              <Space direction="vertical" style={{ width: '100%' }}>
                <Slider
                  min={1}
                  max={10}
                  marks={{
                    1: '1',
                    5: '5',
                    10: '10',
                  }}
                />
              </Space>
            </Form.Item>
          </Col>

          <Col span={12}>
            <Form.Item
              label="Urgency (1-10)"
              field="urgency"
              rules={[{ required: true }]}
            >
              <Space direction="vertical" style={{ width: '100%' }}>
                <Slider
                  min={1}
                  max={10}
                  marks={{
                    1: '1',
                    5: '5',
                    10: '10',
                  }}
                />
              </Space>
            </Form.Item>
          </Col>
        </Row>

        <Form.Item
          label={
            <Space>
              <IconCalendar />
              <span>Async Wait Time (minutes)</span>
            </Space>
          }
          field="asyncWaitTime"
          extra="Time to wait for external processes (e.g., CI/CD, reviews)"
        >
          <InputNumber
            min={0}
            step={5}
            placeholder="0"
            style={{ width: '100%' }}
          />
        </Form.Item>

        <Form.Item
          label={
            <Space>
              <IconCalendar />
              <span>Deadline (Optional)</span>
            </Space>
          }
          field="deadline"
          extra="Set a target completion date for this task"
        >
          <DatePicker
            showTime
            placeholder="Select deadline"
            style={{ width: '100%' }}
            onChange={(value) => setHasDeadline(!!value)}
            disabledDate={(current) => {
              // Disable dates before today
              return current.isBefore(new Date(), 'day')
            }}
          />
        </Form.Item>

        {hasDeadline && (
          <Form.Item
            label="Deadline Type"
            field="deadlineType"
            initialValue="soft"
            extra="Hard deadlines must be met, soft deadlines are targets"
          >
            <Radio.Group>
              <Radio value="soft">Soft (Target)</Radio>
              <Radio value="hard">Hard (Must Meet)</Radio>
            </Radio.Group>
          </Form.Item>
        )}

        <Form.Item
          label={
            <Space>
              <IconBulb />
              <span>Cognitive Complexity</span>
            </Space>
          }
          field="cognitiveComplexity"
          extra="How mentally demanding is this task?"
        >
          <Select placeholder="Select complexity level">
            <Select.Option value={1}>1 - Trivial (routine, automatic)</Select.Option>
            <Select.Option value={2}>2 - Simple (straightforward, clear)</Select.Option>
            <Select.Option value={3}>3 - Moderate (requires focus)</Select.Option>
            <Select.Option value={4}>4 - Complex (challenging, requires deep thought)</Select.Option>
            <Select.Option value={5}>5 - Very Complex (highly challenging, novel)</Select.Option>
          </Select>
        </Form.Item>

        <Form.Item
          label={
            <Space>
              <IconLock />
              <span>Lock to Specific Time</span>
            </Space>
          }
          field="isLocked"
          extra="Task must start at an exact time (e.g., meetings, appointments)"
        >
          <Checkbox onChange={(checked) => setIsLocked(checked)}>
            Lock this task to a specific start time
          </Checkbox>
        </Form.Item>

        {isLocked && (
          <Form.Item
            label={
              <Space>
                <IconClockCircle />
                <span>Locked Start Time</span>
              </Space>
            }
            field="lockedStartTime"
            extra="The exact time this task must start"
            rules={[{ required: true, message: 'Please select a start time for the locked task' }]}
          >
          <DatePicker
            showTime
            placeholder="Select exact start time"
            style={{ width: '100%' }}
            format="YYYY-MM-DD HH:mm"
          />
          </Form.Item>
        )}

        <Form.Item
          label="Notes"
          field="notes"
        >
          <TextArea
            placeholder="Additional details..."
            showWordLimit
            maxLength={500}
            rows={3}
          />
        </Form.Item>
      </Form>
    </Modal>
  )
}
