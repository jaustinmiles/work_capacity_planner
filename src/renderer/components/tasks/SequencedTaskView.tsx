import { useState, useEffect } from 'react'
import { Card, Space, Typography, Tag, Button, Alert, Statistic, Grid, Progress, Popconfirm, Tabs, Modal } from '@arco-design/web-react'
import { IconClockCircle, IconCalendar, IconPlayArrow, IconPause, IconRefresh, IconDown, IconEdit, IconDelete, IconMindMapping, IconHistory, IconBook, IconArchive, IconUndo } from '@arco-design/web-react/icon'
import { SequencedTask, TaskStep } from '@shared/sequencing-types'
import { StepStatus } from '@shared/enums'
import { TaskStepItem } from './TaskStepItem'
import { useSortedUserTaskTypes } from '../../store/useUserTaskTypeStore'
import { UnifiedTaskEdit } from './UnifiedTaskEdit'
import { WorkflowVisualization } from './WorkflowVisualization'
import { WorkflowProgressTracker } from '../progress/WorkflowProgressTracker'
import { WorkflowMinimap } from './WorkflowMinimap'
import { getDatabase } from '../../services/database'
import { logger } from '@/logger'
import { useTaskStore } from '../../store/useTaskStore'


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
  const { activeWorkSessions, isStepActivelyWorkedOn, skipAsyncWait } = useTaskStore()
  const userTypes = useSortedUserTaskTypes()
  const [showDetails, setShowDetails] = useState(false)
  const [showEditView, setShowEditView] = useState(false)
  const [showVisualization, setShowVisualization] = useState(false)
  const [showAllNotesModal, setShowAllNotesModal] = useState(false)
  const [activeTab, setActiveTab] = useState<string>('overview')
  const [stepTimeLogs, setStepTimeLogs] = useState<Record<string, number>>({})
  const [stepsCollapsed, setStepsCollapsed] = useState(true) // Start collapsed for better UX with many workflows
  const [currentTime, setCurrentTime] = useState(new Date())

  // Update current time every minute for countdown timers
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date())
    }, 60000) // Update every minute
    return () => clearInterval(interval)
  }, [])

  const completedSteps = task.steps.filter(step => step.status === StepStatus.Completed).length
  const totalSteps = task.steps.length
  const progressPercent = totalSteps > 0 ? (completedSteps / totalSteps) * 100 : 0

  // Find the step that's in progress AND actively being worked on (not paused)
  const currentStep = task.steps.find(step =>
    step.status === 'in_progress' && isStepActivelyWorkedOn(step.id),
  )

  // Check if any step in this workflow has an active work session
  const getActiveWorkflowSession = () => {
    const sessions = Array.from(activeWorkSessions.values())
    return sessions.find(session =>
      session.workflowId === task.id ||
      task.steps.some(step => step.id === session.stepId),
    ) || null
  }

  const activeSession = getActiveWorkflowSession()
  const hasActiveSession = !!activeSession && !activeSession.isPaused

  // Fetch time logged for each step
  useEffect(() => {
    const fetchStepTimeLogs = async () => {
      try {
        const db = getDatabase()
        const timeLogs: Record<string, number> = {}

        // Fetch work sessions for all steps
        for (const step of task.steps) {
          const sessions = await db.getStepWorkSessions(step.id) as Array<{ actualMinutes?: number; plannedMinutes?: number }>
          const totalMinutes = sessions.reduce((sum, session) => {
            const minutes = session.actualMinutes || session.plannedMinutes || 0
            return sum + minutes
          }, 0)
          timeLogs[step.id] = totalMinutes
        }

        setStepTimeLogs(timeLogs)
      } catch (error) {
        logger.ui.error('Failed to fetch step time logs', {
          error: error instanceof Error ? error.message : String(error),
          taskId: task.id,
        }, 'step-timelogs-fetch-error')
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
      .filter(step => step.status === StepStatus.Pending)
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

  const handleToggleArchive = async () => {
    try {
      const db = getDatabase()
      if (task.archived) {
        await db.unarchiveTask(task.id)
        logger.ui.info(`Unarchived workflow: ${task.name}`)
      } else {
        await db.archiveTask(task.id)
        logger.ui.info(`Archived workflow: ${task.name}`)
      }
      // Refresh tasks to update UI
      const { loadTasks } = useTaskStore.getState()
      await loadTasks()
    } catch (error) {
      logger.ui.error('Failed to toggle archive status', {
        error: error instanceof Error ? error.message : String(error),
        taskId: task.id,
        taskName: task.name,
      }, 'archive-toggle-error')
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
                formatText={() => `${completedSteps}/${totalSteps}`} // Shorter text to prevent overflow
                style={{
                  width: '100%', // Use available width instead of fixed 400px
                  maxWidth: 400, // But cap at 400px on larger screens
                  minWidth: 150, // Minimum width for readability
                }}
              />
            </Space>
          </Col>

          <Col>
            <Space>
              {/* Show start button if workflow is not started OR no active session */}
              {(!hasActiveSession && task.overallStatus !== 'completed') && (
                <Button
                  type="primary"
                  icon={<IconPlayArrow />}
                  onClick={onStartWorkflow}
                >
                  Start Workflow
                </Button>
              )}

              {/* Show pause button if there's an active session in this workflow */}
              {hasActiveSession && (
                <Button
                  status="warning"
                  icon={<IconPause />}
                  onClick={onPauseWorkflow}
                >
                  Pause Work Session
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

              <Button
                type="text"
                icon={task.archived ? <IconUndo /> : <IconArchive />}
                onClick={handleToggleArchive}
                title={task.archived ? 'Unarchive workflow' : 'Archive workflow'}
              >
                {task.archived ? 'Unarchive' : 'Archive'}
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
                <Row gutter={[16, 16]}> {/* Add vertical gutters for wrapping */}
                  <Col xs={24} sm={12} md={6} lg={6} xl={6}> {/* Responsive columns */}
                    <Statistic
                      title="Total Duration"
                      value={formatDuration(task.duration)}
                      prefix={<IconClockCircle />}
                    />
                  </Col>
                  <Col xs={24} sm={12} md={6} lg={6} xl={6}> {/* Responsive columns */}
                    <div style={{ color: Object.values(stepTimeLogs).reduce((sum, time) => sum + time, 0) > 0 ? '#00B42A' : undefined }}>
                      <Statistic
                        title="Logged" // Shorter for mobile
                        value={formatDuration(Object.values(stepTimeLogs).reduce((sum, time) => sum + time, 0))}
                        prefix={<IconHistory />}
                      />
                    </div>
                  </Col>
                  <Col xs={24} sm={12} md={6} lg={6} xl={6}> {/* Responsive columns */}
                    <Statistic
                      title="Path" // Shorter for mobile
                      value={formatDuration(task.criticalPathDuration)}
                      prefix={<IconCalendar />}
                    />
                  </Col>
                  <Col xs={24} sm={12} md={6} lg={6} xl={6}> {/* Responsive columns */}
                    <Statistic
                      title="Due" // Much shorter for mobile
                      value={calculateEstimatedCompletionTime().toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                      })} // Shorter date format: "Sep 4" instead of "9/4/2025"
                      suffix={calculateEstimatedCompletionTime().toLocaleTimeString([], {
                        hour: 'numeric',
                        minute: '2-digit',
                      })} // Shorter time format: "3:45 PM" instead of "03:45 PM"
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
                          isActive={step.status === StepStatus.InProgress}
                          isCompleted={step.status === StepStatus.Completed}
                          isWaiting={step.status === StepStatus.Waiting}
                          currentTime={currentTime}
                          timeLogged={stepTimeLogs[step.id] || 0}
                          onStart={handleStepStart}
                          onComplete={handleStepComplete}
                          onSkipWait={skipAsyncWait}
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
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap', // Allow wrapping on narrow screens
                      gap: 8, // Add space between wrapped items
                    }}>
                      <Text
                        type="secondary"
                        style={{
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          minWidth: 0,
                        }}
                      >
                        {completedSteps}/{totalSteps} steps {/* Shorter format */}
                      </Text>
                      <Text
                        type="secondary"
                        style={{
                          fontSize: 12,
                          whiteSpace: 'nowrap', // Prevent % breaking from "complete"
                        }}
                      >
                        {Math.round(progressPercent)}%
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
                      <Tag size="small" color={userTypes.find(t => t.id === step.type)?.color || 'gray'}>
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
