/**
 * TaskTypeSetupWizard - Non-blocking setup prompt for task types
 *
 * Shown when a session has no task types defined. This is a dismissable
 * prompt that encourages users to set up their types before using the app.
 */

import {
  Card,
  Button,
  Space,
  Typography,
  Alert,
} from '@arco-design/web-react'
import {
  IconPlus,
  IconBulb,
} from '@arco-design/web-react/icon'
import { useHasUserTaskTypes } from '@/renderer/store/useUserTaskTypeStore'

const { Title, Text, Paragraph } = Typography

interface TaskTypeSetupWizardProps {
  /** Called when wizard is dismissed or setup is complete */
  onDismiss?: () => void
  /** Called when user wants to open full settings */
  onOpenSettings?: () => void
}

export function TaskTypeSetupWizard({ onDismiss, onOpenSettings }: TaskTypeSetupWizardProps) {
  const hasTypes = useHasUserTaskTypes()

  // If user already has types, don't show the wizard
  if (hasTypes) {
    return null
  }

  return (
    <Card
      style={{
        maxWidth: 500,
        margin: '24px auto',
        borderRadius: 12,
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
      }}
    >
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        {/* Header */}
        <div style={{ textAlign: 'center' }}>
          <IconBulb style={{ fontSize: 48, color: '#F59E0B', marginBottom: 16 }} />
          <Title heading={4} style={{ margin: 0 }}>
            Set Up Your Task Types
          </Title>
          <Paragraph type="secondary" style={{ marginTop: 8 }}>
            Define the types of work you do to help organize your schedule.
            Create types like &ldquo;Deep Work&rdquo;, &ldquo;Meetings&rdquo;, &ldquo;Admin&rdquo;, or whatever fits your workflow.
          </Paragraph>
        </div>

        {/* Create Types Button */}
        <div style={{ textAlign: 'center' }}>
          <Button
            type="primary"
            icon={<IconPlus />}
            onClick={onOpenSettings}
            size="large"
          >
            Create Your Task Types
          </Button>
          <Paragraph type="secondary" style={{ marginTop: 8, fontSize: 12 }}>
            Define custom names, colors, and emojis for each type of work
          </Paragraph>
        </div>

        {/* Dismiss Option */}
        <Alert
          type="info"
          content={
            <Space style={{ width: '100%', justifyContent: 'space-between' }}>
              <Text type="secondary">
                You can set up task types later in Settings → Task Types
              </Text>
              <Button
                type="text"
                size="small"
                onClick={onDismiss}
              >
                Skip for now
              </Button>
            </Space>
          }
          style={{ backgroundColor: '#f6f8fa' }}
        />
      </Space>
    </Card>
  )
}

/**
 * Check if user has any task types
 */
export { useHasUserTaskTypes }
