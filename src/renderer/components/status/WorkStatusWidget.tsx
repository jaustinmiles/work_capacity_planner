import { useState, useEffect } from 'react'
import { Card, Space, Typography, Progress, Tag, Button, Statistic } from '@arco-design/web-react'
import { IconSchedule, IconEdit, IconCaretRight, IconPlayArrow, IconRefresh, IconPause } from '@arco-design/web-react/icon'
import { useTaskStore } from '../../store/useTaskStore'
import { WorkBlock, getCurrentBlock, getNextBlock } from '@shared/work-blocks-types'
import { NextScheduledItem } from '@shared/types'
import { calculateDuration } from '@shared/time-utils'
import { getDatabase } from '../../services/database'
import { appEvents, EVENTS } from '../../utils/events'
import dayjs from 'dayjs'
import { logger } from '../../utils/logger'
import { Message } from '../common/Message'


const { Text } = Typography

interface WorkStatusWidgetProps {
  onEditSchedule?: () => void
}

export function WorkStatusWidget({ onEditSchedule }: WorkStatusWidgetProps) {
  const { isLoading, activeWorkSessions } = useTaskStore()
  const [currentDate] = useState(dayjs().format('YYYY-MM-DD'))
  const [pattern, setPattern] = useState<any>(null)
  const [accumulated, setAccumulated] = useState({ focused: 0, admin: 0, personal: 0 })
  const [meetingMinutes, setMeetingMinutes] = useState(0)
  const [currentBlock, setCurrentBlock] = useState<WorkBlock | null>(null)
  const [nextBlock, setNextBlock] = useState<WorkBlock | null>(null)
  const [nextTask, setNextTask] = useState<NextScheduledItem | null>(null)
  const [isLoadingNextTask, setIsLoadingNextTask] = useState(false)
  const [isStartingTask, setIsStartingTask] = useState(false)
  // Tracking state removed - handled through time logging modal

  // Debug: Log when activeWorkSessions changes
  useEffect(() => {
    logger.ui.info('[WorkStatusWidget] activeWorkSessions changed', {
      size: activeWorkSessions.size,
      sessions: Array.from(activeWorkSessions.entries()).map(([key, session]) => ({
        key,
        id: session.id,
        isPaused: session.isPaused,
        taskId: session.taskId,
        stepId: session.stepId,
      })),
    })
  }, [activeWorkSessions])

  useEffect(() => {
    loadWorkData()
    const interval = setInterval(loadWorkData, 60000) // Update every minute

    // Listen for time logging events
    const handleTimeLogged = () => {
      loadWorkData()
    }

    // Listen for workflow updates (which might change step types)
    const handleWorkflowUpdated = () => {
      loadWorkData()
    }

    // Listen for session changes and general refresh events
    const handleSessionChanged = () => {
      loadWorkData()
    }

    const handleDataRefresh = () => {
      loadWorkData()
    }

    appEvents.on(EVENTS.TIME_LOGGED, handleTimeLogged)
    appEvents.on(EVENTS.WORKFLOW_UPDATED, handleWorkflowUpdated)
    appEvents.on(EVENTS.SESSION_CHANGED, handleSessionChanged)
    appEvents.on(EVENTS.DATA_REFRESH_NEEDED, handleDataRefresh)

    return () => {
      clearInterval(interval)
      appEvents.off(EVENTS.TIME_LOGGED, handleTimeLogged)
      appEvents.off(EVENTS.WORKFLOW_UPDATED, handleWorkflowUpdated)
      appEvents.off(EVENTS.SESSION_CHANGED, handleSessionChanged)
      appEvents.off(EVENTS.DATA_REFRESH_NEEDED, handleDataRefresh)
    }
  }, [currentDate])

  useEffect(() => {
    if (pattern) {
      setCurrentBlock(getCurrentBlock(pattern.blocks))
      setNextBlock(getNextBlock(pattern.blocks))
    }
  }, [pattern])

  // Load next task when data finishes loading or when data changes
  useEffect(() => {
    // Only load next task if data has finished loading
    if (!isLoading) {
      logger.ui.info('[WorkStatusWidget] Data loaded, loading next task')
      loadNextTask()
    } else {
      logger.ui.info('[WorkStatusWidget] Store is loading, waiting for data...')
    }
  }, [isLoading]) // Depend on isLoading to run when data finishes loading

  // Listen for data refresh events to reload next task
  useEffect(() => {
    const handleDataRefresh = () => {
      logger.ui.info('[WorkStatusWidget] Data refresh event, reloading next task')
      loadNextTask()
    }

    appEvents.on(EVENTS.DATA_REFRESH_NEEDED, handleDataRefresh)
    return () => {
      appEvents.off(EVENTS.DATA_REFRESH_NEEDED, handleDataRefresh)
    }
  }, []) // Empty dependency array - run once on mount

  const loadNextTask = async () => {
    try {
      logger.ui.debug('[WorkStatusWidget] Loading next task...')
      setIsLoadingNextTask(true)

      // Get current store state for logging
      const state = useTaskStore.getState()
      logger.ui.debug('[WorkStatusWidget] Store state:', {
        totalTasks: state.tasks.length,
        totalWorkflows: state.sequencedTasks.length,
        isLoading: state.isLoading,
      })

      const nextItem = await state.getNextScheduledItem()
      logger.ui.info('[WorkStatusWidget] Next scheduled item result:', {
        nextItem: nextItem ? {
          type: nextItem.type,
          id: nextItem.id,
          title: nextItem.title,
          estimatedDuration: nextItem.estimatedDuration,
        } : null,
      })

      setNextTask(nextItem)
    } catch (error) {
      logger.ui.error('[WorkStatusWidget] Failed to load next task:', error)
    } finally {
      setIsLoadingNextTask(false)
      logger.ui.info('[WorkStatusWidget] Finished loading next task')
    }
  }

  // Check if there's currently an active work session
  const getActiveSession = () => {
    const sessions = Array.from(activeWorkSessions.values())
    const activeSession = sessions.find(session => !session.isPaused) || null

    // Check for active (non-paused) sessions

    return activeSession
  }

  const handleStartNextTask = async () => {
    try {
      // Start button clicked

      setIsStartingTask(true)

      await useTaskStore.getState().startNextTask()

      // Show success notification with task name
      if (nextTask) {
        Message.success(`Started work on: ${nextTask.title}`)
      }

      // Reload the next task after starting one
      await loadNextTask()
    } catch (error) {
      logger.ui.error('[WorkStatusWidget] Failed to start next task:', error)
      Message.error('Failed to start work session')
    } finally {
      setIsStartingTask(false)
    }
  }

  const handlePauseCurrentTask = async () => {
    try {
      const activeSession = getActiveSession()
      if (!activeSession) {
        logger.ui.warn('[WorkStatusWidget] No active session to pause')
        return
      }

      // Pause button clicked
      setIsStartingTask(true)

      const store = useTaskStore.getState()

      // Determine if it's a task or step and pause accordingly
      if (activeSession.stepId) {
        await store.pauseWorkOnStep(activeSession.stepId)
        Message.success('Work session paused')
      } else if (activeSession.taskId) {
        // For regular tasks, we stop the session entirely. Pause/resume is only available for workflow steps.
        const sessionKey = activeSession.taskId

        // Remove from store activeWorkSessions first
        const newSessions = new Map(activeWorkSessions)
        newSessions.delete(sessionKey)

        // Update store
        useTaskStore.setState({ activeWorkSessions: newSessions })

        Message.success('Work session stopped')
      }

      await loadNextTask()
    } catch (error) {
      logger.ui.error('[WorkStatusWidget] Failed to pause current task:', error)
      Message.error('Failed to pause work session')
    } finally {
      setIsStartingTask(false)
    }
  }

  const handleRefreshNextTask = async () => {
    logger.ui.info('[WorkStatusWidget] Manual refresh requested')
    await loadNextTask()
  }

  const loadWorkData = async () => {
    try {
      // [WorkPatternLifeCycle] START: WorkStatusWidget loading work data
      logger.ui.info('[WorkPatternLifeCycle] WorkStatusWidget.loadWorkData - START', {
        currentDate,
        timestamp: new Date().toISOString(),
        localTime: new Date().toLocaleTimeString('en-US', { hour12: false }),
      })

      const db = getDatabase()
      const [patternData, accumulatedData] = await Promise.all([
        db.getWorkPattern(currentDate),
        db.getTodayAccumulated(currentDate),
      ])

      // [WorkPatternLifeCycle] Log pattern retrieval result
      logger.ui.debug('[WorkPatternLifeCycle] WorkStatusWidget.loadWorkData - Pattern loaded', {
        currentDate,
        patternFound: !!patternData,
        patternId: patternData?.id || null,
        blocksCount: patternData?.blocks?.length || 0,
        blocks: patternData?.blocks?.map((b: any) => ({
          startTime: b.startTime,
          endTime: b.endTime,
          type: b.type,
          capacity: b.capacity,
        })) || [],
        meetingsCount: patternData?.meetings?.length || 0,
        timestamp: new Date().toISOString(),
      })

      // Load next task separately (updates UI state)
      await loadNextTask()

      setPattern(patternData)
      setAccumulated({
        focused: accumulatedData.focused || 0,
        admin: accumulatedData.admin || 0,
        personal: accumulatedData.personal || 0,
      })

      // [WorkPatternLifeCycle] Log current block detection
      const currentTime = new Date()
      const currentBlockData = patternData ? getCurrentBlock(patternData.blocks, currentTime) : null
      const nextBlockData = patternData ? getNextBlock(patternData.blocks, currentTime) : null

      logger.ui.debug('[WorkPatternLifeCycle] WorkStatusWidget - Block detection', {
        currentTime: currentTime.toTimeString().slice(0, 5),
        currentBlock: currentBlockData ? {
          startTime: currentBlockData.startTime,
          endTime: currentBlockData.endTime,
          type: currentBlockData.type,
        } : null,
        nextBlock: nextBlockData ? {
          startTime: nextBlockData.startTime,
          endTime: nextBlockData.endTime,
          type: nextBlockData.type,
        } : null,
        timestamp: new Date().toISOString(),
      })

      // Calculate meeting time from work sessions
      let totalMeetingMinutes = 0
      if (patternData && patternData.meetings) {
        patternData.meetings.forEach((meeting: any) => {
          if (meeting.type === 'meeting') {
            const [startHour, startMin] = meeting.startTime.split(':').map(Number)
            const [endHour, endMin] = meeting.endTime.split(':').map(Number)
            const startMinutes = startHour * 60 + startMin
            const endMinutes = endHour * 60 + endMin
            const duration = endMinutes - startMinutes
            totalMeetingMinutes += duration > 0 ? duration : 0
          }
        })
      }
      setMeetingMinutes(totalMeetingMinutes)

      // [WorkPatternLifeCycle] COMPLETE: WorkStatusWidget finished loading
      logger.ui.info('[WorkPatternLifeCycle] WorkStatusWidget.loadWorkData - COMPLETE', {
        currentDate,
        patternLoaded: !!patternData,
        currentBlockFound: !!currentBlockData,
        nextBlockFound: !!nextBlockData,
        accumulated: {
          focused: accumulatedData.focused || 0,
          admin: accumulatedData.admin || 0,
          personal: accumulatedData.personal || 0,
        },
        meetingMinutes: totalMeetingMinutes,
        timestamp: new Date().toISOString(),
      })
    } catch (error) {
      logger.ui.error('[WorkPatternLifeCycle] WorkStatusWidget.loadWorkData - ERROR', {
        currentDate,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
      })
      logger.ui.error('Failed to load work data:', error)
    }
  }

  const formatMinutes = (minutes: number) => {
    // Handle NaN or invalid values
    if (!minutes || isNaN(minutes)) {
      return '0m'
    }
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    return hours > 0 ? `${hours}h ${mins > 0 ? `${mins}m` : ''}` : `${mins}m`
  }

  const getBlockDuration = (block: WorkBlock) => {
    return calculateDuration(block.startTime, block.endTime)
  }

  const getBlockCapacity = (block: WorkBlock) => {
    const duration = getBlockDuration(block)

    if (block.capacity) {
      return {
        focusMinutes: block.capacity.focusMinutes || 0,
        adminMinutes: block.capacity.adminMinutes || 0,
      }
    } else if (block.type === 'focused') {
      return { focusMinutes: duration, adminMinutes: 0 }
    } else if (block.type === 'admin') {
      return { focusMinutes: 0, adminMinutes: duration }
    } else if (block.type === 'mixed') {
      return { focusMinutes: duration / 2, adminMinutes: duration / 2 }
    } else {
      // flexible and universal blocks - full duration available for either type
      return { focusMinutes: duration, adminMinutes: duration }
    }
  }

  // Tracking functions removed - functionality handled through time logging modal

  if (!pattern) {
    return (
      <Card>
        <Space direction="vertical" style={{ width: '100%', textAlign: 'center' }} size="large">
          <Text type="secondary">No work schedule defined for today</Text>
          <Button type="primary" onClick={onEditSchedule}>
            Create Schedule
          </Button>

          {/* Start Next Task section - works even without schedule */}
          <div style={{ background: '#f0f8ff', padding: '12px', borderRadius: '4px', border: '1px solid #1890ff' }}>
            <Space direction="vertical" style={{ width: '100%' }}>
              <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                <Text style={{ fontWeight: 600, color: '#1890ff' }}>🚀 Start Next Task</Text>
                <Button
                  type="text"
                  icon={<IconRefresh />}
                  loading={isLoadingNextTask}
                  onClick={handleRefreshNextTask}
                  size="small"
                  title="Refresh task list"
                />
              </Space>

              {isLoadingNextTask ? (
                <Text type="secondary">Loading...</Text>
              ) : nextTask ? (
                <Space direction="vertical" style={{ width: '100%' }}>
                  <Text>Next: {nextTask.title}</Text>
                  <Space>
                    <Tag color="blue">{formatMinutes(nextTask.estimatedDuration)}</Tag>
                    <Tag color={nextTask.type === 'step' ? 'purple' : 'green'}>
                      {nextTask.type === 'step' ? '🔄 Workflow Step' : '📋 Task'}
                    </Tag>
                  </Space>
                </Space>
              ) : (
                <Text type="secondary">No tasks available</Text>
              )}

              {(() => {
                const activeSession = getActiveSession()
                const isActive = !!activeSession

                // Render button based on active session state

                return (
                  <Button
                    type={isActive ? 'outline' : 'primary'}
                    status={isActive ? 'warning' : undefined}
                    icon={isActive ? <IconPause /> : <IconPlayArrow />}
                    loading={isStartingTask}
                    disabled={(!nextTask && !isActive) || isLoadingNextTask}
                    onClick={isActive ? handlePauseCurrentTask : handleStartNextTask}
                    style={{ width: '100%' }}
                  >
                    {isActive ? 'Pause Current Task' : 'Start Next Task'}
                  </Button>
                )
              })()}
            </Space>
          </div>
        </Space>
      </Card>
    )
  }

  const totalCapacity = pattern.blocks.reduce((acc: any, block: WorkBlock) => {
    const capacity = getBlockCapacity(block)
    acc.focusMinutes += capacity.focusMinutes
    acc.adminMinutes += capacity.adminMinutes
    return acc
  }, { focusMinutes: 0, adminMinutes: 0 })

  const focusProgress = totalCapacity.focusMinutes > 0
    ? Math.round((accumulated.focused / totalCapacity.focusMinutes) * 100)
    : 0
  const adminProgress = totalCapacity.adminMinutes > 0
    ? Math.round((accumulated.admin / totalCapacity.adminMinutes) * 100)
    : 0

  return (
    <Card
      title={
        <Space>
          <IconSchedule />
          <Text>Work Capacity - {dayjs().format('MMM D')}</Text>
        </Space>
      }
      extra={
        <Space>
          {onEditSchedule && (
            <Button size="small" icon={<IconEdit />} onClick={onEditSchedule}>
              Edit Schedule
            </Button>
          )}
        </Space>
      }
    >
      <Space direction="vertical" style={{ width: '100%' }} size="large">
        {/* Planned Capacity */}
        <div style={{ background: '#f5f5f5', padding: '12px', borderRadius: '4px' }}>
          <Space direction="vertical" style={{ width: '100%' }}>
            <Text style={{ fontWeight: 600 }}>{"Today's Planned Capacity"}</Text>
            <Space style={{ width: '100%', justifyContent: 'space-between' }}>
              <Text>🎯 Focus Time:</Text>
              <Tag color="blue">{formatMinutes(totalCapacity.focusMinutes)}</Tag>
            </Space>
            <Space style={{ width: '100%', justifyContent: 'space-between' }}>
              <Text>📋 Admin Time:</Text>
              <Tag color="orange">{formatMinutes(totalCapacity.adminMinutes)}</Tag>
            </Space>
            <Space style={{ width: '100%', justifyContent: 'space-between' }}>
              <Text>🤝 Meeting Time:</Text>
              <Tag color="purple">{formatMinutes(meetingMinutes)}</Tag>
            </Space>
            <div style={{ borderTop: '1px solid #e5e5e5', marginTop: 8, paddingTop: 8 }}>
              <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                <Text style={{ fontWeight: 600, whiteSpace: 'nowrap', minWidth: 100 }}>📊 Total Time:</Text>
                <Tag color="green">{formatMinutes(totalCapacity.focusMinutes + totalCapacity.adminMinutes + meetingMinutes)}</Tag>
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
                      {nextBlock.type === 'focused' ? '🎯 Focus' :
                       nextBlock.type === 'admin' ? '📋 Admin' :
                       nextBlock.type === 'personal' ? '👤 Personal' : '🔄 Mixed'}
                    </Tag>
                  </Space>
                  <Text type="secondary" style={{ fontSize: '12px' }}>
                    {(() => {
                      const capacity = getBlockCapacity(nextBlock)
                      return `Capacity: ${formatMinutes(capacity.focusMinutes)} focus, ${formatMinutes(capacity.adminMinutes)} admin`
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
          <Text type="secondary" style={{ marginBottom: '8px', display: 'block' }}>Completed Today</Text>
          <Space direction="vertical" style={{ width: '100%' }}>
            <div>
              <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                <Text>Focus</Text>
                <Text>{formatMinutes(accumulated.focused)} / {formatMinutes(totalCapacity.focusMinutes)}</Text>
              </Space>
              <Progress percent={focusProgress} color={focusProgress >= 100 ? '#00b42a' : '#165dff'} />
            </div>
            <div>
              <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                <Text>Admin</Text>
                <Text>{formatMinutes(accumulated.admin)} / {formatMinutes(totalCapacity.adminMinutes)}</Text>
              </Space>
              <Progress percent={adminProgress} color={adminProgress >= 100 ? '#00b42a' : '#ff7d00'} />
            </div>
            <div>
              <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                <Text>Personal</Text>
                <Text>{formatMinutes(accumulated.personal)}</Text>
              </Space>
              <Progress
                percent={accumulated.personal > 0 ? 100 : 0}
                color='#722ed1'
              />
            </div>
            <div style={{ borderTop: '1px solid #f0f0f0', marginTop: 8, paddingTop: 8 }}>
              <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                <Text style={{ fontWeight: 600 }}>Total Logged</Text>
                <Text style={{ fontWeight: 600 }}>
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
        </Space>

        {/* Start Next Task */}
        <div style={{ background: '#f0f8ff', padding: '12px', borderRadius: '4px', border: '1px solid #1890ff' }}>
          <Space direction="vertical" style={{ width: '100%' }}>
            <Space style={{ width: '100%', justifyContent: 'space-between' }}>
              <Text style={{ fontWeight: 600, color: '#1890ff' }}>🚀 Start Next Task</Text>
              <Button
                type="text"
                icon={<IconRefresh />}
                loading={isLoadingNextTask}
                onClick={handleRefreshNextTask}
                size="small"
                title="Refresh task list"
              />
            </Space>

            {isLoadingNextTask ? (
              <Text type="secondary">Loading...</Text>
            ) : nextTask ? (
              <Space direction="vertical" style={{ width: '100%' }}>
                <Text>Next: {nextTask.title}</Text>
                <Space>
                  <Tag color="blue">{formatMinutes(nextTask.estimatedDuration)}</Tag>
                  <Tag color={nextTask.type === 'step' ? 'purple' : 'green'}>
                    {nextTask.type === 'step' ? '🔄 Workflow Step' : '📋 Task'}
                  </Tag>
                </Space>
              </Space>
            ) : (
              <Text type="secondary">No tasks available</Text>
            )}

            {(() => {
              const activeSession = getActiveSession()
              const isActive = !!activeSession

              // Render button based on active session state

              return (
                <Button
                  type={isActive ? 'outline' : 'primary'}
                  status={isActive ? 'warning' : undefined}
                  icon={isActive ? <IconPause /> : <IconPlayArrow />}
                  loading={isStartingTask}
                  disabled={(!nextTask && !isActive) || isLoadingNextTask}
                  onClick={isActive ? handlePauseCurrentTask : handleStartNextTask}
                  style={{ width: '100%' }}
                >
                  {isActive ? 'Pause Current Task' : 'Start Next Task'}
                </Button>
              )
            })()}
          </Space>
        </div>

      </Space>
    </Card>
  )
}
