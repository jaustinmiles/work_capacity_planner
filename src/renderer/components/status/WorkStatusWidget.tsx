import { useEffect, useState, useMemo } from 'react'
import { Card, Space, Typography, Button, Tag, Progress, Statistic, Grid, Message } from '@arco-design/web-react'
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

  // Calculate total capacity for the day using the getTotalCapacity helper
  const totalCapacity = pattern ? getTotalCapacity(pattern.blocks) : { focus: 0, admin: 0, personal: 0 }

  const focusProgress = totalCapacity.focus > 0
    ? Math.round((accumulated.focused / totalCapacity.focus) * 100)
    : 0
  const adminProgress = totalCapacity.admin > 0
    ? Math.round((accumulated.admin / totalCapacity.admin) * 100)
    : 0

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

      {/* Work Progress Card */}
      <Card>
        <Space direction="vertical" style={{ width: '100%' }}>
          <Title heading={6}>Today&apos;s Progress</Title>

          <Row gutter={16}>
            <Col span={12}>
              <Statistic
                title="Focus Work"
                value={accumulated.focused}
                suffix={`/ ${totalCapacity.focus} min`}
              />
              <Progress percent={focusProgress} showText={false} />
            </Col>
            <Col span={12}>
              <Statistic
                title="Admin Work"
                value={accumulated.admin}
                suffix={`/ ${totalCapacity.admin} min`}
              />
              <Progress percent={adminProgress} showText={false} />
            </Col>
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
