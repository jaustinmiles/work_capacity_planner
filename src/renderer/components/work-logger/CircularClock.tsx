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
import { useContainerQuery } from '../../hooks/useContainerQuery'
import { useResponsive } from '../../providers/ResponsiveProvider'

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
  bedtimeHour?: number
  wakeTimeHour?: number
}

interface DragState {
  sessionId: string
  edge: 'start' | 'end' | 'move'
  initialAngle: number
  initialStartMinutes: number
  initialEndMinutes: number
}

const BASE_CLOCK_SIZE = 400
const BASE_OUTER_RADIUS = 170
const BASE_INNER_RADIUS = 120
const BASE_HOUR_LABEL_RADIUS = 185

// Clock configuration - Show full 24 hours
const WORKDAY_START = 0 // 12 AM (midnight)
const WORKDAY_END = 24 // 12 AM next day (full day)
const WORKDAY_HOURS = WORKDAY_END - WORKDAY_START // 24 hours

// Default circadian rhythm peaks and dips (based on 10 PM bedtime)
const DEFAULT_BEDTIME = 22 // 10 PM
const DEFAULT_WAKE_TIME = 6 // 6 AM

export function CircularClock({
  sessions,
  collapsedWorkflows = new Set(),
  onSessionUpdate,
  onSessionCreate,
  onSessionDelete: _onSessionDelete,
  selectedSessionId,
  onSessionSelect,
  currentTime = new Date(),
  bedtimeHour = DEFAULT_BEDTIME,
  wakeTimeHour = DEFAULT_WAKE_TIME,
}: CircularClockProps) {
  const svgRef = useRef<any>(null)
  const [dragState, setDragState] = useState<DragState | null>(null)
  const [creatingSession, setCreatingSession] = useState<{
    startMinutes: number
    currentMinutes: number
  } | null>(null)
  const [hoveredSession, setHoveredSession] = useState<string | null>(null)

  // Responsive sizing
  const { ref: clockContainerRef, width: containerWidth, height: containerHeight } = useContainerQuery<HTMLDivElement>()
  const { scale: _globalScale, isCompact: _isCompact, isMobile } = useResponsive()

  // Calculate responsive dimensions based on container
  const calculateClockDimensions = () => {
    // Use container size if available, with padding
    const maxSize = Math.min(
      containerWidth || BASE_CLOCK_SIZE,
      containerHeight || BASE_CLOCK_SIZE,
      isMobile ? 360 : 600,  // Increased from 320/400 to 360/600
    ) - 40 // 40px padding

    const size = Math.max(300, maxSize) // Increased minimum from 200px to 300px
    const scale = size / BASE_CLOCK_SIZE

    return {
      clockSize: size,
      center: size / 2,
      outerRadius: BASE_OUTER_RADIUS * scale,
      innerRadius: BASE_INNER_RADIUS * scale,
      hourLabelRadius: BASE_HOUR_LABEL_RADIUS * scale,
      fontSize: {
        hours: Math.max(10, Math.floor(12 * scale)),
        labels: Math.max(8, Math.floor(11 * scale)),
        tiny: Math.max(6, Math.floor(8 * scale)),
      },
    }
  }

  const dimensions = calculateClockDimensions()
  const { clockSize, center, outerRadius, innerRadius, hourLabelRadius, fontSize } = dimensions

  // Get current time in minutes
  const currentMinutes = currentTime.getHours() * 60 + currentTime.getMinutes()

  // Calculate circadian rhythm peaks based on user's sleep schedule
  // Based on typical circadian patterns:
  // - Morning peak: ~4 hours after waking
  // - Afternoon dip: ~8 hours after waking
  // - Evening peak: ~4 hours before bedtime
  const morningPeak = (wakeTimeHour + 4) % 24
  const afternoonDip = (wakeTimeHour + 8) % 24
  const eveningPeak = (bedtimeHour - 4 + 24) % 24

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
    const x = e.clientX - rect.left - center
    const y = e.clientY - rect.top - center

    return angleToMinutes(x + center, y + center, center, center, WORKDAY_START, WORKDAY_HOURS)
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
    <div ref={clockContainerRef} className="circular-clock" style={{ display: 'flex', justifyContent: 'center', padding: 16, width: '100%', minHeight: 400 }}>
      <svg
        ref={svgRef}
        width={clockSize}
        height={clockSize}
        style={{ cursor: 'crosshair' }}
      >
        {/* Clock face background */}
        <circle
          className="clock-face"
          cx={center}
          cy={center}
          r={outerRadius}
          fill="#f5f7fa"
          stroke="#e5e6eb"
          strokeWidth={2}
          onClick={handleClockClick}
        />

        {/* Inner circle */}
        <circle
          cx={center}
          cy={center}
          r={innerRadius}
          fill="white"
          stroke="#e5e6eb"
          strokeWidth={1}
        />

        {/* Hour markers and labels for 12-hour workday */}
        {Array.from({ length: WORKDAY_HOURS + 1 }, (_, i) => {
          const hour = WORKDAY_START + i
          const angle = (i * 30 - 90) * (Math.PI / 180) // 30 degrees per hour
          const isMainHour = i % 3 === 0 // Show every 3 hours
          const markerRadius = isMainHour ? outerRadius : outerRadius - 5
          const x1 = center + (outerRadius - 10) * Math.cos(angle)
          const y1 = center + (outerRadius - 10) * Math.sin(angle)
          const x2 = center + markerRadius * Math.cos(angle)
          const y2 = center + markerRadius * Math.sin(angle)

          const labelX = center + hourLabelRadius * Math.cos(angle)
          const labelY = center + hourLabelRadius * Math.sin(angle)

          // Check if this is a circadian peak or dip
          const isCircadianPoint = hour === morningPeak || hour === afternoonDip || hour === eveningPeak

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

              {/* Hour label - only show every other hour on mobile */}
              {isMainHour && (!isMobile || hour % 2 === 0) && (
                <text
                  x={labelX}
                  y={labelY + 4}
                  textAnchor="middle"
                  fontSize={fontSize.hours}
                  fill={isCircadianPoint ? '#165DFF' : '#4e5969'}
                  fontWeight="bold"
                >
                  {hour > 12 ? hour - 12 : hour}
                  {!isMobile && (hour >= 12 ? 'pm' : 'am')}
                </text>
              )}
            </g>
          )
        })}

        {/* Circadian rhythm indicators */}
        {(() => {
          const currentHour = currentTime.getHours()
          let energyLevel = 'Normal'
          let energyColor = '#86909c'

          // Determine energy level based on proximity to peaks/dips
          const hourDiff = (a: number, b: number) => {
            const diff = Math.abs(a - b)
            return Math.min(diff, 24 - diff)
          }

          if (hourDiff(currentHour, morningPeak) <= 1 || hourDiff(currentHour, eveningPeak) <= 1) {
            energyLevel = 'Peak Focus'
            energyColor = '#165DFF'
          } else if (hourDiff(currentHour, afternoonDip) <= 1) {
            energyLevel = 'Low Energy'
            energyColor = '#FF7D00'
          } else if (hourDiff(currentHour, wakeTimeHour) <= 1) {
            energyLevel = 'Waking Up'
            energyColor = '#52C41A'
          } else if (hourDiff(currentHour, bedtimeHour) <= 1) {
            energyLevel = 'Winding Down'
            energyColor = '#722ED1'
          }

          return (
            <text
              x={center}
              y={center}
              textAnchor="middle"
              fontSize={fontSize.labels}
              fill={energyColor}
              fontWeight="500"
            >
              {energyLevel}
            </text>
          )
        })()}

        {/* Work sessions as arcs */}
        {displaySessions.map(session => {
          const isSelected = session.id === selectedSessionId
          const isHovered = session.id === hoveredSession
          const isCollapsed = session.isCollapsed || false

          // Use consistent arc radii for all sessions
          const arcInnerRadius = innerRadius
          const arcOuterRadius = outerRadius

          const path = generateArcPath(
            session.startMinutes,
            session.endMinutes,
            arcInnerRadius,
            arcOuterRadius,
            center,
            center,
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
                  strokeWidth={isSelected ? 5 : isHovered ? 4 : 3}  // Increased from 3:2 to 5:4:3
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
                  {/* Start handle - use the same angle calculation as minutesToAngle */}
                  <circle
                    cx={center + ((arcInnerRadius + arcOuterRadius) / 2) * Math.cos(minutesToAngle(session.startMinutes) * Math.PI / 180)}
                    cy={center + ((arcInnerRadius + arcOuterRadius) / 2) * Math.sin(minutesToAngle(session.startMinutes) * Math.PI / 180)}
                    r={10}  // Increased from 6 to 10
                    fill="white"
                    stroke={session.color}
                    strokeWidth={3}  // Increased from 2 to 3
                    style={{ cursor: 'ew-resize' }}
                    onMouseDown={(e) => handleArcMouseDown(e, session.id, 'start')}
                  />

                  {/* End handle - use the same angle calculation as minutesToAngle */}
                  <circle
                    cx={center + ((arcInnerRadius + arcOuterRadius) / 2) * Math.cos(minutesToAngle(session.endMinutes) * Math.PI / 180)}
                    cy={center + ((arcInnerRadius + arcOuterRadius) / 2) * Math.sin(minutesToAngle(session.endMinutes) * Math.PI / 180)}
                    r={10}  // Increased from 6 to 10
                    fill="white"
                    stroke={session.color}
                    strokeWidth={3}  // Increased from 2 to 3
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
              innerRadius,
              outerRadius,
              center,
              center,
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
            x1={center}
            y1={center}
            x2={center + (outerRadius - 20) * Math.cos(minutesToAngle(currentMinutes) * Math.PI / 180)}
            y2={center + (outerRadius - 20) * Math.sin(minutesToAngle(currentMinutes) * Math.PI / 180)}
            stroke="#f53f3f"
            strokeWidth={2}
            strokeLinecap="round"
          />
        )}

        {/* Center dot */}
        <circle
          cx={center}
          cy={center}
          r={4}
          fill="#f53f3f"
        />

        {/* Current time text */}
        <text
          x={center}
          y={center + 50}
          textAnchor="middle"
          fontSize={fontSize.hours}
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
