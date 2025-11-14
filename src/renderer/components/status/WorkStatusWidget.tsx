import { useEffect, useState, useMemo } from 'react'
import { Card, Space, Typography, Button, Tag, Progress, Statistic, Alert } from '@arco-design/web-react'
import { IconPlayArrow, IconPause, IconCheck, IconSkipNext, IconCaretRight } from '@arco-design/web-react/icon'
import { useTaskStore } from '../../store/useTaskStore'
import { useSchedulerStore } from '../../store/useSchedulerStore'
import { useWorkPatternStore } from '../../store/useWorkPatternStore'
import { formatMinutes, calculateDuration, formatTimeHHMM, dateToYYYYMMDD } from '@shared/time-utils'
import { TaskStatus, TaskType, WorkBlockType, NotificationType } from '@shared/enums'
import { logger } from '@/logger'
import { getCurrentTime } from '@shared/time-provider'
import { getDatabase } from '../../services/database'
import { WorkBlock } from '@shared/work-blocks-types'
import { getTotalCapacityForTaskType } from '@shared/capacity-calculator'

const { Title, Text } = Typography

// Custom notification state for React 19 compatibility
interface NotificationState {
  message: string
  type: NotificationType
  visible: boolean
}

function getBlockDisplay(block: WorkBlock | null) {
  if (!block) return { icon: '🔍', label: 'No block' }
  switch (block.type) {
    case WorkBlockType.Focused:
      return { icon: '🎯', label: 'Focus' }
    case WorkBlockType.Admin:
      return { icon: '📊', label: 'Admin' }
    case WorkBlockType.Personal:
      return { icon: '🏠', label: 'Personal' }
    case WorkBlockType.Mixed:
      return { icon: '🔄', label: 'Mixed' }
    case WorkBlockType.Flexible:
      return { icon: '🔄', label: 'Flexible' }
    case WorkBlockType.Blocked:
      return { icon: '🚫', label: 'Blocked' }
    case WorkBlockType.Sleep:
      return { icon: '😴', label: 'Sleep' }
    default:
      return { icon: '❓', label: 'Unknown' }
  }
}

// calculateDuration is now imported from @shared/time-utils

export function WorkStatusWidget() {
  // Task store state
  const activeWorkSessions = useTaskStore(state => state.activeWorkSessions)
  const isLoading = useTaskStore(state => state.isLoading)
  const tasks = useTaskStore(state => state.tasks)
  const sequencedTasks = useTaskStore(state => state.sequencedTasks)
  const nextTaskSkipIndex = useTaskStore(state => state.nextTaskSkipIndex)
  const startNextTask = useTaskStore(state => state.startNextTask)
  const pauseWorkOnTask = useTaskStore(state => state.pauseWorkOnTask)
  const pauseWorkOnStep = useTaskStore(state => state.pauseWorkOnStep)
  const completeStep = useTaskStore(state => state.completeStep)
  const updateTask = useTaskStore(state => state.updateTask)
  const getWorkSessionProgress = useTaskStore(state => state.getWorkSessionProgress)
  const incrementNextTaskSkipIndex = useTaskStore(state => state.incrementNextTaskSkipIndex)

  // Work pattern store state
  const workPatterns = useWorkPatternStore(state => state.workPatterns)
  const workPatternsLoading = useWorkPatternStore(state => state.isLoading)

  // Scheduler store state
  const nextScheduledItem = useSchedulerStore(state => state.nextScheduledItem)

  const [isProcessing, setIsProcessing] = useState(false)
  const [nextTask, setNextTask] = useState<any>(null)

  // Local UI state for display only
  const [pattern, setPattern] = useState<any>(null)
  const [accumulated, setAccumulated] = useState({ focused: 0, admin: 0, personal: 0 })
  const [currentBlock, setCurrentBlock] = useState<WorkBlock | null>(null)
  const [nextBlock, setNextBlock] = useState<WorkBlock | null>(null)
  const [meetingMinutes, setMeetingMinutes] = useState(0)

  // Notification state for React 19 compatibility
  const [notification, setNotification] = useState<NotificationState>({
    message: '',
    type: NotificationType.Info,
    visible: false,
  })

  // Helper to show notifications
  const showNotification = (message: string, type: NotificationType = NotificationType.Info) => {
    setNotification({ message, type, visible: true })
    // Auto-hide after 3 seconds
    setTimeout(() => setNotification(prev => ({ ...prev, visible: false })), 3000)
  }

  // Get current date
  const currentDate = useMemo(() => {
    const now = getCurrentTime()
    return dateToYYYYMMDD(now)
  }, [])

  // Get active session from store state
  const activeSession = useMemo(() => {
    const sessions = Array.from(activeWorkSessions.values())
    return sessions.length > 0 ? sessions[0] : null
  }, [activeWorkSessions])

  // Patterns now auto-load via useWorkPatternStore

  // Load work data when patterns change
  useEffect(() => {
    if (!workPatterns || workPatterns.length === 0) {
      return
    }

    const loadWorkData = async () => {
      try {
        const pattern = workPatterns.find(p => p.date === currentDate)

        if (pattern) {
          setPattern(pattern)

          // Get current and next blocks
          const now = getCurrentTime()
          const currentTimeStr = formatTimeHHMM(now)

          const current = pattern.blocks.find(block =>
            block.startTime <= currentTimeStr && block.endTime > currentTimeStr,
          )
          setCurrentBlock(current || null)

          const next = pattern.blocks.find(block =>
            block.startTime > currentTimeStr,
          )
          setNextBlock(next || null)

          // Calculate meeting minutes
          const totalMeetingMinutes = pattern.meetings?.reduce((total: number, meeting: any) => {
            return total + calculateDuration(meeting.startTime, meeting.endTime)
          }, 0) || 0
          setMeetingMinutes(totalMeetingMinutes)

          // Load accumulated time
          const accumulatedData = await getDatabase().getTodayAccumulated(currentDate)
          setAccumulated({
            focused: accumulatedData.focused || 0,
            admin: accumulatedData.admin || 0,
            personal: accumulatedData.personal || 0,
          })
        } else {
          // No pattern for today
          setPattern(null)
          setCurrentBlock(null)
          setNextBlock(null)
          setMeetingMinutes(0)
          setAccumulated({ focused: 0, admin: 0, personal: 0 })
        }
      } catch (error) {
        logger.ui.error('Failed to load work data', { error })
      }
    }

    loadWorkData()
  }, [currentDate, workPatterns])

  // Load next task when relevant state changes
  useEffect(() => {
    const loadNextTask = async () => {
      // Only load if no active session
      if (activeWorkSessions.size > 0) {
        setNextTask(null)
        return
      }

      // Don't load while patterns or store is loading
      if (workPatternsLoading || isLoading) {
        return
      }

      // Next scheduled item is now reactive state from scheduler store
      setNextTask(nextScheduledItem)
    }

    loadNextTask()
  }, [
    activeWorkSessions.size,
    workPatternsLoading,
    isLoading,
    tasks,
    sequencedTasks,
    nextScheduledItem,
    nextTaskSkipIndex,
  ])

  // Refresh accumulated times when sessions change
  useEffect(() => {
    const handleDataChange = async () => {
      // Refresh accumulated times
      if (pattern) {
        try {
          const accumulatedData = await getDatabase().getTodayAccumulated(currentDate)
          setAccumulated({
            focused: accumulatedData.focused || 0,
            admin: accumulatedData.admin || 0,
            personal: accumulatedData.personal || 0,
          })
        } catch (error) {
          logger.ui.error('Failed to refresh accumulated times', { error })
        }
      }
    }

    handleDataChange()
  }, [pattern, currentDate, activeWorkSessions])

  // Handler functions
  const handleStartNextTask = async () => {
    try {
      setIsProcessing(true)
      await startNextTask()

      // Get the task that was started for the success message
      if (nextTask) {
        showNotification(`Started work on: ${nextTask.title}`, NotificationType.Success)
      } else {
        showNotification('Started work session', NotificationType.Success)
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to start work session'
      logger.ui.error('Failed to start task', { error: errorMessage })

      // Show error notification to user
      showNotification(errorMessage, NotificationType.Error)
    } finally {
      setIsProcessing(false)
    }
  }

  const handlePauseCurrentTask = async () => {
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

  const handleCompleteCurrentTask = async () => {
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
    } catch (error) {
      logger.ui.error('Failed to complete task', { error })
      showNotification('Failed to complete task', NotificationType.Error)
    } finally {
      setIsProcessing(false)
    }
  }

  const handleSkipToNextTask = async () => {
    incrementNextTaskSkipIndex()

    // The next task will be reloaded automatically by the useEffect
    // due to nextTaskSkipIndex changing
  }

  // Calculate total capacity for the day
  const totalCapacity = useMemo(() => {
    if (!pattern || !pattern.blocks) {
      return { focusMinutes: 0, adminMinutes: 0, personalMinutes: 0, flexibleMinutes: 0 }
    }

    return pattern.blocks.reduce((acc: any, block: WorkBlock) => {
      if (block.capacity) {
        // Use the proper capacity calculator for blocks with capacity data
        acc.focusMinutes += getTotalCapacityForTaskType(block.capacity, TaskType.Focused)
        acc.adminMinutes += getTotalCapacityForTaskType(block.capacity, TaskType.Admin)
        acc.personalMinutes += getTotalCapacityForTaskType(block.capacity, TaskType.Personal)
        acc.flexibleMinutes += getTotalCapacityForTaskType(block.capacity, TaskType.Flexible)
      } else {
        // Fallback for blocks without capacity data
        const duration = calculateDuration(block.startTime, block.endTime)
        if (block.type === WorkBlockType.Focused) {
          acc.focusMinutes += duration
        } else if (block.type === WorkBlockType.Admin) {
          acc.adminMinutes += duration
        } else if (block.type === WorkBlockType.Personal) {
          acc.personalMinutes += duration
        } else if (block.type === WorkBlockType.Flexible) {
          acc.flexibleMinutes += duration
        } else if (block.type === WorkBlockType.Mixed) {
          // Mixed blocks without capacity data - skip
          logger.ui.warn('Mixed block without capacity data', { block })
        }
      }
      return acc
    }, { focusMinutes: 0, adminMinutes: 0, personalMinutes: 0, flexibleMinutes: 0 })
  }, [pattern])

  // Calculate progress and overflow
  const focusProgress = totalCapacity.focusMinutes > 0
    ? Math.round((accumulated.focused / totalCapacity.focusMinutes) * 100)
    : 0
  const adminProgress = totalCapacity.adminMinutes > 0
    ? Math.round((accumulated.admin / totalCapacity.adminMinutes) * 100)
    : 0

  // Calculate overflow into flexible time
  const focusOverflow = Math.max(0, accumulated.focused - totalCapacity.focusMinutes)
  const adminOverflow = Math.max(0, accumulated.admin - totalCapacity.adminMinutes)
  const flexibleUsed = focusOverflow + adminOverflow
  const flexibleRemaining = Math.max(0, totalCapacity.flexibleMinutes - flexibleUsed)

  const hasActiveSession = !!activeSession

  return (
    <Card>
      <Space direction="vertical" style={{ width: '100%' }} size="medium">
        <Title heading={6}>Work Status</Title>

        {/* Start Next Task - AT THE TOP */}
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
                // Show active session details
                return (
                  <Space direction="vertical" style={{ width: '100%' }}>
                    <Text>Working on: {activeSession.taskName || activeSession.stepName || 'Unknown'}</Text>
                    <Space>
                      <Tag color="blue">{formatMinutes(activeSession.plannedMinutes)}</Tag>
                      <Tag color={activeSession.stepId ? 'purple' : 'green'}>
                        {activeSession.stepId ? '🔄 Workflow Step' : '📋 Task'}
                      </Tag>
                    </Space>
                  </Space>
                )
              } else if (nextTask) {
                return (
                  <Space direction="vertical" style={{ width: '100%' }}>
                    <Text>Next: {nextTask.title}</Text>
                    <Space>
                      <Tag color="blue">{formatMinutes(nextTask.estimatedDuration)}</Tag>
                      <Tag color={nextTask.type === 'step' ? 'purple' : 'green'}>
                        {nextTask.type === 'step' ? '🔄 Workflow Step' : '📋 Task'}
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
                style={{ width: '100%', marginTop: 8 }}
              >
                {workPatternsLoading || isLoading ? 'Loading...' : 'Start Next Task'}
              </Button>
            )}
          </Space>
        </div>

        {/* Planned Capacity */}
        <div style={{ background: '#f5f5f5', padding: '12px', borderRadius: '4px' }}>
          <Space direction="vertical" style={{ width: '100%' }}>
            <Text style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>Today&apos;s Planned Capacity</Text>
            <Space style={{ width: '100%', justifyContent: 'space-between' }}>
              <Text style={{ whiteSpace: 'nowrap' }}>🎯 Focus Time:</Text>
              <Tag color="blue">{formatMinutes(totalCapacity.focusMinutes)}</Tag>
            </Space>
            <Space style={{ width: '100%', justifyContent: 'space-between' }}>
              <Text style={{ whiteSpace: 'nowrap' }}>📋 Admin Time:</Text>
              <Tag color="orange">{formatMinutes(totalCapacity.adminMinutes)}</Tag>
            </Space>
            <Space style={{ width: '100%', justifyContent: 'space-between' }}>
              <Text style={{ whiteSpace: 'nowrap' }}>🌱 Personal Time:</Text>
              <Tag color="green">{formatMinutes(totalCapacity.personalMinutes)}</Tag>
            </Space>
            <Space style={{ width: '100%', justifyContent: 'space-between' }}>
              <Text style={{ whiteSpace: 'nowrap' }}>🔄 Flexible Time:</Text>
              <Tag color="gold">{formatMinutes(totalCapacity.flexibleMinutes)}</Tag>
            </Space>
            <Space style={{ width: '100%', justifyContent: 'space-between' }}>
              <Text style={{ whiteSpace: 'nowrap' }}>🤝 Meeting Time:</Text>
              <Tag color="purple">{formatMinutes(meetingMinutes)}</Tag>
            </Space>
            <div style={{ borderTop: '1px solid #e5e5e5', marginTop: 8, paddingTop: 8 }}>
              <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                <Text style={{ fontWeight: 600, whiteSpace: 'nowrap', minWidth: 100 }}>📊 Total Time:</Text>
                <Text style={{ fontSize: '14px', fontWeight: 500 }}>
                  {formatMinutes(totalCapacity.focusMinutes + totalCapacity.adminMinutes + totalCapacity.personalMinutes + totalCapacity.flexibleMinutes + meetingMinutes)}
                </Text>
              </Space>
            </div>
          </Space>
        </div>

        {/* Current/Next Block */}
        <div>
          {currentBlock ? (
            <Space direction="vertical" style={{ width: '100%' }}>
              <Text type="secondary" style={{ whiteSpace: 'nowrap', minWidth: 150 }}>Currently in Work Block</Text>
              <Space>
                <Tag color="green" icon={<IconCaretRight />}>
                  {currentBlock.startTime} - {currentBlock.endTime}
                </Tag>
                <Tag>
                  {getBlockDisplay(currentBlock).icon} {getBlockDisplay(currentBlock).label}
                </Tag>
              </Space>
              {currentBlock.capacity && (
                <Text type="secondary" style={{ fontSize: '12px' }}>
                  {(() => {
                    const parts: string[] = []
                    const focusMinutes = getTotalCapacityForTaskType(currentBlock.capacity, TaskType.Focused)
                    const adminMinutes = getTotalCapacityForTaskType(currentBlock.capacity, TaskType.Admin)
                    const personalMinutes = getTotalCapacityForTaskType(currentBlock.capacity, TaskType.Personal)
                    const flexibleMinutes = getTotalCapacityForTaskType(currentBlock.capacity, TaskType.Flexible)

                    if (focusMinutes > 0) parts.push(`${formatMinutes(focusMinutes)} focus`)
                    if (adminMinutes > 0) parts.push(`${formatMinutes(adminMinutes)} admin`)
                    if (personalMinutes > 0) parts.push(`${formatMinutes(personalMinutes)} personal`)
                    if (flexibleMinutes > 0) parts.push(`${formatMinutes(flexibleMinutes)} flexible`)
                    return parts.length > 0 ? `Capacity: ${parts.join(', ')}` : 'No capacity data'
                  })()}
                </Text>
              )}
            </Space>
          ) : (
            <Space direction="vertical" style={{ width: '100%' }}>
              {nextBlock ? (
                <>
                  <Text type="secondary" style={{ whiteSpace: 'nowrap', minWidth: 120 }}>Next Work Block</Text>
                  <Space>
                    <Tag color="cyan">
                      {nextBlock.startTime} - {nextBlock.endTime}
                    </Tag>
                    <Tag>
                      {getBlockDisplay(nextBlock).icon} {getBlockDisplay(nextBlock).label}
                    </Tag>
                  </Space>
                  <Text type="secondary" style={{ fontSize: '12px' }}>
                    {(() => {
                      if (!nextBlock.capacity) return 'No capacity data'
                      const parts: string[] = []
                      const focusMinutes = getTotalCapacityForTaskType(nextBlock.capacity, TaskType.Focused)
                      const adminMinutes = getTotalCapacityForTaskType(nextBlock.capacity, TaskType.Admin)
                      const personalMinutes = getTotalCapacityForTaskType(nextBlock.capacity, TaskType.Personal)
                      const flexibleMinutes = getTotalCapacityForTaskType(nextBlock.capacity, TaskType.Flexible)

                      if (focusMinutes > 0) parts.push(`${formatMinutes(focusMinutes)} focus`)
                      if (adminMinutes > 0) parts.push(`${formatMinutes(adminMinutes)} admin`)
                      if (personalMinutes > 0) parts.push(`${formatMinutes(personalMinutes)} personal`)
                      if (flexibleMinutes > 0) parts.push(`${formatMinutes(flexibleMinutes)} flexible`)
                      return `Capacity: ${parts.join(', ')}`
                    })()}
                  </Text>
                </>
              ) : (
                <Text type="secondary">No more work blocks today</Text>
              )}
            </Space>
          )}
        </div>

        {/* Progress */}
        <div>
          <Text type="secondary" style={{ marginBottom: '8px', display: 'block', whiteSpace: 'nowrap' }}>Completed Today</Text>
          <Space direction="vertical" style={{ width: '100%' }}>
            <div>
              <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                <Text style={{ whiteSpace: 'nowrap' }}>Focus</Text>
                <Text style={{ whiteSpace: 'nowrap' }}>{formatMinutes(accumulated.focused)} / {formatMinutes(totalCapacity.focusMinutes)}</Text>
                <Text style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{focusProgress}%</Text>
              </Space>
              <Progress
                percent={Math.min(focusProgress, 100)}
                color={focusProgress >= 100 ? '#00b42a' : '#165dff'}
              />
              {focusOverflow > 0 && totalCapacity.flexibleMinutes > 0 && (
                <Progress
                  percent={Math.round(Math.min((focusOverflow / totalCapacity.flexibleMinutes) * 100, 100))}
                  color="#FFA500"
                  size="small"
                  style={{ marginTop: 2 }}
                />
              )}
            </div>
            <div>
              <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                <Text style={{ whiteSpace: 'nowrap' }}>Admin</Text>
                <Text style={{ whiteSpace: 'nowrap' }}>{formatMinutes(accumulated.admin)} / {formatMinutes(totalCapacity.adminMinutes)}</Text>
                <Text style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{adminProgress}%</Text>
              </Space>
              <Progress
                percent={Math.min(adminProgress, 100)}
                color={adminProgress >= 100 ? '#00b42a' : '#ff7d00'}
              />
              {adminOverflow > 0 && totalCapacity.flexibleMinutes > 0 && (
                <Progress
                  percent={Math.round(Math.min((adminOverflow / totalCapacity.flexibleMinutes) * 100, 100))}
                  color="#FFA500"
                  size="small"
                  style={{ marginTop: 2 }}
                />
              )}
            </div>
            <div>
              <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                <Text style={{ whiteSpace: 'nowrap' }}>Personal</Text>
                <Text style={{ whiteSpace: 'nowrap' }}>{formatMinutes(accumulated.personal)}</Text>
              </Space>
              <Progress
                percent={accumulated.personal > 0 ? 100 : 0}
                color="#722ed1"
              />
            </div>
            {totalCapacity.flexibleMinutes > 0 && (
              <div>
                <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                  <Text style={{ whiteSpace: 'nowrap' }}>Flexible Time Used</Text>
                  <Text style={{ whiteSpace: 'nowrap' }}>{formatMinutes(flexibleUsed)} / {formatMinutes(totalCapacity.flexibleMinutes)}</Text>
                </Space>
                <Progress
                  percent={Math.round((flexibleUsed / totalCapacity.flexibleMinutes) * 100)}
                  color="#FFA500"
                />
              </div>
            )}
            <div style={{ borderTop: '1px solid #f0f0f0', marginTop: 8, paddingTop: 8 }}>
              <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                <Text style={{ fontWeight: 600, whiteSpace: 'nowrap', color: '#1D2129' }}>Total Logged</Text>
                <Text style={{ fontWeight: 600, whiteSpace: 'nowrap', color: '#1D2129' }}>
                  {formatMinutes(accumulated.focused + accumulated.admin + accumulated.personal)}
                  {meetingMinutes > 0 && ` (+ ${formatMinutes(meetingMinutes)} meetings)`}
                </Text>
              </Space>
            </div>
          </Space>
        </div>

        {/* Quick Stats */}
        <Space style={{ width: '100%', justifyContent: 'space-around' }}>
          <Statistic
            title="Remaining Focus"
            value={Math.max(0, totalCapacity.focusMinutes - accumulated.focused)}
            suffix="min"
          />
          <Statistic
            title="Remaining Admin"
            value={Math.max(0, totalCapacity.adminMinutes - accumulated.admin)}
            suffix="min"
          />
          {totalCapacity.flexibleMinutes > 0 && (
            <Statistic
              title="Flexible Available"
              value={flexibleRemaining}
              suffix="min"
            />
          )}
        </Space>

        {/* Notification Alert */}
        {notification.visible && (
          <Alert
            type={notification.type}
            content={notification.message}
            closable
            onClose={() => setNotification(prev => ({ ...prev, visible: false }))}
          />
        )}
      </Space>
    </Card>
  )
}
