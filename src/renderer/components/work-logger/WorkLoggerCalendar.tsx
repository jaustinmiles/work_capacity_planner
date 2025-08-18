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
  Message as ArcoMessage,
  Popconfirm,
} from '@arco-design/web-react'
import { 
  IconPlus, 
  IconCalendar, 
  IconClockCircle,
  IconLeft,
  IconRight,
  IconDelete,
  IconSave,
} from '@arco-design/web-react/icon'
import { TaskType } from '@shared/enums'
import { useTaskStore } from '../../store/useTaskStore'
import { getDatabase } from '../../services/database'
import { logger } from '../../utils/logger'
import dayjs from 'dayjs'

const { Title, Text } = Typography

interface WorkSession {
  id: string
  taskId: string
  stepId?: string
  taskName?: string
  stepName?: string
  type: TaskType
  startTime: string // HH:mm format
  endTime: string // HH:mm format
  duration: number // minutes
  notes?: string
  isNew?: boolean
  isDirty?: boolean
}

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
const START_HOUR = 6
const END_HOUR = 22

export function WorkLoggerCalendar({ visible, onClose }: WorkLoggerCalendarProps) {
  const [selectedDate, setSelectedDate] = useState(dayjs().format('YYYY-MM-DD'))
  const [sessions, setSessions] = useState<WorkSession[]>([])
  const [dragState, setDragState] = useState<DragState | null>(null)
  const [selectedSession, setSelectedSession] = useState<WorkSession | null>(null)
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
      const db = getDatabase()
      const pattern = await db.getWorkPattern(selectedDate)
      if (!pattern) return

      const dbSessions = await db.getWorkSessions(selectedDate)
      
      // Convert database sessions to our format
      const formattedSessions: WorkSession[] = dbSessions.map(session => {
        const startTime = dayjs(session.startTime)
        const endTime = session.endTime ? dayjs(session.endTime) : startTime.add(session.plannedMinutes, 'minute')
        
        // Find task/step names
        const task = [...tasks, ...sequencedTasks].find(t => t.id === session.taskId)
        const step = task?.steps?.find(s => s.id === session.stepId)
        
        return {
          id: session.id,
          taskId: session.taskId,
          stepId: session.stepId,
          taskName: task?.name,
          stepName: step?.name,
          type: session.type as TaskType,
          startTime: startTime.format('HH:mm'),
          endTime: endTime.format('HH:mm'),
          duration: session.actualMinutes || session.plannedMinutes,
          notes: session.notes,
          isNew: false,
          isDirty: false,
        }
      })
      
      setSessions(formattedSessions)
    } catch (error) {
      logger.ui.error('Failed to load work sessions:', error)
    }
  }

  // Convert time string (HH:mm) to pixels from top
  const timeToPixels = (timeStr: string): number => {
    const [hours, minutes] = timeStr.split(':').map(Number)
    const totalMinutes = (hours - START_HOUR) * 60 + minutes
    return (totalMinutes / 60) * HOUR_HEIGHT
  }

  // Convert pixels from top to time string (HH:mm)
  const pixelsToTime = (pixels: number): string => {
    const totalMinutes = Math.round((pixels / HOUR_HEIGHT) * 60)
    const hours = Math.floor(totalMinutes / 60) + START_HOUR
    const minutes = totalMinutes % 60

    // Clamp to valid range
    const clampedHours = Math.max(START_HOUR, Math.min(END_HOUR - 1, hours))
    const clampedMinutes = hours >= END_HOUR ? 59 : minutes

    return `${clampedHours.toString().padStart(2, '0')}:${clampedMinutes.toString().padStart(2, '0')}`
  }

  // Round time to nearest 15 minutes
  const roundToQuarter = (timeStr: string): string => {
    const [hours, minutes] = timeStr.split(':').map(Number)
    const roundedMinutes = Math.round(minutes / 15) * 15
    const adjustedHours = hours + Math.floor(roundedMinutes / 60)
    const finalMinutes = roundedMinutes % 60
    return `${adjustedHours.toString().padStart(2, '0')}:${finalMinutes.toString().padStart(2, '0')}`
  }

  // Check for overlapping sessions
  const checkOverlap = (session: WorkSession, excludeId?: string): boolean => {
    return sessions.some(s => {
      if (s.id === excludeId || s.id === session.id) return false
      
      const sessionStart = timeToMinutes(session.startTime)
      const sessionEnd = timeToMinutes(session.endTime)
      const sStart = timeToMinutes(s.startTime)
      const sEnd = timeToMinutes(s.endTime)
      
      return (sessionStart < sEnd && sessionEnd > sStart)
    })
  }

  const timeToMinutes = (timeStr: string): number => {
    const [hours, minutes] = timeStr.split(':').map(Number)
    return hours * 60 + minutes
  }

  const calculateDuration = (startTime: string, endTime: string): number => {
    return timeToMinutes(endTime) - timeToMinutes(startTime)
  }

  // Create a new work session
  const createNewSession = () => {
    // Find the next available time slot
    const now = dayjs()
    const currentHour = now.hour()
    const currentMinute = Math.floor(now.minute() / 15) * 15
    
    let startTime = `${currentHour.toString().padStart(2, '0')}:${currentMinute.toString().padStart(2, '0')}`
    let endTime = dayjs(`2000-01-01 ${startTime}`).add(60, 'minute').format('HH:mm')
    
    // Check if current time is outside work hours
    if (currentHour < START_HOUR) {
      startTime = `${START_HOUR.toString().padStart(2, '0')}:00`
      endTime = `${(START_HOUR + 1).toString().padStart(2, '0')}:00`
    } else if (currentHour >= END_HOUR) {
      startTime = `${(END_HOUR - 1).toString().padStart(2, '0')}:00`
      endTime = `${END_HOUR.toString().padStart(2, '0')}:00`
    }
    
    const newSession: WorkSession = {
      id: `temp-${Date.now()}`,
      taskId: '',
      type: TaskType.Focused,
      startTime,
      endTime,
      duration: 60,
      isNew: true,
      isDirty: true,
    }
    
    if (checkOverlap(newSession)) {
      ArcoMessage.warning('This time slot overlaps with an existing session')
      return
    }
    
    setSessions([...sessions, newSession])
    setSelectedSession(newSession)
    setShowAssignModal(true)
  }

  // Handle mouse down for dragging
  const handleMouseDown = (e: React.MouseEvent, sessionId: string, edge: 'start' | 'end' | 'move') => {
    e.preventDefault()
    e.stopPropagation()
    
    const session = sessions.find(s => s.id === sessionId)
    if (!session) return
    
    setDragState({
      sessionId,
      edge,
      initialY: e.clientY,
      initialStartTime: session.startTime,
      initialEndTime: session.endTime,
    })
  }

  // Handle mouse move for dragging
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!dragState || !containerRef.current) return
      
      const rect = containerRef.current.getBoundingClientRect()
      const relativeY = e.clientY - rect.top + containerRef.current.scrollTop
      
      const session = sessions.find(s => s.id === dragState.sessionId)
      if (!session) return
      
      if (dragState.edge === 'move') {
        // Moving the entire block
        const deltaY = e.clientY - dragState.initialY
        const deltaMinutes = Math.round((deltaY / HOUR_HEIGHT) * 60)
        
        const startMinutes = timeToMinutes(dragState.initialStartTime) + deltaMinutes
        const endMinutes = timeToMinutes(dragState.initialEndTime) + deltaMinutes
        
        // Check bounds
        if (startMinutes >= START_HOUR * 60 && endMinutes <= END_HOUR * 60) {
          const newStartTime = roundToQuarter(pixelsToTime((startMinutes / 60) * HOUR_HEIGHT))
          const newEndTime = roundToQuarter(pixelsToTime((endMinutes / 60) * HOUR_HEIGHT))
          
          const updatedSession = {
            ...session,
            startTime: newStartTime,
            endTime: newEndTime,
            duration: calculateDuration(newStartTime, newEndTime),
            isDirty: true,
          }
          
          if (!checkOverlap(updatedSession, session.id)) {
            setSessions(sessions.map(s => s.id === session.id ? updatedSession : s))
          }
        }
      } else {
        // Resizing edges
        const newTime = roundToQuarter(pixelsToTime(relativeY))
        
        if (dragState.edge === 'start' && newTime < session.endTime) {
          const updatedSession = {
            ...session,
            startTime: newTime,
            duration: calculateDuration(newTime, session.endTime),
            isDirty: true,
          }
          
          if (!checkOverlap(updatedSession, session.id)) {
            setSessions(sessions.map(s => s.id === session.id ? updatedSession : s))
          }
        } else if (dragState.edge === 'end' && newTime > session.startTime) {
          const updatedSession = {
            ...session,
            endTime: newTime,
            duration: calculateDuration(session.startTime, newTime),
            isDirty: true,
          }
          
          if (!checkOverlap(updatedSession, session.id)) {
            setSessions(sessions.map(s => s.id === session.id ? updatedSession : s))
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
  }, [dragState, sessions])

  // Save sessions to database
  const saveSessions = async () => {
    setIsSaving(true)
    try {
      const db = getDatabase()
      
      // Get or create work pattern for this date
      let pattern = await db.getWorkPattern(selectedDate)
      if (!pattern) {
        pattern = await db.createWorkPattern({
          date: selectedDate,
          blocks: [],
          meetings: [],
        })
      }
      
      // Save dirty sessions
      for (const session of sessions.filter(s => s.isDirty)) {
        if (!session.taskId) continue // Skip unassigned sessions
        
        const startDateTime = dayjs(`${selectedDate} ${session.startTime}`)
        const endDateTime = dayjs(`${selectedDate} ${session.endTime}`)
        
        if (session.isNew) {
          // Create new session
          await db.createWorkSession({
            taskId: session.taskId,
            stepId: session.stepId,
            type: session.type,
            startTime: startDateTime.toDate(),
            endTime: endDateTime.toDate(),
            plannedMinutes: session.duration,
            actualMinutes: session.duration,
            notes: session.notes,
          })
        } else {
          // Update existing session
          await db.updateWorkSession(session.id, {
            taskId: session.taskId,
            stepId: session.stepId,
            type: session.type,
            startTime: startDateTime.toDate(),
            endTime: endDateTime.toDate(),
            actualMinutes: session.duration,
            notes: session.notes,
          })
        }
      }
      
      ArcoMessage.success('Work sessions saved successfully')
      await loadWorkSessions() // Reload to get proper IDs
      await loadTasks() // Reload tasks to update cumulative time
    } catch (error) {
      logger.ui.error('Failed to save work sessions:', error)
      ArcoMessage.error('Failed to save work sessions')
    } finally {
      setIsSaving(false)
    }
  }

  // Delete a session
  const deleteSession = async (sessionId: string) => {
    try {
      const session = sessions.find(s => s.id === sessionId)
      if (!session) return
      
      if (!session.isNew) {
        const db = getDatabase()
        await db.deleteWorkSession(sessionId)
      }
      
      setSessions(sessions.filter(s => s.id !== sessionId))
      ArcoMessage.success('Session deleted')
      await loadTasks() // Reload tasks to update cumulative time
    } catch (error) {
      logger.ui.error('Failed to delete session:', error)
      ArcoMessage.error('Failed to delete session')
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
        </div>
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
          const top = timeToPixels(session.startTime)
          const height = (session.duration / 60) * HOUR_HEIGHT
          const color = session.type === TaskType.Focused ? '#165DFF' : '#00B42A'
          
          return (
            <div
              key={session.id}
              style={{
                position: 'absolute',
                top,
                left: TIME_LABELS_WIDTH + 10,
                width: CONTENT_WIDTH - 20,
                height,
                background: session.isDirty ? `${color}22` : `${color}11`,
                border: `2px solid ${color}`,
                borderRadius: 8,
                padding: 8,
                cursor: 'move',
                userSelect: 'none',
                display: 'flex',
                flexDirection: 'column',
              }}
              onMouseDown={(e) => handleMouseDown(e, session.id, 'move')}
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
              <div style={{ flex: 1, overflow: 'hidden' }}>
                <Text style={{ fontSize: 12, fontWeight: 'bold' }}>
                  {session.taskName || 'Unassigned'}
                </Text>
                {session.stepName && (
                  <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>
                    {session.stepName}
                  </Text>
                )}
                <Text type="secondary" style={{ fontSize: 10, display: 'block', marginTop: 4 }}>
                  {session.startTime} - {session.endTime} ({session.duration} min)
                </Text>
              </div>
              
              {/* Actions */}
              <Space size={4} style={{ marginTop: 4 }}>
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
                <Popconfirm
                  title="Delete this session?"
                  onOk={() => deleteSession(session.id)}
                >
                  <Button size="mini" status="danger">
                    <IconDelete />
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
              disabled={!sessions.some(s => s.isDirty)}
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
              Focused: {sessions.filter(s => s.type === TaskType.Focused).reduce((sum, s) => sum + s.duration, 0)} min
            </Tag>
            <Tag color="green">
              Admin: {sessions.filter(s => s.type === TaskType.Admin).reduce((sum, s) => sum + s.duration, 0)} min
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
              value={
                selectedSession.stepId
                  ? `step:${selectedSession.stepId}:${selectedSession.taskId}`
                  : selectedSession.taskId
                  ? `task:${selectedSession.taskId}`
                  : undefined
              }
              onChange={(value) => {
                if (value.startsWith('step:')) {
                  const [, stepId, taskId] = value.split(':')
                  const task = [...tasks, ...sequencedTasks].find(t => t.id === taskId)
                  const step = task?.steps?.find(s => s.id === stepId)
                  setSelectedSession({
                    ...selectedSession,
                    taskId,
                    stepId,
                    taskName: task?.name,
                    stepName: step?.name,
                    type: step?.type as TaskType || TaskType.Focused,
                    isDirty: true,
                  })
                } else if (value.startsWith('task:')) {
                  const taskId = value.substring(5)
                  const task = [...tasks, ...sequencedTasks].find(t => t.id === taskId)
                  setSelectedSession({
                    ...selectedSession,
                    taskId,
                    stepId: undefined,
                    taskName: task?.name,
                    stepName: undefined,
                    type: task?.type as TaskType || TaskType.Focused,
                    isDirty: true,
                  })
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
              value={selectedSession.notes}
              onChange={(value) => setSelectedSession({
                ...selectedSession,
                notes: value,
                isDirty: true,
              })}
              rows={3}
            />
          </Space>
        )}
      </Modal>
    </Modal>
  )
}