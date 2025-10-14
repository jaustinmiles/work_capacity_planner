import React, { useState, useRef, useEffect, useMemo } from 'react'
import {
  Card,
  Space,
  Typography,
  Button,
  Tag,
  Modal,
  Select,
  Input,
  DatePicker,
  Popconfirm,
} from '@arco-design/web-react'
import {
  IconPlus,
  IconClockCircle,
  IconLeft,
  IconRight,
  IconDelete,
  IconSave,
} from '@arco-design/web-react/icon'
import { TaskType } from '@shared/enums'
import { UnifiedWorkSession } from '@shared/unified-work-session-types'
import {
  parseDateString,
  parseTimeString,
  timeStringToMinutes,
  calculateDuration as calculateDurationFromTimeStrings,
  formatTimeHHMM,
  formatTimeFromParts,
} from '@shared/time-utils'
import { timeProvider } from '@shared/time-provider'
import { useTaskStore } from '../../store/useTaskStore'
import { getDatabase } from '../../services/database'
// LOGGER_REMOVED: import { logger } from '@/shared/logger'
import { appEvents, EVENTS } from '../../utils/events'
import dayjs from 'dayjs'

const { Text } = Typography

interface DragState {
  sessionId: string
  edge: 'start' | 'end' | 'move'
  initialY: number
  initialStartTime: string
  initialEndTime: string
}

interface WorkLoggerCalendarProps {
  visible: boolean
  onClose: () => void
}

const HOUR_HEIGHT = 60 // pixels per hour
const TIME_LABELS_WIDTH = 60
const CONTENT_WIDTH = 400
const START_HOUR = 0
const END_HOUR = 24

export function WorkLoggerCalendar({ visible, onClose }: WorkLoggerCalendarProps) {
  const [selectedDate, setSelectedDate] = useState(dayjs().format('YYYY-MM-DD'))
  const [sessions, setSessions] = useState<UnifiedWorkSession[]>([])
  const [dirtyIds, setDirtyIds] = useState<Set<string>>(new Set())
  const [newIds, setNewIds] = useState<Set<string>>(new Set())
  const [dragState, setDragState] = useState<DragState | null>(null)
  const [selectedSession, setSelectedSession] = useState<UnifiedWorkSession | null>(null)
  const [showAssignModal, setShowAssignModal] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  const containerRef = useRef<HTMLDivElement>(null)
  const { tasks, sequencedTasks, loadTasks } = useTaskStore()

  // Load existing work sessions for the selected date
  useEffect(() => {
    if (visible) {
      loadWorkSessions()
      loadTasks()
    }
  }, [selectedDate, visible])

  const loadWorkSessions = async () => {
    try {
      // LOGGER_REMOVED: logger.ui.info('Loading work sessions for date:', selectedDate)
      const db = getDatabase()

      // Load work sessions directly - they're already UnifiedWorkSession format
      const dbSessions = await db.getWorkSessions(selectedDate)
      // LOGGER_REMOVED: logger.ui.info('Loaded work sessions from DB:', { count: dbSessions.length })

      // Use sessions directly, no transformation
      setSessions(dbSessions)

      // Clear UI state - these are fresh from DB
      setDirtyIds(new Set())
      setNewIds(new Set())
    } catch (error) {
      // LOGGER_REMOVED: logger.ui.error('Failed to load work sessions:', error)
    }
  }

  // Convert time string (HH:mm) to pixels from top
  const timeToPixels = (timeStr: string): number => {
    const [hours, minutes] = parseTimeString(timeStr)
    const totalMinutes = (hours - START_HOUR) * 60 + minutes
    const pixels = (totalMinutes / 60) * HOUR_HEIGHT
    return pixels
  }

  // Convert pixels from top to time string (HH:mm)
  // Note: pixels should be relative to the timeline container top (0 = 6 AM)
  const pixelsToTime = (pixels: number): string => {
    const totalMinutes = Math.round((pixels / HOUR_HEIGHT) * 60)
    const hours = Math.floor(totalMinutes / 60) + START_HOUR
    const minutes = totalMinutes % 60

    // Clamp to valid range
    const clampedHours = Math.max(START_HOUR, Math.min(END_HOUR - 1, hours))
    const clampedMinutes = hours >= END_HOUR ? 59 : minutes

    const result = `${clampedHours.toString().padStart(2, '0')}:${clampedMinutes.toString().padStart(2, '0')}`
    return result
  }

  // Check for overlapping sessions
  const checkOverlap = (session: UnifiedWorkSession, excludeId?: string): boolean => {
    return sessions.some(otherSession => {
      if (otherSession.id === excludeId || otherSession.id === session.id) return false

      const sessionStart = timeStringToMinutes(formatTimeHHMM(session.startTime))
      const sessionEnd = session.endTime ? timeStringToMinutes(formatTimeHHMM(session.endTime)) : sessionStart
      const otherSessionStart = timeStringToMinutes(formatTimeHHMM(otherSession.startTime))
      const otherSessionEnd = otherSession.endTime ? timeStringToMinutes(formatTimeHHMM(otherSession.endTime)) : otherSessionStart

      return (sessionStart < otherSessionEnd && sessionEnd > otherSessionStart)
    })
  }

  // Create a new work session
  const createNewSession = () => {
    const now = timeProvider.now()
    const startHour = now.getHours()
    const startMin = now.getMinutes()

    // Create Date objects for the selected date using shared utility
    const [year, month, day] = parseDateString(selectedDate)
    const startTime = new Date(year, month - 1, day, startHour, startMin, 0, 0)
    const endTime = new Date(year, month - 1, day, startHour + 1, startMin, 0, 0)

    const newSession: UnifiedWorkSession = {
      id: `temp-${Date.now()}`,
      taskId: '',
      type: TaskType.Focused,
      startTime,
      endTime,
      plannedMinutes: 0,
      actualMinutes: 0,
    }

    if (checkOverlap(newSession)) {
      // LOGGER_REMOVED: logger.ui.warn('This time slot overlaps with an existing session')
      return
    }

    const newId = newSession.id
    setSessions([...sessions, newSession])
    setNewIds(new Set([...newIds, newId]))
    setDirtyIds(new Set([...dirtyIds, newId]))
    setSelectedSession(newSession)
    setShowAssignModal(true)
  }

  // Handle mouse down for dragging
  const handleMouseDown = (e: React.MouseEvent, sessionId: string, edge: 'start' | 'end' | 'move') => {
    e.preventDefault()
    e.stopPropagation()

    // LOGGER_REMOVED: logger.ui.debug('MouseDown on session:', { sessionId, edge, clientY: e.clientY })

    const session = sessions.find(s => s.id === sessionId)
    if (!session) {
      // LOGGER_REMOVED: logger.ui.error('Session not found for drag:', sessionId)
      return
    }

    // LOGGER_REMOVED: logger.ui.debug('Starting drag for session:', {
      // LOGGER_REMOVED: sessionId,
      // LOGGER_REMOVED: edge,
      // LOGGER_REMOVED: startTime: session.startTime,
      // LOGGER_REMOVED: endTime: session.endTime,
    // LOGGER_REMOVED: })

    setDragState({
      sessionId,
      edge,
      initialY: e.clientY,
      initialStartTime: formatTimeHHMM(session.startTime),
      initialEndTime: session.endTime ? formatTimeHHMM(session.endTime) : formatTimeHHMM(session.startTime),
    })
  }

  // Handle mouse move for dragging
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!dragState || !containerRef.current) return

      const session = sessions.find(s => s.id === dragState.sessionId)
      if (!session) {
        // LOGGER_REMOVED: logger.ui.error('Session lost during drag:', dragState.sessionId)
        return
      }

      // Add minimum movement threshold to prevent accidental moves
      const deltaY = e.clientY - dragState.initialY
      if (Math.abs(deltaY) < 5) {
        return // Ignore tiny movements
      }

      // LOGGER_REMOVED: logger.ui.debug('Dragging session:', {
        // LOGGER_REMOVED: sessionId: dragState.sessionId,
        // LOGGER_REMOVED: deltaY,
        // LOGGER_REMOVED: edge: dragState.edge,
        // LOGGER_REMOVED: clientY: e.clientY,
        // LOGGER_REMOVED: initialY: dragState.initialY,
      // LOGGER_REMOVED: })

      if (dragState.edge === 'move') {
        // Moving the entire block
        const deltaMinutes = Math.round((deltaY / HOUR_HEIGHT) * 60)

        const startMinutes = timeStringToMinutes(dragState.initialStartTime) + deltaMinutes
        const endMinutes = timeStringToMinutes(dragState.initialEndTime) + deltaMinutes

        // Check bounds - allow some flexibility
        const minStartMinutes = START_HOUR * 60
        const maxEndMinutes = END_HOUR * 60

        // Clamp to valid range (no minimum duration)
        const clampedStartMinutes = Math.max(minStartMinutes, Math.min(startMinutes, maxEndMinutes))
        const clampedEndMinutes = Math.min(maxEndMinutes, Math.max(endMinutes, minStartMinutes))

        // Convert minutes directly to time without going through pixels
        const startHours = Math.floor(clampedStartMinutes / 60)
        const startMins = clampedStartMinutes % 60
        const endHours = Math.floor(clampedEndMinutes / 60)
        const endMins = clampedEndMinutes % 60

        const newStartTimeStr = formatTimeFromParts(startHours, startMins)
        const newEndTimeStr = formatTimeFromParts(endHours, endMins)

        // Convert to Date objects using shared utility
        const [year, month, day] = parseDateString(selectedDate)
        const newStartTime = new Date(year, month - 1, day, startHours, startMins, 0, 0)
        const newEndTime = new Date(year, month - 1, day, endHours, endMins, 0, 0)

        const updatedSession = {
          ...session,
          startTime: newStartTime,
          endTime: newEndTime,
          actualMinutes: calculateDurationFromTimeStrings(newStartTimeStr, newEndTimeStr),
        }

        // LOGGER_REMOVED: logger.ui.debug('Updating session position:', {
          // LOGGER_REMOVED: oldStart: session.startTime,
          // LOGGER_REMOVED: newStart: newStartTime,
          // LOGGER_REMOVED: oldEnd: session.endTime,
          // LOGGER_REMOVED: newEnd: newEndTime,
        // LOGGER_REMOVED: })

        if (!checkOverlap(updatedSession, session.id)) {
          setSessions(sessions.map(s => s.id === session.id ? updatedSession : s))
          setDirtyIds(new Set([...dirtyIds, session.id]))
        } else {
          // LOGGER_REMOVED: logger.ui.warn('Overlap detected, not updating position')
        }
      } else {
        // Resizing edges - calculate position relative to timeline container
        const rect = containerRef.current.getBoundingClientRect()
        const scrollTop = containerRef.current.scrollTop
        const relativeY = e.clientY - rect.top + scrollTop

        // Debug the calculation
        const debugInfo = {
          edge: dragState.edge,
          clientY: e.clientY,
          rectTop: rect.top,
          scrollTop,
          relativeY,
          calculatedHours: Math.floor((relativeY / HOUR_HEIGHT)) + START_HOUR,
          expectedHours: Math.floor(e.clientY / HOUR_HEIGHT),
        }
        // LOGGER_REMOVED: logger.ui.debug('Edge resize calculation:', debugInfo)

        const newTimeStr = pixelsToTime(relativeY)
        const [newHours, newMins] = parseTimeString(newTimeStr)

        // Convert to Date object using shared utility
        const [year, month, day] = parseDateString(selectedDate)
        const newTimeDate = new Date(year, month - 1, day, newHours, newMins, 0, 0)

        if (dragState.edge === 'start' && newTimeDate < session.startTime) {
          const endTimeStr = session.endTime ? formatTimeHHMM(session.endTime) : formatTimeHHMM(session.startTime)
          const updatedSession = {
            ...session,
            startTime: newTimeDate,
            actualMinutes: calculateDurationFromTimeStrings(newTimeStr, endTimeStr),
          }

          if (!checkOverlap(updatedSession, session.id)) {
            setSessions(sessions.map(s => s.id === session.id ? updatedSession : s))
            setDirtyIds(new Set([...dirtyIds, session.id]))
          }
        } else if (dragState.edge === 'end' && session.endTime && newTimeDate > session.endTime) {
          const startTimeStr = formatTimeHHMM(session.startTime)
          const updatedSession = {
            ...session,
            endTime: newTimeDate,
            actualMinutes: calculateDurationFromTimeStrings(startTimeStr, newTimeStr),
          }

          if (!checkOverlap(updatedSession, session.id)) {
            setSessions(sessions.map(s => s.id === session.id ? updatedSession : s))
            setDirtyIds(new Set([...dirtyIds, session.id]))
          }
        }
      }
    }

    const handleMouseUp = () => {
      setDragState(null)
    }

    if (dragState) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)

      return () => {
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
      }
    }
    return undefined
  }, [dragState, sessions])

  // Save sessions to database
  const saveSessions = async () => {
    setIsSaving(true)
    // LOGGER_REMOVED: logger.ui.info('Starting save of sessions:', { dirtyCount: dirtyIds.size })

    try {
      const db = getDatabase()

      // Get or create work pattern for this date
      let pattern = await db.getWorkPattern(selectedDate)
      if (!pattern) {
        // LOGGER_REMOVED: logger.ui.debug('Creating new work pattern for date:', selectedDate)
        pattern = await db.createWorkPattern({
          date: selectedDate,
          blocks: [],
          meetings: [],
        })
      }

      // Save dirty sessions
      const dirtySessionsToSave = sessions.filter(s => dirtyIds.has(s.id) && s.taskId)
      const unassignedSessions = sessions.filter(s => dirtyIds.has(s.id) && !s.taskId)

      if (unassignedSessions.length > 0) {
        // LOGGER_REMOVED: logger.ui.warn('Skipping unassigned sessions:', unassignedSessions.length)
      }

      // LOGGER_REMOVED: logger.ui.info('Saving dirty sessions:', dirtySessionsToSave.length)

      for (const session of dirtySessionsToSave) {
        // LOGGER_REMOVED: logger.ui.debug('Saving session:', {
          // id: session.id,
          // taskId: session.taskId,
          // stepId: session.stepId,
          // type: session.type,
          // startTime: session.startTime.toISOString(),
          // endTime: session.endTime?.toISOString(),
          // actualMinutes: session.actualMinutes,
          // isNew: newIds.has(session.id),
        // })

        if (newIds.has(session.id)) {
          // Create new session
          const createData = {
            taskId: session.taskId,
            stepId: session.stepId,
            type: session.type,
            startTime: session.startTime,
            endTime: session.endTime || session.startTime,
            plannedMinutes: session.plannedMinutes,
            actualMinutes: session.actualMinutes || session.plannedMinutes,
            notes: session.notes,
          }
          // LOGGER_REMOVED: logger.ui.debug('Creating new work session:', createData)
          await db.createWorkSession(createData)
        } else {
          // Update existing session
          await db.updateWorkSession(session.id, {
            taskId: session.taskId,
            stepId: session.stepId,
            type: session.type,
            startTime: session.startTime,
            endTime: session.endTime,
            actualMinutes: session.actualMinutes,
            notes: session.notes,
          })
        }
      }

      // LOGGER_REMOVED: logger.ui.info('Work sessions saved successfully')
      await loadWorkSessions() // Reload to get proper IDs
      await loadTasks() // Reload tasks to update cumulative time

      // Emit event to update WorkStatusWidget and other components
      appEvents.emit(EVENTS.TIME_LOGGED)
    } catch (error) {
      // LOGGER_REMOVED: logger.ui.error('Failed to save work sessions:', error)
      console.error('Failed to save work sessions:', error)
    } finally {
      setIsSaving(false)
    }
  }

  // Delete a session
  const deleteSession = async (sessionId: string) => {
    try {
      const session = sessions.find(s => s.id === sessionId)
      if (!session) return

      if (!newIds.has(sessionId)) {
        const db = getDatabase()
        await db.deleteWorkSession(sessionId)
      }

      setSessions(sessions.filter(s => s.id !== sessionId))

      // Clean up Sets
      const newDirtyIds = new Set(dirtyIds)
      newDirtyIds.delete(sessionId)
      setDirtyIds(newDirtyIds)

      const newNewIds = new Set(newIds)
      newNewIds.delete(sessionId)
      setNewIds(newNewIds)

      // LOGGER_REMOVED: logger.ui.info('Session deleted successfully')
      await loadTasks() // Reload tasks to update cumulative time
    } catch (error) {
      // LOGGER_REMOVED: logger.ui.error('Failed to delete session:', error)
      console.error('Failed to delete session:', error)
    }
  }

  // Get all available tasks and workflow steps
  const availableTasks = useMemo(() => {
    const allTasks = [...tasks, ...sequencedTasks]
    const taskOptions: Array<{ value: string; label: string; type: TaskType }> = []

    // Add standalone tasks
    allTasks.forEach(task => {
      if (!task.hasSteps) {
        taskOptions.push({
          value: `task:${task.id}`,
          label: task.name,
          type: task.type as TaskType,
        })
      }
    })

    // Add workflow steps
    allTasks.forEach(task => {
      if (task.hasSteps && task.steps) {
        task.steps.forEach(step => {
          taskOptions.push({
            value: `step:${step.id}:${task.id}`,
            label: `${task.name} > ${step.name}`,
            type: step.type as TaskType,
          })
        })
      }
    })

    return taskOptions
  }, [tasks, sequencedTasks])

  // Render hour lines
  const renderHourLines = () => {
    const hours: React.ReactNode[] = []
    for (let hour = START_HOUR; hour <= END_HOUR; hour++) {
      hours.push(
        <div
          key={hour}
          style={{
            position: 'absolute',
            top: (hour - START_HOUR) * HOUR_HEIGHT,
            left: 0,
            right: 0,
            height: 1,
            background: '#e5e6eb',
          }}
        >
          <Text
            style={{
              position: 'absolute',
              left: 8,
              top: -10,
              fontSize: 12,
              color: '#86909c',
            }}
          >
            {hour.toString().padStart(2, '0')}:00
          </Text>
        </div>,
      )
    }
    return hours
  }

  // Render work sessions
  const renderSessions = () => {
    const now = dayjs()
    const isToday = selectedDate === now.format('YYYY-MM-DD')
    const currentTimePixels = isToday ? timeToPixels(now.format('HH:mm')) : -1

    return (
      <>
        {/* Current time indicator */}
        {isToday && currentTimePixels >= 0 && currentTimePixels <= (END_HOUR - START_HOUR) * HOUR_HEIGHT && (
          <div
            style={{
              position: 'absolute',
              top: currentTimePixels,
              left: TIME_LABELS_WIDTH,
              right: 0,
              height: 2,
              background: '#f53f3f',
              zIndex: 10,
            }}
          >
            <div
              style={{
                position: 'absolute',
                left: -8,
                top: -8,
                width: 16,
                height: 16,
                borderRadius: '50%',
                background: '#f53f3f',
              }}
            />
          </div>
        )}

        {/* Work sessions */}
        {sessions.map(session => {
          // Format Date to string for display using shared utility
          const startTimeStr = formatTimeHHMM(session.startTime)
          const endTimeStr = session.endTime ? formatTimeHHMM(session.endTime) : startTimeStr

          // Use actualMinutes for display (duration since work was actually done)
          // Height represents the actual time logged, not the planned time
          const displayMinutes = session.actualMinutes ?? 0

          const top = timeToPixels(startTimeStr)
          const height = Math.max((displayMinutes / 60) * HOUR_HEIGHT, 30) // Minimum height for visibility
          const color = session.type === TaskType.Focused ? '#165DFF' : '#00B42A'

          // Look up task/step names if not in session
          let taskName = session.taskName || 'Unassigned'
          let stepName = session.stepName
          if (session.taskId && !taskName) {
            const task = [...tasks, ...sequencedTasks].find(t => t.id === session.taskId)
            taskName = task?.name || 'Unknown Task'
          }
          if (session.stepId && !stepName) {
            for (const task of [...tasks, ...sequencedTasks]) {
              const step = task.steps?.find(s => s.id === session.stepId)
              if (step) {
                stepName = step.name
                break
              }
            }
          }

          return (
            <div
              key={session.id}
              style={{
                position: 'absolute',
                top,
                left: TIME_LABELS_WIDTH + 10,
                width: CONTENT_WIDTH - 20,
                height,
                background: dirtyIds.has(session.id) ? `${color}22` : `${color}11`,
                border: `2px solid ${color}`,
                borderRadius: 6,
                padding: '4px 8px',
                cursor: 'move',
                userSelect: 'none',
                display: 'flex',
                flexDirection: 'column',
                fontSize: 11,
                overflow: 'hidden',
              }}
              onMouseDown={(e) => handleMouseDown(e, session.id, 'move')}
              onContextMenu={(e) => {
                e.preventDefault()
                e.stopPropagation()
                // Show delete confirmation on right-click
                Modal.confirm({
                  title: 'Delete this work session?',
                  content: `${taskName} ${stepName ? '- ' + stepName : ''} (${displayMinutes} min)`,
                  onOk: () => deleteSession(session.id),
                  okText: 'Delete',
                  okButtonProps: { status: 'danger' },
                })
              }}
            >
              {/* Resize handles */}
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  height: 8,
                  cursor: 'ns-resize',
                }}
                onMouseDown={(e) => handleMouseDown(e, session.id, 'start')}
              />
              <div
                style={{
                  position: 'absolute',
                  bottom: 0,
                  left: 0,
                  right: 0,
                  height: 8,
                  cursor: 'ns-resize',
                }}
                onMouseDown={(e) => handleMouseDown(e, session.id, 'end')}
              />

              {/* Content */}
              <div style={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {taskName}
                </div>
                {stepName && (
                  <div style={{ fontSize: 10, color: '#86909c', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {stepName}
                  </div>
                )}
                {height > 50 && ( // Only show time if there's space
                  <div style={{ fontSize: 9, color: '#86909c', marginTop: 2 }}>
                    {startTimeStr} - {endTimeStr} ({displayMinutes}m)
                  </div>
                )}
              </div>

              {/* Actions - always show delete, but make it compact for small sessions */}
              <Space size={2} style={{ marginTop: 2 }}>
                {height > 40 && (
                  <Button
                    size="mini"
                    onClick={(e) => {
                      e.stopPropagation()
                      setSelectedSession(session)
                      setShowAssignModal(true)
                    }}
                  >
                    Assign
                  </Button>
                )}
                <Popconfirm
                  title="Delete this session?"
                  onOk={() => deleteSession(session.id)}
                >
                  <Button
                    size="mini"
                    status="danger"
                    icon={<IconDelete />}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {height > 40 && 'Delete'}
                  </Button>
                </Popconfirm>
              </Space>
            </div>
          )
        })}
      </>
    )
  }

  return (
    <Modal
      title={
        <Space>
          <IconClockCircle />
          <span>Work Logger</span>
        </Space>
      }
      visible={visible}
      onCancel={onClose}
      footer={null}
      style={{ width: '90vw', maxWidth: 1200 }}
      maskClosable={false}
    >
      <Space direction="vertical" style={{ width: '100%' }} size="large">
        {/* Date navigation */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
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

          <Space>
            <Button type="primary" icon={<IconPlus />} onClick={createNewSession}>
              Add Session
            </Button>
            <Button
              type="primary"
              icon={<IconSave />}
              loading={isSaving}
              onClick={saveSessions}
              disabled={dirtyIds.size === 0}
            >
              Save Changes
            </Button>
          </Space>
        </div>

        {/* Timeline */}
        <Card>
          <div
            ref={containerRef}
            style={{
              position: 'relative',
              height: (END_HOUR - START_HOUR) * HOUR_HEIGHT,
              width: TIME_LABELS_WIDTH + CONTENT_WIDTH,
              overflow: 'auto',
            }}
          >
            {renderHourLines()}
            {renderSessions()}
          </div>
        </Card>

        {/* Summary */}
        <Card>
          <Space>
            <Text>Total logged today:</Text>
            <Tag color="blue">
              Focused: {sessions.filter(s => s.type === TaskType.Focused).reduce((sum, s) => sum + (s.actualMinutes ?? 0), 0)} min
            </Tag>
            <Tag color="green">
              Admin: {sessions.filter(s => s.type === TaskType.Admin).reduce((sum, s) => sum + (s.actualMinutes ?? 0), 0)} min
            </Tag>
          </Space>
        </Card>
      </Space>

      {/* Task assignment modal */}
      <Modal
        title="Assign Task"
        visible={showAssignModal}
        onOk={() => {
          if (selectedSession) {
            setSessions(sessions.map(s => s.id === selectedSession.id ? selectedSession : s))
          }
          setShowAssignModal(false)
          setSelectedSession(null)
        }}
        onCancel={() => {
          setShowAssignModal(false)
          setSelectedSession(null)
        }}
      >
        {selectedSession && (
          <Space direction="vertical" style={{ width: '100%' }}>
            <Select
              placeholder="Select task or workflow step"
              style={{ width: '100%' }}
              {...(selectedSession.stepId
                ? { value: `step:${selectedSession.stepId}:${selectedSession.taskId}` }
                : selectedSession.taskId
                ? { value: `task:${selectedSession.taskId}` }
                : {})}
              onChange={(value) => {
                if (value.startsWith('step:')) {
                  const [, stepId, taskId] = value.split(':')
                  const task = [...tasks, ...sequencedTasks].find(t => t.id === taskId)
                  const step = task?.steps?.find(s => s.id === stepId)
                  const updatedSession: UnifiedWorkSession = {
                    ...selectedSession,
                    taskId,
                    stepId,
                    ...(task?.name && { taskName: task.name }),
                    ...(step?.name && { stepName: step.name }),
                    type: step?.type as TaskType || TaskType.Focused,
                  }
                  setSelectedSession(updatedSession)
                  setDirtyIds(new Set([...dirtyIds, updatedSession.id]))
                } else if (value.startsWith('task:')) {
                  const taskId = value.substring(5)
                  const task = [...tasks, ...sequencedTasks].find(t => t.id === taskId)
                  const updatedSession: UnifiedWorkSession = {
                    ...selectedSession,
                    taskId,
                    stepId: undefined,
                    ...(task?.name && { taskName: task.name }),
                    stepName: undefined,
                    type: task?.type as TaskType || TaskType.Focused,
                  }
                  setSelectedSession(updatedSession)
                  setDirtyIds(new Set([...dirtyIds, updatedSession.id]))
                }
              }}
              showSearch
              filterOption
            >
              {availableTasks.map(task => (
                <Select.Option key={task.value} value={task.value}>
                  <Space>
                    <Tag color={task.type === TaskType.Focused ? 'blue' : 'green'} size="small">
                      {task.type === TaskType.Focused ? 'Focused' : 'Admin'}
                    </Tag>
                    {task.label}
                  </Space>
                </Select.Option>
              ))}
            </Select>

            <Input.TextArea
              placeholder="Notes (optional)"
              value={selectedSession.notes ?? ''}
              onChange={(value) => {
                const updatedSession = {
                  ...selectedSession,
                  notes: value,
                }
                setSelectedSession(updatedSession)
                setDirtyIds(new Set([...dirtyIds, updatedSession.id]))
              }}
              rows={3}
            />
          </Space>
        )}
      </Modal>
    </Modal>
  )
}

