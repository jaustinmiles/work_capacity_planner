/**
 * StartNextTaskWidget — Rewritten with proper reactive data flow.
 *
 * Design principles:
 * - Active session: read from task/workflow arrays (never lose names on refresh)
 * - Next task: computed locally from scheduleResult (no cached derived state)
 * - No debounce dependency — useMemo recomputes instantly on source change
 * - Completed tasks filtered out by checking task/step status directly
 */

import { useState, useMemo, ReactElement, useCallback } from 'react'
import { Typography, Button, Tag, Alert, Popover, InputNumber } from '@arco-design/web-react'
import { IconPlayArrow, IconPause, IconCheck, IconSkipNext, IconClockCircle } from '@arco-design/web-react/icon'
import { useResponsive } from '../../providers/ResponsiveProvider'
import { useTaskStore } from '../../store/useTaskStore'
import { useSchedulerStore } from '../../store/useSchedulerStore'
import { useWorkPatternStore } from '../../store/useWorkPatternStore'
import { formatMinutes } from '@shared/time-utils'
import { TaskStatus, StepStatus, NotificationType, UnifiedScheduleItemType } from '@shared/enums'
import { processCompletion } from '@shared/task-completion-processor'
import { logger } from '@/logger'

const { Text } = Typography

export function StartNextTaskWidget(): ReactElement {
  const { isCompact } = useResponsive()

  // Raw data sources — these update synchronously on completion
  const tasks = useTaskStore(s => s.tasks)
  const sequencedTasks = useTaskStore(s => s.sequencedTasks)
  const activeWorkSessions = useTaskStore(s => s.activeWorkSessions)
  const isLoading = useTaskStore(s => s.isLoading)

  // Actions
  const startNextTask = useTaskStore(s => s.startNextTask)
  const pauseWorkOnTask = useTaskStore(s => s.pauseWorkOnTask)
  const pauseWorkOnStep = useTaskStore(s => s.pauseWorkOnStep)
  const startWaitOnStep = useTaskStore(s => s.startWaitOnStep)
  const startWaitOnTask = useTaskStore(s => s.startWaitOnTask)
  const completeStep = useTaskStore(s => s.completeStep)
  const updateTask = useTaskStore(s => s.updateTask)
  const getWorkSessionProgress = useTaskStore(s => s.getWorkSessionProgress)
  const incrementNextTaskSkipIndex = useTaskStore(s => s.incrementNextTaskSkipIndex)

  // Schedule data — for computing next task locally
  const scheduleResult = useSchedulerStore(s => s.scheduleResult)
  const nextTaskSkipIndex = useSchedulerStore(s => s.nextTaskSkipIndex)
  const workPatternsLoading = useWorkPatternStore(s => s.isLoading)

  const [isProcessing, setIsProcessing] = useState(false)
  const [waitMinutes, setWaitMinutes] = useState(30)
  const [showWaitPopover, setShowWaitPopover] = useState(false)
  const [notification, setNotification] = useState<{ message: string; type: NotificationType; visible: boolean }>({
    message: '', type: NotificationType.Info, visible: false,
  })

  const showNotification = useCallback((message: string, type: NotificationType = NotificationType.Info) => {
    setNotification({ message, type, visible: true })
    setTimeout(() => setNotification(prev => ({ ...prev, visible: false })), 3000)
  }, [])

  // =========================================================================
  // ACTIVE SESSION — derive from activeWorkSessions + task/workflow names
  // Names are looked up from task/workflow arrays (always current, survive refresh)
  // =========================================================================
  const activeSession = useMemo(() => {
    if (activeWorkSessions.size === 0) return null
    const session = Array.from(activeWorkSessions.values())[0]
    if (!session) return null

    // Look up names from source data (not from session object which may be stale)
    let taskName = session.taskName ?? ''
    let stepName = session.stepName ?? ''

    if (session.stepId) {
      const workflow = sequencedTasks.find(w => w.steps.some(s => s.id === session.stepId))
      const step = workflow?.steps.find(s => s.id === session.stepId)
      taskName = workflow?.name ?? taskName
      stepName = step?.name ?? stepName
    } else if (session.taskId) {
      const task = tasks.find(t => t.id === session.taskId)
      taskName = task?.name ?? taskName
    }

    return { ...session, taskName, stepName }
  }, [activeWorkSessions, tasks, sequencedTasks])

  // =========================================================================
  // NEXT TASK — computed locally from scheduleResult + task arrays
  // Recomputes instantly when ANY source changes (no debounce dependency)
  // =========================================================================
  const nextTask = useMemo(() => {
    if (activeSession) return null
    if (!scheduleResult || workPatternsLoading || isLoading) return null

    // Build set of waiting item IDs (deps on these block scheduling)
    const waitingIds = new Set(
      scheduleResult.scheduled
        .filter(item => item.isWaitingOnAsync)
        .map(item => item.originalTaskId || item.id),
    )

    // Filter to actionable work items
    const workItems = scheduleResult.scheduled
      .filter(item => {
        if (!item.startTime) return false
        // Exclude non-work items
        if (
          item.type === UnifiedScheduleItemType.Meeting ||
          item.type === UnifiedScheduleItemType.Break ||
          item.type === UnifiedScheduleItemType.BlockedTime ||
          item.type === UnifiedScheduleItemType.AsyncWait
        ) return false
        // Exclude completed
        if (item.completed) return false
        // Exclude waiting on async
        if (item.isWaitingOnAsync) return false
        // Exclude items with waiting dependencies
        if (item.dependencies?.some(depId => waitingIds.has(depId))) return false

        // CRITICAL: Double-check against live task/step data
        // This catches the case where scheduleResult is stale but task arrays are current
        const itemId = item.originalTaskId || item.id
        if (item.type === UnifiedScheduleItemType.WorkflowStep) {
          const workflow = sequencedTasks.find(w => w.steps.some(s => s.id === itemId))
          const step = workflow?.steps.find(s => s.id === itemId)
          if (!step) return false
          if (step.status === StepStatus.Completed || step.status === StepStatus.Waiting || step.status === StepStatus.Skipped) return false
        } else {
          const task = tasks.find(t => t.id === itemId)
          if (!task) return false
          if (task.completed || task.overallStatus === TaskStatus.Completed || task.overallStatus === TaskStatus.Waiting) return false
        }

        return true
      })
      .sort((a, b) => (a.startTime?.getTime() ?? 0) - (b.startTime?.getTime() ?? 0))

    if (workItems.length === 0 || nextTaskSkipIndex >= workItems.length) return null

    const item = workItems[nextTaskSkipIndex]
    if (!item?.startTime) return null

    const itemId = item.originalTaskId || item.id

    // Look up names from live data
    if (item.type === UnifiedScheduleItemType.WorkflowStep) {
      const workflow = sequencedTasks.find(w => w.steps.some(s => s.id === itemId))
      const step = workflow?.steps.find(s => s.id === itemId)
      if (step && workflow) {
        return {
          id: step.id,
          title: step.name,
          workflowName: workflow.name,
          estimatedDuration: step.duration,
          loggedMinutes: step.actualDuration ?? 0,
          type: 'step' as const,
        }
      }
    }

    const task = tasks.find(t => t.id === itemId)
    return {
      id: itemId,
      title: task?.name ?? item.name,
      workflowName: undefined,
      estimatedDuration: item.duration,
      loggedMinutes: task?.actualDuration ?? 0,
      type: 'task' as const,
    }
  }, [activeSession, scheduleResult, tasks, sequencedTasks, nextTaskSkipIndex, workPatternsLoading, isLoading])

  // =========================================================================
  // HANDLERS
  // =========================================================================

  const handleStart = useCallback(async () => {
    try {
      setIsProcessing(true)
      await startNextTask()
      showNotification(nextTask ? `Started: ${nextTask.title}` : 'Started work', NotificationType.Success)
    } catch (error) {
      showNotification(error instanceof Error ? error.message : 'Failed to start', NotificationType.Error)
    } finally {
      setIsProcessing(false)
    }
  }, [startNextTask, nextTask, showNotification])

  const handlePause = useCallback(async () => {
    if (!activeSession) return
    try {
      setIsProcessing(true)
      if (activeSession.stepId) await pauseWorkOnStep(activeSession.stepId)
      else if (activeSession.taskId) await pauseWorkOnTask(activeSession.taskId)
      showNotification('Paused', NotificationType.Success)
    } catch (_error) {
      showNotification('Failed to pause', NotificationType.Error)
    } finally {
      setIsProcessing(false)
    }
  }, [activeSession, pauseWorkOnStep, pauseWorkOnTask, showNotification])

  const handleComplete = useCallback(async () => {
    if (!activeSession) return
    try {
      setIsProcessing(true)
      if (activeSession.stepId) {
        await completeStep(activeSession.stepId)
        showNotification(`Done: ${activeSession.stepName || 'Step'}`, NotificationType.Success)
      } else if (activeSession.taskId) {
        const progress = getWorkSessionProgress(activeSession.taskId)
        if (progress.isActive && !progress.isPaused) {
          await pauseWorkOnTask(activeSession.taskId)
        }
        const task = tasks.find(t => t.id === activeSession.taskId)
        if (task) {
          const result = processCompletion({ entityType: 'task', entityId: task.id, task })
          await updateTask(activeSession.taskId, {
            completed: result.finalStatus === TaskStatus.Completed,
            completedAt: result.completedAt,
            overallStatus: result.finalStatus,
          })
        }
        showNotification(`Done: ${activeSession.taskName || 'Task'}`, NotificationType.Success)
      }
    } catch (error) {
      logger.ui.error('Failed to complete', { error })
      showNotification('Failed to complete', NotificationType.Error)
    } finally {
      setIsProcessing(false)
    }
  }, [activeSession, completeStep, pauseWorkOnTask, updateTask, tasks, getWorkSessionProgress, showNotification])

  const handleWait = useCallback(async () => {
    if (!activeSession || waitMinutes <= 0) return
    try {
      setIsProcessing(true)
      if (activeSession.stepId) await startWaitOnStep(activeSession.stepId, waitMinutes)
      else if (activeSession.taskId) await startWaitOnTask(activeSession.taskId, waitMinutes)
      showNotification(`Wait: ${waitMinutes}min`, NotificationType.Success)
      setShowWaitPopover(false)
    } catch (_error) {
      showNotification('Failed to start wait', NotificationType.Error)
    } finally {
      setIsProcessing(false)
    }
  }, [activeSession, waitMinutes, startWaitOnStep, startWaitOnTask, showNotification])

  // =========================================================================
  // RENDER
  // =========================================================================

  return (
    <>
      <div style={{
        background: 'var(--color-primary-light-1)',
        padding: 10,
        borderRadius: 6,
        border: '1px solid var(--color-primary-light-3)',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <Text style={{ fontWeight: 600, color: 'var(--color-primary-6)', fontSize: 13 }}>
            {activeSession ? (activeSession.isPaused ? '⏸ Paused' : '▶ Working') : '🚀 Next Task'}
          </Text>
          {!activeSession && (
            <Button type="text" icon={<IconSkipNext />} size="mini" onClick={() => incrementNextTaskSkipIndex()} disabled={isProcessing} />
          )}
        </div>

        {/* Content */}
        {activeSession ? (
          <div style={{ marginBottom: 6 }}>
            <Text style={{ fontSize: 13, display: 'block' }} ellipsis>
              {activeSession.stepName || activeSession.taskName}
            </Text>
            {activeSession.stepName && activeSession.taskName && (
              <Text type="secondary" style={{ fontSize: 11 }}>{activeSession.taskName}</Text>
            )}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginTop: 4 }}>
              {(() => {
                const itemId = activeSession.stepId || activeSession.taskId
                const progress = getWorkSessionProgress(itemId)
                return (
                  <Tag size="small" color="gray">{formatMinutes(progress.elapsedMinutes)} elapsed</Tag>
                )
              })()}
            </div>
          </div>
        ) : nextTask ? (
          <div style={{ marginBottom: 6 }}>
            <Text style={{ fontSize: 13, display: 'block' }} ellipsis>{nextTask.title}</Text>
            {nextTask.workflowName && (
              <Text type="secondary" style={{ fontSize: 11 }}>{nextTask.workflowName}</Text>
            )}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginTop: 4 }}>
              <Tag size="small" color="blue">{formatMinutes(nextTask.estimatedDuration)}</Tag>
            </div>
          </div>
        ) : (
          <Text type="secondary" style={{ fontSize: 12, marginBottom: 6, display: 'block' }}>
            {isLoading || workPatternsLoading ? 'Loading...' : 'No tasks scheduled'}
          </Text>
        )}

        {/* Buttons */}
        {activeSession ? (
          <div style={{ display: 'flex', gap: 4 }}>
            <Button size="mini" type="outline" status="warning" icon={<IconPause />} loading={isProcessing} onClick={handlePause} style={{ flex: 1 }}>
              {isCompact ? '' : 'Pause'}
            </Button>
            <Popover
              trigger="click"
              popupVisible={showWaitPopover}
              onVisibleChange={setShowWaitPopover}
              content={
                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  <InputNumber size="small" value={waitMinutes} onChange={v => setWaitMinutes(v ?? 30)} min={1} max={10080} suffix="m" style={{ width: 80 }} />
                  <Button size="small" type="primary" onClick={handleWait} loading={isProcessing}>Go</Button>
                </div>
              }
            >
              <Button size="mini" type="outline" icon={<IconClockCircle />} loading={isProcessing} style={{ flex: 1 }}>
                {isCompact ? '' : 'Wait'}
              </Button>
            </Popover>
            <Button size="mini" type="primary" status="success" icon={<IconCheck />} loading={isProcessing} onClick={handleComplete} style={{ flex: 1 }}>
              {isCompact ? '' : 'Done'}
            </Button>
          </div>
        ) : nextTask ? (
          <Button size="small" type="primary" icon={<IconPlayArrow />} loading={isProcessing} disabled={isLoading || workPatternsLoading} onClick={handleStart} style={{ width: '100%' }}>
            {isCompact ? 'Start' : 'Start Task'}
          </Button>
        ) : null}
      </div>

      {notification.visible && (
        <Alert type={notification.type} content={notification.message} closable onClose={() => setNotification(p => ({ ...p, visible: false }))} style={{ marginTop: 4 }} />
      )}
    </>
  )
}
