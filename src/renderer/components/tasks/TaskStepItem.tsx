import React from 'react'
import { Space, Typography, Tag, Tooltip, Badge, Progress } from '@arco-design/web-react'
import { IconClockCircle, IconCalendar, IconExclamationCircle, IconBranch, IconLoop, IconCheck } from '@arco-design/web-react/icon'
import { TaskStep } from '@shared/sequencing-types'

const { Text } = Typography

interface TaskStepItemProps {
  step: TaskStep
  stepIndex: number
  isActive?: boolean
  isCompleted?: boolean
  estimatedStartTime?: Date
}

export function TaskStepItem({ step, stepIndex, isActive = false, isCompleted = false, estimatedStartTime }: TaskStepItemProps) {
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
      fontWeight: 'bold'
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
        position: 'relative'
      }}
    >
      {/* Step number/status indicator */}
      <div style={{ 
        position: 'absolute', 
        left: -9, 
        top: 12,
        background: '#fff',
        padding: 1
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
              textDecoration: isCompleted ? 'line-through' : 'none'
            }}
          >
            {step.name}
          </Text>
          
          {isActive && (
            <Badge status="processing" text="In Progress" style={{ marginLeft: 8 }} />
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
          
          <Tag size="small" color="gray">
            {step.type === 'focused' ? 'Focused Work' : 'Admin/Meeting'}
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
          
          {step.conditionalBranches && step.conditionalBranches.length > 0 && (
            <Tooltip content={`${step.conditionalBranches.length} conditional branch(es)`}>
              <Tag
                icon={<IconBranch />}
                color="purple"
                size="small"
              >
                Branches
              </Tag>
            </Tooltip>
          )}
          
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
        
        {/* Show conditional branches */}
        {step.conditionalBranches && step.conditionalBranches.length > 0 && (
          <div style={{ marginTop: 8, paddingLeft: 12, borderLeft: '1px dashed #E5E8EF' }}>
            {step.conditionalBranches.map((branch, index) => (
              <div key={branch.id} style={{ marginBottom: 4 }}>
                <Space size="small">
                  <IconBranch style={{ color: '#FF7D00', fontSize: 12 }} />
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {branch.condition} ({Math.round(branch.probability * 100)}% chance)
                  </Text>
                  {branch.repeatFromStepId && (
                    <Tag icon={<IconLoop />} size="small" color="orange">
                      Repeats workflow
                    </Tag>
                  )}
                </Space>
              </div>
            ))}
          </div>
        )}
        
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