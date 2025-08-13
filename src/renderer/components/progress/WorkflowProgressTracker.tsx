import { useState } from 'react'
import { SequencedTask, TaskStep } from '@shared/sequencing-types'
import { useWorkflowProgress } from '../../hooks/useWorkflowProgress'
import { formatDuration } from '../../utils/dateUtils'
import { IconPlayArrow, IconPause, IconCheckCircle, IconClockCircle, IconExclamationCircle, IconDown } from '@arco-design/web-react/icon'
import { Button, Progress, Card, Space, Typography, Tag, Grid, Statistic, Slider, Alert } from '@arco-design/web-react'
import { TimeLoggingModal } from './TimeLoggingModal'

const { Title, Text } = Typography
const { Row, Col } = Grid

interface WorkflowProgressTrackerProps {
  workflow: SequencedTask
}

export const WorkflowProgressTracker: React.FC<WorkflowProgressTrackerProps> = ({
  workflow,
}) => {
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set())
  const [showTimeModal, setShowTimeModal] = useState<string | null>(null)

  const {
    startWork,
    pauseWork,
    completeStep,
    updateProgress,
    logTime,
    getStepProgress,
    getWorkflowStats,
    getStepStats,
  } = useWorkflowProgress(workflow.id)

  const stats = getWorkflowStats(workflow.id)

  const toggleStepExpanded = (stepId: string) => {
    const newExpanded = new Set(expandedSteps)
    if (newExpanded.has(stepId)) {
      newExpanded.delete(stepId)
    } else {
      newExpanded.add(stepId)
    }
    setExpandedSteps(newExpanded)
  }

  const handleStartWork = (step: TaskStep) => (e: any) => {
    e.stopPropagation()
    startWork(step.id)
  }

  const handlePauseWork = (step: TaskStep) => (e: any) => {
    e.stopPropagation()
    pauseWork(step.id)
  }

  const handleCompleteStep = (step: TaskStep) => async (e: any) => {
    e.stopPropagation()
    const progress = getStepProgress(step.id)

    if (progress.elapsedMinutes > 0) {
      // If work was tracked, complete with tracked time
      await completeStep(step.id)
    } else {
      // Otherwise, show time logging modal
      setShowTimeModal(step.id)
    }
  }

  const renderStepProgress = (step: TaskStep) => {
    const progress = getStepProgress(step.id)
    const stepStats = getStepStats(step.id)
    const isExpanded = expandedSteps.has(step.id)

    const getStepStatusColor = () => {
      switch (step.status) {
        case 'completed': return '#00B42A'
        case 'in_progress': return '#165DFF'
        default: return '#86909C'
      }
    }

    return (
      <Card
        key={step.id}
        style={{
          marginBottom: 8,
          borderColor: getStepStatusColor(),
          backgroundColor: step.status === 'completed' ? '#F6FFED' : step.status === 'in_progress' ? '#F0F9FF' : undefined,
        }}
        hoverable
        onClick={() => toggleStepExpanded(step.id)}
      >
        <Space direction="vertical" style={{ width: '100%' }} size="medium">
          <Row justify="space-between" align="center">
            <Col flex="auto">
              <Space align="center">
                <IconDown
                  style={{
                    transform: isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)',
                    transition: 'transform 0.2s',
                  }}
                />
                <Title heading={6} style={{ margin: 0 }}>{step.name}</Title>
                {step.status === 'completed' && (
                  <IconCheckCircle style={{ color: '#00B42A' }} />
                )}
                {step.status === 'in_progress' && (
                  <Tag color="blue">
                    <Space>
                      <IconClockCircle />
                      {formatDuration(progress.elapsedMinutes)}
                    </Space>
                  </Tag>
                )}
              </Space>

              <Space style={{ marginTop: 4 }}>
                <Text type="secondary">Est: {formatDuration(step.duration)}</Text>
                {stepStats.actualMinutes > 0 && (
                  <Text type="secondary">Actual: {formatDuration(stepStats.actualMinutes)}</Text>
                )}
                {step.percentComplete > 0 && step.percentComplete < 100 && (
                  <Text type="secondary">{step.percentComplete}% complete</Text>
                )}
              </Space>
            </Col>

            <Col>
              <Space>
                {step.status === 'pending' && (
                  <Button
                    type="text"
                    icon={<IconPlayArrow />}
                    onClick={handleStartWork(step)}
                    title="Start work"
                  />
                )}

                {step.status === 'in_progress' && progress.isActive && (
                  <Button
                    type="text"
                    icon={<IconPause />}
                    onClick={handlePauseWork(step)}
                    title="Pause work"
                  />
                )}

                {step.status === 'in_progress' && progress.isPaused && (
                  <Button
                    type="text"
                    icon={<IconPlayArrow />}
                    onClick={handleStartWork(step)}
                    title="Resume work"
                  />
                )}

                {step.status === 'in_progress' && (
                  <Button
                    type="primary"
                    size="small"
                    onClick={handleCompleteStep(step)}
                  >
                    Complete
                  </Button>
                )}

                {/* Always show log time button */}
                <Button
                  type="text"
                  size="small"
                  onClick={() => setShowTimeModal(step.id)}
                  title="Log time manually"
                >
                  Log time
                </Button>
              </Space>
            </Col>
          </Row>

          {isExpanded && (
            <Space direction="vertical" style={{ width: '100%' }} size="medium">
              {/* Progress bar */}
              <div>
                <Row justify="space-between" style={{ marginBottom: 8 }}>
                  <Text type="secondary">Progress</Text>
                  <Text type="secondary">{step.percentComplete}%</Text>
                </Row>
                <Progress
                  percent={step.percentComplete}
                  showText={false}
                />
              </div>

              {/* Time tracking details */}
              {(stepStats.actualMinutes > 0 || progress.elapsedMinutes > 0) && (
                <Card style={{ backgroundColor: '#F7F8FA' }}>
                  <Space direction="vertical" size="small" style={{ width: '100%' }}>
                    <Row justify="space-between">
                      <Text type="secondary">Time spent:</Text>
                      <Text style={{ fontWeight: 'bold' }}>
                        {formatDuration(stepStats.actualMinutes || progress.elapsedMinutes)}
                      </Text>
                    </Row>
                    {stepStats.actualMinutes > 0 && step.duration > 0 && (
                      <Row justify="space-between">
                        <Text type="secondary">Accuracy:</Text>
                        <Text style={{ fontWeight: 'bold',
                          color: Math.abs(stepStats.actualMinutes - step.duration) / step.duration > 0.2
                            ? '#FF7D00'
                            : '#00B42A',
                        }}>
                          {Math.round((stepStats.actualMinutes / step.duration) * 100)}%
                        </Text>
                      </Row>
                    )}
                  </Space>
                </Card>
              )}

              {/* Manual progress update */}
              {step.status === 'in_progress' && (
                <Space direction="vertical" style={{ width: '100%' }}>
                  <Row justify="space-between" align="center">
                    <Col span={16}>
                      <Slider
                        value={step.percentComplete}
                        onChange={(value) => updateProgress(step.id, value as number)}
                        marks={{
                          0: '0%',
                          25: '25%',
                          50: '50%',
                          75: '75%',
                          100: '100%',
                        }}
                      />
                    </Col>
                    <Col>
                      <Button
                        type="text"
                        size="small"
                        onClick={() => setShowTimeModal(step.id)}
                      >
                        Log time
                      </Button>
                    </Col>
                  </Row>
                </Space>
              )}
            </Space>
          )}
        </Space>
      </Card>
    )
  }

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="large">
      {/* Overall progress summary */}
      <Card>
        <Title heading={5} style={{ marginBottom: 24 }}>Workflow Progress</Title>

        <Row gutter={16} style={{ marginBottom: 24 }}>
          <Col span={6}>
            <Statistic
              title="Completion"
              value={stats.completionPercentage}
              suffix="%"
            />
          </Col>
          <Col span={6}>
            <Statistic
              title="Steps"
              value={`${stats.completedSteps}/${stats.totalSteps}`}
            />
          </Col>
          <Col span={6}>
            <Statistic
              title="Time Spent"
              value={formatDuration(stats.totalActualMinutes)}
            />
          </Col>
          <Col span={6}>
            <Statistic
              title="Remaining"
              value={formatDuration(stats.remainingEstimatedMinutes)}
            />
          </Col>
        </Row>

        {/* Overall progress bar */}
        <Progress
          percent={stats.completionPercentage}
          strokeWidth={12}
          {...(stats.completionPercentage === 100 ? { status: 'success' } : {})}
        />

        {/* Accuracy indicator */}
        {stats.accuracyRatio !== null && (
          <Alert
            style={{ marginTop: 16 }}
            type={
              stats.accuracyRatio > 1.2 ? 'warning' :
              stats.accuracyRatio < 0.8 ? 'info' :
              'success'
            }
            content={
              stats.accuracyRatio > 1.2 ? (
                <Space>
                  <IconExclamationCircle />
                  Running {Math.round((stats.accuracyRatio - 1) * 100)}% over estimate
                </Space>
              ) : stats.accuracyRatio < 0.8 ? (
                <Space>
                  <IconExclamationCircle />
                  Running {Math.round((1 - stats.accuracyRatio) * 100)}% under estimate
                </Space>
              ) : (
                <Space>
                  <IconCheckCircle />
                  On track with estimates
                </Space>
              )
            }
          />
        )}
      </Card>

      {/* Step-by-step progress */}
      <div>
        {workflow.steps.map((step) => renderStepProgress(step))}
      </div>

      {/* Time logging modal */}
      {showTimeModal && (() => {
        const step = workflow.steps.find(s => s.id === showTimeModal)
        if (!step) return null

        // Allow completing any non-completed step through the modal
        const canComplete = step.status !== 'completed'

        return (
          <TimeLoggingModal
            step={step}
            onClose={() => setShowTimeModal(null)}
            onLogTime={async (minutes, notes) => {
              await logTime(step.id, minutes, notes)
              setShowTimeModal(null)
            }}
            onComplete={canComplete ? async (minutes, notes) => {
              await completeStep(step.id, minutes, notes)
              setShowTimeModal(null)
            } : undefined}
            mode={canComplete && step.status !== 'in_progress' ? 'complete' : 'log'}
          />
        )
      })()}
    </Space>
  )
}
