import { useState, useEffect } from 'react'
import { Card, Space, Typography, Tag, Button, Alert, Statistic, Grid, Progress, Popconfirm, Tabs, Modal } from '@arco-design/web-react'
import { IconClockCircle, IconCalendar, IconPlayArrow, IconPause, IconRefresh, IconDown, IconEdit, IconDelete, IconMindMapping, IconHistory, IconBook } from '@arco-design/web-react/icon'
import { SequencedTask, TaskStep } from '@shared/sequencing-types'
import { TaskType, StepStatus } from '@shared/enums'
import { TaskStepItem } from './TaskStepItem'
import { UnifiedTaskEdit } from './UnifiedTaskEdit'
import { WorkflowVisualization } from './WorkflowVisualization'
import { WorkflowProgressTracker } from '../progress/WorkflowProgressTracker'
import { WorkflowMinimap } from './WorkflowMinimap'
import { getDatabase } from '../../services/database'
import { logger } from '../../utils/logger'


const { Title, Text } = Typography
const { Row, Col } = Grid

interface SequencedTaskViewProps {
  task: SequencedTask
  onUpdateStep?: (__stepId: string, updates: Partial<TaskStep>) => void
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
  const [showVisualization, setShowVisualization] = useState(false)
  const [showAllNotesModal, setShowAllNotesModal] = useState(false)
  const [activeTab, setActiveTab] = useState<string>('overview')
  const [stepTimeLogs, setStepTimeLogs] = useState<Record<string, number>>({})
  const [stepsCollapsed, setStepsCollapsed] = useState(true) // Start collapsed for better UX with many workflows

  const completedSteps = task.steps.filter(step => step.status === 'completed').length
  const totalSteps = task.steps.length
  const progressPercent = totalSteps > 0 ? (completedSteps / totalSteps) * 100 : 0

  const currentStep = task.steps.find(step => step.status === 'in_progress')

  // Fetch time logged for each step
  useEffect(() => {
    const fetchStepTimeLogs = async () => {
      try {
        const db = getDatabase()
        const timeLogs: Record<string, number> = {}

        // Fetch work sessions for all steps
        for (const step of task.steps) {
          const sessions = await db.getStepWorkSessions(step.id)
          const totalMinutes = sessions.reduce((sum, session) => {
            const minutes = session.actualMinutes || session.plannedMinutes || 0
            return sum + minutes
          }, 0)
          timeLogs[step.id] = totalMinutes
        }

        setStepTimeLogs(timeLogs)
      } catch (error) {
        logger.ui.error('Failed to fetch step time logs:', error)
      }
    }

    fetchStepTimeLogs()
  }, [task.steps])

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

  // Step completion handlers
  const handleStepStart = (stepId: string) => {
    if (onUpdateStep) {
      onUpdateStep(stepId, { status: StepStatus.InProgress })
    }
  }

  const handleStepComplete = (stepId: string) => {
    if (onUpdateStep) {
      onUpdateStep(stepId, { status: StepStatus.Completed, percentComplete: 100 })
    }
  }

  if (showEditView) {
    return (
      <UnifiedTaskEdit
        task={task}
        onClose={() => setShowEditView(false)}
        startInEditMode={true}
      />
    )
  }

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="small">
      {/* Combined Card - Header and Content in one card to remove gap */}
      <Card style={{ marginBottom: 0 }}>
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
                {task.steps.length} steps • {formatDuration(task.duration)} total work •
                up to {formatDuration(task.worstCaseDuration)} worst case
              </Text>

              <Progress
                percent={progressPercent}
                formatText={() => `${completedSteps}/${totalSteps} steps complete`}
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
                icon={<IconMindMapping />}
                onClick={() => setShowVisualization(true)}
              >
                View Graph
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

        {/* Current Status Alert - inside the same card */}
        {currentStep && (
          <Alert
            type="info"
            style={{ marginTop: 16, marginBottom: 16 }}
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
            style={{ marginTop: 16, marginBottom: 16 }}
            content={
              <Space>
                <Text>Waiting for async process to complete...</Text>
                <Text type="secondary">Next step will be available automatically</Text>
              </Space>
            }
          />
        )}

        {/* Tabbed View - now inside the same card */}
        <Tabs
          activeTab={activeTab}
          onChange={setActiveTab}
          type="rounded"
        >
          <Tabs.TabPane
            key="overview"
            title={
              <span>
                <IconCalendar style={{ marginRight: 8 }} />
                Overview
              </span>
            }
          >
            <Space direction="vertical" style={{ width: '100%' }} size="large">
              {/* Summary Statistics */}
              <Card>
                <Row gutter={16}>
                  <Col span={6}>
                    <Statistic
                      title="Total Duration"
                      value={formatDuration(task.duration)}
                      prefix={<IconClockCircle />}
                    />
                  </Col>
                  <Col span={6}>
                    <div style={{ color: Object.values(stepTimeLogs).reduce((sum, time) => sum + time, 0) > 0 ? '#00B42A' : undefined }}>
                      <Statistic
                        title="Time Logged"
                        value={formatDuration(Object.values(stepTimeLogs).reduce((sum, time) => sum + time, 0))}
                        prefix={<IconHistory />}
                      />
                    </div>
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
                    <Title heading={6} style={{ margin: 0 }}>Workflow Steps ({task.steps.length})</Title>
                    <Button
                      type="text"
                      size="small"
                      icon={<IconDown style={{ transform: !stepsCollapsed ? 'rotate(180deg)' : 'none', transition: 'transform 0.3s' }} />}
                      onClick={() => setStepsCollapsed(!stepsCollapsed)}
                    >
                      {stepsCollapsed ? 'Show Steps' : 'Hide Steps'}
                    </Button>
                    {!stepsCollapsed && (
                      <>
                        <Button
                          type="text"
                          size="small"
                          icon={<IconDown style={{ transform: showDetails ? 'rotate(180deg)' : 'none', transition: 'transform 0.3s' }} />}
                          onClick={() => setShowDetails(!showDetails)}
                        >
                          {showDetails ? 'Hide Details' : 'Show Details'}
                        </Button>
                        <Button
                          type="text"
                          size="small"
                          icon={<IconBook />}
                          onClick={() => setShowAllNotesModal(true)}
                        >
                          View All Notes
                        </Button>
                      </>
                    )}
                  </Space>
                }
              >
                {!stepsCollapsed ? (
                  <>
                    <div style={{ position: 'relative' }}>
                      {task.steps.map((step, index) => (
                        <TaskStepItem
                          key={step.id}
                          step={step}
                          stepIndex={index}
                          isActive={step.status === 'in_progress'}
                          isCompleted={step.status === 'completed'}
                          timeLogged={stepTimeLogs[step.id] || 0}
                          onStart={handleStepStart}
                          onComplete={handleStepComplete}
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
              </>
            ) : (
              <div style={{ padding: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                  {/* Minimap on the left */}
                  <div style={{ flex: '0 0 auto' }}>
                    <WorkflowMinimap task={task} width={280} height={80} />
                  </div>

                  {/* Progress info on the right */}
                  <div style={{ flex: 1 }}>
                    <Progress
                      percent={Math.round(progressPercent)}
                      style={{ marginBottom: 8 }}
                      strokeWidth={8}
                    />
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text type="secondary">
                        {completedSteps} of {totalSteps} steps completed
                      </Text>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {Math.round(progressPercent)}% complete
                      </Text>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </Card>
            </Space>
          </Tabs.TabPane>

          <Tabs.TabPane
            key="progress"
            title={
              <span>
                <IconHistory style={{ marginRight: 8 }} />
                Progress Tracking
              </span>
            }
          >
            <WorkflowProgressTracker workflow={task} />
          </Tabs.TabPane>
        </Tabs>
      </Card>

      {/* Workflow Visualization Modal - outside of cards */}
      <WorkflowVisualization
        task={task}
        visible={showVisualization}
        onClose={() => setShowVisualization(false)}
      />

      {/* All Notes Modal */}
      <Modal
        title={
          <Space>
            <IconBook />
            <span>All Step Notes for {task.name}</span>
          </Space>
        }
        visible={showAllNotesModal}
        onCancel={() => setShowAllNotesModal(false)}
        footer={[
          <Button key="close" onClick={() => setShowAllNotesModal(false)}>
            Close
          </Button>,
        ]}
        style={{ width: 700 }}
      >
        <Space direction="vertical" style={{ width: '100%' }} size="medium">
          {task.notes && (
            <Card size="small" title="Workflow Notes" style={{ marginBottom: 16 }}>
              <Text>{task.notes}</Text>
            </Card>
          )}
          {task.steps.filter(step => step.notes).length === 0 ? (
            <Text type="secondary">No notes found for any steps in this workflow.</Text>
          ) : (
            task.steps
              .filter(step => step.notes)
              .map((step, index) => (
                <Card
                  key={step.id}
                  size="small"
                  title={
                    <Space>
                      <Text style={{ fontWeight: 500 }}>
                        Step {index + 1}: {step.name}
                      </Text>
                      <Tag size="small" color={
                        step.type === TaskType.Focused ? 'blue' :
                        step.type === TaskType.Admin ? 'green' :
                        'orange'
                      }>
                        {formatDuration(step.duration)}
                      </Tag>
                      {step.asyncWaitTime > 0 && (
                        <Tag size="small" color="red">
                          +{formatDuration(step.asyncWaitTime)} wait
                        </Tag>
                      )}
                    </Space>
                  }
                >
                  <Text style={{ whiteSpace: 'pre-wrap' }}>{step.notes}</Text>
                </Card>
              ))
          )}
        </Space>
      </Modal>
    </Space>
  )
}
