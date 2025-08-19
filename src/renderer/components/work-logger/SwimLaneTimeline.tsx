import React, { useRef, useState, useEffect } from 'react'
import { Typography, Tooltip, Button, Slider } from '@arco-design/web-react'
import { IconDown, IconRight, IconZoomIn, IconZoomOut } from '@arco-design/web-react/icon'
import { Task } from '@shared/types'
import { SequencedTask } from '@shared/sequencing-types'
import { TaskType } from '@shared/enums'
import {
  WorkSessionData,
  minutesToTime,
  roundToQuarter,
  checkOverlap,
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
  expandedWorkflows?: Set<string>
  onExpandedWorkflowsChange?: (expanded: Set<string>) => void
}

const TIME_LABEL_WIDTH = 80
const START_HOUR = 6
const END_HOUR = 22
const TOTAL_HOURS = END_HOUR - START_HOUR
const MIN_LANE_HEIGHT = 20
const MAX_LANE_HEIGHT = 60
const MIN_HOUR_WIDTH = 40
const MAX_HOUR_WIDTH = 200

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
  expandedWorkflows: externalExpandedWorkflows,
  onExpandedWorkflowsChange,
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
  const [internalExpandedWorkflows, setInternalExpandedWorkflows] = useState<Set<string>>(new Set())
  const [laneHeight, setLaneHeight] = useState(30)
  const [hourWidth, setHourWidth] = useState(80)

  // Use external state if provided, otherwise use internal
  const expandedWorkflows = externalExpandedWorkflows ?? internalExpandedWorkflows
  const setExpandedWorkflows = onExpandedWorkflowsChange ?? setInternalExpandedWorkflows

  // Convert minutes to pixels
  const minutesToPixels = (minutes: number): number => {
    const hours = minutes / 60 - START_HOUR
    return hours * hourWidth + TIME_LABEL_WIDTH
  }

  // Convert pixels to minutes
  const pixelsToMinutes = (pixels: number): number => {
    const hours = (pixels - TIME_LABEL_WIDTH) / hourWidth + START_HOUR
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
    stepId?: string  // Add stepId to track workflow steps
    indent?: boolean
  }> = []

  // Build swim lanes - ensure stable ordering
  // First, deduplicate tasks by ID to avoid duplicate lanes
  const uniqueTasks = new Map<string, typeof tasks[0]>()
  tasks.forEach(task => {
    if (!uniqueTasks.has(task.id)) {
      uniqueTasks.set(task.id, task)
    }
  })

  Array.from(uniqueTasks.values()).forEach(task => {
    const hasSteps = task.hasSteps && task.steps && task.steps.length > 0

    if (!hasSteps) {
      // Regular task (not a workflow)
      const taskSessions = sessions.filter(s => s.taskId === task.id && !s.stepId)
      swimLanes.push({
        id: task.id,
        name: task.name,
        sessions: taskSessions,
        taskId: task.id,  // Add taskId for regular tasks too
        isWorkflow: false,
      })
      return
    }

    // It's a workflow
    const isExpanded = expandedWorkflows.has(task.id)

    if (!isExpanded) {
      // Collapsed: show all workflow sessions on single lane
      const allWorkflowSessions = sessions.filter(s =>
        s.taskId === task.id ||
        (task.steps?.some(step => step.id === s.stepId) || false),
      )

      swimLanes.push({
        id: task.id,
        name: task.name,
        sessions: allWorkflowSessions,
        isWorkflow: true,
        isExpanded: false,
        taskId: task.id,
      })
    } else {
      // Expanded: show header + individual step lanes

      // Workflow header (for expand/collapse button)
      swimLanes.push({
        id: task.id,
        name: task.name,
        sessions: [], // No sessions on header when expanded
        isWorkflow: true,
        isExpanded: true,
        taskId: task.id,
      })

      // Step lanes
      if (task.steps) {
        task.steps.forEach(step => {
          const stepSessions = sessions.filter(s => s.stepId === step.id)
          swimLanes.push({
            id: `${task.id}-${step.id}`,
            name: step.name,
            sessions: stepSessions,
            taskId: task.id,  // Add the parent task ID
            stepId: step.id,  // Add the step ID
            indent: true,
            isWorkflow: false,
          })
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
    if (!target.classList.contains('swim-lane')) {
      return
    }

    e.preventDefault()
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) {
      return
    }

    // Get the timeline area element to account for scroll
    const timelineArea = target.closest('.swim-lane') as HTMLElement
    if (!timelineArea) {
      return
    }
    const timelineRect = timelineArea.getBoundingClientRect()

    const x = e.clientX - timelineRect.left + TIME_LABEL_WIDTH
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
        const deltaMinutes = (deltaX / hourWidth) * 60

        if (dragState.edge === 'move') {
          const newStart = roundToQuarter(dragState.initialStartMinutes + deltaMinutes)
          const newEnd = roundToQuarter(dragState.initialEndMinutes + deltaMinutes)

          if (newStart >= START_HOUR * 60 && newEnd <= END_HOUR * 60) {
            // Check for overlaps
            const movedSession: WorkSessionData = {
              id: dragState.sessionId,
              taskId: '',
              taskName: '',
              startMinutes: newStart,
              endMinutes: newEnd,
              type: TaskType.Focused,
              color: '',
            }

            if (!checkOverlap(movedSession, sessions, dragState.sessionId)) {
              onSessionUpdate(dragState.sessionId, newStart, newEnd)
            }
          }
        } else if (dragState.edge === 'start') {
          const newStart = roundToQuarter(dragState.initialStartMinutes + deltaMinutes)
          if (newStart >= START_HOUR * 60 && newStart < dragState.initialEndMinutes) {
            const resizedSession: WorkSessionData = {
              id: dragState.sessionId,
              taskId: '',
              taskName: '',
              startMinutes: newStart,
              endMinutes: dragState.initialEndMinutes,
              type: TaskType.Focused,
              color: '',
            }

            if (!checkOverlap(resizedSession, sessions, dragState.sessionId)) {
              onSessionUpdate(dragState.sessionId, newStart, dragState.initialEndMinutes)
            }
          }
        } else if (dragState.edge === 'end') {
          const newEnd = roundToQuarter(dragState.initialEndMinutes + deltaMinutes)
          if (newEnd <= END_HOUR * 60 && newEnd > dragState.initialStartMinutes) {
            const resizedSession: WorkSessionData = {
              id: dragState.sessionId,
              taskId: '',
              taskName: '',
              startMinutes: dragState.initialStartMinutes,
              endMinutes: newEnd,
              type: TaskType.Focused,
              color: '',
            }

            if (!checkOverlap(resizedSession, sessions, dragState.sessionId)) {
              onSessionUpdate(dragState.sessionId, dragState.initialStartMinutes, newEnd)
            }
          }
        }
      } else if (creatingSession) {
        const container = containerRef.current
        if (!container) return

        // Find the specific swim lane being dragged on
        const lanes = Array.from(container.querySelectorAll('.swim-lane'))

        for (const lane of lanes) {
          const htmlLane = lane as HTMLElement
          const rect = htmlLane.getBoundingClientRect()
          if (e.clientY >= rect.top && e.clientY <= rect.bottom) {
            const x = e.clientX - rect.left + TIME_LABEL_WIDTH
            setCreatingSession({ ...creatingSession, currentX: x })
            break
          }
        }
      }
    }

    const handleMouseUp = () => {
      if (creatingSession) {
        const startMinutes = roundToQuarter(pixelsToMinutes(Math.min(creatingSession.startX, creatingSession.currentX)))
        const endMinutes = roundToQuarter(pixelsToMinutes(Math.max(creatingSession.startX, creatingSession.currentX)))

if (endMinutes - startMinutes >= 15) {
          // Check for overlaps with existing sessions
          const newSession: WorkSessionData = {
            id: 'temp-new',
            taskId: creatingSession.taskId,
            taskName: '',
            stepId: creatingSession.stepId,
            startMinutes,
            endMinutes,
            type: TaskType.Focused, // Will be set by parent
            color: '',
          }

          // Only check overlaps for sessions on the same lane
          const laneSessions = sessions.filter(s =>
            (creatingSession.stepId && s.stepId === creatingSession.stepId) ||
            (!creatingSession.stepId && s.taskId === creatingSession.taskId && !s.stepId),
          )

if (!checkOverlap(newSession, laneSessions)) {
            onSessionCreate(
              creatingSession.taskId,
              startMinutes,
              endMinutes,
              creatingSession.stepId,
            )
          }
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
  }, [dragState, creatingSession, onSessionUpdate, onSessionCreate, hourWidth])

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Zoom Controls */}
      <div style={{
        padding: '8px 16px',
        background: 'white',
        borderBottom: '1px solid #e5e6eb',
        display: 'flex',
        alignItems: 'center',
        gap: 16,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Text style={{ fontSize: 12, color: '#86909c' }}>Horizontal:</Text>
          <Button
            size="mini"
            icon={<IconZoomOut />}
            onClick={() => setHourWidth(Math.max(MIN_HOUR_WIDTH, hourWidth - 20))}
            disabled={hourWidth <= MIN_HOUR_WIDTH}
          />
          <Slider
            value={hourWidth}
            min={MIN_HOUR_WIDTH}
            max={MAX_HOUR_WIDTH}
            onChange={(val) => setHourWidth(val as number)}
            style={{ width: 100 }}
          />
          <Button
            size="mini"
            icon={<IconZoomIn />}
            onClick={() => setHourWidth(Math.min(MAX_HOUR_WIDTH, hourWidth + 20))}
            disabled={hourWidth >= MAX_HOUR_WIDTH}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Text style={{ fontSize: 12, color: '#86909c' }}>Vertical:</Text>
          <Button
            size="mini"
            icon={<IconZoomOut />}
            onClick={() => setLaneHeight(Math.max(MIN_LANE_HEIGHT, laneHeight - 5))}
            disabled={laneHeight <= MIN_LANE_HEIGHT}
          />
          <Slider
            value={laneHeight}
            min={MIN_LANE_HEIGHT}
            max={MAX_LANE_HEIGHT}
            onChange={(val) => setLaneHeight(val as number)}
            style={{ width: 100 }}
          />
          <Button
            size="mini"
            icon={<IconZoomIn />}
            onClick={() => setLaneHeight(Math.min(MAX_LANE_HEIGHT, laneHeight + 5))}
            disabled={laneHeight >= MAX_LANE_HEIGHT}
          />
        </div>
      </div>

      <div
        ref={containerRef}
        style={{
          position: 'relative',
          overflow: 'auto',
          background: '#fafbfc',
          borderRadius: 8,
          flex: 1,
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
                left: i * hourWidth,
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
              height: laneHeight,
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

                // Use the taskId and stepId directly from the lane object
                if (lane.taskId) {
                  handleLaneMouseDown(e, lane.taskId, lane.stepId)
                }
              }}
            >
              {/* Hour grid lines */}
              {Array.from({ length: TOTAL_HOURS + 1 }, (_, i) => (
                <div
                  key={i}
                  style={{
                    position: 'absolute',
                    left: i * hourWidth,
                    top: 0,
                    bottom: 0,
                    borderLeft: '1px solid #f0f0f0',
                  }}
                />
              ))}

              {/* Sessions */}
              {lane.sessions.map((session, sessionIndex) => {
                const left = minutesToPixels(session.startMinutes)
                const width = (session.endMinutes - session.startMinutes) / 60 * hourWidth
                const isSelected = session.id === selectedSessionId
                const isHovered = session.id === hoveredSession

                const sessionKey = `${lane.id}-${session.id}-${sessionIndex}`

                return (
                  <div
                    key={sessionKey}
                    style={{
                      position: 'absolute',
                      left: left - TIME_LABEL_WIDTH,
                      top: 4,
                      bottom: 4,
                      width,
                      background: session.completed
                        ? `repeating-linear-gradient(45deg, ${session.color}33, ${session.color}33 10px, ${session.color}55 10px, ${session.color}55 20px)`
                        : session.color + (isSelected ? '33' : '22'),
                      border: `2px solid ${session.color}`,
                      borderRadius: 4,
                      cursor: 'move',
                      display: 'flex',
                      alignItems: 'center',
                      padding: '0 4px',
                      overflow: 'hidden',
                      boxShadow: isHovered ? '0 2px 8px rgba(0,0,0,0.15)' : undefined,
                      transition: 'box-shadow 0.2s',
                      opacity: session.completed ? 0.8 : 1,
                    }}
                    onMouseDown={(e) => handleMouseDown(e, session.id, 'move')}
                    onMouseEnter={() => setHoveredSession(session.id)}
                    onMouseLeave={() => setHoveredSession(null)}
                    onClick={(e) => {
                      e.stopPropagation()
                      onSessionSelect(session.id)
                    }}
                  >
                    {/* Resize handles - only show when selected */}
                    {isSelected && (
                      <>
                        <div
                          style={{
                            position: 'absolute',
                            left: 0,
                            top: 0,
                            bottom: 0,
                            width: 8,
                            cursor: 'ew-resize',
                            background: 'rgba(255,255,255,0.5)',
                            borderLeft: `2px solid ${session.color}`,
                            zIndex: 10,
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
                            background: 'rgba(255,255,255,0.5)',
                            borderRight: `2px solid ${session.color}`,
                            zIndex: 10,
                          }}
                          onMouseDown={(e) => handleMouseDown(e, session.id, 'end')}
                        />
                      </>
                    )}

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
              {creatingSession && (
                (creatingSession.stepId && lane.id === `${creatingSession.taskId}-${creatingSession.stepId}`) ||
                (!creatingSession.stepId && lane.id === creatingSession.taskId)
              ) && (
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
    </div>
  )
}
