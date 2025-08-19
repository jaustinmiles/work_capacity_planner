import React, { useState, useEffect, useMemo, useCallback } from 'react'
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
} from '@arco-design/web-react'
import {
  IconClockCircle,
  IconLeft,
  IconRight,
  IconSave,
  IconDelete,
  IconFullscreen,
  IconFullscreenExit,
} from '@arco-design/web-react/icon'
import dayjs from 'dayjs'
import { TaskType } from '@shared/enums'
import { useTaskStore } from '../../store/useTaskStore'
import { getDatabase } from '../../services/database'
import { logger } from '../../utils/logger'
import { SwimLaneTimeline } from './SwimLaneTimeline'
import { CircularClock } from './CircularClock'
import { ClockTimePicker } from '../common/ClockTimePicker'
import {
  WorkSessionData,
  timeToMinutes,
  minutesToTime,
  getTypeColor,
  roundToQuarter,
} from './SessionState'

const { Text } = Typography
const { Row, Col } = Grid

interface WorkLoggerDualProps {
  visible: boolean
  onClose: () => void
}

export function WorkLoggerDual({ visible, onClose }: WorkLoggerDualProps) {
  const [selectedDate, setSelectedDate] = useState(dayjs().format('YYYY-MM-DD'))
  const [sessions, setSessions] = useState<WorkSessionData[]>([])
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const [showAssignModal, setShowAssignModal] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [pendingSession, setPendingSession] = useState<Partial<WorkSessionData> | null>(null)
  const [expandedWorkflows, setExpandedWorkflows] = useState<Set<string>>(new Set())
  const [isFullscreen, setIsFullscreen] = useState(false)

  const { tasks, sequencedTasks, loadTasks } = useTaskStore()

  // Load sessions when date changes or modal opens
  useEffect(() => {
    if (visible) {
      loadWorkSessions()
      loadTasks()
    }
  }, [selectedDate, visible])

  const loadWorkSessions = async () => {
    setIsLoading(true)
    try {
      const db = getDatabase()
      const dbSessions = await db.getWorkSessions(selectedDate)

      const formattedSessions: WorkSessionData[] = dbSessions.map(session => {
        const startTime = dayjs(session.startTime)
        const endTime = session.endTime
          ? dayjs(session.endTime)
          : startTime.add(session.plannedMinutes || session.actualMinutes || 60, 'minute')

        // Find task and step details
        const task = [...tasks, ...sequencedTasks].find(t => t.id === session.taskId) || session.Task
        let stepName: string | undefined

        if (session.stepId) {
          for (const t of [...tasks, ...sequencedTasks]) {
            if (t.hasSteps && t.steps) {
              const step = t.steps.find(s => s.id === session.stepId)
              if (step) {
                stepName = step.name
                break
              }
            }
          }
        }

        const type = (session.type as TaskType) || TaskType.Focused

        return {
          id: session.id,
          taskId: session.taskId,
          taskName: task?.name || 'Unknown Task',
          stepId: session.stepId,
          stepName,
          startMinutes: startTime.hour() * 60 + startTime.minute(),
          endMinutes: endTime.hour() * 60 + endTime.minute(),
          type,
          color: getTypeColor(type),
          notes: session.notes,
          isNew: false,
          isDirty: false,
        }
      })

      setSessions(formattedSessions)
    } catch (error) {
      logger.ui.error('Failed to load work sessions:', error)
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
            startMinutes: roundToQuarter(startMinutes),
            endMinutes: roundToQuarter(endMinutes),
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
      id: `temp-${Date.now()}`,
      taskId,
      taskName: task?.name || 'Unknown Task',
      stepId,
      stepName,
      startMinutes: roundToQuarter(startMinutes),
      endMinutes: roundToQuarter(endMinutes),
      type,
      color: getTypeColor(type),
      isNew: true,
      isDirty: true,
    }

    setSessions(prev => [...prev, newSession])
    setSelectedSessionId(newSession.id)
  }, [tasks, sequencedTasks])

  // Handle session creation from clock (needs task assignment)
  const handleClockSessionCreate = useCallback((startMinutes: number, endMinutes: number) => {
    setPendingSession({
      startMinutes: roundToQuarter(startMinutes),
      endMinutes: roundToQuarter(endMinutes),
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
        logger.ui.error('Failed to delete session:', error)
        return
      }
    }

    setSessions(prev => prev.filter(s => s.id !== id))
    if (selectedSessionId === id) {
      setSelectedSessionId(null)
    }
  }, [sessions, selectedSessionId])

  // Save all dirty sessions
  const saveSessions = async () => {
    setIsSaving(true)
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
        s.isDirty && s.taskId && !validTaskIds.has(s.taskId)
      )
      
      if (sessionsWithInvalidTask.length > 0) {
        logger.ui.error('Invalid task IDs found:', sessionsWithInvalidTask.map(s => ({
          sessionId: s.id,
          taskId: s.taskId,
          taskName: s.taskName
        })))
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

        if (session.isNew) {
          logger.ui.debug('Creating work session:', {
            taskId: session.taskId,
            stepId: session.stepId,
            taskName: session.taskName,
            stepName: session.stepName,
            type: session.type,
            startTime: startDateTime.toISOString(),
            endTime: endDateTime.toISOString(),
          })
          
          await db.createWorkSession({
            taskId: session.taskId,
            stepId: session.stepId,
            type: session.type,
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
            type: session.type,
            startTime: startDateTime,
            endTime: endDateTime,
            actualMinutes: session.endMinutes - session.startMinutes,
            notes: session.notes,
          })
        }
      }

      await loadWorkSessions()
      await loadTasks()
    } catch (error) {
      logger.ui.error('Failed to save work sessions:', error)
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

    return { focused, admin, total: focused + admin }
  }, [sessions])

  const selectedSession = sessions.find(s => s.id === selectedSessionId)

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
          <Button
            type="text"
            icon={isFullscreen ? <IconFullscreenExit /> : <IconFullscreen />}
            onClick={() => setIsFullscreen(!isFullscreen)}
          />
        </Space>
      }
      visible={visible}
      onCancel={onClose}
      footer={null}
      style={{ 
        width: isFullscreen ? '100vw' : '95vw', 
        maxWidth: isFullscreen ? '100vw' : 1400,
        height: isFullscreen ? '100vh' : undefined,
        margin: isFullscreen ? 0 : undefined,
        top: isFullscreen ? 0 : undefined,
      }}
      maskClosable={false}
      wrapClassName={isFullscreen ? 'fullscreen-modal' : undefined}
    >
      <Space direction="vertical" style={{ width: '100%' }} size="large">
        {/* Header controls */}
        <Row justify="space-between" align="center">
          <Col span={12}>
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
              {selectedDate !== dayjs().format('YYYY-MM-DD') && (
                <Button onClick={() => setSelectedDate(dayjs().format('YYYY-MM-DD'))}>
                  Today
                </Button>
              )}
            </Space>
          </Col>
          <Col span={12} style={{ textAlign: 'right' }}>
            <Space>
              <Tag color="blue">Focused: {summary.focused} min</Tag>
              <Tag color="green">Admin: {summary.admin} min</Tag>
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
            <Card title="Timeline View" style={{ marginBottom: 16 }}>
              <div style={{ height: 400, overflow: 'hidden' }}>
                <SwimLaneTimeline
                  sessions={sessions}
                  tasks={[...tasks, ...sequencedTasks]}
                  onSessionUpdate={handleSessionUpdate}
                  onSessionCreate={handleTimelineSessionCreate}
                  onSessionDelete={handleSessionDelete}
                  selectedSessionId={selectedSessionId || undefined}
                  onSessionSelect={(id) => setSelectedSessionId(id || null)}
                  expandedWorkflows={expandedWorkflows}
                  onExpandedWorkflowsChange={handleWorkflowExpansionChange}
                />
              </div>
            </Card>

            {/* Circular clock */}
            <Card title="Clock View - Drag arcs to adjust time!">
              <CircularClock
                sessions={sessions}
                collapsedWorkflows={new Set([...tasks, ...sequencedTasks]
                  .filter(t => t.hasSteps && !expandedWorkflows.has(t.id))
                  .map(t => t.id))}
                onSessionUpdate={handleSessionUpdate}
                onSessionCreate={handleClockSessionCreate}
                onSessionDelete={handleSessionDelete}
                selectedSessionId={selectedSessionId || undefined}
                onSessionSelect={(id) => setSelectedSessionId(id || null)}
                currentTime={new Date()}
              />
            </Card>

            {/* Selected session details */}
            {selectedSession && (
              <Card title="Selected Session">
                <Space direction="vertical" style={{ width: '100%' }}>
                  <Row gutter={16}>
                    <Col span={8}>
                      <Text style={{ fontWeight: 'bold' }}>Task:</Text> {selectedSession.taskName}
                      {selectedSession.stepName && (
                        <div><Text type="secondary">Step: {selectedSession.stepName}</Text></div>
                      )}
                    </Col>
                    <Col span={8}>
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
                    <Col span={8} style={{ textAlign: 'right' }}>
                      <Space>
                        <Tag color={selectedSession.type === TaskType.Focused ? 'blue' : 'green'}>
                          {selectedSession.type === TaskType.Focused ? 'Focused' : 'Admin'}
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
                logger.ui.debug('Task assignment selected:', value)
                
                if (value.startsWith('step:')) {
                  const [, stepId, taskId] = value.split(':')
                  logger.ui.debug('Creating session for workflow step:', { stepId, taskId })
                  
                  // Verify the taskId exists
                  const taskExists = [...tasks, ...sequencedTasks].some(t => t.id === taskId)
                  if (!taskExists) {
                    logger.ui.error('Task not found in database:', taskId)
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
                  logger.ui.debug('Creating session for task:', { taskId })
                  
                  // Verify the taskId exists
                  const taskExists = [...tasks, ...sequencedTasks].some(t => t.id === taskId)
                  if (!taskExists) {
                    logger.ui.error('Task not found in database:', taskId)
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
                    <Tag color={task.type === TaskType.Focused ? 'blue' : 'green'} size="small">
                      {task.type === TaskType.Focused ? 'F' : 'A'}
                    </Tag>
                    {task.label}
                  </Space>
                </Select.Option>
              ))}
            </Select>
          </Space>
        )}
      </Modal>
    </Modal>
  )
}
