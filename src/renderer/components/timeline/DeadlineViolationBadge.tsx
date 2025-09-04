import { Tag, Tooltip } from '@arco-design/web-react'
import { IconExclamationCircleFill } from '@arco-design/web-react/icon'
import dayjs from 'dayjs'

interface DeadlineViolationBadgeProps {
  deadline: Date
  endTime: Date
  isWorkflow?: boolean
  workflowName?: string
  visible?: boolean
}

export function DeadlineViolationBadge({
  deadline,
  endTime,
  isWorkflow = false,
  workflowName,
  visible = true,
}: DeadlineViolationBadgeProps) {
  const deadlineDayjs = dayjs(deadline)
  const endTimeDayjs = dayjs(endTime)

  // Check if deadline is violated
  const isViolated = endTimeDayjs.isAfter(deadlineDayjs)

  if (!isViolated || !visible) {
    return null
  }

  // Calculate how late we'll be
  const delayMinutes = endTimeDayjs.diff(deadlineDayjs, 'minutes')
  const delayHours = Math.round(delayMinutes / 60 * 10) / 10 // Round to 1 decimal

  const delayText = delayHours >= 1
    ? `${delayHours}h late`
    : `${delayMinutes}m late`

  const badgeText = isWorkflow ? 'WORKFLOW DEADLINE MISSED' : 'DEADLINE MISSED'

  const tooltipContent = [
    `${badgeText}!`,
    `Deadline: ${deadlineDayjs.format('MMM D, YYYY h:mm A')}`,
    `Will finish: ${endTimeDayjs.format('MMM D, YYYY h:mm A')}`,
    `Delay: ${delayText}`,
    ...(workflowName ? [`Workflow: ${workflowName}`] : []),
  ].join('\n')

  return (
    <Tooltip content={tooltipContent} position="top">
      <Tag
        color="red"
        style={{
          position: 'absolute',
          top: -8,
          right: -8,
          zIndex: 20,
          fontSize: '10px',
          fontWeight: 'bold',
          padding: '2px 6px',
          border: '2px solid #fff',
          boxShadow: '0 2px 8px rgba(245, 63, 63, 0.4)',
          animation: 'pulse 2s infinite',
          cursor: 'help',
        }}
        icon={<IconExclamationCircleFill style={{ fontSize: '12px' }} />}
      >
        {badgeText}
      </Tag>
    </Tooltip>
  )
}

// Add CSS animation for pulsing effect
const style = document.createElement('style')
style.textContent = `
  @keyframes pulse {
    0% {
      opacity: 1;
      transform: scale(1);
    }
    50% {
      opacity: 0.7;
      transform: scale(1.05);
    }
    100% {
      opacity: 1;
      transform: scale(1);
    }
  }
`
document.head.appendChild(style)
