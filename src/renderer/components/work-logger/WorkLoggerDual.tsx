import { useState, useEffect, useMemo, useCallback } from 'react'
import { getCurrentTime } from '@shared/time-provider'
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
import { TaskType } from '@shared/enums'
import { useTaskStore } from '../../store/useTaskStore'
import { getDatabase } from '../../services/database'
import { logger } from '@/logger'
import { SwimLaneTimeline } from './SwimLaneTimeline'
import { CircularClock } from './CircularClock'
import { ClockTimePicker } from '../common/ClockTimePicker'
import { useResponsive } from '../../providers/ResponsiveProvider'
import {
  WorkSessionData,
  timeToMinutes,
  minutesToTime,
  getTypeColor,
  getTypeTagColor,
} from './SessionState'

const { Text } = Typography
const { Row, Col } = Grid

interface WorkLoggerDualProps {
  visible: boolean
  onClose: () => void
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
  const [hideCompleted, setHideCompleted] = useState(false)
  const [bedtimeHour, setBedtimeHour] = useState(22) // Default 10 PM
  const [wakeTimeHour, setWakeTimeHour] = useState(6) // Default 6 AM
  const [showCircadianSettings, setShowCircadianSettings] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [sessionToDelete, setSessionToDelete] = useState<WorkSessionData | null>(null)

  const { tasks, sequencedTasks, loadTasks, activeWorkSessions } = useTaskStore()
  const { isCompact, isMobile, isDesktop } = useResponsive()

  // Real-time timer for active work sessions (updates every 10 seconds for dogfooding)
  const [, forceUpdate] = useState({})
  useEffect(() => {
    if (!visible) return

    const timer = setInterval(() => {
      if (activeWorkSessions.size > 0) {
        forceUpdate({}) // Force re-render to update elapsed time
      }
    }, 10000) // Update every 10 seconds

    return () => clearInterval(timer)
  }, [visible, activeWorkSessions.size])

  // Load sessions when date changes or modal opens
  useEffect(() => {
    if (visible) {
      loadWorkSessions()
      loadTasks()
      loadPreferences()
    }
  }, [selectedDate, visible])

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

      // Load meetings for the selected date
      const workPattern = await db.getWorkPattern(selectedDate)
      if (workPattern && workPattern.meetings) {
        setMeetings(workPattern.meetings)
      } else {
        setMeetings([])
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
          let type: TaskType = TaskType.Focused // Default

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
              type = task.type || TaskType.Focused
            }
          }

          const workSessionData: WorkSessionData = {
            id: session.id,
            taskId: session.taskId,
            taskName: task?.name || 'Unknown Task',
            startMinutes: startTime.hour() * 60 + startTime.minute(),
            endMinutes: endTime.hour() * 60 + endTime.minute(),
            type,
            color: getTypeColor(type),
            isNew: false,
            isDirty: false,
          }

          // Only add optional properties if they have values
          if (session.stepId) workSessionData.stepId = session.stepId
          if (stepName) workSessionData.stepName = stepName
          if (session.notes) workSessionData.notes = session.notes

          return workSessionData
        })

      setSessions(formattedSessions)
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
    let type = task?.type as TaskType || TaskType.Focused

    if (stepId && task?.hasSteps && task.steps) {
      const step = task.steps.find(s => s.id === stepId)
      if (step) {
        stepName = step.name
        type = step.type as TaskType || TaskType.Focused
      }
    }

    const newSession: WorkSessionData = {
      id: generateUniqueId('session'),
      taskId,
      taskName: task?.name || 'Unknown Task',
      startMinutes: startMinutes,
      endMinutes: endMinutes,
      type,
      color: getTypeColor(type),
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
        const [year, month, day] = selectedDate.split('-').map(Number)
        const startHour = Math.floor(session.startMinutes / 60)
        const startMin = session.startMinutes % 60
        const endHour = Math.floor(session.endMinutes / 60)
        const endMin = session.endMinutes % 60

        const startDateTime = new Date(year, month - 1, day, startHour, startMin, 0, 0)
        const endDateTime = new Date(year, month - 1, day, endHour, endMin, 0, 0)

        // Derive the type from the task, not the session
        const task = allTasks.find(t => t.id === session.taskId)
        let taskType: TaskType = TaskType.Focused // Default

        if (task) {
          if (session.stepId && task.hasSteps && task.steps) {
            const step = task.steps.find(s => s.id === session.stepId)
            taskType = step?.type as TaskType || task.type as TaskType
          } else {
            taskType = task.type as TaskType
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
    const options: Array<{ value: string; label: string; type: TaskType }> = []

    const allTasks = [...tasks, ...sequencedTasks]
    allTasks.forEach(task => {
      if (!task.hasSteps) {
        options.push({
          value: `task:${task.id}`,
          label: task.name,
          type: task.type as TaskType,
        })
      } else if (task.steps) {
        // For workflows, we add each step as an option
        // Important: The parent task.id is the workflow ID that exists in the database
        task.steps.forEach(step => {
          options.push({
            value: `step:${step.id}:${task.id}`,
            label: `${task.name} > ${step.name}`,
            type: step.type as TaskType,
          })
        })
      }
    })

    return options
  }, [tasks, sequencedTasks])

  // Calculate summary statistics
  const summary = useMemo(() => {
    const focused = sessions
      .filter(s => s.type === TaskType.Focused)
      .reduce((sum, s) => sum + (s.endMinutes - s.startMinutes), 0)
    const admin = sessions
      .filter(s => s.type === TaskType.Admin)
      .reduce((sum, s) => sum + (s.endMinutes - s.startMinutes), 0)
    const personal = sessions
      .filter(s => s.type === TaskType.Personal)
      .reduce((sum, s) => sum + (s.endMinutes - s.startMinutes), 0)

    return { focused, admin, personal, total: focused + admin + personal }
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

          if (activeSessionEntries.length === 0) {
            return (
              <Card style={{ background: '#f7f8fa', border: '1px dashed #d9d9d9' }}>
                <Space>
                  <IconClockCircle style={{ color: '#86909c' }} />
                  <Text type="secondary">No active work session</Text>
                </Space>
              </Card>
            )
          }

          const [_sessionKey, session] = activeSessionEntries[0] // Get first non-paused active session

          // Determine if this is a workflow step or regular task
          let itemName = ''
          let parentName = ''

          if (session.stepId) {
            // This is a workflow step session
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
            // This is a regular task session
            const task = tasks.find(t => t.id === session.taskId)
            if (task) {
              itemName = task.name
              parentName = 'Task' // Regular tasks don't have parents
            } else {
              // Check if it's a workflow (taskId might be workflowId)
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

          // Calculate elapsed time
          const elapsedMinutes = Math.floor((new Date(getCurrentTime()).getTime() - session.startTime.getTime()) / 60000) + (session.actualMinutes || 0)
          const elapsedHours = Math.floor(elapsedMinutes / 60)
          const elapsedMins = elapsedMinutes % 60
          const elapsedText = elapsedHours > 0 ? `${elapsedHours}h ${elapsedMins}m` : `${elapsedMins}m`

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
            <Space>
              <Tag color="blue">Focused: {summary.focused} min</Tag>
              <Tag color="orange">Admin: {summary.admin} min</Tag>
              <Tag color="green">Personal: {summary.personal} min</Tag>
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
                  <span>Timeline View</span>
                  <Checkbox
                    checked={hideCompleted}
                    onChange={setHideCompleted}
                  >
                    Hide Completed Tasks
                  </Checkbox>
                </Space>
              }
              style={{ marginBottom: 16 }}>
              <div style={{
                height: isCompact ? 500 : isMobile ? 600 : 700,
                width: '100%',
                overflow: 'auto', // Allow scrolling within timeline
              }}>
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
                />
              </div>
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
                          color={getTypeTagColor(selectedSession.type)}
                        >
                          {
                            selectedSession.type === TaskType.Focused ? 'Focused' :
                              selectedSession.type === TaskType.Admin ? 'Admin' :
                                selectedSession.type === TaskType.Personal ? 'Personal' :
                                  'Unknown'
                          }
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
                      color={
                        task.type === TaskType.Focused ? 'blue' :
                          task.type === TaskType.Admin ? 'orange' :
                            task.type === TaskType.Personal ? 'green' :
                              'default'
                      }
                      size="small"
                    >
                      {
                        task.type === TaskType.Focused ? 'F' :
                          task.type === TaskType.Admin ? 'A' :
                            task.type === TaskType.Personal ? 'P' :
                              '?'
                      }
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
