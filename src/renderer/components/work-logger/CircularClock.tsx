import React, { useState, useRef, useEffect } from 'react'
import { Tooltip } from '@arco-design/web-react'
import { TaskType } from '@shared/enums'
import {
  WorkSessionData,
  generateArcPath,
  angleToMinutes,
  minutesToTime,
  roundToQuarter,
  checkOverlap,
} from './SessionState'

interface CircularClockProps {
  sessions: WorkSessionData[]
  collapsedWorkflows?: Set<string>
  onSessionUpdate: (id: string, startMinutes: number, endMinutes: number) => void
  onSessionCreate: (startMinutes: number, endMinutes: number) => void
  onSessionDelete: (id: string) => void
  selectedSessionId?: string
  onSessionSelect: (id: string | null) => void
  currentTime?: Date
  meetings?: Array<{ startMinutes: number; endMinutes: number; name: string }>
  sleepBlocks?: Array<{ startMinutes: number; endMinutes: number }>
}

interface DragState {
  sessionId: string
  edge: 'start' | 'end' | 'move'
  initialAngle: number
  initialStartMinutes: number
  initialEndMinutes: number
}

const CLOCK_SIZE = 240
const CENTER = CLOCK_SIZE / 2
const OUTER_RADIUS = 100
const INNER_RADIUS = 70
const MIDDLE_RADIUS = 85
const HOUR_LABEL_RADIUS = 110

// Workday configuration - 12 hour focus from 8 AM to 8 PM
const WORKDAY_START = 8 // 8 AM
const WORKDAY_END = 20 // 8 PM
const WORKDAY_HOURS = WORKDAY_END - WORKDAY_START // 12 hours

// Circadian rhythm peaks and dips
const MORNING_PEAK = 10 // 10 AM - Morning alertness peak
const AFTERNOON_DIP = 14 // 2 PM - Post-lunch dip
const EVENING_PEAK = 18 // 6 PM - Evening alertness peak

export function CircularClock({
  sessions,
  collapsedWorkflows = new Set(),
  onSessionUpdate,
  onSessionCreate,
  onSessionDelete: _onSessionDelete,
  selectedSessionId,
  onSessionSelect,
  currentTime = new Date(),
}: CircularClockProps) {
  const svgRef = useRef<any>(null)
  const [dragState, setDragState] = useState<DragState | null>(null)
  const [creatingSession, setCreatingSession] = useState<{
    startMinutes: number
    currentMinutes: number
  } | null>(null)
  const [hoveredSession, setHoveredSession] = useState<string | null>(null)

  // Get current time in minutes
  const currentMinutes = currentTime.getHours() * 60 + currentTime.getMinutes()
  
  // Convert minutes to angle for 12-hour workday clock (8 AM = top)
  const minutesToAngle = (minutes: number): number => {
    const hours = minutes / 60
    // Map hours to 0-360 degrees where 8 AM is at top (270 degrees)
    if (hours >= WORKDAY_START && hours <= WORKDAY_END) {
      // During workday: map to full circle
      const workdayProgress = (hours - WORKDAY_START) / WORKDAY_HOURS
      return (workdayProgress * 360 - 90) % 360
    }
    // Outside workday: compress into inner ring
    return -1 // Signal to use inner ring
  }

  // Process sessions to handle collapsed workflows
  const displaySessions = React.useMemo(() => {
    if (collapsedWorkflows.size === 0) {
      return sessions
    }

    const processedSessions: WorkSessionData[] = []

    // Process each session
    sessions.forEach(session => {
      if (session.taskId && collapsedWorkflows.has(session.taskId)) {
        // This session belongs to a collapsed workflow
        // Keep the session but mark it as part of a collapsed workflow
        processedSessions.push({
          ...session,
          isCollapsed: true,
          // Add a note to indicate it's part of a collapsed workflow
          notes: `${session.taskName}${session.stepName ? ' - ' + session.stepName : ''}`,
        })
      } else {
        // Regular session or expanded workflow step
        processedSessions.push(session)
      }
    })

    return processedSessions
  }, [sessions, collapsedWorkflows])

  // Handle mouse position to minutes conversion
  const getMinutesFromMouse = (e: React.MouseEvent | MouseEvent): number => {
    if (!svgRef.current) return 0

    const rect = svgRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left - CENTER
    const y = e.clientY - rect.top - CENTER

    return angleToMinutes(x + CENTER, y + CENTER, CENTER, CENTER, WORKDAY_START, WORKDAY_HOURS)
  }

  // Handle arc click/drag start
  const handleArcMouseDown = (
    e: React.MouseEvent,
    sessionId: string,
    edge: 'start' | 'end' | 'move',
  ) => {
    e.preventDefault()
    e.stopPropagation()

    const session = displaySessions.find(s => s.id === sessionId)
    if (!session) return

    const minutes = getMinutesFromMouse(e)

    setDragState({
      sessionId,
      edge,
      initialAngle: minutes,
      initialStartMinutes: session.startMinutes,
      initialEndMinutes: session.endMinutes,
    })

    onSessionSelect(sessionId)
  }

  // Handle clock face click to create new session
  const handleClockClick = (e: React.MouseEvent) => {
    // Check if clicking on empty space
    const target = e.target as Element
    if (!target.classList.contains('clock-face')) return

    const minutes = roundToQuarter(getMinutesFromMouse(e))
    setCreatingSession({
      startMinutes: minutes,
      currentMinutes: minutes,
    })
  }

  // Handle drag and creation
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const minutes = getMinutesFromMouse(e)

      if (dragState) {
        const deltaMinutes = minutes - dragState.initialAngle

        if (dragState.edge === 'move') {
          let newStart = dragState.initialStartMinutes + deltaMinutes
          let newEnd = dragState.initialEndMinutes + deltaMinutes

          // Handle wrap-around at midnight
          if (newStart < 0) {
            newStart += 1440
            newEnd += 1440
          } else if (newEnd > 1440) {
            newStart -= 1440
            newEnd -= 1440
          }

          // Check for overlaps
          const movedSession: WorkSessionData = {
            id: dragState.sessionId,
            taskId: '',
            taskName: '',
            startMinutes: roundToQuarter(newStart % 1440),
            endMinutes: roundToQuarter(newEnd % 1440),
            type: TaskType.Focused,
            color: '',
          }

          if (!checkOverlap(movedSession, displaySessions, dragState.sessionId)) {
            onSessionUpdate(
              dragState.sessionId,
              roundToQuarter(newStart % 1440),
              roundToQuarter(newEnd % 1440),
            )
          }
        } else if (dragState.edge === 'start') {
          const newStart = roundToQuarter(minutes)
          if (newStart !== dragState.initialEndMinutes) {
            const resizedSession: WorkSessionData = {
              id: dragState.sessionId,
              taskId: '',
              taskName: '',
              startMinutes: newStart,
              endMinutes: dragState.initialEndMinutes,
              type: TaskType.Focused,
              color: '',
            }

            if (!checkOverlap(resizedSession, displaySessions, dragState.sessionId)) {
              onSessionUpdate(dragState.sessionId, newStart, dragState.initialEndMinutes)
            }
          }
        } else if (dragState.edge === 'end') {
          const newEnd = roundToQuarter(minutes)
          if (newEnd !== dragState.initialStartMinutes) {
            const resizedSession: WorkSessionData = {
              id: dragState.sessionId,
              taskId: '',
              taskName: '',
              startMinutes: dragState.initialStartMinutes,
              endMinutes: newEnd,
              type: TaskType.Focused,
              color: '',
            }

            if (!checkOverlap(resizedSession, displaySessions, dragState.sessionId)) {
              onSessionUpdate(dragState.sessionId, dragState.initialStartMinutes, newEnd)
            }
          }
        }
      } else if (creatingSession) {
        setCreatingSession({
          ...creatingSession,
          currentMinutes: roundToQuarter(minutes),
        })
      }
    }

    const handleMouseUp = () => {
      if (creatingSession) {
        const start = Math.min(creatingSession.startMinutes, creatingSession.currentMinutes)
        const end = Math.max(creatingSession.startMinutes, creatingSession.currentMinutes)

        if (end - start >= 15) {
          // Check for overlaps with existing sessions
          const newSession: WorkSessionData = {
            id: 'temp-new',
            taskId: '',
            taskName: '',
            startMinutes: start,
            endMinutes: end,
            type: TaskType.Focused,
            color: '',
          }

          if (!checkOverlap(newSession, displaySessions)) {
            onSessionCreate(start, end)
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
  }, [dragState, creatingSession, onSessionUpdate, onSessionCreate])

  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: 16 }}>
      <svg
        ref={svgRef}
        width={CLOCK_SIZE}
        height={CLOCK_SIZE}
        style={{ cursor: 'crosshair' }}
      >
        {/* Clock face background */}
        <circle
          className="clock-face"
          cx={CENTER}
          cy={CENTER}
          r={OUTER_RADIUS}
          fill="#f5f7fa"
          stroke="#e5e6eb"
          strokeWidth={2}
          onClick={handleClockClick}
        />

        {/* Inner circle */}
        <circle
          cx={CENTER}
          cy={CENTER}
          r={INNER_RADIUS}
          fill="white"
          stroke="#e5e6eb"
          strokeWidth={1}
        />

        {/* Hour markers and labels for 12-hour workday */}
        {Array.from({ length: WORKDAY_HOURS + 1 }, (_, i) => {
          const hour = WORKDAY_START + i
          const angle = (i * 30 - 90) * (Math.PI / 180) // 30 degrees per hour
          const isMainHour = i % 3 === 0 // Show every 3 hours
          const markerRadius = isMainHour ? OUTER_RADIUS : OUTER_RADIUS - 5
          const x1 = CENTER + (OUTER_RADIUS - 10) * Math.cos(angle)
          const y1 = CENTER + (OUTER_RADIUS - 10) * Math.sin(angle)
          const x2 = CENTER + markerRadius * Math.cos(angle)
          const y2 = CENTER + markerRadius * Math.sin(angle)

          const labelX = CENTER + HOUR_LABEL_RADIUS * Math.cos(angle)
          const labelY = CENTER + HOUR_LABEL_RADIUS * Math.sin(angle)

          // Check if this is a circadian peak or dip
          const isCircadianPoint = hour === MORNING_PEAK || hour === AFTERNOON_DIP || hour === EVENING_PEAK

          return (
            <g key={hour}>
              {/* Hour marker */}
              <line
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={isCircadianPoint ? '#165DFF' : '#86909c'}
                strokeWidth={isMainHour ? 2 : 1}
              />

              {/* Hour label */}
              {isMainHour && (
                <text
                  x={labelX}
                  y={labelY + 4}
                  textAnchor="middle"
                  fontSize={12}
                  fill={isCircadianPoint ? '#165DFF' : '#4e5969'}
                  fontWeight="bold"
                >
                  {hour > 12 ? hour - 12 : hour}
                  {hour >= 12 ? 'pm' : 'am'}
                </text>
              )}
            </g>
          )
        })}

        {/* Circadian rhythm indicators */}
        <text
          x={CENTER}
          y={CENTER - 30}
          textAnchor="middle"
          fontSize={10}
          fill="#165DFF"
        >
          Peak Focus
        </text>
        <text
          x={CENTER}
          y={CENTER + 35}
          textAnchor="middle"
          fontSize={10}
          fill="#FF7D00"
        >
          Low Energy
        </text>

        {/* Work sessions as arcs */}
        {displaySessions.map(session => {
          const isSelected = session.id === selectedSessionId
          const isHovered = session.id === hoveredSession
          const isCollapsed = session.isCollapsed || false

          // Use consistent arc radii for all sessions
          const arcInnerRadius = INNER_RADIUS
          const arcOuterRadius = OUTER_RADIUS

          const path = generateArcPath(
            session.startMinutes,
            session.endMinutes,
            arcInnerRadius,
            arcOuterRadius,
            CENTER,
            CENTER,
            WORKDAY_START,
            WORKDAY_HOURS,
          )

          return (
            <g key={session.id}>
              {/* Main arc */}
              <Tooltip
                content={
                  <div>
                    <div>{session.taskName}</div>
                    {session.stepName && <div>{session.stepName}</div>}
                    {isCollapsed && session.notes && <div style={{ fontSize: '0.9em', opacity: 0.8 }}>{session.notes}</div>}
                    <div>
                      {minutesToTime(session.startMinutes)} - {minutesToTime(session.endMinutes)}
                    </div>
                    <div>{session.endMinutes - session.startMinutes} minutes</div>
                  </div>
                }
              >
                <path
                  d={path}
                  fill={session.color + (isSelected ? '44' : '33')}
                  stroke={session.color}
                  strokeWidth={isSelected ? 3 : 2}
                  strokeDasharray={isCollapsed ? '4 2' : undefined}
                  style={{
                    cursor: 'move',
                    filter: isHovered ? 'brightness(1.1)' : undefined,
                    transition: 'filter 0.2s',
                  }}
                  onMouseDown={(e) => handleArcMouseDown(e, session.id, 'move')}
                  onMouseEnter={() => setHoveredSession(session.id)}
                  onMouseLeave={() => setHoveredSession(null)}
                  onClick={(e) => {
                    e.stopPropagation()
                    onSessionSelect(session.id)
                  }}
                />
              </Tooltip>

              {/* Drag handles at edges */}
              {isSelected && (
                <>
                  {/* Start handle */}
                  <circle
                    cx={CENTER + ((arcInnerRadius + arcOuterRadius) / 2) * Math.cos((session.startMinutes / 60 * 30 - 90) * Math.PI / 180)}
                    cy={CENTER + ((arcInnerRadius + arcOuterRadius) / 2) * Math.sin((session.startMinutes / 60 * 30 - 90) * Math.PI / 180)}
                    r={6}
                    fill="white"
                    stroke={session.color}
                    strokeWidth={2}
                    style={{ cursor: 'ew-resize' }}
                    onMouseDown={(e) => handleArcMouseDown(e, session.id, 'start')}
                  />

                  {/* End handle */}
                  <circle
                    cx={CENTER + ((arcInnerRadius + arcOuterRadius) / 2) * Math.cos((session.endMinutes / 60 * 30 - 90) * Math.PI / 180)}
                    cy={CENTER + ((arcInnerRadius + arcOuterRadius) / 2) * Math.sin((session.endMinutes / 60 * 30 - 90) * Math.PI / 180)}
                    r={6}
                    fill="white"
                    stroke={session.color}
                    strokeWidth={2}
                    style={{ cursor: 'ew-resize' }}
                    onMouseDown={(e) => handleArcMouseDown(e, session.id, 'end')}
                  />
                </>
              )}
            </g>
          )
        })}

        {/* Creating session preview */}
        {creatingSession && (
          <path
            d={generateArcPath(
              Math.min(creatingSession.startMinutes, creatingSession.currentMinutes),
              Math.max(creatingSession.startMinutes, creatingSession.currentMinutes),
              INNER_RADIUS,
              OUTER_RADIUS,
              CENTER,
              CENTER,
              WORKDAY_START,
              WORKDAY_HOURS,
            )}
            fill="#165DFF22"
            stroke="#165DFF"
            strokeWidth={2}
            strokeDasharray="4 2"
            pointerEvents="none"
          />
        )}

        {/* Current time indicator - only show during workday */}
        {currentMinutes >= WORKDAY_START * 60 && currentMinutes <= WORKDAY_END * 60 && (
          <line
            x1={CENTER}
            y1={CENTER}
            x2={CENTER + (OUTER_RADIUS - 20) * Math.cos(minutesToAngle(currentMinutes) * Math.PI / 180)}
            y2={CENTER + (OUTER_RADIUS - 20) * Math.sin(minutesToAngle(currentMinutes) * Math.PI / 180)}
            stroke="#f53f3f"
            strokeWidth={2}
            strokeLinecap="round"
          />
        )}

        {/* Center dot */}
        <circle
          cx={CENTER}
          cy={CENTER}
          r={4}
          fill="#f53f3f"
        />

        {/* Current time text */}
        <text
          x={CENTER}
          y={CENTER + 50}
          textAnchor="middle"
          fontSize={14}
          fill="#1d2129"
          fontWeight="bold"
        >
          {currentTime.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
          })}
        </text>
      </svg>
    </div>
  )
}
