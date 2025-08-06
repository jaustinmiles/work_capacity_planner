import React, { useState } from 'react'
import { Card, Space, Typography, Tag, Button, Collapse, Alert, Statistic, Grid, Progress, Tooltip, Popconfirm } from '@arco-design/web-react'
import { IconClockCircle, IconCalendar, IconBranch, IconPlayArrow, IconPause, IconRefresh, IconDown, IconEdit, IconDelete } from '@arco-design/web-react/icon'
import { SequencedTask, TaskStep } from '@shared/sequencing-types'
import { TaskStepItem } from './TaskStepItem'
import { SequencedTaskEdit } from './SequencedTaskEdit'

const { Title, Text } = Typography
const { Row, Col } = Grid
const CollapseItem = Collapse.Item

interface SequencedTaskViewProps {
  task: SequencedTask
  onUpdateStep?: (stepId: string, updates: Partial<TaskStep>) => void
  onStartWorkflow?: () => void
  onPauseWorkflow?: () => void
  onResetWorkflow?: () => void
  onDelete?: () => void
}

export function SequencedTaskView({
  task,
  onUpdateStep,
  onStartWorkflow,
  onPauseWorkflow,
  onResetWorkflow,
  onDelete,
}: SequencedTaskViewProps) {
  const [showDetails, setShowDetails] = useState(false)
  const [showEditView, setShowEditView] = useState(false)

  const completedSteps = task.steps.filter(step => step.status === 'completed').length
  const totalSteps = task.steps.length
  const progressPercent = totalSteps > 0 ? (completedSteps / totalSteps) * 100 : 0

  const currentStep = task.steps.find(step => step.status === 'in_progress')
  const nextStep = task.steps.find(step => step.status === 'pending')

  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    if (hours > 0) {
      return `${hours}h ${mins > 0 ? `${mins}m` : ''}`
    }
    return `${mins}m`
  }

  const calculateEstimatedCompletionTime = () => {
    const now = new Date()
    const remainingMinutes = task.steps
      .filter(step => step.status === 'pending')
      .reduce((sum, step) => sum + step.duration + step.asyncWaitTime, 0)

    const completionTime = new Date(now.getTime() + remainingMinutes * 60000)
    return completionTime
  }

  const getWorkflowStatusColor = () => {
    switch (task.overallStatus) {
      case 'completed': return '#00B42A'
      case 'in_progress': return '#165DFF'
      case 'waiting': return '#FF7D00'
      default: return '#86909C'
    }
  }

  if (showEditView) {
    return (
      <SequencedTaskEdit
        task={task}
        onClose={() => setShowEditView(false)}
      />
    )
  }

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="large">
      {/* Main Task Header */}
      <Card>
        <Row gutter={24} align="center">
          <Col flex="auto">
            <Space direction="vertical" size="small">
              <Space>
                <Title heading={5} style={{ margin: 0 }}>
                  {task.name}
                </Title>
                <Tag
                  color={getWorkflowStatusColor()}
                  style={{ textTransform: 'capitalize' }}
                >
                  {task.overallStatus.replace('_', ' ')}
                </Tag>
              </Space>

              <Text type="secondary">
                {task.steps.length} steps • {formatDuration(task.totalDuration)} total work •
                up to {formatDuration(task.worstCaseDuration)} worst case
              </Text>

              <Progress
                percent={progressPercent}
                formatText={(percent) => `${completedSteps}/${totalSteps} steps complete`}
                style={{ width: 400 }}
              />
            </Space>
          </Col>

          <Col>
            <Space>
              {task.overallStatus === 'not_started' && (
                <Button
                  type="primary"
                  icon={<IconPlayArrow />}
                  onClick={onStartWorkflow}
                >
                  Start Workflow
                </Button>
              )}

              {task.overallStatus === 'in_progress' && (
                <Button
                  status="warning"
                  icon={<IconPause />}
                  onClick={onPauseWorkflow}
                >
                  Pause
                </Button>
              )}

              <Button
                type="text"
                icon={<IconRefresh />}
                onClick={onResetWorkflow}
              >
                Reset
              </Button>
              
              <Button
                type="text"
                icon={<IconEdit />}
                onClick={() => setShowEditView(true)}
              >
                Edit
              </Button>
              
              {onDelete && (
                <Popconfirm
                  title="Delete this workflow?"
                  content="This will permanently delete this workflow and all its steps. This action cannot be undone."
                  onOk={onDelete}
                  okText="Delete"
                  cancelText="Cancel"
                  okButtonProps={{ status: 'danger' }}
                >
                  <Button
                    type="text"
                    status="danger"
                    icon={<IconDelete />}
                  >
                    Delete
                  </Button>
                </Popconfirm>
              )}
            </Space>
          </Col>
        </Row>
      </Card>

      {/* Current Status Alert */}
      {currentStep && (
        <Alert
          type="info"
          content={
            <Space>
              <Text>Currently working on:</Text>
              <Text style={{ fontWeight: 500 }}>{currentStep.name}</Text>
              <Text type="secondary">({formatDuration(currentStep.duration)})</Text>
            </Space>
          }
        />
      )}

      {task.overallStatus === 'waiting' && (
        <Alert
          type="warning"
          content={
            <Space>
              <Text>Waiting for async process to complete...</Text>
              <Text type="secondary">Next step will be available automatically</Text>
            </Space>
          }
        />
      )}

      {/* Summary Statistics */}
      <Card>
        <Row gutter={16}>
          <Col span={6}>
            <Statistic
              title="Total Duration"
              value={formatDuration(task.totalDuration)}
              prefix={<IconClockCircle />}
            />
          </Col>
          <Col span={6}>
            <Statistic
              title="Critical Path"
              value={formatDuration(task.criticalPathDuration)}
              prefix={<IconCalendar />}
            />
          </Col>
          <Col span={6}>
            <Statistic
              title="Worst Case"
              value={formatDuration(task.worstCaseDuration)}
              prefix={<IconBranch />}
            />
          </Col>
          <Col span={6}>
            <Statistic
              title="Est. Completion"
              value={calculateEstimatedCompletionTime().toLocaleDateString()}
              suffix={calculateEstimatedCompletionTime().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            />
          </Col>
        </Row>
      </Card>

      {/* Workflow Steps */}
      <Card
        title={
          <Space>
            <Title heading={6} style={{ margin: 0 }}>Workflow Steps</Title>
            <Button
              type="text"
              size="small"
              icon={<IconDown style={{ transform: showDetails ? 'rotate(180deg)' : 'none' }} />}
              onClick={() => setShowDetails(!showDetails)}
            >
              {showDetails ? 'Hide Details' : 'Show Details'}
            </Button>
          </Space>
        }
      >
        <div style={{ position: 'relative' }}>
          {task.steps.map((step, index) => (
            <TaskStepItem
              key={step.id}
              step={step}
              stepIndex={index}
              isActive={step.status === 'in_progress'}
              isCompleted={step.status === 'completed'}
            />
          ))}
        </div>

        {showDetails && (
          <div style={{ marginTop: 24, padding: 16, background: '#F7F8FA', borderRadius: 8 }}>
            <Title heading={6}>Workflow Analysis</Title>
            <Space direction="vertical" size="small">
              <Text>
                • <strong>Sequential Dependencies:</strong> Each step builds on the previous ones
              </Text>
              <Text>
                • <strong>Async Wait Times:</strong> Built-in delays for external processes
              </Text>
              <Text>
                • <strong>Conditional Branches:</strong> Automatic handling of failure scenarios
              </Text>
              <Text>
                • <strong>Worst-Case Planning:</strong> Includes all possible retry scenarios
              </Text>
            </Space>
          </div>
        )}
      </Card>
    </Space>
  )
}
