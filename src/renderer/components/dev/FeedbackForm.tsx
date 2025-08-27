import React, { useState } from 'react'
import { Form, Input, Button, Radio, Typography, Space, Alert, Checkbox } from '@arco-design/web-react'
import { IconMessage, IconSave } from '@arco-design/web-react/icon'
import { Message } from '../common/Message'
import { logger } from '../../utils/logger'

const FormItem = Form.Item
const TextArea = Input.TextArea
const { Title, Text } = Typography
const RadioGroup = Radio.Group
const CheckboxGroup = Checkbox.Group

interface FeedbackFormProps {
  onClose?: () => void
}

interface FeedbackData {
  type: 'bug' | 'feature' | 'improvement' | 'other'
  priority: 'low' | 'medium' | 'high' | 'critical'
  title: string
  description: string
  components?: string[]
  steps?: string
  expected?: string
  actual?: string
  context?: string
  timestamp: string
  sessionId: string
}

// Component options that map to actual files
const COMPONENT_OPTIONS = [
  { label: 'Task List', value: 'tasks/TaskList' },
  { label: 'Task Edit Form', value: 'tasks/TaskEdit' },
  { label: 'Eisenhower Matrix', value: 'tasks/EisenhowerMatrix' },
  { label: 'Gantt Chart', value: 'timeline/GanttChart' },
  { label: 'Gantt Chart Sidebar', value: 'timeline/GanttChartSidebar' },
  { label: 'Work Status Widget', value: 'status/WorkStatusWidget' },
  { label: 'Work Logger (Dual View)', value: 'work-logger/WorkLoggerDualView' },
  { label: 'Work Logger Calendar', value: 'work-logger/WorkLoggerCalendar' },
  { label: 'Weekly Calendar', value: 'calendar/WeeklyCalendar' },
  { label: 'Workflow Editor', value: 'tasks/SequencedTaskEdit' },
  { label: 'Workflow Progress Tracker', value: 'progress/WorkflowProgressTracker' },
  { label: 'Voice Amendment', value: 'voice/VoiceAmendmentModal' },
  { label: 'AI Brainstorm', value: 'ai/BrainstormModal' },
  { label: 'Task Creation Flow', value: 'ai/TaskCreationFlow' },
  { label: 'Schedule Generator', value: 'schedule/ScheduleGenerator' },
  { label: 'Daily Schedule View', value: 'schedule/DailyScheduleView' },
  { label: 'Timeline Visualizer', value: 'schedule/TimelineVisualizer' },
  { label: 'Work Blocks Editor', value: 'settings/WorkBlocksEditor' },
  { label: 'Multi-Day Schedule Editor', value: 'settings/MultiDayScheduleEditor' },
  { label: 'Session Manager', value: 'session/SessionManager' },
  { label: 'Dev Tools', value: 'dev/DevTools' },
  { label: 'Navigation', value: 'layout/Navigation' },
  { label: 'Scheduler (flexible-scheduler.ts)', value: 'utils/flexible-scheduler' },
  { label: 'Amendment Applicator', value: 'utils/amendment-applicator' },
  { label: 'Database Service', value: 'services/database' },
  { label: 'Other/Not Listed', value: 'other' },
]

export function FeedbackForm({ onClose }: FeedbackFormProps): React.ReactElement {
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [feedbackType, setFeedbackType] = useState<FeedbackData['type']>('improvement')

  // Set default values when component mounts
  React.useEffect(() => {
    form.setFieldsValue({
      priority: 'medium',
      type: 'improvement',
    })
  }, [form])

  const handleSubmit = async (): Promise<void> => {
    try {
      const values = await form.validate()
      setLoading(true)

      const sessionId = await window.electronAPI?.getSessionId?.() || 'unknown'

      const feedback: FeedbackData = {
        ...values,
        timestamp: new Date().toISOString(),
        sessionId,
      }

      // Save feedback to a JSON file in the context folder for Claude to see
      await saveFeedback(feedback)

      Message.success('Feedback saved successfully!')
      logger.ui.info('Feedback submitted:', feedback)

      form.resetFields()
      onClose?.()
    } catch (error) {
      logger.ui.error('Failed to submit feedback:', error)
      Message.error('Failed to save feedback')
    } finally {
      setLoading(false)
    }
  }

  const saveFeedback = async (feedback: FeedbackData): Promise<void> => {
    try {
      // Get existing feedback or create new array
      const existingFeedback = await window.electronAPI?.readFeedback?.() || []

      // Add new feedback
      const updatedFeedback = [...existingFeedback, feedback]

      // Save to file
      await window.electronAPI?.saveFeedback?.(updatedFeedback)
    } catch (_error) {
      // If the API doesn't exist yet, save to localStorage as fallback
      const storedFeedback = window.localStorage.getItem('app_feedback')
      const existing = storedFeedback ? JSON.parse(storedFeedback) : []
      existing.push(feedback)
      window.localStorage.setItem('app_feedback', JSON.stringify(existing))

      // Also write to context folder if possible
      logger.ui.info('Feedback saved to localStorage:', feedback)
    }
  }

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="large">
      <div>
        <Title heading={6}>
          <Space>
            <IconMessage />
            Submit Feedback
          </Space>
        </Title>
        <Text type="secondary">
          Your feedback will be saved to the context folder for Claude to review in the next session.
        </Text>
      </div>

      <Alert
        type="info"
        content="This feedback will be visible to Claude in future development sessions to help improve the application."
      />

      <Form
        form={form}
        layout="vertical"
        style={{ width: '100%' }}
      >
        <FormItem label="Feedback Type" field="type" rules={[{ required: true }]}>
          <RadioGroup
            value={feedbackType}
            onChange={(value) => setFeedbackType(value as FeedbackData['type'])}
          >
            <Radio value="bug">Bug Report</Radio>
            <Radio value="feature">Feature Request</Radio>
            <Radio value="improvement">Improvement</Radio>
            <Radio value="other">Other</Radio>
          </RadioGroup>
        </FormItem>

        <FormItem label="Priority" field="priority" rules={[{ required: true }]}>
          <RadioGroup>
            <Radio value="low">Low</Radio>
            <Radio value="medium">Medium</Radio>
            <Radio value="high">High</Radio>
            <Radio value="critical">Critical</Radio>
          </RadioGroup>
        </FormItem>

        <FormItem
          label="Affected Components"
          field="components"
          tooltip="Select all components where you encountered this issue"
        >
          <CheckboxGroup
            direction="vertical"
            style={{ maxHeight: 200, overflowY: 'auto' }}
          >
            {COMPONENT_OPTIONS.map(option => (
              <Checkbox key={option.value} value={option.value}>
                {option.label}
              </Checkbox>
            ))}
          </CheckboxGroup>
        </FormItem>

        <FormItem
          label="Title"
          field="title"
          rules={[
            { required: true, message: 'Please provide a title' },
            { maxLength: 100, message: 'Title must be less than 100 characters' },
          ]}
        >
          <Input placeholder="Brief summary of your feedback" />
        </FormItem>

        <FormItem
          label="Description"
          field="description"
          rules={[
            { required: true, message: 'Please provide a description' },
            { minLength: 10, message: 'Description should be at least 10 characters' },
          ]}
        >
          <TextArea
            placeholder="Detailed description of the issue or suggestion"
            autoSize={{ minRows: 3, maxRows: 8 }}
          />
        </FormItem>

        {feedbackType === 'bug' && (
          <>
            <FormItem label="Steps to Reproduce" field="steps">
              <TextArea
                placeholder="1. Click on X&#10;2. Enter Y&#10;3. See error"
                autoSize={{ minRows: 3, maxRows: 6 }}
              />
            </FormItem>

            <FormItem label="Expected Behavior" field="expected">
              <TextArea
                placeholder="What should happen?"
                autoSize={{ minRows: 2, maxRows: 4 }}
              />
            </FormItem>

            <FormItem label="Actual Behavior" field="actual">
              <TextArea
                placeholder="What actually happened?"
                autoSize={{ minRows: 2, maxRows: 4 }}
              />
            </FormItem>
          </>
        )}

        <FormItem label="Additional Context" field="context">
          <TextArea
            placeholder="Any other information that might be helpful (e.g., what you were doing when this occurred)"
            autoSize={{ minRows: 2, maxRows: 4 }}
          />
        </FormItem>

        <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            type="primary"
            icon={<IconSave />}
            onClick={handleSubmit}
            loading={loading}
          >
            Save Feedback
          </Button>
        </Space>
      </Form>
    </Space>
  )
}
