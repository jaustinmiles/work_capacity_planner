import { useState, useMemo, ReactElement } from 'react'
import { Space, Typography, Button, Tag, Alert } from '@arco-design/web-react'
import { IconPlayArrow, IconPause, IconCheck, IconSkipNext } from '@arco-design/web-react/icon'
import { useResponsive } from '../../providers/ResponsiveProvider'
import { useTaskStore } from '../../store/useTaskStore'
import { useSchedulerStore } from '../../store/useSchedulerStore'
import { useWorkPatternStore } from '../../store/useWorkPatternStore'
import { formatMinutes } from '@shared/time-utils'
import { TaskStatus, NotificationType } from '@shared/enums'
import { logger } from '@/logger'

const { Text } = Typography

// Notification state for React 19 compatibility
interface NotificationState {
  message: string
  type: NotificationType
  visible: boolean
}

/**
 * StartNextTaskWidget - Focused widget for starting/managing work sessions
 *
 * Displays:
 * - Current active session (if any)
 * - Next scheduled task (if no active session)
 * - Action buttons: Start, Pause, Complete, Skip
 */
export function StartNextTaskWidget(): ReactElement {
  const { isCompact } = useResponsive()

  // Task store state - only subscribe to what we need
  const activeWorkSessions = useTaskStore(state => state.activeWorkSessions)
  const isLoading = useTaskStore(state => state.isLoading)
  const startNextTask = useTaskStore(state => state.startNextTask)
  const pauseWorkOnTask = useTaskStore(state => state.pauseWorkOnTask)
  const pauseWorkOnStep = useTaskStore(state => state.pauseWorkOnStep)
  const completeStep = useTaskStore(state => state.completeStep)
  const updateTask = useTaskStore(state => state.updateTask)
  const getWorkSessionProgress = useTaskStore(state => state.getWorkSessionProgress)
  const incrementNextTaskSkipIndex = useTaskStore(state => state.incrementNextTaskSkipIndex)

  // Work pattern store state
  const workPatternsLoading = useWorkPatternStore(state => state.isLoading)

  // Scheduler store state - nextScheduledItem is reactive and updates automatically
  // when tasks change (via storeConnector subscription chain)
  const nextScheduledItem = useSchedulerStore(state => state.nextScheduledItem)

  const [isProcessing, setIsProcessing] = useState(false)

  // Notification state
  const [notification, setNotification] = useState<NotificationState>({
    message: '',
    type: NotificationType.Info,
    visible: false,
  })

  // Helper to show notifications
  const showNotification = (message: string, type: NotificationType = NotificationType.Info): void => {
    setNotification({ message, type, visible: true })
    setTimeout(() => setNotification(prev => ({ ...prev, visible: false })), 3000)
  }

  // Get active session from store state
  const activeSession = useMemo(() => {
    const sessions = Array.from(activeWorkSessions.values())
    return sessions.length > 0 ? sessions[0] : null
  }, [activeWorkSessions])

  // Derive nextTask from reactive store state - no manual sync needed
  // When activeWorkSessions exists, we show active session instead of next task
  const nextTask = useMemo(() => {
    if (activeWorkSessions.size > 0) return null
    if (workPatternsLoading || isLoading) return null
    return nextScheduledItem
  }, [activeWorkSessions.size, workPatternsLoading, isLoading, nextScheduledItem])

  // Handler functions
  const handleStartNextTask = async (): Promise<void> => {
    try {
      setIsProcessing(true)
      await startNextTask()

      if (nextTask) {
        showNotification(`Started work on: ${nextTask.title}`, NotificationType.Success)
      } else {
        showNotification('Started work session', NotificationType.Success)
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to start work session'
      logger.ui.error('Failed to start task', { error: errorMessage })
      showNotification(errorMessage, NotificationType.Error)
    } finally {
      setIsProcessing(false)
    }
  }

  const handlePauseCurrentTask = async (): Promise<void> => {
    if (!activeSession) {
      return
    }

    try {
      setIsProcessing(true)

      if (activeSession.stepId) {
        await pauseWorkOnStep(activeSession.stepId)
      } else if (activeSession.taskId) {
        await pauseWorkOnTask(activeSession.taskId)
      }

      showNotification('Work session paused', NotificationType.Success)
    } catch (error) {
      logger.ui.error('Failed to pause task', { error })
      showNotification('Failed to pause work session', NotificationType.Error)
    } finally {
      setIsProcessing(false)
    }
  }

  const handleCompleteCurrentTask = async (): Promise<void> => {
    if (!activeSession) {
      return
    }

    try {
      setIsProcessing(true)

      if (activeSession.stepId) {
        await completeStep(activeSession.stepId)
        showNotification(`Completed workflow step: ${activeSession.stepName || 'Step'}`, NotificationType.Success)
      } else if (activeSession.taskId) {
        // Pause work first to log time
        const progress = getWorkSessionProgress(activeSession.taskId)
        if (progress.isActive && !progress.isPaused) {
          await pauseWorkOnTask(activeSession.taskId)
        }

        // Mark task as completed
        await updateTask(activeSession.taskId, {
          completed: true,
          overallStatus: TaskStatus.Completed,
        })

        showNotification(`Completed task: ${activeSession.taskName || 'Task'}`, NotificationType.Success)
      }

      // No manual sync needed - the reactive chain handles this:
      // 1. updateTask() updates TaskStore
      // 2. storeConnector subscription detects change
      // 3. filterSchedulableItems() removes completed task
      // 4. setInputs() updates SchedulerStore.nextScheduledItem
      // 5. This component's subscription to nextScheduledItem triggers re-render
      // 6. useMemo derives nextTask from the new nextScheduledItem
    } catch (error) {
      logger.ui.error('Failed to complete task', { error })
      showNotification('Failed to complete task', NotificationType.Error)
    } finally {
      setIsProcessing(false)
    }
  }

  const handleSkipToNextTask = (): void => {
    incrementNextTaskSkipIndex()
    // Next task will be reloaded automatically via useEffect
  }

  const hasActiveSession = !!activeSession

  return (
    <>
      <div style={{ background: '#f0f8ff', padding: '12px', borderRadius: '4px', border: '1px solid #1890ff' }}>
        <Space direction="vertical" style={{ width: '100%' }}>
          <Space style={{ width: '100%', justifyContent: 'space-between' }}>
            <Text style={{ fontWeight: 600, color: '#1890ff' }}>🚀 Start Next Task</Text>
            <Button
              type="text"
              icon={<IconSkipNext />}
              onClick={handleSkipToNextTask}
              size="small"
              title="Skip to next task"
              disabled={hasActiveSession || isProcessing}
            />
          </Space>

          {(() => {
            if (activeSession) {
              // Show active session details with progress info
              const itemId = activeSession.stepId || activeSession.taskId
              const progress = getWorkSessionProgress(itemId)
              const remainingMinutes = Math.max(0, activeSession.plannedMinutes - progress.elapsedMinutes)
              const isOverdue = progress.elapsedMinutes > activeSession.plannedMinutes

              return (
                <Space direction="vertical" style={{ width: '100%' }}>
                  <Text>
                    {progress.isPaused ? '⏸️ Paused: ' : '▶️ Working on: '}
                    {activeSession.taskName || activeSession.stepName || 'Unknown'}
                  </Text>
                  <Space wrap>
                    <Tag color={isOverdue ? 'red' : 'blue'}>
                      {isOverdue
                        ? `⚠️ ${formatMinutes(progress.elapsedMinutes - activeSession.plannedMinutes)} over`
                        : `${formatMinutes(remainingMinutes)} remaining`}
                    </Tag>
                    <Tag color="gray">
                      {formatMinutes(progress.elapsedMinutes)} elapsed
                    </Tag>
                    <Tag color={activeSession.stepId ? 'purple' : 'green'}>
                      {activeSession.stepId ? '🔄 Step' : '📋 Task'}
                    </Tag>
                  </Space>
                </Space>
              )
            } else if (nextTask) {
              const remainingMinutes = Math.max(0, nextTask.estimatedDuration - nextTask.loggedMinutes)
              const isOverdue = nextTask.loggedMinutes > nextTask.estimatedDuration
              const hasLoggedTime = nextTask.loggedMinutes > 0

              return (
                <Space direction="vertical" style={{ width: '100%' }}>
                  <Text>Next: {nextTask.title}</Text>
                  {nextTask.workflowName && (
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      Workflow: {nextTask.workflowName}
                    </Text>
                  )}
                  <Space wrap>
                    {hasLoggedTime ? (
                      <>
                        <Tag color={isOverdue ? 'red' : 'blue'}>
                          {isOverdue ? '⚠️ Overdue' : `${formatMinutes(remainingMinutes)} remaining`}
                        </Tag>
                        <Tag color="gray">
                          {formatMinutes(nextTask.loggedMinutes)} logged
                        </Tag>
                      </>
                    ) : (
                      <Tag color="blue">{formatMinutes(nextTask.estimatedDuration)}</Tag>
                    )}
                    <Tag color={nextTask.type === 'step' ? 'purple' : 'green'}>
                      {nextTask.type === 'step' ? '🔄 Step' : '📋 Task'}
                    </Tag>
                  </Space>
                </Space>
              )
            } else {
              return <Text type="secondary">No tasks available</Text>
            }
          })()}

          {/* Action buttons */}
          {hasActiveSession ? (
            <Space style={{ width: '100%', marginTop: 8 }}>
              <Button
                type="outline"
                status="warning"
                icon={<IconPause />}
                loading={isProcessing}
                onClick={handlePauseCurrentTask}
                style={{ flex: 1 }}
              >
                Pause
              </Button>
              <Button
                type="primary"
                status="success"
                icon={<IconCheck />}
                loading={isProcessing}
                onClick={handleCompleteCurrentTask}
                style={{ flex: 1 }}
              >
                Complete
              </Button>
            </Space>
          ) : (
            <Button
              type="primary"
              icon={<IconPlayArrow />}
              loading={isProcessing || workPatternsLoading}
              disabled={workPatternsLoading || isLoading || isProcessing}
              onClick={handleStartNextTask}
              style={{ width: '100%', marginTop: 8, minWidth: 0 }}
            >
              {workPatternsLoading || isLoading ? 'Loading...' : (isCompact ? 'Start' : 'Start Next Task')}
            </Button>
          )}
        </Space>
      </div>

      {/* Notification Alert */}
      {notification.visible && (
        <Alert
          type={notification.type}
          content={notification.message}
          closable
          onClose={() => setNotification(prev => ({ ...prev, visible: false }))}
          style={{ marginTop: 8 }}
        />
      )}
    </>
  )
}
