import { useState, useEffect, useMemo, useCallback } from 'react'
import { getCurrentTime } from '@shared/time-provider'
import { formatMinutes, formatElapsedWithSeconds, parseDateString } from '@shared/time-utils'
import { generateUniqueId } from '@shared/step-id-utils'
import {
  Modal,
  Space,
  Button,
  DatePicker,
  Card,
  Typography,
  Tag,
  Select,
  Grid,
  Spin,
  Notification,
  Checkbox,
  Alert,
} from '@arco-design/web-react'
import {
  IconClockCircle,
  IconLeft,
  IconRight,
  IconSave,
  IconDelete,
  IconFullscreen,
  IconFullscreenExit,
  IconSettings,
} from '@arco-design/web-react/icon'
import dayjs from 'dayjs'
import { useTaskStore } from '../../store/useTaskStore'
import { useSortedUserTaskTypes } from '../../store/useUserTaskTypeStore'
import { useActiveSinkSession, useSortedTimeSinks } from '../../store/useTimeSinkStore'
import { getDatabase } from '../../services/database'
import { logger } from '@/logger'
import { SwimLaneTimeline } from './SwimLaneTimeline'
import { CircularClock } from './CircularClock'
import { LinearTimeline } from './LinearTimeline'
import { WorkBlock } from '@shared/work-blocks-types'
import { ClockTimePicker } from '../common/ClockTimePicker'
import { useResponsive } from '../../providers/ResponsiveProvider'
import {
  WorkSessionData,
  PlannedSessionItem,
  timeToMinutes,
  minutesToTime,
  getTypeColor,
  getTypeDisplayName,
  getTypeEmojiDisplay,
} from './SessionState'
import { useTodaySnapshot } from '../../store/useScheduleSnapshotStore'

const { Text } = Typography
const { Row, Col } = Grid

interface WorkLoggerDualProps {
  visible: boolean
  onClose: () => void
}

/** Option type for task/step selection in work logger */
interface TaskSelectOption {
  value: string   // Format: "task:{taskId}" or "step:{stepId}:{taskId}"
  label: string   // Display name for the task/step
  type: string    // User-defined task type ID
}

// Helper function to filter out paused sessions from arrays
const filterActiveSessions = <T extends { isPaused?: boolean }>(sessions: T[]): T[] => {
  return sessions.filter((session): session is T => !session.isPaused)
}

// Helper function to filter out paused sessions from Map entries
const filterActiveSessionEntries = <K, V extends { isPaused?: boolean }>(entries: [K, V][]): [K, V][] => {
  return entries.filter(([_key, session]) => !session.isPaused)
}

export function WorkLoggerDual({ visible, onClose }: WorkLoggerDualProps) {
  const [selectedDate, setSelectedDate] = useState(dayjs(getCurrentTime()).format('YYYY-MM-DD'))
  const [sessions, setSessions] = useState<WorkSessionData[]>([])
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const [showAssignModal, setShowAssignModal] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [pendingSession, setPendingSession] = useState<Partial<WorkSessionData> | null>(null)
  const [expandedWorkflows, setExpandedWorkflows] = useState<Set<string>>(new Set())
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [meetings, setMeetings] = useState<any[]>([])
  const [workBlocks, setWorkBlocks] = useState<WorkBlock[]>([])
  const [hideCompleted, setHideCompleted] = useState(false)
  const [bedtimeHour, setBedtimeHour] = useState(22) // Default 10 PM
  const [wakeTimeHour, setWakeTimeHour] = useState(6) // Default 6 AM
  const [showCircadianSettings, setShowCircadianSettings] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showPlannedOverlay, setShowPlannedOverlay] = useState(false)

  // Get today's frozen schedule snapshot
  const todaySnapshot = useTodaySnapshot()
  const [sessionToDelete, setSessionToDelete] = useState<WorkSessionData | null>(null)

  const { tasks, sequencedTasks, loadTasks, activeWorkSessions } = useTaskStore()
  const { isCompact, isMobile, isDesktop } = useResponsive()
  const userTaskTypes = useSortedUserTaskTypes()
  const activeSinkSession = useActiveSinkSession()
  const timeSinks = useSortedTimeSinks()

  // Real-time timer for active sessions (updates every second for counting display)
  const [, forceUpdate] = useState({})
  useEffect(() => {
    if (!visible) return

    const timer = setInterval(() => {
      // Update if any work or time sink session is active
      if (activeWorkSessions.size > 0 || activeSinkSession) {
        forceUpdate({}) // Force re-render to update elapsed time with seconds
      }
    }, 1000) // Update every second for real-time seconds display

    return () => clearInterval(timer)
  }, [visible, activeWorkSessions.size, activeSinkSession])

  // Load sessions when date changes or modal opens
  useEffect(() => {
    if (visible) {
      loadWorkSessions()
      loadTasks()
      loadPreferences()
    }
  }, [selectedDate, visible])

  // Auto-enable planned overlay when today's snapshot exists
  // This ensures the frozen schedule comparison persists across modal close/reopen
  useEffect(() => {
    const today = dayjs(getCurrentTime()).format('YYYY-MM-DD')
    if (todaySnapshot && selectedDate === today) {
      setShowPlannedOverlay(true)
    }
  }, [todaySnapshot, selectedDate])

  const loadPreferences = async () => {
    try {
      const db = getDatabase()
      // Get the current session preferences
      const session = await db.getCurrentSession()
      if (session && session.SchedulingPreferences) {
        setBedtimeHour(session.SchedulingPreferences.bedtimeHour || 22)
        setWakeTimeHour(session.SchedulingPreferences.wakeTimeHour || 6)
      }
    } catch (error) {
      logger.ui.error('Failed to load preferences', {
        error: error instanceof Error ? error.message : String(error),
      }, 'prefs-load-error')
    }
  }

  const loadWorkSessions = async () => {
    setIsLoading(true)
    try {
      const db = getDatabase()
      const dbSessions = await db.getWorkSessions(selectedDate)

      // Load meetings and work blocks for the selected date
      const workPattern = await db.getWorkPattern(selectedDate)
      if (workPattern) {
        setMeetings(workPattern.meetings || [])
        setWorkBlocks(workPattern.blocks || [])
      } else {
        setMeetings([])
        setWorkBlocks([])
      }

      const formattedSessions: WorkSessionData[] = filterActiveSessions(dbSessions)
        .map(session => {
          const startTime = dayjs(session.startTime)
          // For active sessions without endTime, use current time to show actual duration
          const endTime = session.endTime
            ? dayjs(session.endTime)
            : dayjs(getCurrentTime()) // Use time provider for active sessions

          // Find task and step details
          const task = [...tasks, ...sequencedTasks].find(t => t.id === session.taskId) || session.Task
          let stepName: string | undefined
          let type: string = userTaskTypes[0]?.id || '' // Default to first user type

          // Get the type from the task or step, not from the session
          if (task) {
            if (session.stepId) {
              // For workflow steps, find the step's type
              for (const t of [...tasks, ...sequencedTasks]) {
                if (t.hasSteps && t.steps) {
                  const step = t.steps.find(s => s.id === session.stepId)
                  if (step) {
                    stepName = step.name
                    type = step.type || task.type
                    break
                  }
                }
              }
            } else {
              // For regular tasks, use the task's type
              type = task.type || userTaskTypes[0]?.id || ''
            }
          }

          const workSessionData: WorkSessionData = {
            id: session.id,
            taskId: session.taskId,
            taskName: task?.name || 'Unknown Task',
            startMinutes: startTime.hour() * 60 + startTime.minute(),
            endMinutes: endTime.hour() * 60 + endTime.minute(),
            type,
            color: getTypeColor(userTaskTypes, type),
            isNew: false,
            isDirty: false,
          }

          // Only add optional properties if they have values
          if (session.stepId) workSessionData.stepId = session.stepId
          if (stepName) workSessionData.stepName = stepName
          if (session.notes) workSessionData.notes = session.notes

          return workSessionData
        })

      // Load time sink sessions for the same date
      const timeSinkSessions = await db.getTimeSinkSessionsByDate(selectedDate)
      const formattedTimeSinkSessions: WorkSessionData[] = timeSinkSessions.map(session => {
        const startTime = dayjs(session.startTime)
        // For active sessions without endTime, use current time to show actual duration
        const endTime = session.endTime
          ? dayjs(session.endTime)
          : dayjs(getCurrentTime())

        // Find the time sink to get its name and color
        const sink = timeSinks.find(s => s.id === session.timeSinkId)
        const sinkName = sink?.name || 'Time Sink'
        const sinkEmoji = sink?.emoji || '⏱️'
        const sinkColor = sink?.color || '#9B59B6'

        return {
          id: `sink-${session.id}`, // Prefix to identify as time sink
          taskId: `sink-${session.timeSinkId}`, // Use sink ID as task ID
          taskName: `${sinkEmoji} ${sinkName}`,
          startMinutes: startTime.hour() * 60 + startTime.minute(),
          endMinutes: endTime.hour() * 60 + endTime.minute(),
          type: 'time-sink', // Special type for time sinks
          color: sinkColor,
          isNew: false,
          isDirty: false,
          notes: session.notes,
        }
      })

      // Combine work sessions and time sink sessions
      setSessions([...formattedSessions, ...formattedTimeSinkSessions])
    } catch (error) {
      logger.ui.error('Failed to load work sessions', {
        error: error instanceof Error ? error.message : String(error),
        date: selectedDate,
      }, 'sessions-load-error')
    } finally {
      setIsLoading(false)
    }
  }

  // Handle session updates from either view
  const handleSessionUpdate = useCallback((id: string, startMinutes: number, endMinutes: number) => {
    setSessions(prev => prev.map(session =>
      session.id === id
        ? {
          ...session,
          startMinutes: startMinutes,
          endMinutes: endMinutes,
          isDirty: true,
        }
        : session,
    ))
  }, [])

  // Handle session creation from timeline (with task context)
  const handleTimelineSessionCreate = useCallback((
    taskId: string,
    startMinutes: number,
    endMinutes: number,
    stepId?: string,
  ) => {
    const task = [...tasks, ...sequencedTasks].find(t => t.id === taskId)
    let stepName: string | undefined
    let type = task?.type || userTaskTypes[0]?.id || ''

    if (stepId && task?.hasSteps && task.steps) {
      const step = task.steps.find(s => s.id === stepId)
      if (step) {
        stepName = step.name
        type = step.type || task?.type || userTaskTypes[0]?.id || ''
      }
    }

    const newSession: WorkSessionData = {
      id: generateUniqueId('session'),
      taskId,
      taskName: task?.name || 'Unknown Task',
      startMinutes: startMinutes,
      endMinutes: endMinutes,
      type,
      color: getTypeColor(userTaskTypes, type),
      isNew: true,
      isDirty: true,
    }

    // Only add optional properties if they have values
    if (stepId) newSession.stepId = stepId
    if (stepName) newSession.stepName = stepName

    setSessions(prev => [...prev, newSession])
    setSelectedSessionId(newSession.id)
  }, [tasks, sequencedTasks])

  // Handle session creation from clock (needs task assignment)
  const handleClockSessionCreate = useCallback((startMinutes: number, endMinutes: number) => {
    setPendingSession({
      startMinutes: startMinutes,
      endMinutes: endMinutes,
    })
    setShowAssignModal(true)
  }, [])

  // Handle session deletion
  const handleSessionDelete = useCallback(async (id: string) => {
    const session = sessions.find(s => s.id === id)
    if (!session) return

    if (!session.isNew) {
      try {
        const db = getDatabase()
        await db.deleteWorkSession(id)
      } catch (error) {
        logger.ui.error('Failed to delete session', {
          error: error instanceof Error ? error.message : String(error),
          sessionId: id,
        }, 'session-delete-error')
        return
      }
    }

    setSessions(prev => prev.filter(s => s.id !== id))
    if (selectedSessionId === id) {
      setSelectedSessionId(null)
    }
  }, [sessions, selectedSessionId])

  // Handle time sink session creation from LinearTimeline drag
  const handleTimeSinkSessionCreate = useCallback(async (
    sinkId: string,
    startMinutes: number,
    endMinutes: number,
  ) => {
    try {
      const sink = timeSinks.find(s => s.id === sinkId)

      // Calculate start and end times based on the selected date
      const dateBase = dayjs(selectedDate)
      const startTime = dateBase.hour(Math.floor(startMinutes / 60)).minute(startMinutes % 60).second(0)
      const endTime = dateBase.hour(Math.floor(endMinutes / 60)).minute(endMinutes % 60).second(0)
      const actualMinutes = endMinutes - startMinutes

      // Create the time sink session via electron API
      const session = await window.electronAPI.db.createTimeSinkSession({
        timeSinkId: sinkId,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        actualMinutes,
      })

      // Add to local state - use the database-generated ID directly
      const newSessionData: WorkSessionData = {
        id: session.id,
        taskId: sinkId,
        taskName: `${sink?.emoji || '⏱️'} ${sink?.name || 'Time Sink'}`,
        startMinutes,
        endMinutes,
        type: 'time-sink',
        color: sink?.color || '#9B59B6',
        isNew: false,
        isDirty: false,
      }

      setSessions(prev => [...prev, newSessionData])
      logger.ui.info('Created time sink session', {
        sinkId,
        startMinutes,
        endMinutes,
        actualMinutes,
      }, 'time-sink-session-created')
    } catch (error) {
      logger.ui.error('Failed to create time sink session', {
        error: error instanceof Error ? error.message : String(error),
        sinkId,
      }, 'time-sink-create-error')
    }
  }, [selectedDate, timeSinks])

  // Keyboard handler for backspace deletion
  useEffect(() => {
    if (!visible) return

    const handleKeyPress = (event: KeyboardEvent) => {
      // Only handle delete/backspace when we have a selected session
      if (!selectedSessionId) return

      if (event.key === 'Backspace' || event.key === 'Delete') {
        // Check if user is typing in an input field
        const target = event.target as HTMLElement
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.contentEditable === 'true') {
          return
        }

        event.preventDefault()

        const session = sessions.find(s => s.id === selectedSessionId)
        if (!session) {
          return
        }

        // Set state to show confirmation modal
        setSessionToDelete(session)
        setShowDeleteConfirm(true)
      }
    }

    // Attach to window with capture phase
    window.addEventListener('keydown', handleKeyPress, true)

    return () => {
      window.removeEventListener('keydown', handleKeyPress, true)
    }
  }, [visible, selectedSessionId, sessions])

  // Save all dirty sessions
  const saveSessions = async () => {
    setIsSaving(true)

    const dirtySessions = sessions.filter(s => s.isDirty)
    logger.db.info('Saving work sessions', {
      total: dirtySessions.length,
      date: selectedDate,
    }, 'session-save')

    try {
      const db = getDatabase()

      // Validate all sessions have a taskId
      const sessionsWithoutTask = sessions.filter(s => s.isDirty && !s.taskId)
      if (sessionsWithoutTask.length > 0) {
        Notification.error({
          title: 'Validation Error',
          content: 'Some sessions do not have a task assigned. Please assign tasks to all sessions before saving.',
        })
        setIsSaving(false)
        return
      }

      // Get all valid task IDs from the database
      const allTasks = [...tasks, ...sequencedTasks]
      const validTaskIds = new Set(allTasks.map(t => t.id))

      // Check if all sessions have valid task IDs
      const sessionsWithInvalidTask = sessions.filter(s =>
        s.isDirty && s.taskId && !validTaskIds.has(s.taskId),
      )

      if (sessionsWithInvalidTask.length > 0) {
        logger.ui.warn('Invalid task IDs found', {
          invalidSessions: sessionsWithInvalidTask.map(s => ({
            sessionId: s.id,
            taskId: s.taskId,
            taskName: s.taskName,
          })),
        }, 'session-invalid-tasks')
        Notification.error({
          title: 'Validation Error',
          content: 'Some sessions have invalid task references. Please reassign tasks.',
        })
        setIsSaving(false)
        return
      }

      const dirtySessionsToSave = sessions.filter(s => s.isDirty && s.taskId && validTaskIds.has(s.taskId))

      for (const session of dirtySessionsToSave) {
        const [year, month, day] = parseDateString(selectedDate)
        const startHour = Math.floor(session.startMinutes / 60)
        const startMin = session.startMinutes % 60
        const endHour = Math.floor(session.endMinutes / 60)
        const endMin = session.endMinutes % 60

        const startDateTime = new Date(year, month - 1, day, startHour, startMin, 0, 0)
        const endDateTime = new Date(year, month - 1, day, endHour, endMin, 0, 0)

        // Derive the type from the task, not the session
        const task = allTasks.find(t => t.id === session.taskId)
        let taskType: string = userTaskTypes[0]?.id || '' // Default to first user type

        if (task) {
          if (session.stepId && task.hasSteps && task.steps) {
            const step = task.steps.find(s => s.id === session.stepId)
            taskType = step?.type || task.type || ''
          } else {
            taskType = task.type || '' // Workflows may not have a type
          }
        }

        if (session.isNew) {
          logger.db.debug('Creating work session', {
            taskId: session.taskId,
            stepId: session.stepId,
            type: taskType, // Use derived type
            startTime: startDateTime.toISOString(),
            endTime: endDateTime.toISOString(),
          }, 'session-create')

          await db.createWorkSession({
            taskId: session.taskId,
            stepId: session.stepId,
            type: taskType, // Use derived type (TODO: Remove once DB schema updated)
            startTime: startDateTime,
            endTime: endDateTime,
            plannedMinutes: session.endMinutes - session.startMinutes,
            actualMinutes: session.endMinutes - session.startMinutes,
            notes: session.notes,
          })
        } else {
          await db.updateWorkSession(session.id, {
            taskId: session.taskId,
            stepId: session.stepId,
            type: taskType, // Use derived type (TODO: Remove once DB schema updated)
            startTime: startDateTime,
            endTime: endDateTime,
            actualMinutes: session.endMinutes - session.startMinutes,
            notes: session.notes,
          })
        }
      }

      await loadWorkSessions()
      await loadTasks()

      // Schedule will automatically recompute via reactive subscriptions when tasks update
    } catch (error) {
      logger.db.error('Failed to save work sessions', {
        error: error instanceof Error ? error.message : String(error),
        date: selectedDate,
      }, 'sessions-save-error')
    } finally {
      setIsSaving(false)
    }
  }

  // Get available tasks for assignment
  const availableTasks = useMemo(() => {
    const options: TaskSelectOption[] = []

    const allTasks = [...tasks, ...sequencedTasks]
    allTasks.forEach(task => {
      if (!task.hasSteps) {
        options.push({
          value: `task:${task.id}`,
          label: task.name,
          type: task.type || '', // Regular tasks should always have type
        })
      } else if (task.steps) {
        // For workflows, we add each step as an option
        // Important: The parent task.id is the workflow ID that exists in the database
        task.steps.forEach(step => {
          options.push({
            value: `step:${step.id}:${task.id}`,
            label: `${task.name} > ${step.name}`,
            type: step.type,
          })
        })
      }
    })

    return options
  }, [tasks, sequencedTasks])

  // Calculate summary statistics - grouped by user-defined type IDs
  const summary = useMemo(() => {
    const byType: Record<string, number> = {}
    let total = 0

    sessions.forEach(s => {
      const duration = s.endMinutes - s.startMinutes
      byType[s.type] = (byType[s.type] || 0) + duration
      total += duration
    })

    return { byType, total }
  }, [sessions])

  const selectedSession = sessions.find(s => s.id === selectedSessionId)

  // Filter tasks based on hideCompleted setting
  const filteredTasks = useMemo(() => {
    if (!hideCompleted) {
      return [...tasks, ...sequencedTasks]
    }

    // Filter out completed tasks
    const activeTasks = tasks.filter(t => !t.completed)
    const activeSequencedTasks = sequencedTasks.filter(t => t.overallStatus !== 'completed')

    return [...activeTasks, ...activeSequencedTasks]
  }, [tasks, sequencedTasks, hideCompleted])

  // Separate work sessions from time sink sessions for LinearTimeline
  const { workSessions, timeSinkSessionsForTimeline } = useMemo(() => {
    const work: WorkSessionData[] = []
    const sinks: WorkSessionData[] = []

    sessions.forEach(s => {
      if (s.type === 'time-sink') {
        sinks.push(s)
      } else {
        work.push(s)
      }
    })

    return { workSessions: work, timeSinkSessionsForTimeline: sinks }
  }, [sessions])

  // Transform frozen schedule snapshot into PlannedSessionItem[] for comparison overlay
  const plannedItemsForDate = useMemo((): PlannedSessionItem[] => {
    if (!todaySnapshot?.data?.scheduledItems) return []

    return todaySnapshot.data.scheduledItems
      .filter(item => {
        // Only include items with valid start times on the selected date
        if (!item.startTime) return false
        const itemDate = new Date(item.startTime).toISOString().split('T')[0]
        return itemDate === selectedDate
      })
      .map(item => {
        const startDate = new Date(item.startTime!)
        const startMinutes = startDate.getHours() * 60 + startDate.getMinutes()
        const duration = item.duration || 30 // Default 30 min if missing

        // Get color based on item type
        let color = '#86909c'
        if (item.type === 'meeting') {
          color = '#F77234'
        } else {
          // Try to find task type color
          const task = [...tasks, ...sequencedTasks].find(t => t.id === item.id)
          if (task?.type) {
            color = getTypeColor(userTaskTypes, task.type)
          }
        }

        return {
          id: item.id,
          name: item.name,
          taskId: item.id,
          startMinutes,
          endMinutes: startMinutes + duration,
          type: item.type || 'task',
          color,
        }
      })
  }, [todaySnapshot, selectedDate, tasks, sequencedTasks, userTaskTypes])

  // Callback to handle workflow expansion changes from SwimLaneTimeline
  const handleWorkflowExpansionChange = useCallback((expanded: Set<string>) => {
    setExpandedWorkflows(expanded)
  }, [])

  return (
    <Modal
      title={
        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
          <Space>
            <IconClockCircle />
            <span>Work Logger - Dual View</span>
          </Space>
          <Space>
            <Button
              type="text"
              icon={<IconSettings />}
              onClick={() => setShowCircadianSettings(true)}
              title="Circadian Settings"
            />
            <Button
              type="text"
              icon={isFullscreen ? <IconFullscreenExit /> : <IconFullscreen />}
              onClick={() => setIsFullscreen(!isFullscreen)}
              style={{ marginRight: 24 }}  // Add space between fullscreen and X button
            />
          </Space>
        </Space>
      }
      visible={visible}
      onCancel={onClose}
      footer={null}
      style={{
        width: isFullscreen ? '100vw' : (isCompact ? '98vw' : isMobile ? '95vw' : '90vw'),
        maxWidth: isFullscreen ? '100vw' : (isCompact ? undefined : isMobile ? 1200 : isDesktop ? 1600 : 1800),
        height: isFullscreen ? '100vh' : undefined,
        margin: isFullscreen ? 0 : undefined,
        top: isFullscreen ? 0 : undefined,
      }}
      maskClosable={false}
      wrapClassName={isFullscreen ? 'fullscreen-modal' : undefined}
    >
      <Space direction="vertical" style={{ width: '100%' }} size="large">
        {/* Current Work Indicator for Dogfooding */}
        {(() => {
          // Find any active work session that is not paused
          const activeSessionEntries = filterActiveSessionEntries(
            Array.from(activeWorkSessions.entries()),
          )

          // Check for active work session first
          const firstEntry = activeSessionEntries[0]
          if (firstEntry) {
            const [_sessionKey, session] = firstEntry

            // Determine if this is a workflow step or regular task
            let itemName = ''
            let parentName = ''

            if (session.stepId) {
              sequencedTasks.forEach(workflow => {
                const step = workflow.steps?.find(s => s.id === session.stepId)
                if (step) {
                  itemName = step.name
                  parentName = workflow.name
                }
              })
              if (!itemName) {
                itemName = 'Unknown Step'
                parentName = 'Unknown Workflow'
              }
            } else if (session.taskId) {
              const task = tasks.find(t => t.id === session.taskId)
              if (task) {
                itemName = task.name
                parentName = 'Task'
              } else {
                const workflow = sequencedTasks.find(w => w.id === session.taskId)
                if (workflow) {
                  itemName = workflow.name
                  parentName = 'Workflow'
                } else {
                  itemName = 'Unknown Task'
                  parentName = 'Task'
                }
              }
            } else {
              itemName = 'Unknown Item'
              parentName = 'Unknown Type'
            }

            // Show real-time elapsed with seconds for active sessions
            const previousMinutes = session.actualMinutes || 0
            const currentSegmentText = formatElapsedWithSeconds(session.startTime, getCurrentTime())
            const elapsedText = previousMinutes > 0
              ? `${formatMinutes(previousMinutes)} + ${currentSegmentText}`
              : currentSegmentText

            return (
              <Card style={{ background: '#e6f7ff', border: '1px solid #91d5ff' }}>
                <Space direction="vertical" style={{ width: '100%' }}>
                  <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                    <Space>
                      <IconClockCircle style={{ color: '#1890ff' }} />
                      <Text style={{ fontWeight: 600 }}>Currently Working:</Text>
                    </Space>
                    <Tag color="blue">{elapsedText} elapsed</Tag>
                  </Space>
                  <Text style={{ fontSize: 14 }}>
                    {parentName === 'Task' ? (
                      <strong>{itemName}</strong>
                    ) : (
                      <>
                        <strong>{parentName}</strong> → {itemName}
                      </>
                    )}
                  </Text>
                </Space>
              </Card>
            )
          }

          // Check for active time sink session
          if (activeSinkSession) {
            const sink = timeSinks.find(s => s.id === activeSinkSession.timeSinkId)
            const sinkName = sink?.name || 'Unknown Time Sink'
            const sinkEmoji = sink?.emoji || '⏱️'
            const sinkColor = sink?.color || '#9B59B6'

            // Show real-time elapsed with seconds for active time sinks
            const elapsedText = formatElapsedWithSeconds(activeSinkSession.startTime, getCurrentTime())

            return (
              <Card style={{ background: '#f9f0ff', border: `1px solid ${sinkColor}` }}>
                <Space direction="vertical" style={{ width: '100%' }}>
                  <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                    <Space>
                      <span style={{ fontSize: 16 }}>{sinkEmoji}</span>
                      <Text style={{ fontWeight: 600 }}>Time Sink Active:</Text>
                    </Space>
                    <Tag color="purple">{elapsedText} elapsed</Tag>
                  </Space>
                  <Text style={{ fontSize: 14 }}>
                    <strong>{sinkName}</strong>
                  </Text>
                </Space>
              </Card>
            )
          }

          // No active session
          return (
            <Card style={{ background: '#f7f8fa', border: '1px dashed #d9d9d9' }}>
              <Space>
                <IconClockCircle style={{ color: '#86909c' }} />
                <Text type="secondary">No active session</Text>
              </Space>
            </Card>
          )
        })()}

        {/* Header controls */}
        <Row justify="space-between" align="center">
          <Col xs={24} sm={24} md={12} lg={12}>
            <Space>
              <Button
                icon={<IconLeft />}
                onClick={() => setSelectedDate(dayjs(selectedDate).subtract(1, 'day').format('YYYY-MM-DD'))}
              />
              <DatePicker
                value={selectedDate}
                onChange={(dateString) => setSelectedDate(dateString as string)}
                style={{ width: 200 }}
              />
              <Button
                icon={<IconRight />}
                onClick={() => setSelectedDate(dayjs(selectedDate).add(1, 'day').format('YYYY-MM-DD'))}
              />
              {selectedDate !== dayjs(getCurrentTime()).format('YYYY-MM-DD') && (
                <Button onClick={() => setSelectedDate(dayjs(getCurrentTime()).format('YYYY-MM-DD'))}>
                  Today
                </Button>
              )}
            </Space>
          </Col>
          <Col xs={24} sm={24} md={12} lg={12} style={{ textAlign: 'right' }}>
            <Space wrap>
              {userTaskTypes.map(type => {
                const minutes = summary.byType[type.id] || 0
                if (minutes === 0) return null
                return (
                  <Tag key={type.id} color={type.color}>
                    {type.emoji} {type.name}: {minutes} min
                  </Tag>
                )
              })}
              <Tag>Total: {Math.round(summary.total / 60 * 10) / 10} hours</Tag>
              <Button
                type="primary"
                icon={<IconSave />}
                loading={isSaving}
                onClick={saveSessions}
                disabled={!sessions.some(s => s.isDirty)}
              >
                Save Changes
              </Button>
            </Space>
          </Col>
        </Row>

        {/* Main content area */}
        {isLoading ? (
          <div style={{ textAlign: 'center', padding: 60 }}>
            <Spin size={40} />
          </div>
        ) : (
          <>
            {/* Swim lane timeline */}
            <Card
              title={
                <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                  <span>Swim Lane View</span>
                  <Checkbox
                    checked={hideCompleted}
                    onChange={setHideCompleted}
                  >
                    Hide Completed Tasks
                  </Checkbox>
                </Space>
              }
              style={{ marginBottom: 16 }}>
              <SwimLaneTimeline
                sessions={sessions}
                tasks={filteredTasks}
                meetings={meetings}
                onSessionUpdate={handleSessionUpdate}
                onSessionCreate={handleTimelineSessionCreate}
                onSessionDelete={handleSessionDelete}
                selectedSessionId={selectedSessionId || undefined}
                onSessionSelect={(id) => setSelectedSessionId(id || null)}
                expandedWorkflows={expandedWorkflows}
                onExpandedWorkflowsChange={handleWorkflowExpansionChange}
                bedtimeHour={bedtimeHour}
                wakeTimeHour={wakeTimeHour}
                maxHeight={isCompact ? 500 : isMobile ? 600 : 700}
              />
            </Card>

            {/* Linear Timeline - Zoomable horizontal view */}
            <Card
              title="Linear Timeline"
              style={{ marginBottom: 16 }}
              extra={
                <Space>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    Drag to move • Drag edges to resize • Click empty space to create
                  </Text>
                </Space>
              }
            >
              <LinearTimeline
                sessions={workSessions}
                workBlocks={workBlocks}
                meetings={meetings}
                onSessionUpdate={handleSessionUpdate}
                onSessionCreate={handleClockSessionCreate}
                onSessionDelete={handleSessionDelete}
                selectedSessionId={selectedSessionId}
                onSessionSelect={(id) => setSelectedSessionId(id)}
                currentTime={getCurrentTime()}
                date={selectedDate}
                plannedItems={plannedItemsForDate}
                showPlannedOverlay={showPlannedOverlay}
                onTogglePlannedOverlay={() => setShowPlannedOverlay(!showPlannedOverlay)}
                timeSinks={timeSinks}
                timeSinkSessions={timeSinkSessionsForTimeline}
                onTimeSinkSessionCreate={handleTimeSinkSessionCreate}
              />
            </Card>

            {/* Circular clock */}
            <Card title="Clock View - 24-Hour Day View" style={{ minHeight: 500 }}>
              <CircularClock
                sessions={sessions}
                collapsedWorkflows={new Set(filteredTasks
                  .filter(t => t.hasSteps && !expandedWorkflows.has(t.id))
                  .map(t => t.id))}
                onSessionUpdate={handleSessionUpdate}
                onSessionCreate={handleClockSessionCreate}
                onSessionDelete={handleSessionDelete}
                selectedSessionId={selectedSessionId || undefined}
                onSessionSelect={(id) => setSelectedSessionId(id || null)}
                currentTime={new Date()}
                meetings={meetings}
                sleepBlocks={[]} // TODO: Load sleep blocks
                bedtimeHour={bedtimeHour}
                wakeTimeHour={wakeTimeHour}
              />
            </Card>

            {/* Selected session details */}
            {selectedSession && (
              <Card title="Selected Session">
                <Space direction="vertical" style={{ width: '100%' }}>
                  <Row gutter={16}>
                    <Col xs={24} sm={12} md={8} lg={8}>
                      <Text style={{ fontWeight: 'bold' }}>Task:</Text> {selectedSession.taskName}
                      {selectedSession.stepName && (
                        <div><Text type="secondary">Step: {selectedSession.stepName}</Text></div>
                      )}
                    </Col>
                    <Col xs={24} sm={12} md={8} lg={8}>
                      <Space>
                        <Text style={{ fontWeight: 'bold' }}>Time:</Text>
                        <ClockTimePicker
                          value={minutesToTime(selectedSession.startMinutes)}
                          onChange={(time) => {
                            const minutes = timeToMinutes(time)
                            handleSessionUpdate(selectedSession.id, minutes, selectedSession.endMinutes)
                          }}
                          style={{ width: 100 }}
                        />
                        <Text>to</Text>
                        <ClockTimePicker
                          value={minutesToTime(selectedSession.endMinutes)}
                          onChange={(time) => {
                            const minutes = timeToMinutes(time)
                            handleSessionUpdate(selectedSession.id, selectedSession.startMinutes, minutes)
                          }}
                          style={{ width: 100 }}
                        />
                      </Space>
                    </Col>
                    <Col xs={24} sm={12} md={8} lg={8} style={{ textAlign: 'right' }}>
                      <Space>
                        <Tag
                          color={getTypeColor(userTaskTypes, selectedSession.type)}
                        >
                          {getTypeEmojiDisplay(userTaskTypes, selectedSession.type)} {getTypeDisplayName(userTaskTypes, selectedSession.type)}
                        </Tag>
                        <Text>{selectedSession.endMinutes - selectedSession.startMinutes} minutes</Text>
                        <Button
                          status="danger"
                          icon={<IconDelete />}
                          onClick={() => handleSessionDelete(selectedSession.id)}
                        >
                          Delete
                        </Button>
                      </Space>
                    </Col>
                  </Row>
                </Space>
              </Card>
            )}
          </>
        )}
      </Space>

      {/* Task assignment modal */}
      <Modal
        title="Assign Task to Session"
        visible={showAssignModal}
        footer={null}
        onCancel={() => {
          setPendingSession(null)
          setShowAssignModal(false)
        }}
      >
        {pendingSession && (
          <Space direction="vertical" style={{ width: '100%' }}>
            <Text>
              Session time: {minutesToTime(pendingSession.startMinutes!)} - {minutesToTime(pendingSession.endMinutes!)}
            </Text>
            <Select
              placeholder="Select task or workflow step"
              style={{ width: '100%' }}
              onChange={(value) => {
                logger.ui.debug('Task assignment selected', {
                  selection: value,
                }, 'session-assign')

                if (value.startsWith('step:')) {
                  const [, stepId, taskId] = value.split(':')
                  logger.ui.debug('Creating session for workflow step', {
                    stepId,
                    taskId,
                  }, 'session-workflow-step')

                  // Verify the taskId exists
                  const taskExists = [...tasks, ...sequencedTasks].some(t => t.id === taskId)
                  if (!taskExists) {
                    logger.ui.error('Task not found in database', {
                      taskId,
                    }, 'task-not-found')
                    Notification.error({
                      title: 'Invalid Task',
                      content: 'Selected task not found. Please try again.',
                    })
                    return
                  }

                  handleTimelineSessionCreate(
                    taskId,
                    pendingSession.startMinutes!,
                    pendingSession.endMinutes!,
                    stepId,
                  )
                } else if (value.startsWith('task:')) {
                  const taskId = value.substring(5)
                  logger.ui.debug('Creating session for task', {
                    taskId,
                  }, 'session-task')

                  // Verify the taskId exists
                  const taskExists = [...tasks, ...sequencedTasks].some(t => t.id === taskId)
                  if (!taskExists) {
                    logger.ui.error('Task not found in database', {
                      taskId,
                    }, 'task-not-found')
                    Notification.error({
                      title: 'Invalid Task',
                      content: 'Selected task not found. Please try again.',
                    })
                    return
                  }

                  handleTimelineSessionCreate(
                    taskId,
                    pendingSession.startMinutes!,
                    pendingSession.endMinutes!,
                  )
                }
                setPendingSession(null)
                setShowAssignModal(false)
              }}
            >
              {availableTasks.map(task => (
                <Select.Option key={task.value} value={task.value}>
                  <Space>
                    <Tag
                      color={getTypeColor(userTaskTypes, task.type)}
                      size="small"
                    >
                      {getTypeEmojiDisplay(userTaskTypes, task.type)}
                    </Tag>
                    {task.label}
                  </Space>
                </Select.Option>
              ))}
            </Select>
          </Space>
        )}
      </Modal>

      {/* Circadian Settings Modal */}
      <Modal
        title="Circadian Rhythm Settings"
        visible={showCircadianSettings}
        onCancel={() => setShowCircadianSettings(false)}
        onOk={async () => {
          try {
            const db = getDatabase()
            const session = await db.getCurrentSession()
            if (session) {
              await db.updateSchedulingPreferences(session.id, {
                bedtimeHour,
                wakeTimeHour,
              })
              logger.ui.info('Updated circadian settings', {
                bedtimeHour,
                wakeTimeHour,
              }, 'circadian-update')
              Notification.success({
                title: 'Settings Saved',
                content: 'Your circadian rhythm settings have been updated.',
              })
            }
            setShowCircadianSettings(false)
          } catch (error) {
            logger.ui.error('Failed to save circadian settings', {
              error: error instanceof Error ? error.message : String(error),
            }, 'circadian-save-error')
            Notification.error({
              title: 'Save Failed',
              content: 'Failed to save circadian settings.',
            })
          }
        }}
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <div>
            <Text>Bedtime (24-hour format):</Text>
            <Select
              value={bedtimeHour}
              onChange={setBedtimeHour}
              style={{ width: '100%', marginTop: 8 }}
            >
              {Array.from({ length: 24 }, (_, i) => (
                <Select.Option key={i} value={i}>
                  {i.toString().padStart(2, '0')}:00 - {
                    i === 0 ? 'Midnight' :
                      i < 12 ? `${i} AM` :
                        i === 12 ? 'Noon' :
                          `${i - 12} PM`
                  }
                </Select.Option>
              ))}
            </Select>
          </div>

          <div>
            <Text>Wake Time (24-hour format):</Text>
            <Select
              value={wakeTimeHour}
              onChange={setWakeTimeHour}
              style={{ width: '100%', marginTop: 8 }}
            >
              {Array.from({ length: 24 }, (_, i) => (
                <Select.Option key={i} value={i}>
                  {i.toString().padStart(2, '0')}:00 - {
                    i === 0 ? 'Midnight' :
                      i < 12 ? `${i} AM` :
                        i === 12 ? 'Noon' :
                          `${i - 12} PM`
                  }
                </Select.Option>
              ))}
            </Select>
          </div>

          <Alert
            type="info"
            content={
              <div>
                <div><strong>Your Circadian Rhythm:</strong></div>
                <div>• Morning Peak: ~{((wakeTimeHour + 4) % 24).toString().padStart(2, '0')}:00 (High energy)</div>
                <div>• Afternoon Dip: ~{((wakeTimeHour + 8) % 24).toString().padStart(2, '0')}:00 (Low energy)</div>
                <div>• Evening Peak: ~{((bedtimeHour - 4 + 24) % 24).toString().padStart(2, '0')}:00 (Second wind)</div>
              </div>
            }
          />
        </Space>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        title="Delete Work Session"
        visible={showDeleteConfirm}
        onCancel={() => {
          setShowDeleteConfirm(false)
          setSessionToDelete(null)
        }}
        onOk={async () => {
          if (sessionToDelete) {
            await handleSessionDelete(sessionToDelete.id)
            logger.ui.info('Work session deleted via keyboard shortcut', {
              sessionId: sessionToDelete.id,
              taskName: sessionToDelete.taskName,
            }, 'session-keyboard-delete')
          }
          setShowDeleteConfirm(false)
          setSessionToDelete(null)
        }}
        okText="Delete"
        cancelText="Cancel"
        okButtonProps={{ status: 'danger' }}
      >
        {sessionToDelete && (
          <Text>
            Are you sure you want to delete the work session for &quot;{sessionToDelete.taskName}
            {sessionToDelete.stepName ? ' - ' + sessionToDelete.stepName : ''}&quot;
            ({minutesToTime(sessionToDelete.startMinutes)} - {minutesToTime(sessionToDelete.endMinutes)})?
          </Text>
        )}
      </Modal>
    </Modal>
  )
}
