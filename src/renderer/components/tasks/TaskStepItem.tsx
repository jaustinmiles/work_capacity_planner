import { Space, Typography, Tag, Tooltip, Badge, Button, Progress } from '@arco-design/web-react'
import { TaskType } from '@shared/enums'
import { IconClockCircle, IconCalendar, IconExclamationCircle, IconCheck, IconHistory } from '@arco-design/web-react/icon'
import { TaskStep } from '@shared/sequencing-types'

const { Text } = Typography

interface TaskStepItemProps {
  step: TaskStep
  stepIndex: number
  isActive?: boolean
  isCompleted?: boolean
  estimatedStartTime?: Date
  timeLogged?: number  // Total minutes logged
  onComplete?: (__stepId: string) => void
  onStart?: (stepId: string) => void
}

export function TaskStepItem({ step, stepIndex, isActive = false, isCompleted = false, estimatedStartTime, timeLogged = 0, onComplete, onStart }: TaskStepItemProps) {
  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    if (hours > 0) {
      return `${hours}h ${mins > 0 ? `${mins}m` : ''}`
    }
    return `${mins}m`
  }

  const getStatusColor = () => {
    if (isCompleted) return '#00B42A'
    if (isActive) return '#165DFF'
    return '#86909C'
  }

  const getStatusIcon = () => {
    if (isCompleted) return <IconCheck />
    return <div style={{
      width: 16,
      height: 16,
      borderRadius: '50%',
      background: getStatusColor(),
      color: 'white',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 12,
      fontWeight: 'bold',
    }}>
      {stepIndex + 1}
    </div>
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        padding: '12px 0',
        borderLeft: `2px solid ${getStatusColor()}`,
        paddingLeft: 16,
        marginLeft: 8,
        position: 'relative',
      }}
    >
      {/* Step number/status indicator */}
      <div style={{
        position: 'absolute',
        left: -9,
        top: 12,
        background: '#fff',
        padding: 1,
      }}>
        {getStatusIcon()}
      </div>

      <div style={{ flex: 1, marginLeft: 16 }}>
        <div style={{ marginBottom: 8 }}>
          <Text
            style={{
              fontSize: 15,
              fontWeight: isActive ? 600 : 500,
              color: isCompleted ? '#86909C' : '#1D2129',
              textDecoration: isCompleted ? 'line-through' : 'none',
            }}
          >
            {step.name}
          </Text>

          {isActive && (
            <Badge status="processing" text="In Progress" style={{ marginLeft: 8 }} />
          )}

          {/* Action buttons */}
          {!isCompleted && (
            <Space style={{ marginLeft: 12 }}>
              {!isActive && step.status === 'pending' && onStart && (
                <Button
                  size="mini"
                  type="primary"
                  onClick={() => onStart(step.id)}
                >
                  Start
                </Button>
              )}
              {isActive && onComplete && (
                <Button
                  size="mini"
                  status="success"
                  icon={<IconCheck />}
                  onClick={() => onComplete(step.id)}
                >
                  Complete
                </Button>
              )}
            </Space>
          )}
        </div>

        <Space size="small" wrap>
          <Tag
            icon={<IconClockCircle />}
            color="arcoblue"
            size="small"
          >
            {formatDuration(step.duration)}
          </Tag>

          {/* Time Logged Display */}
          {timeLogged > 0 && (
            <Tooltip content={`${formatDuration(timeLogged)} of ${formatDuration(step.duration)} logged`}>
              <Tag
                icon={<IconHistory />}
                color={timeLogged >= step.duration ? 'green' : 'orange'}
                size="small"
              >
                Logged: {formatDuration(timeLogged)}
                {timeLogged < step.duration && (
                  <Progress
                    percent={Math.round((timeLogged / step.duration) * 100)}
                    size="mini"
                    style={{ width: 60, marginLeft: 8, display: 'inline-block' }}
                    showText={false}
                  />
                )}
              </Tag>
            </Tooltip>
          )}

          <Tag size="small" color="gray">
            {step.type === TaskType.Focused ? 'Focused Work' : 'Admin/Meeting'}
          </Tag>

          {step.asyncWaitTime > 0 && (
            <Tag
              icon={<IconCalendar />}
              color="orange"
              size="small"
            >
              Wait: {formatDuration(step.asyncWaitTime)}
            </Tag>
          )}

          {/* Conditional branches feature - not yet implemented */}

          {step.dependsOn.length > 0 && (
            <Tooltip content={`Depends on ${step.dependsOn.length} step(s)`}>
              <Tag
                icon={<IconExclamationCircle />}
                color="yellow"
                size="small"
              >
                Dependencies
              </Tag>
            </Tooltip>
          )}
        </Space>

        {/* Show conditional branches - feature not yet implemented */}

        {/* Show estimated start time */}
        {estimatedStartTime && (
          <div style={{ marginTop: 8 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              Estimated start: {estimatedStartTime.toLocaleDateString()} {estimatedStartTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </Text>
          </div>
        )}
      </div>
    </div>
  )
}
