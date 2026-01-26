/**
 * AmendmentCard Component
 *
 * Displays a single amendment proposal with preview information and action buttons.
 * Users can apply or skip individual amendments.
 */

import React, { useState } from 'react'
import { Card, Button, Tag, Typography, Space } from '@arco-design/web-react'
import {
  IconCheck,
  IconBulb,
  IconPlus,
  IconEdit,
  IconCalendar,
  IconClockCircle,
  IconList,
} from '@arco-design/web-react/icon'
import { AmendmentCard as AmendmentCardType } from '@shared/conversation-types'
import { AmendmentCardStatus, AmendmentType } from '@shared/enums'
import { formatTimeLogDate, formatTimeLogTime } from '../../utils/amendment-display-formatters'
import { hasDependencyChanges } from '../../utils/dependency-utils'

const { Text, Title } = Typography

interface AmendmentCardProps {
  card: AmendmentCardType
  onApply: () => Promise<void>
  onSkip: () => void
}

/**
 * Get icon for amendment type
 */
function getAmendmentIcon(type: AmendmentType): React.ReactNode {
  switch (type) {
    case AmendmentType.TaskCreation:
    case AmendmentType.WorkflowCreation:
      return <IconPlus />
    case AmendmentType.StatusUpdate:
      return <IconCheck />
    case AmendmentType.DurationChange:
    case AmendmentType.TimeLog:
      return <IconClockCircle />
    case AmendmentType.WorkPatternModification:
    case AmendmentType.DeadlineChange:
      return <IconCalendar />
    case AmendmentType.StepAddition:
    case AmendmentType.StepRemoval:
      return <IconList />
    case AmendmentType.NoteAddition:
    case AmendmentType.PriorityChange:
    case AmendmentType.TypeChange:
      return <IconEdit />
    default:
      return <IconBulb />
  }
}

/**
 * Get color for amendment type
 */
function getAmendmentColor(type: AmendmentType): string {
  switch (type) {
    case AmendmentType.TaskCreation:
    case AmendmentType.WorkflowCreation:
      return 'arcoblue'
    case AmendmentType.StatusUpdate:
      return 'green'
    case AmendmentType.WorkPatternModification:
      return 'purple'
    case AmendmentType.DurationChange:
    case AmendmentType.TimeLog:
      return 'orangered'
    default:
      return 'gray'
  }
}

export function AmendmentCard({
  card,
  onApply,
  onSkip,
}: AmendmentCardProps): React.ReactElement {
  const [isApplying, setIsApplying] = useState(false)
  const { amendment, preview, status } = card

  const handleApply = async () => {
    setIsApplying(true)
    try {
      await onApply()
    } finally {
      setIsApplying(false)
    }
  }

  const isPending = status === AmendmentCardStatus.Pending
  const isApplied = status === AmendmentCardStatus.Applied
  const isSkipped = status === AmendmentCardStatus.Skipped

  return (
    <Card
      size="small"
      style={{
        borderRadius: 8,
        border: `1px solid ${
          isApplied
            ? 'var(--color-success-light-4)'
            : isSkipped
            ? 'var(--color-border-2)'
            : 'var(--color-border)'
        }`,
        background: isApplied
          ? 'var(--color-success-light-1)'
          : isSkipped
          ? 'var(--color-fill-2)'
          : 'var(--color-bg-1)',
        opacity: isSkipped ? 0.7 : 1,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 8,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: `var(--color-${getAmendmentColor(amendment.type)}-6)` }}>
            {getAmendmentIcon(amendment.type)}
          </span>
          <Title heading={6} style={{ margin: 0, fontSize: 14 }}>
            {preview.title}
          </Title>
        </div>

        {isApplied && (
          <Tag color="green" size="small">
            <IconCheck /> Applied
          </Tag>
        )}
        {isSkipped && (
          <Tag color="gray" size="small">
            Skipped
          </Tag>
        )}
      </div>

      {/* Preview description */}
      <Text style={{ color: 'var(--color-text-2)', fontSize: 13 }}>
        {preview.description}
      </Text>

      {/* Details (optional, type-specific) */}
      {preview.details && Object.keys(preview.details).length > 0 && (
        <div style={{ marginTop: 8 }}>
          <PreviewDetails details={preview.details} type={amendment.type} />
        </div>
      )}

      {/* Action buttons */}
      {isPending && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 8,
            marginTop: 12,
          }}
        >
          <Button
            size="small"
            onClick={onSkip}
            disabled={isApplying}
          >
            Skip
          </Button>
          <Button
            type="primary"
            size="small"
            icon={<IconCheck />}
            onClick={handleApply}
            loading={isApplying}
          >
            Apply
          </Button>
        </div>
      )}
    </Card>
  )
}

// =============================================================================
// PreviewDetails Sub-component
// =============================================================================

interface PreviewDetailsProps {
  details: Record<string, unknown>
  type: AmendmentType
}

function PreviewDetails({ details, type }: PreviewDetailsProps): React.ReactElement | null {
  // Render type-specific preview details
  switch (type) {
    case AmendmentType.WorkflowCreation: {
      const steps = details.steps as string[] | undefined
      if (!steps || steps.length === 0) return null

      return (
        <div
          style={{
            background: 'var(--color-fill-2)',
            borderRadius: 4,
            padding: '8px 12px',
            fontSize: 12,
          }}
        >
          <Text bold style={{ fontSize: 11, color: 'var(--color-text-3)' }}>
            STEPS
          </Text>
          <ol style={{ margin: '4px 0 0 0', paddingLeft: 16 }}>
            {steps.slice(0, 5).map((step, i) => (
              <li key={i} style={{ color: 'var(--color-text-2)' }}>
                {step}
              </li>
            ))}
            {steps.length > 5 && (
              <li style={{ color: 'var(--color-text-3)', fontStyle: 'italic' }}>
                +{steps.length - 5} more steps
              </li>
            )}
          </ol>
        </div>
      )
    }

    case AmendmentType.TaskCreation: {
      const duration = details.duration as number | undefined
      if (!duration) return null

      return (
        <Space size={12}>
          <Tag size="small" color="arcoblue">
            <IconClockCircle /> {duration} min
          </Tag>
        </Space>
      )
    }

    case AmendmentType.DependencyChange: {
      const addDeps = details.addDependencies as string[] | undefined
      const removeDeps = details.removeDependencies as string[] | undefined
      const addDependents = details.addDependents as string[] | undefined
      const removeDependents = details.removeDependents as string[] | undefined

      if (!hasDependencyChanges(details)) return null

      return (
        <div
          style={{
            background: 'var(--color-fill-2)',
            borderRadius: 4,
            padding: '8px 12px',
            fontSize: 12,
          }}
        >
          {addDeps && addDeps.length > 0 && (
            <div style={{ marginBottom: 4 }}>
              <Text bold style={{ fontSize: 11, color: 'var(--color-success-6)' }}>
                + DEPENDS ON
              </Text>
              <div style={{ color: 'var(--color-text-2)', marginLeft: 8 }}>
                {addDeps.join(', ')}
              </div>
            </div>
          )}
          {removeDeps && removeDeps.length > 0 && (
            <div style={{ marginBottom: 4 }}>
              <Text bold style={{ fontSize: 11, color: 'var(--color-danger-6)' }}>
                − REMOVE DEPENDENCIES
              </Text>
              <div style={{ color: 'var(--color-text-2)', marginLeft: 8 }}>
                {removeDeps.join(', ')}
              </div>
            </div>
          )}
          {addDependents && addDependents.length > 0 && (
            <div style={{ marginBottom: 4 }}>
              <Text bold style={{ fontSize: 11, color: 'var(--color-success-6)' }}>
                + BLOCKS
              </Text>
              <div style={{ color: 'var(--color-text-2)', marginLeft: 8 }}>
                {addDependents.join(', ')}
              </div>
            </div>
          )}
          {removeDependents && removeDependents.length > 0 && (
            <div>
              <Text bold style={{ fontSize: 11, color: 'var(--color-danger-6)' }}>
                − UNBLOCKS
              </Text>
              <div style={{ color: 'var(--color-text-2)', marginLeft: 8 }}>
                {removeDependents.join(', ')}
              </div>
            </div>
          )}
        </div>
      )
    }

    case AmendmentType.WorkSessionEdit: {
      const startTime = details.startTime as string | Date | undefined
      const endTime = details.endTime as string | Date | undefined
      const plannedMinutes = details.plannedMinutes as number | undefined

      const formattedStart = formatTimeLogTime(startTime)
      const formattedEnd = formatTimeLogTime(endTime)

      const hasDetails = formattedStart || formattedEnd || plannedMinutes

      if (!hasDetails) return null

      return (
        <Space size={12} wrap>
          {formattedStart && (
            <Tag size="small" color="arcoblue">
              <IconClockCircle /> Start: {formattedStart}
            </Tag>
          )}
          {formattedEnd && (
            <Tag size="small" color="green">
              <IconClockCircle /> End: {formattedEnd}
            </Tag>
          )}
          {plannedMinutes && (
            <Tag size="small" color="orangered">
              <IconClockCircle /> {plannedMinutes} min planned
            </Tag>
          )}
        </Space>
      )
    }

    case AmendmentType.TimeLog: {
      const date = details.date as string | Date | undefined
      const startTime = details.startTime as string | Date | undefined
      const endTime = details.endTime as string | Date | undefined
      const duration = details.duration as number | undefined
      const description = details.description as string | undefined

      const formattedDate = formatTimeLogDate(date)
      const formattedStart = formatTimeLogTime(startTime)
      const formattedEnd = formatTimeLogTime(endTime)

      const hasDetails = formattedDate || formattedStart || formattedEnd || description

      if (!hasDetails) return null

      return (
        <Space size={12} wrap>
          {formattedDate && (
            <Tag size="small" color="purple">
              <IconCalendar /> {formattedDate}
            </Tag>
          )}
          {formattedStart && (
            <Tag size="small" color="arcoblue">
              <IconClockCircle /> Start: {formattedStart}
            </Tag>
          )}
          {formattedEnd && (
            <Tag size="small" color="green">
              <IconClockCircle /> End: {formattedEnd}
            </Tag>
          )}
          {duration && (
            <Tag size="small" color="orangered">
              <IconClockCircle /> {duration} min
            </Tag>
          )}
          {description && (
            <Tag size="small" color="gray">
              {description.length > 30 ? `${description.slice(0, 30)}...` : description}
            </Tag>
          )}
        </Space>
      )
    }

    default:
      return null
  }
}
