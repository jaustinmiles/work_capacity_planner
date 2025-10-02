import { useState } from 'react'
import { TaskStep } from '@shared/sequencing-types'
import { StepStatus } from '@shared/enums'
import {
  Modal,
  Form,
  Input,
  Typography,
  Space,
  Slider,
  Alert,
  Grid,
} from '@arco-design/web-react'
import { IconScissor } from '@arco-design/web-react/icon'
import { Message } from '../common/Message'
import { logger } from '@/shared/logger'

const { Title, Text } = Typography
const { Row, Col } = Grid
const FormItem = Form.Item

interface StepSplitModalProps {
  step: TaskStep
  stepIndex: number
  visible: boolean
  onClose: () => void
  onSplit: (step1: TaskStep, step2: TaskStep) => void
}

export function StepSplitModal({
  step,
  stepIndex,
  visible,
  onClose,
  onSplit,
}: StepSplitModalProps) {
  const [form] = Form.useForm()
  const [splitRatio, setSplitRatio] = useState(50)
  const [loading, setLoading] = useState(false)

  // Calculate durations based on split ratio
  const duration1 = Math.round(step.duration * (splitRatio / 100))
  const duration2 = step.duration - duration1

  const handleSplit = async () => {
    try {
      setLoading(true)
      const values = await form.validate()

      // Create first step (update existing)
      const step1: TaskStep = {
        ...step,
        name: values.name1,
        duration: duration1,
        notes: values.description1 || step.notes,
      }

      // Create second step (new)
      const step2: TaskStep = {
        id: `${step.id}-split-${Date.now()}`,
        taskId: step.taskId,
        name: values.name2,
        duration: duration2,
        type: step.type,
        asyncWaitTime: 0,
        dependsOn: step.dependsOn, // Inherit dependencies
        status: StepStatus.Pending,
        stepIndex: step.stepIndex + 1,
        percentComplete: 0,
        notes: values.description2,
        cognitiveComplexity: step.cognitiveComplexity,
        importance: step.importance,
        urgency: step.urgency,
        actualDuration: 0,
      }

      logger.ui.info('Step split successfully', {
        originalStepId: step.id,
        newStepId: step2.id,
        splitRatio,
      })

      Message.success('Step split successfully')
      onSplit(step1, step2)
      form.resetFields()
      onClose()
    } catch (error) {
      logger.ui.error('Failed to split step:', error)
      Message.error('Failed to split step')
    } finally {
      setLoading(false)
    }
  }

  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    if (hours > 0) {
      return `${hours}h ${mins > 0 ? `${mins}m` : ''}`
    }
    return `${mins}m`
  }

  return (
    <Modal
      title={
        <Space>
          <IconScissor />
          <span>Split Workflow Step</span>
        </Space>
      }
      visible={visible}
      onCancel={onClose}
      onOk={handleSplit}
      confirmLoading={loading}
      okText="Split Step"
      cancelText="Cancel"
      style={{ width: 600 }}
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={{
          name1: step.name,
          name2: `${step.name} (continued)`,
          description1: step.notes,
        }}
      >
        <Space direction="vertical" style={{ width: '100%' }} size="large">
          <Alert
            type="info"
            content={`This will split Step ${stepIndex + 1}: "${step.name}" (${formatDuration(step.duration)}) into two separate steps.`}
          />

          <div>
            <Title heading={6}>Duration Split</Title>
            <Slider
              value={splitRatio}
              onChange={(value) => setSplitRatio(value as number)}
              marks={{
                0: '0%',
                25: '25%',
                50: '50%',
                75: '75%',
                100: '100%',
              }}
              min={10}
              max={90}
              step={5}
              formatTooltip={(value) => `${value}%`}
            />
            <Row gutter={16} style={{ marginTop: 16 }}>
              <Col span={12}>
                <Text type="secondary">First step: </Text>
                <Text style={{ fontWeight: 600 }}>{formatDuration(duration1)}</Text>
              </Col>
              <Col span={12}>
                <Text type="secondary">Second step: </Text>
                <Text style={{ fontWeight: 600 }}>{formatDuration(duration2)}</Text>
              </Col>
            </Row>
          </div>

          <Row gutter={16}>
            <Col span={12}>
              <FormItem
                field="name1"
                label="First Step Name"
                rules={[{ required: true, message: 'Please enter a name' }]}
              >
                <Input placeholder="Enter name for first part" />
              </FormItem>
              <FormItem field="description1" label="Description (optional)">
                <Input.TextArea
                  rows={2}
                  placeholder="Optional description for first part"
                />
              </FormItem>
            </Col>
            <Col span={12}>
              <FormItem
                field="name2"
                label="Second Step Name"
                rules={[{ required: true, message: 'Please enter a name' }]}
              >
                <Input placeholder="Enter name for second part" />
              </FormItem>
              <FormItem field="description2" label="Description (optional)">
                <Input.TextArea
                  rows={2}
                  placeholder="Optional description for second part"
                />
              </FormItem>
            </Col>
          </Row>

          <Alert
            type="warning"
            content="The second step will be inserted immediately after the first step. Dependencies will be preserved."
          />
        </Space>
      </Form>
    </Modal>
  )
}
