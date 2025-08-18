import React, { useRef, useState, useEffect } from 'react'
import { Typography, Tooltip, Button } from '@arco-design/web-react'
import { IconDown, IconRight } from '@arco-design/web-react/icon'
import { Task } from '@shared/types'
import { SequencedTask } from '@shared/sequencing-types'
import {
  WorkSessionData,
  minutesToTime,
  roundToQuarter,
} from './SessionState'

const { Text } = Typography

interface SwimLaneTimelineProps {
  sessions: WorkSessionData[]
  tasks: (Task | SequencedTask)[]
  onSessionUpdate: (id: string, startMinutes: number, endMinutes: number) => void
  onSessionCreate: (taskId: string, startMinutes: number, endMinutes: number, stepId?: string) => void
  onSessionDelete: (id: string) => void
  selectedSessionId?: string
  onSessionSelect: (id: string | null) => void
}

const LANE_HEIGHT = 40
const TIME_LABEL_WIDTH = 60
const HOUR_WIDTH = 120 // Pixels per hour
const START_HOUR = 6
const END_HOUR = 22
const TOTAL_HOURS = END_HOUR - START_HOUR

interface DragState {
  sessionId: string
  edge: 'start' | 'end' | 'move'
  initialX: number
  initialStartMinutes: number
  initialEndMinutes: number
}

export function SwimLaneTimeline({
  sessions,
  tasks,
  onSessionUpdate,
  onSessionCreate,
  onSessionDelete: _onSessionDelete,
  selectedSessionId,
  onSessionSelect,
}: SwimLaneTimelineProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [dragState, setDragState] = useState<DragState | null>(null)
  const [creatingSession, setCreatingSession] = useState<{
    taskId: string
    stepId?: string
    startX: number
    currentX: number
  } | null>(null)
  const [hoveredSession, setHoveredSession] = useState<string | null>(null)
  const [expandedWorkflows, setExpandedWorkflows] = useState<Set<string>>(new Set())

  // Convert minutes to pixels
  const minutesToPixels = (minutes: number): number => {
    const hours = minutes / 60 - START_HOUR
    return hours * HOUR_WIDTH + TIME_LABEL_WIDTH
  }

  // Convert pixels to minutes
  const pixelsToMinutes = (pixels: number): number => {
    const hours = (pixels - TIME_LABEL_WIDTH) / HOUR_WIDTH + START_HOUR
    return Math.max(START_HOUR * 60, Math.min(END_HOUR * 60, hours * 60))
  }

  // Toggle workflow expansion
  const toggleWorkflow = (taskId: string) => {
    setExpandedWorkflows(prev => {
      const next = new Set(prev)
      if (next.has(taskId)) {
        next.delete(taskId)
      } else {
        next.add(taskId)
      }
      return next
    })
  }

  // Build swim lanes with collapsible workflows
  const swimLanes: Array<{ 
    id: string
    name: string
    sessions: WorkSessionData[]
    isWorkflow?: boolean
    isExpanded?: boolean
    taskId?: string
    indent?: boolean
  }> = []

  tasks.forEach(task => {
    const isWorkflow = task.hasSteps && task.steps && task.steps.length > 0
    const isExpanded = expandedWorkflows.has(task.id)
    
    if (isWorkflow) {
      // Get all sessions for this workflow (including steps)
      const allWorkflowSessions = sessions.filter(s => 
        s.taskId === task.id || 
        (task.steps && task.steps.some(step => step.id === s.stepId))
      )
      
      // Add workflow header lane
      swimLanes.push({
        id: task.id,
        name: task.name,
        sessions: isExpanded ? [] : allWorkflowSessions, // Show all sessions when collapsed
        isWorkflow: true,
        isExpanded,
        taskId: task.id,
      })
      
      // Add step lanes if expanded
      if (isExpanded && task.steps) {
        task.steps.forEach(step => {
          const stepSessions = sessions.filter(s => s.stepId === step.id)
          swimLanes.push({
            id: `${task.id}-${step.id}`,
            name: step.name,
            sessions: stepSessions,
            indent: true,
          })
        })
      }
    } else {
      // Regular task
      const taskSessions = sessions.filter(s => s.taskId === task.id && !s.stepId)
      if (taskSessions.length > 0 || !isWorkflow) {
        swimLanes.push({
          id: task.id,
          name: task.name,
          sessions: taskSessions,
        })
      }
    }
  })

  // Handle drag start
  const handleMouseDown = (
    e: React.MouseEvent,
    sessionId: string,
    edge: 'start' | 'end' | 'move',
  ) => {
    e.preventDefault()
    e.stopPropagation()

    const session = sessions.find(s => s.id === sessionId)
    if (!session) return

    setDragState({
      sessionId,
      edge,
      initialX: e.clientX,
      initialStartMinutes: session.startMinutes,
      initialEndMinutes: session.endMinutes,
    })

    onSessionSelect(sessionId)
  }

  // Handle creating new session by dragging
  const handleLaneMouseDown = (
    e: React.MouseEvent,
    taskId: string,
    stepId?: string,
  ) => {
    // Only create if clicking on empty space
    const target = e.target as HTMLElement
    if (!target.classList.contains('swim-lane')) return

    e.preventDefault()
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return

    const x = e.clientX - rect.left
    setCreatingSession({
      taskId,
      stepId,
      startX: x,
      currentX: x,
    })
  }

  // Handle drag move
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (dragState) {
        const deltaX = e.clientX - dragState.initialX
        const deltaMinutes = (deltaX / HOUR_WIDTH) * 60

        if (dragState.edge === 'move') {
          const newStart = roundToQuarter(dragState.initialStartMinutes + deltaMinutes)
          const newEnd = roundToQuarter(dragState.initialEndMinutes + deltaMinutes)

          if (newStart >= START_HOUR * 60 && newEnd <= END_HOUR * 60) {
            onSessionUpdate(dragState.sessionId, newStart, newEnd)
          }
        } else if (dragState.edge === 'start') {
          const newStart = roundToQuarter(dragState.initialStartMinutes + deltaMinutes)
          if (newStart >= START_HOUR * 60 && newStart < dragState.initialEndMinutes) {
            onSessionUpdate(dragState.sessionId, newStart, dragState.initialEndMinutes)
          }
        } else if (dragState.edge === 'end') {
          const newEnd = roundToQuarter(dragState.initialEndMinutes + deltaMinutes)
          if (newEnd <= END_HOUR * 60 && newEnd > dragState.initialStartMinutes) {
            onSessionUpdate(dragState.sessionId, dragState.initialStartMinutes, newEnd)
          }
        }
      } else if (creatingSession) {
        const rect = containerRef.current?.getBoundingClientRect()
        if (!rect) return

        const x = e.clientX - rect.left
        setCreatingSession({ ...creatingSession, currentX: x })
      }
    }

    const handleMouseUp = () => {
      if (creatingSession) {
        const startMinutes = roundToQuarter(pixelsToMinutes(Math.min(creatingSession.startX, creatingSession.currentX)))
        const endMinutes = roundToQuarter(pixelsToMinutes(Math.max(creatingSession.startX, creatingSession.currentX)))

        if (endMinutes - startMinutes >= 15) {
          onSessionCreate(
            creatingSession.taskId,
            startMinutes,
            endMinutes,
            creatingSession.stepId,
          )
        }
        setCreatingSession(null)
      }
      setDragState(null)
    }

    if (dragState || creatingSession) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      return () => {
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
      }
    }
  }, [dragState, creatingSession, onSessionUpdate, onSessionCreate])

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        overflow: 'auto',
        background: '#fafbfc',
        borderRadius: 8,
        height: '100%',
      }}
    >
      {/* Time axis header */}
      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 10,
          background: 'white',
          borderBottom: '1px solid #e5e6eb',
          height: 40,
          display: 'flex',
        }}
      >
        <div
          style={{
            width: TIME_LABEL_WIDTH,
            borderRight: '1px solid #e5e6eb',
            display: 'flex',
            alignItems: 'center',
            paddingLeft: 8,
          }}
        >
          <Text style={{ fontWeight: 'bold' }}>Tasks</Text>
        </div>
        <div style={{ flex: 1, position: 'relative' }}>
          {Array.from({ length: TOTAL_HOURS + 1 }, (_, i) => (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: i * HOUR_WIDTH,
                top: 0,
                height: '100%',
                borderLeft: '1px solid #e5e6eb',
                paddingLeft: 4,
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <Text style={{ fontSize: 12, color: '#86909c' }}>
                {(START_HOUR + i).toString().padStart(2, '0')}:00
              </Text>
            </div>
          ))}
        </div>
      </div>

      {/* Swim lanes */}
      <div style={{ position: 'relative' }}>
        {swimLanes.map((lane) => (
          <div
            key={lane.id}
            style={{
              height: LANE_HEIGHT,
              borderBottom: '1px solid #e5e6eb',
              display: 'flex',
              position: 'relative',
            }}
          >
            {/* Task name */}
            <div
              style={{
                width: TIME_LABEL_WIDTH,
                borderRight: '1px solid #e5e6eb',
                padding: '4px',
                display: 'flex',
                alignItems: 'center',
                background: lane.isWorkflow ? '#f5f7fa' : 'white',
                position: 'sticky',
                left: 0,
                zIndex: 5,
                paddingLeft: lane.indent ? 24 : 4,
              }}
            >
              {lane.isWorkflow && (
                <Button
                  size="mini"
                  type="text"
                  icon={lane.isExpanded ? <IconDown /> : <IconRight />}
                  onClick={() => toggleWorkflow(lane.taskId!)}
                  style={{ 
                    minWidth: 20, 
                    width: 20, 
                    height: 20,
                    padding: 0,
                    marginRight: 4,
                  }}
                />
              )}
              <Tooltip content={lane.name}>
                <Text
                  style={{
                    fontSize: 11,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    fontWeight: lane.isWorkflow ? 'bold' : 'normal',
                  }}
                >
                  {lane.name}
                </Text>
              </Tooltip>
            </div>

            {/* Timeline area */}
            <div
              className="swim-lane"
              style={{
                flex: 1,
                position: 'relative',
                cursor: 'crosshair',
              }}
              onMouseDown={(e) => {
                // Don't allow creating on collapsed workflow lanes - user should expand first
                if (lane.isWorkflow && !lane.isExpanded) {
                  return
                }
                const [taskId, stepId] = lane.id.split('-')
                handleLaneMouseDown(e, taskId, stepId)
              }}
            >
              {/* Hour grid lines */}
              {Array.from({ length: TOTAL_HOURS + 1 }, (_, i) => (
                <div
                  key={i}
                  style={{
                    position: 'absolute',
                    left: i * HOUR_WIDTH,
                    top: 0,
                    bottom: 0,
                    borderLeft: '1px solid #f0f0f0',
                  }}
                />
              ))}

              {/* Sessions */}
              {lane.sessions.map(session => {
                const left = minutesToPixels(session.startMinutes)
                const width = (session.endMinutes - session.startMinutes) / 60 * HOUR_WIDTH
                const isSelected = session.id === selectedSessionId
                const isHovered = session.id === hoveredSession

                return (
                  <div
                    key={session.id}
                    style={{
                      position: 'absolute',
                      left: left - TIME_LABEL_WIDTH,
                      top: 4,
                      bottom: 4,
                      width,
                      background: session.color + (isSelected ? '33' : '22'),
                      border: `2px solid ${session.color}`,
                      borderRadius: 4,
                      cursor: 'move',
                      display: 'flex',
                      alignItems: 'center',
                      padding: '0 4px',
                      overflow: 'hidden',
                      boxShadow: isHovered ? '0 2px 8px rgba(0,0,0,0.15)' : undefined,
                      transition: 'box-shadow 0.2s',
                    }}
                    onMouseDown={(e) => handleMouseDown(e, session.id, 'move')}
                    onMouseEnter={() => setHoveredSession(session.id)}
                    onMouseLeave={() => setHoveredSession(null)}
                    onClick={(e) => {
                      e.stopPropagation()
                      onSessionSelect(session.id)
                    }}
                  >
                    {/* Resize handles */}
                    <div
                      style={{
                        position: 'absolute',
                        left: 0,
                        top: 0,
                        bottom: 0,
                        width: 8,
                        cursor: 'ew-resize',
                      }}
                      onMouseDown={(e) => handleMouseDown(e, session.id, 'start')}
                    />
                    <div
                      style={{
                        position: 'absolute',
                        right: 0,
                        top: 0,
                        bottom: 0,
                        width: 8,
                        cursor: 'ew-resize',
                      }}
                      onMouseDown={(e) => handleMouseDown(e, session.id, 'end')}
                    />

                    {/* Session content */}
                    <Tooltip
                      content={
                        <div>
                          <div>{session.taskName}</div>
                          {session.stepName && <div>{session.stepName}</div>}
                          <div>
                            {minutesToTime(session.startMinutes)} - {minutesToTime(session.endMinutes)}
                          </div>
                          <div>{session.endMinutes - session.startMinutes} minutes</div>
                        </div>
                      }
                    >
                      <Text
                        style={{
                          fontSize: 11,
                          color: 'white',
                          fontWeight: 500,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {width > 60 && `${Math.round((session.endMinutes - session.startMinutes) / 60 * 10) / 10}h`}
                      </Text>
                    </Tooltip>
                  </div>
                )
              })}

              {/* Creating session preview */}
              {creatingSession && lane.id === `${creatingSession.taskId}${creatingSession.stepId ? '-' + creatingSession.stepId : ''}` && (
                <div
                  style={{
                    position: 'absolute',
                    left: Math.min(creatingSession.startX, creatingSession.currentX) - TIME_LABEL_WIDTH,
                    top: 4,
                    bottom: 4,
                    width: Math.abs(creatingSession.currentX - creatingSession.startX),
                    background: '#165DFF22',
                    border: '2px dashed #165DFF',
                    borderRadius: 4,
                    pointerEvents: 'none',
                  }}
                />
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
