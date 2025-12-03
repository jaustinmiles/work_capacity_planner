/**
 * TaskTypeSetupWizard - Non-blocking setup prompt for task types
 *
 * Shown when a session has no task types defined. This is a dismissable
 * prompt that encourages users to set up their types before using the app.
 *
 * Features:
 * - Template presets for quick setup (Knowledge Worker, Creative, Freelancer)
 * - Direct link to full TaskTypeManager
 * - Can be dismissed and accessed later via Settings
 */

import { useState } from 'react'
import {
  Card,
  Button,
  Space,
  Typography,
  Alert,
  Grid,
  Divider,
} from '@arco-design/web-react'
import {
  IconPlus,
  IconSettings,
  IconBulb,
} from '@arco-design/web-react/icon'
import {
  useUserTaskTypeStore,
  useHasUserTaskTypes,
} from '@/renderer/store/useUserTaskTypeStore'
import { TYPE_TEMPLATES } from './TaskTypeManager'
import { Message } from '../common/Message'
import { logger } from '@/logger'

const { Title, Text, Paragraph } = Typography
const { Row, Col } = Grid

interface TaskTypeSetupWizardProps {
  /** Called when wizard is dismissed or setup is complete */
  onDismiss?: () => void
  /** Called when user wants to open full settings */
  onOpenSettings?: () => void
}

interface TemplateOption {
  id: string
  name: string
  description: string
  icon: string
  types: Array<{ name: string; emoji: string; color: string }>
}

const TEMPLATE_OPTIONS: TemplateOption[] = [
  {
    id: 'knowledgeWorker',
    name: 'Knowledge Worker',
    description: 'Deep work, meetings, admin tasks, and personal time',
    icon: '💼',
    types: TYPE_TEMPLATES.knowledgeWorker,
  },
  {
    id: 'creative',
    name: 'Creative',
    description: 'Creative work, research, admin, and breaks',
    icon: '🎨',
    types: TYPE_TEMPLATES.creative,
  },
  {
    id: 'freelancer',
    name: 'Freelancer',
    description: 'Client work, business tasks, learning, and personal',
    icon: '🚀',
    types: TYPE_TEMPLATES.freelancer,
  },
]

export function TaskTypeSetupWizard({ onDismiss, onOpenSettings }: TaskTypeSetupWizardProps) {
  const [isApplyingTemplate, setIsApplyingTemplate] = useState<string | null>(null)
  const { createType } = useUserTaskTypeStore()
  const hasTypes = useHasUserTaskTypes()

  // If user already has types, don't show the wizard
  if (hasTypes) {
    return null
  }

  const handleApplyTemplate = async (template: TemplateOption) => {
    setIsApplyingTemplate(template.id)

    try {
      // Create each type from the template
      for (let i = 0; i < template.types.length; i++) {
        const typeData = template.types[i]
        await createType({
          name: typeData.name,
          emoji: typeData.emoji,
          color: typeData.color,
        })
      }

      Message.success(`Applied "${template.name}" template with ${template.types.length} task types`)
      logger.ui.info('Applied task type template', {
        templateId: template.id,
        templateName: template.name,
        typeCount: template.types.length,
      }, 'task-type-template-applied')

      onDismiss?.()
    } catch (err) {
      logger.ui.error('Failed to apply template', {
        error: err instanceof Error ? err.message : String(err),
        templateId: template.id,
      }, 'task-type-template-error')
      Message.error('Failed to apply template')
    } finally {
      setIsApplyingTemplate(null)
    }
  }

  return (
    <Card
      style={{
        maxWidth: 700,
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
            You can always customize these later in Settings.
          </Paragraph>
        </div>

        <Divider style={{ margin: '8px 0' }} />

        {/* Template Options */}
        <div>
          <Text style={{ fontWeight: 600, marginBottom: 12, display: 'block' }}>
            Quick Start - Choose a Template:
          </Text>
          <Row gutter={[16, 16]}>
            {TEMPLATE_OPTIONS.map((template) => (
              <Col span={8} key={template.id}>
                <Card
                  hoverable
                  style={{
                    height: '100%',
                    cursor: isApplyingTemplate ? 'wait' : 'pointer',
                    border: '2px solid transparent',
                    transition: 'all 0.2s ease',
                  }}
                  onClick={() => !isApplyingTemplate && handleApplyTemplate(template)}
                >
                  <Space direction="vertical" align="center" style={{ width: '100%' }}>
                    <span style={{ fontSize: 32 }}>{template.icon}</span>
                    <Text style={{ fontWeight: 600 }}>{template.name}</Text>
                    <Text type="secondary" style={{ fontSize: 12, textAlign: 'center' }}>
                      {template.description}
                    </Text>
                    <Space wrap size="mini" style={{ marginTop: 8 }}>
                      {template.types.map((type, idx) => (
                        <span
                          key={idx}
                          style={{
                            padding: '2px 8px',
                            backgroundColor: type.color,
                            color: '#fff',
                            borderRadius: 4,
                            fontSize: 11,
                          }}
                        >
                          {type.emoji} {type.name}
                        </span>
                      ))}
                    </Space>
                    <Button
                      type="primary"
                      size="small"
                      loading={isApplyingTemplate === template.id}
                      disabled={isApplyingTemplate !== null && isApplyingTemplate !== template.id}
                      style={{ marginTop: 8 }}
                    >
                      Use Template
                    </Button>
                  </Space>
                </Card>
              </Col>
            ))}
          </Row>
        </div>

        <Divider style={{ margin: '8px 0' }}>
          <Text type="secondary">or</Text>
        </Divider>

        {/* Custom Setup Option */}
        <div style={{ textAlign: 'center' }}>
          <Button
            type="outline"
            icon={<IconPlus />}
            onClick={onOpenSettings}
            size="large"
          >
            Create Custom Types
          </Button>
          <Paragraph type="secondary" style={{ marginTop: 8, fontSize: 12 }}>
            Define your own task types with custom names, colors, and emojis
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
 * Compact banner version for inline display in other components
 */
export function TaskTypeSetupBanner({ onOpenSettings }: { onOpenSettings?: () => void }) {
  const hasTypes = useHasUserTaskTypes()

  if (hasTypes) {
    return null
  }

  return (
    <Alert
      type="warning"
      title="No Task Types Defined"
      content={
        <Space>
          <Text>Create task types to start organizing your work.</Text>
          <Button
            type="primary"
            size="mini"
            icon={<IconSettings />}
            onClick={onOpenSettings}
          >
            Set Up Types
          </Button>
        </Space>
      }
      style={{ marginBottom: 16 }}
      closable
    />
  )
}
