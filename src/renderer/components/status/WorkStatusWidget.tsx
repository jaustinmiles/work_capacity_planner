import { useEffect, useState, useMemo } from 'react'
import { Card, Space, Typography, Button, Tag, Progress, Grid, Message } from '@arco-design/web-react'
import { IconPlayArrow, IconPause, IconCheck, IconSkipNext } from '@arco-design/web-react/icon'
import { useTaskStore } from '../../store/useTaskStore'
import { formatMinutes } from '@shared/time-utils'
import { TaskStatus } from '@shared/enums'
import dayjs from 'dayjs'
import { logger } from '@/logger'
import { getCurrentTime } from '@shared/time-provider'
import { getDatabase } from '../../services/database'
import { WorkBlock, getTotalCapacity } from '@shared/work-blocks-types'

const { Title, Text } = Typography
const { Row, Col } = Grid

function getBlockDisplay(block: WorkBlock | null) {
  if (!block) return { icon: '🔍', label: 'No block' }
  switch (block.type) {
    case 'focused':
      return { icon: '🎯', label: 'Focus' }
    case 'admin':
      return { icon: '📊', label: 'Admin' }
    case 'personal':
      return { icon: '🏠', label: 'Personal' }
    case 'mixed':
      return { icon: '🔄', label: 'Mixed' }
    default:
      return { icon: '❓', label: 'Unknown' }
  }
}

function formatBlockTime(block: WorkBlock | null) {
  if (!block) return 'No current block'
  const display = getBlockDisplay(block)
  return `${display.icon} ${display.label}`
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

  // Load work patterns on mount
  useEffect(() => {
    loadWorkPatterns()
  }, []) // Only run once on mount

  // Reactively compute next task when dependencies change
  useEffect(() => {
    if (activeWorkSessions.size === 0 && !workPatternsLoading && !isLoading) {
      // Get next task when no active session
      getNextScheduledItem().then(item => {
        setNextTask(item)
      }).catch(err => {
        logger.ui.error('Failed to get next task', { error: err })
        setNextTask(null)
      })
    } else if (activeWorkSessions.size > 0) {
      // Clear next task when session is active
      setNextTask(null)
    }
  }, [
    activeWorkSessions.size,
    tasks.length, // React to task changes
    sequencedTasks.length, // React to workflow changes
    // React to step status changes
    sequencedTasks.map(t => t.steps.map(s => s.status).join(',')).join(';'),
    workPatternsLoading,
    isLoading,
  ])

  // Load work pattern data when patterns are loaded
  useEffect(() => {
    // Don't try to load data if patterns are still loading
    if (workPatternsLoading) {
      return
    }

    const loadWorkData = async () => {
      try {
        const pattern = workPatterns.find(p => p.date === currentDate)
        if (pattern) {
          setPattern(pattern)

          // Get current blocks
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
        } else {
          // No pattern for today, clear the state
          setPattern(null)
          setCurrentBlock(null)
          setNextBlock(null)
        }

        // Calculate meeting minutes if pattern has meetings
        if (pattern && pattern.meetings) {
          const totalMeetingMinutes = pattern.meetings.reduce((total: number, meeting: any) => {
            const duration = calculateDuration(meeting.startTime, meeting.endTime)
            return total + duration
          }, 0)
          setMeetingMinutes(totalMeetingMinutes)
        } else {
          setMeetingMinutes(0)
        }

        // Calculate accumulated time
        const accumulatedData = await getDatabase().getTodayAccumulated(currentDate)
        const accumulated = {
          focused: accumulatedData.focused || 0,
          admin: accumulatedData.admin || 0,
          personal: accumulatedData.personal || 0,
        }
        setAccumulated(accumulated)
      } catch (error) {
        logger.ui.error('Failed to load work data', { error })
      }
    }

    loadWorkData()
  }, [currentDate, workPatterns, workPatternsLoading])

  // Get active session helper
  const getActiveSession = () => {
    const sessions = Array.from(activeWorkSessions.values())
    return sessions.length > 0 ? sessions[0] : null
  }

  // Handler functions
  const handleCompleteCurrentTask = async () => {
    try {
      setIsProcessing(true)

      const activeSession = getActiveSession()
      if (!activeSession) return

      const store = useTaskStore.getState()

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

      const activeSession = getActiveSession()
      if (!activeSession) return

      const store = useTaskStore.getState()

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

      const taskToStart = nextTask
      await useTaskStore.getState().startNextTask()

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

  // Render loading state
  if (workPatternsLoading || isLoading) {
    return (
      <Card>
        <Space direction="vertical" style={{ width: '100%' }}>
          <Title heading={6}>Work Status</Title>
          <Text type="secondary">Loading...</Text>
        </Space>
      </Card>
    )
  }

  // Render no pattern state
  if (!pattern) {
    return (
      <Card>
        <Space direction="vertical" style={{ width: '100%' }}>
          <Title heading={6}>Work Status</Title>
          <Text type="secondary">No work pattern configured for today</Text>
        </Space>
      </Card>
    )
  }

  const activeSession = getActiveSession()
  const hasActiveSession = !!(activeSession && activeWorkSessions.size > 0)

  // Calculate total capacity for the day including flexible time
  const totalCapacity = useMemo(() => {
    if (!pattern || !pattern.blocks) {
      return { focus: 0, admin: 0, personal: 0, flexible: 0, mixed: 0 }
    }

    const baseCapacity = getTotalCapacity(pattern.blocks)

    // Calculate flexible and mixed capacity separately
    let flexibleMinutes = 0
    let mixedMinutes = 0

    pattern.blocks.forEach((block: WorkBlock) => {
      const duration = calculateDuration(block.startTime, block.endTime)
      if (block.type === 'flexible') {
        flexibleMinutes += duration
      } else if (block.type === 'mixed' && block.capacity?.splitRatio) {
        // Mixed blocks are already counted in focus/admin, but track total for display
        mixedMinutes += duration
      }
    })

    return {
      ...baseCapacity,
      flexible: flexibleMinutes,
      mixed: mixedMinutes,
    }
  }, [pattern])

  // Calculate progress and overflow
  const focusProgress = totalCapacity.focus > 0
    ? Math.round((accumulated.focused / totalCapacity.focus) * 100)
    : 0
  const adminProgress = totalCapacity.admin > 0
    ? Math.round((accumulated.admin / totalCapacity.admin) * 100)
    : 0
  const personalProgress = totalCapacity.personal > 0
    ? Math.round((accumulated.personal / totalCapacity.personal) * 100)
    : 0

  // Calculate overflow into flexible time
  const focusOverflow = Math.max(0, accumulated.focused - totalCapacity.focus)
  const adminOverflow = Math.max(0, accumulated.admin - totalCapacity.admin)
  const flexibleUsed = focusOverflow + adminOverflow
  const flexibleRemaining = Math.max(0, totalCapacity.flexible - flexibleUsed)

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="large">
      {/* Start Next Task Card */}
      <Card>
        <Space direction="vertical" style={{ width: '100%' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Title heading={6} style={{ margin: 0 }}>
              {hasActiveSession ? 'Current Task' : 'Start Next Task'}
            </Title>
            <Button
              type="text"
              icon={<IconSkipNext />}
              onClick={handleSkipToNextTask}
              size="small"
              title="Skip to next task"
              disabled={hasActiveSession}
            />
          </div>

          <div style={{ minHeight: 60, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            {hasActiveSession ? (
              <Space direction="vertical" style={{ width: '100%' }}>
                <Text>Working on: {activeSession.taskName || activeSession.stepName || 'Unknown'}</Text>
                <Space>
                  <Tag color="blue">{formatMinutes(activeSession.plannedMinutes)}</Tag>
                  <Tag color={activeSession.stepId ? 'purple' : 'green'}>
                    {activeSession.stepId ? '🔄 Workflow Step' : '📋 Task'}
                  </Tag>
                </Space>
              </Space>
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

            {hasActiveSession ? (
              <Space style={{ width: '100%', marginTop: 16 }}>
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
                loading={isProcessing}
                disabled={!nextTask}
                onClick={handleStartNextTask}
                style={{ width: '100%', marginTop: 16 }}
              >
                Start Next Task
              </Button>
            )}
          </div>
        </Space>
      </Card>

      {/* Capacity Summary Card */}
      <Card>
        <Space direction="vertical" style={{ width: '100%' }}>
          <Title heading={6}>Capacity Summary</Title>

          <div style={{ background: '#f0f8ff', padding: '12px', borderRadius: '4px', border: '1px solid #1890ff' }}>
            <Space direction="vertical" style={{ width: '100%' }} size="small">
              <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                <Text style={{ whiteSpace: 'nowrap' }}>🎯 Focus Time:</Text>
                <Tag color="blue">{formatMinutes(totalCapacity.focus)}</Tag>
              </Space>
              <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                <Text style={{ whiteSpace: 'nowrap' }}>📋 Admin Time:</Text>
                <Tag color="orange">{formatMinutes(totalCapacity.admin)}</Tag>
              </Space>
              {totalCapacity.personal > 0 && (
                <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                  <Text style={{ whiteSpace: 'nowrap' }}>🌱 Personal Time:</Text>
                  <Tag color="green">{formatMinutes(totalCapacity.personal)}</Tag>
                </Space>
              )}
              {totalCapacity.flexible > 0 && (
                <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                  <Text style={{ whiteSpace: 'nowrap' }}>🔄 Flexible Time:</Text>
                  <Tag color="gold">{formatMinutes(totalCapacity.flexible)}</Tag>
                </Space>
              )}
              {meetingMinutes > 0 && (
                <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                  <Text style={{ whiteSpace: 'nowrap' }}>🤝 Meeting Time:</Text>
                  <Tag color="purple">{formatMinutes(meetingMinutes)}</Tag>
                </Space>
              )}
              <div style={{ borderTop: '1px solid #e5e5e5', marginTop: 8, paddingTop: 8 }}>
                <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                  <Text style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>📊 Total Time:</Text>
                  <Text style={{ fontSize: '14px', fontWeight: 500 }}>
                    {formatMinutes(totalCapacity.focus + totalCapacity.admin + totalCapacity.personal + totalCapacity.flexible + meetingMinutes)}
                  </Text>
                </Space>
              </div>
            </Space>
          </div>
        </Space>
      </Card>

      {/* Work Progress Card */}
      <Card>
        <Space direction="vertical" style={{ width: '100%' }}>
          <Title heading={6}>Today&apos;s Progress</Title>

          <Row gutter={[16, 16]}>
            <Col span={12}>
              <div>
                <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 4 }}>
                  <Text>🎯 Focus</Text>
                  <Text>{formatMinutes(accumulated.focused)} / {formatMinutes(totalCapacity.focus)}</Text>
                </Space>
                <Progress
                  percent={Math.min(focusProgress, 100)}
                  color={focusProgress >= 100 ? '#00b42a' : '#165dff'}
                />
                {focusOverflow > 0 && totalCapacity.flexible > 0 && (
                  <Progress
                    percent={Math.round(Math.min((focusOverflow / totalCapacity.flexible) * 100, 100))}
                    color="#FFA500"
                    size="small"
                    style={{ marginTop: 2 }}
                  />
                )}
              </div>
            </Col>
            <Col span={12}>
              <div>
                <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 4 }}>
                  <Text>📋 Admin</Text>
                  <Text>{formatMinutes(accumulated.admin)} / {formatMinutes(totalCapacity.admin)}</Text>
                </Space>
                <Progress
                  percent={Math.min(adminProgress, 100)}
                  color={adminProgress >= 100 ? '#00b42a' : '#ff7d00'}
                />
                {adminOverflow > 0 && totalCapacity.flexible > 0 && (
                  <Progress
                    percent={Math.round(Math.min((adminOverflow / totalCapacity.flexible) * 100, 100))}
                    color="#FFA500"
                    size="small"
                    style={{ marginTop: 2 }}
                  />
                )}
              </div>
            </Col>
            {totalCapacity.personal > 0 && (
              <Col span={12}>
                <div>
                  <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 4 }}>
                    <Text>🌱 Personal</Text>
                    <Text>{formatMinutes(accumulated.personal)} / {formatMinutes(totalCapacity.personal)}</Text>
                  </Space>
                  <Progress
                    percent={personalProgress}
                    color={personalProgress >= 100 ? '#00b42a' : '#52c41a'}
                  />
                </div>
              </Col>
            )}
            {totalCapacity.flexible > 0 && (
              <Col span={12}>
                <div>
                  <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 4 }}>
                    <Text>🔄 Flexible Used</Text>
                    <Text style={{ color: flexibleUsed > totalCapacity.flexible ? 'red' : 'inherit' }}>
                      {formatMinutes(flexibleUsed)} / {formatMinutes(totalCapacity.flexible)}
                    </Text>
                  </Space>
                  <Progress
                    percent={Math.round((flexibleUsed / totalCapacity.flexible) * 100)}
                    color={flexibleUsed > totalCapacity.flexible ? '#ff4d4f' : '#FFA500'}
                  />
                  {flexibleRemaining > 0 && (
                    <Text type="secondary" style={{ fontSize: 12, marginTop: 4 }}>
                      {formatMinutes(flexibleRemaining)} remaining
                    </Text>
                  )}
                </div>
              </Col>
            )}
          </Row>

          <Space style={{ marginTop: 16 }}>
            <Tag color="blue">Current: {formatBlockTime(currentBlock)}</Tag>
            {nextBlock && (
              <Tag color="gray">Next: {nextBlock.startTime} - {getBlockDisplay(nextBlock).label}</Tag>
            )}
          </Space>
        </Space>
      </Card>
    </Space>
  )
}
