import React, { useState } from 'react'
import { TaskStep } from '@shared/sequencing-types'
import { Form, Input, Button, Space, Typography, Grid, Tag, Alert, Modal } from '@arco-design/web-react'
import { logger } from '@/logger'


const FormItem = Form.Item
const TextArea = Input.TextArea
const { Title, Text } = Typography
const { Row, Col } = Grid

interface TimeLoggingModalProps {
  step: TaskStep
  onClose: () => void
  onLogTime: (__minutes: number, notes?: string) => Promise<void>
  onComplete?: (__minutes: number, notes?: string) => Promise<void>
  mode?: 'log' | 'complete'
}

export const TimeLoggingModal: React.FC<TimeLoggingModalProps> = ({
  step,
  onClose,
  onLogTime,
  onComplete,
  mode = 'log',
}) => {
  const [form] = Form.useForm()
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async () => {
    try {
      const values = await form.validate()
      const hours = parseInt(values.hours) || 0
      const minutes = parseInt(values.minutes) || 0
      const totalMinutes = hours * 60 + minutes

      if (totalMinutes <= 0) {
        form.setFields({
          minutes: {
            error: {
              message: 'Please enter a valid time',
            },
          },
        })
        return
      }

      setIsSubmitting(true)

      if (mode === 'complete' && onComplete) {
        await onComplete(totalMinutes, values.notes ?? null)
      } else {
        await onLogTime(totalMinutes, values.notes ?? null)
      }
    } catch (error) {
      logger.ui.error('Failed to log time', {
        error: error instanceof Error ? error.message : String(error),
      }, 'time-log-error')
    } finally {
      setIsSubmitting(false)
    }
  }

  const suggestedTimes = [
    { label: '15 min', minutes: 15 },
    { label: '30 min', minutes: 30 },
    { label: '1 hour', minutes: 60 },
    { label: '2 hours', minutes: 120 },
    { label: 'Est. time', minutes: step.duration },
  ]

  const applySuggestedTime = (minutes: number) => {
    form.setFieldsValue({
      hours: Math.floor(minutes / 60),
      minutes: minutes % 60,
    })
  }

  return (
    <Modal
      title={mode === 'complete' ? 'Complete Step' : 'Log Time'}
      visible={true}
      onCancel={onClose}
      footer={null}
      style={{ maxWidth: '90vw' }}
    >
      <div>

      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <div>
          <Title heading={6} style={{ marginBottom: 8 }}>{step.name}</Title>
          <Text type="secondary">
            Estimated time: {Math.floor(step.duration / 60)}h {step.duration % 60}m
          </Text>
        </div>

        <Form
          form={form}
          layout="vertical"
          initialValues={{
            hours: 0,
            minutes: 0,
            notes: '',
          }}
          onSubmit={handleSubmit}
        >
          <FormItem label="Time spent">
            <Row gutter={8}>
              <Col span={8}>
                <FormItem field="hours" noStyle>
                  <Input
                    type="number"
                    min={0}
                    max={99}
                    suffix="h"
                    placeholder="0"
                  />
                </FormItem>
              </Col>
              <Col span={8}>
                <FormItem field="minutes" noStyle>
                  <Input
                    type="number"
                    min={0}
                    max={59}
                    suffix="m"
                    placeholder="0"
                  />
                </FormItem>
              </Col>
            </Row>

            {/* Quick time buttons */}
            <Space wrap style={{ marginTop: 12 }}>
              {suggestedTimes.map((time) => (
                <Tag
                  key={time.label}
                  checkable
                  onClick={() => applySuggestedTime(time.minutes)}
                  style={{ cursor: 'pointer' }}
                >
                  {time.label}
                </Tag>
              ))}
            </Space>
          </FormItem>

          <FormItem
            field="notes"
            label="Notes (optional)"
          >
            <TextArea
              rows={3}
              placeholder="Any notes about this work session..."
            />
          </FormItem>

          {mode === 'complete' && (
            <Alert
              type="info"
              content="This will mark the step as completed with the logged time."
              style={{ marginBottom: 16 }}
            />
          )}

          {mode === 'log' && step.status === 'completed' && (
            <Alert
              type="success"
              content="This step is already completed. You can still log additional time worked on it."
              style={{ marginBottom: 16 }}
            />
          )}

          {mode === 'log' && step.status === 'pending' && (
            <Alert
              type="warning"
              content="This step hasn't been started yet. You can log time retroactively or use the 'Log Time & Complete' button to mark it as done."
              style={{ marginBottom: 16 }}
            />
          )}

          <FormItem>
            <Space>
              <Button onClick={onClose} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button
                type="primary"
                htmlType="submit"
                loading={isSubmitting}
              >
                {mode === 'complete' ? 'Complete Step' : 'Log Time'}
              </Button>
              {mode === 'log' && onComplete && (
                <Button
                  type="primary"
                  status="success"
                  loading={isSubmitting}
                  onClick={async () => {
                    const values = await form.validate()
                    const hours = parseInt(values.hours) || 0
                    const minutes = parseInt(values.minutes) || 0
                    const totalMinutes = hours * 60 + minutes
                    if (totalMinutes > 0) {
                      setIsSubmitting(true)
                      try {
                        await onComplete(totalMinutes, values.notes ?? null)
                      } finally {
                        setIsSubmitting(false)
                      }
                    }
                  }}
                >
                  Log Time & Complete
                </Button>
              )}
            </Space>
          </FormItem>
        </Form>
      </Space>
    </div>
    </Modal>
  )
}
