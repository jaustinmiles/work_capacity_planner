import { useEffect, useState, useMemo } from 'react'
import { Card, Space, Typography, Button, Tag, Progress, Message, Statistic } from '@arco-design/web-react'
import { IconPlayArrow, IconPause, IconCheck, IconSkipNext, IconCaretRight } from '@arco-design/web-react/icon'
import { useTaskStore } from '../../store/useTaskStore'
import { formatMinutes } from '@shared/time-utils'
import { TaskStatus, TaskType, WorkBlockType } from '@shared/enums'
import dayjs from 'dayjs'
import { logger } from '@/logger'
import { getCurrentTime } from '@shared/time-provider'
import { getDatabase } from '../../services/database'
import { WorkBlock } from '@shared/work-blocks-types'
import { getTotalCapacityForTaskType } from '@shared/capacity-calculator'
import { appEvents, EVENTS } from '../../utils/events'

const { Title, Text } = Typography

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

// Helper to calculate duration
const calculateDuration = (startTime: string, endTime: string): number => {
  const startParts = startTime.split(':').map(Number)
  const endParts = endTime.split(':').map(Number)
  if (startParts.length !== 2 || endParts.length !== 2) return 0

  const [startHour = 0, startMin = 0] = startParts
  const [endHour = 0, endMin = 0] = endParts
  const startMinutes = startHour * 60 + startMin
  const endMinutes = endHour * 60 + endMin
  return endMinutes > startMinutes ? endMinutes - startMinutes : 0
}

export function WorkStatusWidget() {
  // Subscribe to all relevant store state
  const activeWorkSessions = useTaskStore(state => state.activeWorkSessions)
  const workPatternsLoading = useTaskStore(state => state.workPatternsLoading)
  const workPatterns = useTaskStore(state => state.workPatterns)
  const isLoading = useTaskStore(state => state.isLoading)
  const tasks = useTaskStore(state => state.tasks)
  const sequencedTasks = useTaskStore(state => state.sequencedTasks)
  const getNextScheduledItem = useTaskStore(state => state.getNextScheduledItem)
  const loadWorkPatterns = useTaskStore(state => state.loadWorkPatterns)
  const nextTaskSkipIndex = useTaskStore(state => state.nextTaskSkipIndex)

  const [isProcessing, setIsProcessing] = useState(false)
  const [nextTask, setNextTask] = useState<any>(null)

  // Local UI state
  const [pattern, setPattern] = useState<any>(null)
  const [accumulated, setAccumulated] = useState({ focused: 0, admin: 0, personal: 0 })
  const [currentBlock, setCurrentBlock] = useState<WorkBlock | null>(null)
  const [nextBlock, setNextBlock] = useState<WorkBlock | null>(null)
  const [meetingMinutes, setMeetingMinutes] = useState(0)

  // Get current date
  const currentDate = useMemo(() => {
    const now = getCurrentTime()
    return dayjs(now).format('YYYY-MM-DD')
  }, [])

  // Consolidated data loading effect with proper sequencing
  useEffect(() => {
    let mounted = true

    const loadAllData = async () => {
      // Step 1: Ensure work patterns are loaded
      if (workPatternsLoading) {
        return // Wait for patterns to finish loading
      }

      // If patterns aren't loaded yet, trigger load
      if (!workPatterns || workPatterns.length === 0) {
        loadWorkPatterns()
        return // Will re-run when patterns load
      }

      // Step 2: Process pattern data and accumulated times
      try {
        const pattern = workPatterns.find(p => p.date === currentDate)

        if (!mounted) return

        if (pattern) {
          setPattern(pattern)

          // Get current and next blocks
          const now = getCurrentTime()
          const currentTimeStr = now.toTimeString().slice(0, 5)

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

          if (!mounted) return

          setAccumulated({
            focused: accumulatedData.focused || 0,
            admin: accumulatedData.admin || 0,
            personal: accumulatedData.personal || 0,
          })
        } else {
          // No pattern for today, clear everything
          setPattern(null)
          setCurrentBlock(null)
          setNextBlock(null)
          setMeetingMinutes(0)
          setAccumulated({ focused: 0, admin: 0, personal: 0 })
        }
      } catch (error) {
        logger.ui.error('Failed to load work data', { error })
      }

      // Step 3: Load next task (only if no active session)
      if (!mounted) return

      if (activeWorkSessions.size === 0 && !isLoading) {
        try {
          const item = await getNextScheduledItem()
          if (mounted) {
            setNextTask(item)
          }
        } catch (err) {
          logger.ui.error('Failed to get next task', { error: err })
          if (mounted) {
            setNextTask(null)
          }
        }
      } else if (activeWorkSessions.size > 0) {
        setNextTask(null)
      }
    }

    loadAllData()

    return () => {
      mounted = false
    }
  }, [
    currentDate,
    workPatterns,
    workPatternsLoading,
    isLoading,
    activeWorkSessions.size,
    nextTaskSkipIndex,
    // Simplified dependencies - only track actual data changes
    tasks.length,
    sequencedTasks.length,
    loadWorkPatterns,
    getNextScheduledItem,
  ])

  // Listen for events that require data refresh
  useEffect(() => {
    const handleDataChange = async () => {
      // Only refresh next task if no active session
      if (activeWorkSessions.size === 0 && !workPatternsLoading && !isLoading) {
        try {
          const item = await getNextScheduledItem()
          setNextTask(item)
        } catch (err) {
          logger.ui.error('Failed to refresh next task on event', { error: err })
          setNextTask(null)
        }
      }

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

    appEvents.on(EVENTS.TASK_UPDATED, handleDataChange)
    appEvents.on(EVENTS.WORKFLOW_UPDATED, handleDataChange)
    appEvents.on(EVENTS.SESSION_CHANGED, handleDataChange)
    appEvents.on(EVENTS.TIME_LOGGED, handleDataChange)

    return () => {
      appEvents.off(EVENTS.TASK_UPDATED, handleDataChange)
      appEvents.off(EVENTS.WORKFLOW_UPDATED, handleDataChange)
      appEvents.off(EVENTS.SESSION_CHANGED, handleDataChange)
      appEvents.off(EVENTS.TIME_LOGGED, handleDataChange)
    }
  }, [activeWorkSessions.size, workPatternsLoading, isLoading, pattern, currentDate, getNextScheduledItem])

  // Get active session helper
  const getActiveSession = () => {
    const sessions = Array.from(activeWorkSessions.values())
    return sessions.length > 0 ? sessions[0] : null
  }

  // Handler functions - always get fresh state to avoid stale closures
  const handleCompleteCurrentTask = async () => {
    try {
      setIsProcessing(true)

      // Get fresh state directly from store
      const store = useTaskStore.getState()
      const sessions = Array.from(store.activeWorkSessions.values())
      const activeSession = sessions.length > 0 ? sessions[0] : null

      if (!activeSession) {
        logger.ui.warn('No active session to complete')
        return
      }

      logger.ui.info('Completing task/step', {
        sessionId: activeSession.id,
        stepId: activeSession.stepId,
        taskId: activeSession.taskId,
        stepName: activeSession.stepName,
        taskName: activeSession.taskName,
      })

      if (activeSession.stepId) {
        await store.completeStep(activeSession.stepId)
        Message.success(`Completed workflow step: ${activeSession.stepName || 'Step'}`)
      } else if (activeSession.taskId) {
        // Pause work first to log time
        const progress = store.getWorkSessionProgress(activeSession.taskId)
        if (progress.isActive && !progress.isPaused) {
          await store.pauseWorkOnTask(activeSession.taskId)
        }

        // Mark task as completed
        await store.updateTask(activeSession.taskId, {
          completed: true,
          overallStatus: TaskStatus.Completed,
        })

        Message.success(`Completed task: ${activeSession.taskName || 'Task'}`)
      }
    } catch (error) {
      logger.ui.error('Failed to complete task', { error })
      Message.error('Failed to complete task')
    } finally {
      setIsProcessing(false)
    }
  }

  const handlePauseCurrentTask = async () => {
    try {
      setIsProcessing(true)

      // Get fresh state directly from store
      const store = useTaskStore.getState()
      const sessions = Array.from(store.activeWorkSessions.values())
      const activeSession = sessions.length > 0 ? sessions[0] : null

      if (!activeSession) {
        logger.ui.warn('No active session to pause')
        return
      }

      logger.ui.info('Pausing work', {
        sessionId: activeSession.id,
        stepId: activeSession.stepId,
        taskId: activeSession.taskId,
      })

      if (activeSession.stepId) {
        await store.pauseWorkOnStep(activeSession.stepId)
      } else if (activeSession.taskId) {
        await store.pauseWorkOnTask(activeSession.taskId)
      }

      Message.success('Work session paused')
    } catch (error) {
      logger.ui.error('Failed to pause task', { error })
      Message.error('Failed to pause work session')
    } finally {
      setIsProcessing(false)
    }
  }

  const handleStartNextTask = async () => {
    try {
      setIsProcessing(true)

      // Get fresh state
      const store = useTaskStore.getState()

      // Log what we're about to start for debugging
      const taskToStart = nextTask
      if (taskToStart) {
        logger.ui.info('Starting next task', {
          title: taskToStart.title,
          type: taskToStart.type,
          id: taskToStart.id,
          estimatedDuration: taskToStart.estimatedDuration,
        })
      }

      await store.startNextTask()

      if (taskToStart) {
        Message.success(`Started work on: ${taskToStart.title}`)
      }
    } catch (error) {
      logger.ui.error('Failed to start task', { error })
      Message.error('Failed to start work session')
    } finally {
      setIsProcessing(false)
    }
  }

  const handleSkipToNextTask = async () => {
    useTaskStore.getState().incrementNextTaskSkipIndex()
    // Next task will be recomputed automatically via useEffect
  }

  const activeSession = getActiveSession()
  const hasActiveSession = !!(activeSession && activeWorkSessions.size > 0)

  // Calculate total capacity for the day - PROPER calculation for ALL types
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
        // Fallback for blocks without capacity data - should never happen but handle gracefully
        // For mixed blocks without capacity data, we can't know the actual split ratio
        // so we skip them rather than assuming an incorrect ratio
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
          // Mixed blocks MUST have capacity data to know split ratios
          // We cannot assume any ratio - log warning and skip
          logger.ui.warn('Mixed block without capacity data - cannot determine split ratio', { block })
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

  return (
    <Card>
      <Space direction="vertical" style={{ width: '100%' }} size="medium">
        <Title heading={6}>Work Status</Title>

        {/* Start Next Task - MOVED TO TOP */}
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
                disabled={hasActiveSession}
              />
            </Space>

            {(() => {
              const activeSession = getActiveSession()

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

            {(() => {
              const activeSession = getActiveSession()
              const isActive = !!activeSession

              // Render buttons based on active session state
              if (isActive) {
                // Show both Pause and Complete buttons when task is running
                return (
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
                )
              } else {
                // Show Start button when no task is running
                return (
                  <Button
                    type="primary"
                    icon={<IconPlayArrow />}
                    loading={isProcessing}
                    disabled={!nextTask}
                    onClick={handleStartNextTask}
                    style={{ width: '100%', marginTop: 8 }}
                  >
                    Start Next Task
                  </Button>
                )
              }
            })()}
          </Space>
        </div>

        {/* Planned Capacity */}
        <div style={{ background: '#f5f5f5', padding: '12px', borderRadius: '4px' }}>
          <Space direction="vertical" style={{ width: '100%' }}>
            <Text style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{'Today\'s Planned Capacity'}</Text>
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
      </Space>
    </Card>
  )
}
