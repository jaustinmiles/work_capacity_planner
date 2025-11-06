import { useState, useEffect } from 'react'
import { TaskType, TaskStatus, WorkBlockType } from '@shared/enums'
import { Card, Space, Typography, Progress, Tag, Button, Statistic } from '@arco-design/web-react'
import { IconSchedule, IconEdit, IconCaretRight, IconPlayArrow, IconSkipNext, IconPause, IconCheck } from '@arco-design/web-react/icon'
import { useTaskStore } from '../../store/useTaskStore'
import { WorkBlock, getCurrentBlock, getNextBlock } from '@shared/work-blocks-types'
import { NextScheduledItem } from '@shared/types'
import { getDatabase } from '../../services/database'
import { appEvents, EVENTS } from '../../utils/events'
import { getTotalCapacityForTaskType } from '@shared/capacity-calculator'
import { getCurrentTime } from '@shared/time-provider'
import { formatMinutes, parseTimeString } from '@shared/time-utils'
import dayjs from 'dayjs'
import { logger } from '@/logger'
import { Message } from '../common/Message'


const { Text } = Typography

interface WorkStatusWidgetProps {
  onEditSchedule?: () => void
}

// Work block type display mapping for consistent UI representation
const WORK_BLOCK_DISPLAY: Record<string, { label: string; icon: string }> = {
  [WorkBlockType.Focused]: { label: 'Focus', icon: '🎯' },
  [WorkBlockType.Admin]: { label: 'Admin', icon: '📋' },
  [WorkBlockType.Personal]: { label: 'Personal', icon: '👤' },
  [WorkBlockType.Mixed]: { label: 'Mixed', icon: '🔄' },
  [WorkBlockType.Flexible]: { label: 'Flexible', icon: '✨' },
}

// Helper function to get work block display
const getWorkBlockDisplay = (blockType: string): string => {
  const display = WORK_BLOCK_DISPLAY[blockType]
  if (!display) return `🔄 ${blockType}` // Fallback for unknown types
  return `${display.icon} ${display.label}`
}

// Log spam reduced by removing interval-based refresh - now uses event-driven updates only
export function WorkStatusWidget({ onEditSchedule }: WorkStatusWidgetProps) {
  const activeWorkSessions = useTaskStore(state => state.activeWorkSessions)
  const workPatternsLoading = useTaskStore(state => state.workPatternsLoading)
  const isLoading = useTaskStore(state => state.isLoading)
  // Use time provider for consistent time handling
  const [currentDate] = useState(() => {
    const now = getCurrentTime()
    return dayjs(now).format('YYYY-MM-DD')
  })
  const [pattern, setPattern] = useState<any>(null)
  const [accumulated, setAccumulated] = useState({ focused: 0, admin: 0, personal: 0 })
  const [meetingMinutes, setMeetingMinutes] = useState(0)
  const [currentBlock, setCurrentBlock] = useState<WorkBlock | null>(null)
  const [nextBlock, setNextBlock] = useState<WorkBlock | null>(null)
  const [nextTask, setNextTask] = useState<NextScheduledItem | null>(null)
  const [isLoadingNextTask, setIsLoadingNextTask] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)

  // Debug: Log when activeWorkSessions changes
  useEffect(() => {
    logger.ui.debug('[WorkStatusWidget] activeWorkSessions changed', {
      count: activeWorkSessions.size,
      sessionIds: Array.from(activeWorkSessions.keys()),
    })
  }, [activeWorkSessions])

  const loadNextTask = async () => {
    try {
      logger.ui.info('[WorkStatusWidget] 🎯 Loading next task...')
      setIsLoadingNextTask(true)

      const state = useTaskStore.getState()

      // CRITICAL: Wait for work patterns to load before calling getNextScheduledItem
      if (state.workPatternsLoading) {
        logger.ui.warn('[WorkStatusWidget] ⏳ Work patterns still loading, waiting...', {
          workPatternsLoading: state.workPatternsLoading,
          workPatternsCount: state.workPatterns.length,
        })

        // Wait up to 5 seconds for patterns to load
        const startTime = Date.now()
        while (state.workPatternsLoading && Date.now() - startTime < 5000) {
          await new Promise(resolve => setTimeout(resolve, 100))
          // Re-check state
          const currentState = useTaskStore.getState()
          if (!currentState.workPatternsLoading) {
            logger.ui.info('[WorkStatusWidget] ✅ Work patterns loaded, continuing...')
            break
          }
        }

        if (useTaskStore.getState().workPatternsLoading) {
          logger.ui.error('[WorkStatusWidget] ❌ Timeout waiting for work patterns to load')
          setNextTask(null)
          return
        }
      }

      logger.ui.info('[WorkStatusWidget] 📊 Calling getNextScheduledItem with loaded patterns', {
        workPatternsCount: useTaskStore.getState().workPatterns.length,
        tasksCount: useTaskStore.getState().tasks.length,
        workflowsCount: useTaskStore.getState().sequencedTasks.length,
      })

      const nextItem = await state.getNextScheduledItem()

      logger.ui.info('[WorkStatusWidget] ✅ Next scheduled item result:', {
        nextItem: nextItem ? {
          type: nextItem.type,
          id: nextItem.id,
          title: nextItem.title,
          estimatedDuration: nextItem.estimatedDuration,
          scheduledStartTime: nextItem.scheduledStartTime,
        } : null,
      })

      logger.ui.info('🚨 [WorkStatusWidget] ABOUT TO CALL setNextTask - THIS IS WHAT WILL DISPLAY:', {
        nextItem: nextItem ? {
          type: nextItem.type,
          id: nextItem.id,
          title: nextItem.title,
        } : null,
      })

      setNextTask(nextItem)
    } catch (error) {
      logger.ui.error('[WorkStatusWidget] ❌ Failed to load next task:', error)
    } finally {
      setIsLoadingNextTask(false)
    }
  }

  const loadWorkData = async () => {
    try {
      logger.ui.info('[WorkPatternLifeCycle] WorkStatusWidget.loadWorkData - START', {
        currentDate,
        timestamp: new Date().toISOString(),
      })

      const db = getDatabase()
      const [patternData, accumulatedData] = await Promise.all([
        db.getWorkPattern(currentDate),
        db.getTodayAccumulated(currentDate),
      ])

      logger.ui.debug('[WorkPatternLifeCycle] WorkStatusWidget.loadWorkData - Pattern loaded', {
        currentDate,
        patternFound: !!patternData,
        patternId: patternData?.id || null,
        blocksCount: patternData?.blocks?.length || 0,
        timestamp: new Date().toISOString(),
      })

      // DO NOT CALL loadNextTask() HERE - it will run before store.workPatterns are loaded
      // loadNextTask will be called by the separate useEffect watching workPatternsLoading

      setPattern(patternData)
      setAccumulated({
        focused: accumulatedData.focused || 0,
        admin: accumulatedData.admin || 0,
        personal: accumulatedData.personal || 0,
      })

      // Use time provider for consistent time handling
      const currentTime = getCurrentTime()
      const currentBlockData = patternData ? getCurrentBlock(patternData.blocks, currentTime) : null
      const nextBlockData = patternData ? getNextBlock(patternData.blocks, currentTime) : null

      setCurrentBlock(currentBlockData)
      setNextBlock(nextBlockData)

      let totalMeetingMinutes = 0
      if (patternData && patternData.meetings) {
        patternData.meetings.forEach((meeting: any) => {
          // TODO: Create MeetingType enum when more meeting types are added
          if (meeting.type === 'meeting') {
            // Use time utilities for parsing time strings
            const [startHour, startMin] = parseTimeString(meeting.startTime)
            const [endHour, endMin] = parseTimeString(meeting.endTime)
            const startMinutes = startHour * 60 + startMin
            const endMinutes = endHour * 60 + endMin
            const duration = endMinutes - startMinutes
            totalMeetingMinutes += duration > 0 ? duration : 0
          }
        })
      }
      setMeetingMinutes(totalMeetingMinutes)

      logger.ui.info('[WorkPatternLifeCycle] WorkStatusWidget.loadWorkData - COMPLETE', {
        currentDate,
        patternLoaded: !!patternData,
        currentBlockFound: !!currentBlockData,
        nextBlockFound: !!nextBlockData,
        accumulated: accumulatedData,
        meetingMinutes: totalMeetingMinutes,
        timestamp: new Date().toISOString(),
      })
    } catch (error) {
      logger.ui.error('Failed to load work data', {
        error: error instanceof Error ? error.message : String(error),
        currentDate,
      })
    }
  }

  // Separate useEffect to load next task ONLY when BOTH work patterns AND tasks/workflows are loaded
  useEffect(() => {
    if (!workPatternsLoading && !isLoading) {
      logger.ui.info('[WorkStatusWidget] ALL DATA READY, loading next task', {
        workPatternsLoading,
        isLoading,
      })
      loadNextTask()
    } else {
      logger.ui.warn('[WorkStatusWidget] Data still loading, NOT calling loadNextTask', {
        workPatternsLoading,
        isLoading,
      })
    }
  }, [workPatternsLoading, isLoading])

  useEffect(() => {
    loadWorkData()
    // Removed interval-based refresh to reduce log spam
    // State changes are handled through event listeners

    const handleTimeLogged = () => {
      loadWorkData()
      loadNextTask()  // Reload next task when time is logged
    }
    const handleWorkflowUpdated = () => {
      loadWorkData()
      loadNextTask()  // Reload next task when workflow is updated
    }
    const handleSessionChanged = () => {
      loadWorkData()
      loadNextTask()  // Reload next task when session changes
    }
    const handleDataRefresh = () => {
      loadWorkData()
      loadNextTask()  // Reload next task when data refreshes
    }

    appEvents.on(EVENTS.TIME_LOGGED, handleTimeLogged)
    appEvents.on(EVENTS.WORKFLOW_UPDATED, handleWorkflowUpdated)
    appEvents.on(EVENTS.SESSION_CHANGED, handleSessionChanged)
    appEvents.on(EVENTS.DATA_REFRESH_NEEDED, handleDataRefresh)

    return () => {
      appEvents.off(EVENTS.TIME_LOGGED, handleTimeLogged)
      appEvents.off(EVENTS.WORKFLOW_UPDATED, handleWorkflowUpdated)
      appEvents.off(EVENTS.SESSION_CHANGED, handleSessionChanged)
      appEvents.off(EVENTS.DATA_REFRESH_NEEDED, handleDataRefresh)
    }
  }, [currentDate])

  // formatMinutes is imported from @shared/time-utils


  // Tracking functions removed - functionality handled through time logging modal

  // Helper function to get the active work session
  const getActiveSession = () => {
    // Get the first active session from the Map
    const sessions = Array.from(activeWorkSessions.values())
    return sessions.length > 0 ? sessions[0] : null
  }

  // Handler functions for task actions
  // Skip to the next task in the priority queue
  const handleSkipToNextTask = async () => {
    logger.ui.info('[WorkStatusWidget] Skip to next task requested - incrementing skip index')
    // Increment the skip index to show the next task in priority order
    useTaskStore.getState().incrementNextTaskSkipIndex()
    // Reload the next task with the new skip index
    await loadNextTask()
  }

  const handlePauseCurrentTask = async () => {
    try {
      const activeSession = getActiveSession()
      if (!activeSession) {
        logger.ui.warn('[WorkStatusWidget] No active session to pause')
        return
      }

      setIsProcessing(true)

      const store = useTaskStore.getState()

      // Unified stop logic - both tasks and steps use store methods
      if (activeSession.stepId) {
        await store.pauseWorkOnStep(activeSession.stepId)
        Message.success('Work session paused')
      } else if (activeSession.taskId) {
        await store.pauseWorkOnTask(activeSession.taskId)
        Message.success('Work session stopped')
      }

      // Reload next task after stopping current one
      await loadNextTask()
    } catch (error) {
      logger.ui.error('[WorkStatusWidget] Failed to pause current task:', error)
      Message.error('Failed to pause work session')
    } finally {
      setIsProcessing(false)
    }
  }

  const handleCompleteCurrentTask = async () => {
    try {
      const activeSession = getActiveSession()
      if (!activeSession) {
        logger.ui.warn('[WorkStatusWidget] No active session to complete')
        return
      }

      setIsProcessing(true)

      const store = useTaskStore.getState()

      // Complete logic - both tasks and steps
      if (activeSession.stepId) {
        // For workflow steps, use completeStep
        await store.completeStep(activeSession.stepId, activeSession.plannedMinutes)
        Message.success(`Completed workflow step: ${activeSession.stepName || 'Step'}`)
      } else if (activeSession.taskId) {
        // For standalone tasks, mark as completed
        await store.updateTask(activeSession.taskId, {
          completed: true,
          overallStatus: TaskStatus.Completed,
        })
        Message.success(`Completed task: ${activeSession.taskName || 'Task'}`)
      }

      // Reload next task after completing current one
      await loadNextTask()
    } catch (error) {
      logger.ui.error('[WorkStatusWidget] Failed to complete current task:', error)
      Message.error('Failed to complete task')
    } finally {
      setIsProcessing(false)
    }
  }

  const handleStartNextTask = async () => {
    try {
      setIsProcessing(true)

      await useTaskStore.getState().startNextTask()

      // Show success notification with task name
      if (nextTask) {
        Message.success(`Started work on: ${nextTask.title}`)
      }

      // Don't reload next task here - UI now shows pause button, not next task
    } catch (error) {
      logger.ui.error('Failed to start next task', {
        error: error instanceof Error ? error.message : String(error),
      })
      Message.error('Failed to start work session')
    } finally {
      setIsProcessing(false)
    }
  }

  if (!pattern) {
    return (
      <Card>
        <Space direction="vertical" style={{ width: '100%', textAlign: 'center' }} size="large">
          <Text type="secondary">No work schedule defined for today</Text>
          {onEditSchedule && (
            <Button type="primary" onClick={onEditSchedule}>
              Create Schedule
            </Button>
          )}

          {/* Start Next Task section - works even without schedule */}
          <div style={{ background: '#f0f8ff', padding: '12px', borderRadius: '4px', border: '1px solid #1890ff' }}>
            <Space direction="vertical" style={{ width: '100%' }}>
              <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                <Text style={{ fontWeight: 600, color: '#1890ff' }}>🚀 Start Next Task</Text>
                <Button
                  type="text"
                  icon={<IconSkipNext />}
                  loading={isLoadingNextTask}
                  onClick={handleSkipToNextTask}
                  size="small"
                  title="Skip to next task"
                />
              </Space>

              {(() => {
                const activeSession = getActiveSession()

                if (isLoadingNextTask) {
                  return <Text type="secondary">Loading...</Text>
                } else if (activeSession) {
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
                    <Space style={{ width: '100%' }}>
                      <Button
                        type="outline"
                        status="warning"
                        icon={<IconPause />}
                        loading={isProcessing}
                        disabled={isLoadingNextTask}
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
                        disabled={isLoadingNextTask}
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
                      disabled={!nextTask || isLoadingNextTask}
                      onClick={handleStartNextTask}
                      style={{ width: '100%' }}
                    >
                      Start Next Task
                    </Button>
                  )
                }
              })()}
            </Space>
          </div>
        </Space>
      </Card>
    )
  }

  const totalCapacity = pattern.blocks.reduce((acc: any, block: WorkBlock) => {
    // Skip blocks without capacity field - they shouldn't exist but be safe
    if (!block.capacity) return acc

    acc.focusMinutes += getTotalCapacityForTaskType(block.capacity, TaskType.Focused)
    acc.adminMinutes += getTotalCapacityForTaskType(block.capacity, TaskType.Admin)
    acc.personalMinutes += getTotalCapacityForTaskType(block.capacity, TaskType.Personal)
    acc.flexibleMinutes += getTotalCapacityForTaskType(block.capacity, TaskType.Flexible)
    return acc
  }, { focusMinutes: 0, adminMinutes: 0, personalMinutes: 0, flexibleMinutes: 0 })

  // Calculate progress with ability to exceed 100% using flexible time
  const focusProgress = totalCapacity.focusMinutes > 0
    ? Math.round((accumulated.focused / totalCapacity.focusMinutes) * 100)
    : 0
  const adminProgress = totalCapacity.adminMinutes > 0
    ? Math.round((accumulated.admin / totalCapacity.adminMinutes) * 100)
    : 0

  // Calculate how much flexible time has been used
  const focusOverflow = Math.max(0, accumulated.focused - totalCapacity.focusMinutes)
  const adminOverflow = Math.max(0, accumulated.admin - totalCapacity.adminMinutes)
  const flexibleUsed = focusOverflow + adminOverflow
  const flexibleRemaining = Math.max(0, totalCapacity.flexibleMinutes - flexibleUsed)

  return (
    <Card
      title={
        <Space>
          <IconSchedule />
          <Text>Work Capacity - {dayjs().format('MMM D')}</Text>
        </Space>
      }
    >
      <Space direction="vertical" style={{ width: '100%' }} size="large">
        {/* Edit Schedule Button */}
        {onEditSchedule && (
          <div style={{ marginBottom: 8 }}>
            <Button size="small" icon={<IconEdit />} onClick={onEditSchedule}>
              Edit Schedule
            </Button>
          </div>
        )}
        {/* Planned Capacity */}
        <div style={{ background: '#f5f5f5', padding: '12px', borderRadius: '4px' }}>
          <Space direction="vertical" style={{ width: '100%' }}>
            <Text style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{"Today's Planned Capacity"}</Text>
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
                <Text style={{ fontWeight: 600, whiteSpace: 'nowrap', minWidth: 100, color: '#1D2129' }}>📊 Total Time:</Text>
                <Tag color="default">{formatMinutes(totalCapacity.focusMinutes + totalCapacity.adminMinutes + totalCapacity.personalMinutes + totalCapacity.flexibleMinutes + meetingMinutes)}</Tag>
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
                  {currentBlock.type === 'focused' ? '🎯 Focused' :
                    currentBlock.type === 'admin' ? '📋 Admin' :
                      currentBlock.type === 'personal' ? '👤 Personal' : '🔄 Mixed'}
                </Tag>
              </Space>
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
                      {getWorkBlockDisplay(nextBlock.type)}
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
                <Space>
                  <Text style={{ whiteSpace: 'nowrap' }}>{formatMinutes(accumulated.focused)} / {formatMinutes(totalCapacity.focusMinutes)}</Text>
                  <Text style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{focusProgress}%</Text>
                </Space>
              </Space>
              <Progress
                percent={Math.min(focusProgress, 100)}
                color={focusProgress >= 100 ? '#00b42a' : '#165dff'}
              />
              {focusOverflow > 0 && totalCapacity.flexibleMinutes > 0 && (
                <Progress
                  percent={Math.round(Math.min((focusOverflow / totalCapacity.flexibleMinutes) * 100, 100))}
                  color='#FFA500'
                  size='small'
                  style={{ marginTop: 2 }}
                />
              )}
            </div>
            <div>
              <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                <Text style={{ whiteSpace: 'nowrap' }}>Admin</Text>
                <Space>
                  <Text style={{ whiteSpace: 'nowrap' }}>{formatMinutes(accumulated.admin)} / {formatMinutes(totalCapacity.adminMinutes)}</Text>
                  <Text style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{adminProgress}%</Text>
                </Space>
              </Space>
              <Progress
                percent={Math.min(adminProgress, 100)}
                color={adminProgress >= 100 ? '#00b42a' : '#ff7d00'}
              />
              {adminOverflow > 0 && totalCapacity.flexibleMinutes > 0 && (
                <Progress
                  percent={Math.round(Math.min((adminOverflow / totalCapacity.flexibleMinutes) * 100, 100))}
                  color='#FFA500'
                  size='small'
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
                color='#722ed1'
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
                  color='#FFA500'
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

        {/* Start Next Task */}
        <div style={{ background: '#f0f8ff', padding: '12px', borderRadius: '4px', border: '1px solid #1890ff' }}>
          <Space direction="vertical" style={{ width: '100%' }}>
            <Space style={{ width: '100%', justifyContent: 'space-between' }}>
              <Text style={{ fontWeight: 600, color: '#1890ff' }}>🚀 Start Next Task</Text>
              <Button
                type="text"
                icon={<IconSkipNext />}
                loading={isLoadingNextTask}
                onClick={handleSkipToNextTask}
                size="small"
                title="Skip to next task"
              />
            </Space>

            {(() => {
              const activeSession = getActiveSession()

              if (isLoadingNextTask) {
                return <Text type="secondary">Loading...</Text>
              } else if (activeSession) {
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
                  <Space style={{ width: '100%' }}>
                    <Button
                      type="outline"
                      status="warning"
                      icon={<IconPause />}
                      loading={isProcessing}
                      disabled={isLoadingNextTask}
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
                      disabled={isLoadingNextTask}
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
                    disabled={!nextTask || isLoadingNextTask}
                    onClick={handleStartNextTask}
                    style={{ width: '100%' }}
                  >
                    Start Next Task
                  </Button>
                )
              }
            })()}
          </Space>
        </div>

      </Space>
    </Card>
  )
}
