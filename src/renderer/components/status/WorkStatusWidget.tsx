import { useEffect, useState, useMemo } from 'react'
import { Card, Space, Typography, Button, Tag, Progress, Statistic, Alert } from '@arco-design/web-react'
import { IconPlayArrow, IconPause, IconCheck, IconSkipNext, IconCaretRight } from '@arco-design/web-react/icon'
import { useResponsive } from '../../providers/ResponsiveProvider'
import { useTaskStore } from '../../store/useTaskStore'
import { useSchedulerStore } from '../../store/useSchedulerStore'
import { useWorkPatternStore } from '../../store/useWorkPatternStore'
import { useSortedUserTaskTypes } from '../../store/useUserTaskTypeStore'
import { formatMinutes, calculateDuration, formatTimeHHMM, dateToYYYYMMDD } from '@shared/time-utils'
import { TaskStatus, NotificationType, WorkBlockType } from '@shared/enums'
import { logger } from '@/logger'
import { getCurrentTime } from '@shared/time-provider'
import { getDatabase } from '../../services/database'
import { WorkBlock, getTotalCapacityByType } from '@shared/work-blocks-types'
import { isSystemBlock, isSingleTypeBlock, isComboBlock, UserTaskType } from '@shared/user-task-types'

const { Text } = Typography

// Custom notification state for React 19 compatibility
interface NotificationState {
  message: string
  type: NotificationType
  visible: boolean
}

function getBlockDisplay(block: WorkBlock | null, userTypes: UserTaskType[]) {
  if (!block) return { icon: '🔍', label: 'No block' }
  const { typeConfig } = block
  if (isSystemBlock(typeConfig)) {
    return { icon: '🚫', label: typeConfig.systemType === WorkBlockType.Sleep ? 'Sleep' : 'Blocked' }
  }
  if (isSingleTypeBlock(typeConfig)) {
    // Look up user type for display name and emoji
    const userType = userTypes.find(t => t.id === typeConfig.typeId)
    const emoji = userType?.emoji || '📋'
    const name = userType?.name || typeConfig.typeId
    return { icon: emoji, label: name }
  }
  if (isComboBlock(typeConfig)) {
    // Look up user types for combo block display
    const typeNames = typeConfig.allocations.map(a => {
      const userType = userTypes.find(t => t.id === a.typeId)
      return userType?.name || a.typeId
    }).join('/')
    return { icon: '🔄', label: typeNames }
  }
  return { icon: '❓', label: 'Unknown' }
}

// calculateDuration is now imported from @shared/time-utils

export function WorkStatusWidget() {
  // Responsive state for compact layouts
  const { isCompact } = useResponsive()

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

  // User-defined task types
  const userTaskTypes = useSortedUserTaskTypes()

  // Scheduler store state
  const nextScheduledItem = useSchedulerStore(state => state.nextScheduledItem)

  const [isProcessing, setIsProcessing] = useState(false)
  const [nextTask, setNextTask] = useState<any>(null)

  // Local UI state for display only
  const [pattern, setPattern] = useState<any>(null)
  // Dynamic accumulated time by typeId
  const [accumulatedByType, setAccumulatedByType] = useState<Record<string, number>>({})
  const [accumulatedTotal, setAccumulatedTotal] = useState(0)
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

          // Load accumulated time (dynamic by type)
          const accumulatedData = await getDatabase().getTodayAccumulated(currentDate)
          setAccumulatedByType(accumulatedData.byType || {})
          setAccumulatedTotal(accumulatedData.total || 0)
        } else {
          // No pattern for today
          setPattern(null)
          setCurrentBlock(null)
          setNextBlock(null)
          setMeetingMinutes(0)
          setAccumulatedByType({})
          setAccumulatedTotal(0)
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
          setAccumulatedByType(accumulatedData.byType || {})
          setAccumulatedTotal(accumulatedData.total || 0)
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

  // Calculate total capacity for the day using dynamic type system
  // Returns a map of typeId -> planned minutes
  const capacityByType = useMemo(() => {
    if (!pattern || !pattern.blocks) {
      return {} as Record<string, number>
    }
    return getTotalCapacityByType(pattern.blocks, [])
  }, [pattern])

  // Calculate total planned minutes (sum of all type capacities)
  const totalPlannedMinutes = useMemo(() => {
    return Object.values(capacityByType).reduce((sum, mins) => sum + mins, 0)
  }, [capacityByType])

  const hasActiveSession = !!activeSession

  return (
    <Card>
      <Space direction="vertical" style={{ width: '100%' }} size="medium">
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
                style={{ width: '100%', marginTop: 8, minWidth: 0 }}
              >
                {workPatternsLoading || isLoading ? 'Loading...' : (isCompact ? 'Start' : 'Start Next Task')}
              </Button>
            )}
          </Space>
        </div>

        {/* Planned Capacity - Dynamic based on user-defined types */}
        <div style={{ background: '#f5f5f5', padding: '12px', borderRadius: '4px' }}>
          <Space direction="vertical" style={{ width: '100%' }}>
            <Text style={{ fontWeight: 600 }}>{isCompact ? 'Capacity' : "Today's Planned Capacity"}</Text>
            {userTaskTypes.length === 0 ? (
              <Text type="secondary">No task types defined. Go to Settings to create types.</Text>
            ) : (
              userTaskTypes.map(taskType => {
                const plannedMinutes = capacityByType[taskType.id] || 0
                return (
                  <Space key={taskType.id} style={{ width: '100%', justifyContent: 'space-between', flexWrap: 'wrap', gap: 4 }}>
                    <Text style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {taskType.emoji} {isCompact ? '' : taskType.name + ':'}
                    </Text>
                    <Tag style={{ backgroundColor: taskType.color, color: '#fff', border: 'none' }}>
                      {formatMinutes(plannedMinutes)}
                    </Tag>
                  </Space>
                )
              })
            )}
            <Space style={{ width: '100%', justifyContent: 'space-between', flexWrap: 'wrap', gap: 4 }}>
              <Text>🤝 {isCompact ? '' : 'Meeting Time:'}</Text>
              <Tag color="purple">{formatMinutes(meetingMinutes)}</Tag>
            </Space>
            <div style={{ borderTop: '1px solid #e5e5e5', marginTop: 8, paddingTop: 8 }}>
              <Space style={{ width: '100%', justifyContent: 'space-between', flexWrap: 'wrap', gap: 4 }}>
                <Text style={{ fontWeight: 600 }}>📊 {isCompact ? '' : 'Total:'}</Text>
                <Text style={{ fontSize: '14px', fontWeight: 500 }}>
                  {formatMinutes(totalPlannedMinutes + meetingMinutes)}
                </Text>
              </Space>
            </div>
          </Space>
        </div>

        {/* Current/Next Block */}
        <div>
          {currentBlock ? (
            <Space direction="vertical" style={{ width: '100%' }}>
              <Text type="secondary">{isCompact ? 'Current Block' : 'Currently in Work Block'}</Text>
              <Space wrap>
                <Tag color="green" icon={<IconCaretRight />}>
                  {currentBlock.startTime} - {currentBlock.endTime}
                </Tag>
                <Tag>
                  {getBlockDisplay(currentBlock, userTaskTypes).icon} {!isCompact && getBlockDisplay(currentBlock, userTaskTypes).label}
                </Tag>
              </Space>
              {!isCompact && currentBlock.capacity && (
                <Text type="secondary" style={{ fontSize: '12px' }}>
                  Capacity: {formatMinutes(currentBlock.capacity.totalMinutes)}
                </Text>
              )}
            </Space>
          ) : (
            <Space direction="vertical" style={{ width: '100%' }}>
              {nextBlock ? (
                <>
                  <Text type="secondary">{isCompact ? 'Next Block' : 'Next Work Block'}</Text>
                  <Space wrap>
                    <Tag color="cyan">
                      {nextBlock.startTime} - {nextBlock.endTime}
                    </Tag>
                    <Tag>
                      {getBlockDisplay(nextBlock, userTaskTypes).icon} {!isCompact && getBlockDisplay(nextBlock, userTaskTypes).label}
                    </Tag>
                  </Space>
                  {!isCompact && (
                    <Text type="secondary" style={{ fontSize: '12px' }}>
                      {nextBlock.capacity
                        ? `Capacity: ${formatMinutes(nextBlock.capacity.totalMinutes)}`
                        : 'No capacity data'}
                    </Text>
                  )}
                </>
              ) : (
                <Text type="secondary">{isCompact ? 'No more blocks' : 'No more work blocks today'}</Text>
              )}
            </Space>
          )}
        </div>

        {/* Progress - Dynamic based on user-defined types */}
        <div>
          <Text type="secondary" style={{ marginBottom: '8px', display: 'block' }}>{isCompact ? 'Progress' : 'Completed Today'}</Text>
          <Space direction="vertical" style={{ width: '100%' }}>
            {userTaskTypes.length === 0 ? (
              <Text type="secondary">No task types defined yet.</Text>
            ) : (
              userTaskTypes.map(taskType => {
                const logged = accumulatedByType[taskType.id] || 0
                const planned = capacityByType[taskType.id] || 0
                // Don't show misleading 100% for unplanned work - show 0% instead
                const progress = planned > 0 ? Math.round((logged / planned) * 100) : 0
                const hasUnplannedWork = planned === 0 && logged > 0

                return (
                  <div key={taskType.id}>
                    <Space style={{ width: '100%', justifyContent: 'space-between', flexWrap: 'wrap', gap: 4 }}>
                      <Text style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {taskType.emoji} {isCompact ? '' : taskType.name}
                      </Text>
                      <Text>
                        {formatMinutes(logged)}{!isCompact && planned > 0 && ` / ${formatMinutes(planned)}`}
                      </Text>
                      {!isCompact && planned > 0 && (
                        <Text style={{ fontWeight: 600 }}>{progress}%</Text>
                      )}
                    </Space>
                    <Progress
                      percent={hasUnplannedWork ? 100 : Math.min(progress, 100)}
                      color={
                        hasUnplannedWork
                          ? '#ff7d00'  // Orange warning for unplanned work
                          : progress >= 100
                            ? '#00b42a'
                            : taskType.color
                      }
                    />
                    {hasUnplannedWork && (
                      <Text type="warning" style={{ fontSize: '11px' }}>
                        {isCompact ? '⚠️' : '⚠️ Unplanned work logged'}
                      </Text>
                    )}
                  </div>
                )
              })
            )}
            <div style={{ borderTop: '1px solid #f0f0f0', marginTop: 8, paddingTop: 8 }}>
              <Space style={{ width: '100%', justifyContent: 'space-between', flexWrap: 'wrap', gap: 4 }}>
                <Text style={{ fontWeight: 600, color: '#1D2129' }}>{isCompact ? 'Total' : 'Total Logged'}</Text>
                <Text style={{ fontWeight: 600, color: '#1D2129' }}>
                  {formatMinutes(accumulatedTotal)}
                  {!isCompact && meetingMinutes > 0 && ` (+ ${formatMinutes(meetingMinutes)} meetings)`}
                </Text>
              </Space>
            </div>
          </Space>
        </div>

        {/* Quick Stats - Dynamic based on user-defined types */}
        {userTaskTypes.length > 0 && (
          <Space style={{ width: '100%', justifyContent: 'space-around', flexWrap: 'wrap' }}>
            {userTaskTypes.slice(0, 3).map(taskType => {
              const logged = accumulatedByType[taskType.id] || 0
              const planned = capacityByType[taskType.id] || 0
              const remaining = Math.max(0, planned - logged)

              return (
                <Statistic
                  key={taskType.id}
                  title={`Remaining ${taskType.name}`}
                  value={remaining}
                  suffix="min"
                />
              )
            })}
          </Space>
        )}

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
