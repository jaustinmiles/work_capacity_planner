/**
 * Reusable component for previewing workflow amendments
 * Used in BrainstormChat and VoiceAmendmentModal
 */
import React from 'react'
import { Space, Tag, Typography } from '@arco-design/web-react'
import { WorkflowCreation } from '../../../shared/amendment-types'

const { Text } = Typography

interface WorkflowAmendmentPreviewProps {
  amendment: WorkflowCreation
  /** 'compact' shows truncated steps, 'detailed' shows all steps with dependencies */
  mode?: 'compact' | 'detailed'
  /** Maximum steps to show in compact mode before "...and N more" (default: 3) */
  maxCompactSteps?: number
}

/**
 * Preview component for workflow creation amendments
 * Supports compact view (for modals) and detailed view (for chat)
 */
export function WorkflowAmendmentPreview({
  amendment,
  mode = 'detailed',
  maxCompactSteps = 3,
}: WorkflowAmendmentPreviewProps): React.ReactElement {
  const totalDuration = amendment.steps.reduce((sum, step) => sum + step.duration, 0)
  const totalAsyncWait = amendment.steps.reduce((sum, step) => sum + (step.asyncWaitTime || 0), 0)

  if (mode === 'compact') {
    return (
      <Space direction="vertical" size={4}>
        <Space>
          <Text>Create workflow:</Text>
          <Text bold>{amendment.name}</Text>
        </Space>
        <Text type="secondary">Steps: {amendment.steps?.length || 0}</Text>
        <Text type="secondary">
          Priority: {amendment.importance || 'Default'}/{amendment.urgency || 'Default'}
        </Text>
        {amendment.steps && amendment.steps.length > 0 && (
          <div style={{ marginLeft: 16 }}>
            {amendment.steps.slice(0, maxCompactSteps).map((step, index) => (
              <Text key={index} type="secondary" style={{ display: 'block' }}>
                • {step.name} ({step.duration}m)
              </Text>
            ))}
            {amendment.steps.length > maxCompactSteps && (
              <Text type="secondary">... and {amendment.steps.length - maxCompactSteps} more steps</Text>
            )}
          </div>
        )}
      </Space>
    )
  }

  // Detailed mode
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ marginBottom: 8 }}>
        <Text bold>{amendment.name}</Text>
        {amendment.description && (
          <Text type="secondary" style={{ marginLeft: 8 }}>
            — {amendment.description}
          </Text>
        )}
      </div>

      <div style={{ marginBottom: 8, paddingLeft: 8, borderLeft: '2px solid var(--color-border-2)' }}>
        {amendment.steps.map((step, idx) => (
          <div key={idx} style={{ marginBottom: 4, fontSize: 13 }}>
            <Text>
              {idx + 1}. {step.name}
            </Text>
            <Text type="secondary"> ({step.duration}min)</Text>
            {(step.asyncWaitTime ?? 0) > 0 && (
              <Text type="warning"> + {step.asyncWaitTime}min wait</Text>
            )}
            {step.dependsOn && step.dependsOn.length > 0 && (
              <Text type="secondary"> → after: {step.dependsOn.join(', ')}</Text>
            )}
          </div>
        ))}
      </div>

      <Space size="small">
        <Tag color="gray">Total: {totalDuration}min active</Tag>
        {totalAsyncWait > 0 && <Tag color="gold">{totalAsyncWait}min async</Tag>}
        <Tag color="orange">Importance: {amendment.importance}/10</Tag>
        <Tag color="red">Urgency: {amendment.urgency}/10</Tag>
      </Space>
    </div>
  )
}
