import React, { useState, useEffect } from 'react'
import { Typography, Tooltip, Button, Switch } from '@arco-design/web-react'
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
import { useContainerQuery } from '../../hooks/useContainerQuery'
import { useResponsive } from '../../providers/ResponsiveProvider'

const { Text } = Typography

interface SwimLaneTimelineProps {
  sessions: WorkSessionData[]
  tasks: (Task | SequencedTask)[]
  meetings?: Array<{
    id: string
    name: string
    startTime: string
    endTime: string
    type: 'meeting' | 'break' | 'personal' | 'blocked'
  }>
  onSessionUpdate: (id: string, startMinutes: number, endMinutes: number) => void
  onSessionCreate: (taskId: string, startMinutes: number, endMinutes: number, stepId?: string) => void
  onSessionDelete: (id: string) => void
  selectedSessionId?: string
  onSessionSelect: (id: string | null) => void
  expandedWorkflows?: Set<string>
  onExpandedWorkflowsChange?: (expanded: Set<string>) => void
  bedtimeHour?: number
  wakeTimeHour?: number
}

const TIME_LABEL_WIDTH = 80
const START_HOUR = 6
const END_HOUR = 22
const HOURS_PER_DAY = END_HOUR - START_HOUR
const TOTAL_DAYS = 3 // Show yesterday, today, tomorrow
const TOTAL_HOURS = HOURS_PER_DAY * TOTAL_DAYS
// Removed unused: MIN_LANE_HEIGHT, MAX_LANE_HEIGHT
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
  meetings = [],
  onSessionUpdate,
  onSessionCreate,
  onSessionDelete: _onSessionDelete,
  selectedSessionId,
  onSessionSelect,
  expandedWorkflows: externalExpandedWorkflows,
  onExpandedWorkflowsChange,
  bedtimeHour = 22,
  wakeTimeHour = 6,
}: SwimLaneTimelineProps) {
  const [dragState, setDragState] = useState<DragState | null>(null)
  const [creatingSession, setCreatingSession] = useState<{
    taskId: string
    stepId?: string
    startX: number
    currentX: number
  } | null>(null)
  const [hoveredSession, setHoveredSession] = useState<string | null>(null)
  const [internalExpandedWorkflows, setInternalExpandedWorkflows] = useState<Set<string>>(new Set())
  const [baseLaneHeight] = useState(30)
  const [baseHourWidth, setBaseHourWidth] = useState(80)

  // Calculate zoom-responsive visual elements
  const zoomFactor = baseHourWidth / 80 // 80 = baseline
  const laneHeight = Math.max(20, Math.min(50, baseLaneHeight * zoomFactor))
  const headerFontSize = Math.max(10, Math.min(14, 12 * zoomFactor))
  const timeFontSize = Math.max(9, Math.min(12, 10 * zoomFactor))
  const sessionFontSize = Math.max(9, Math.min(13, 11 * zoomFactor))
  const [currentTime, setCurrentTime] = useState(new Date())
  const [showCircadianRhythm, setShowCircadianRhythm] = useState(false)

  // Responsive container measurement
  const { ref: timelineRef, width: _containerWidth } = useContainerQuery<HTMLDivElement>()
  const { isCompact: _isCompact } = useResponsive()

  // Calculate hour width based on zoom level - let it overflow!
  const calculateHourWidth = () => {
    // Simple calculation: base zoom factor applied to minimum width
    const zoomFactor = baseHourWidth / 80 // 80 = default zoom baseline

    // Return zoomed width - NO CONSTRAINTS! Let it overflow and scroll!
    return Math.max(MIN_HOUR_WIDTH, MIN_HOUR_WIDTH * zoomFactor)
  }

  const hourWidth = calculateHourWidth()


  // Use external state if provided, otherwise use internal
  const expandedWorkflows = externalExpandedWorkflows ?? internalExpandedWorkflows
  const setExpandedWorkflows = onExpandedWorkflowsChange ?? setInternalExpandedWorkflows

  // Update current time every minute
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date())
    }, 60000) // Update every minute

    return () => clearInterval(interval)
  }, [])

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

  // Calculate circadian rhythm energy level (0-1) for a given hour with smooth interpolation
  const getCircadianEnergy = (hour: number): number => {
    // Use sine waves to create smooth circadian rhythm curve
    // Peaks and troughs adjusted based on user's sleep/wake times

    // Normalize hour to 0-24 range
    const h = hour % 24

    // Calculate peak energy time (4 hours after wake)
    const morningPeak = (wakeTimeHour + 4) % 24

    // Base circadian rhythm using cosine wave
    // Peak at morning peak time, trough 12 hours later
    const baseRhythm = 0.5 + 0.5 * Math.cos((h - morningPeak) * Math.PI / 12)

    // Add post-lunch dip (7 hours after wake)
    const lunchDipTime = (wakeTimeHour + 7) % 24
    const lunchDip = 0.15 * Math.cos((h - lunchDipTime) * Math.PI / 6)

    // Add afternoon boost (9 hours after wake)
    const afternoonPeakTime = (wakeTimeHour + 9) % 24
    const afternoonBoost = 0.1 * Math.cos((h - afternoonPeakTime) * Math.PI / 4)

    // Combine and clamp between 0.1 and 1.0
    const energy = Math.max(0.1, Math.min(1.0, baseRhythm - lunchDip + afternoonBoost))

    // Scale down during sleep hours
    // Handle cases where bedtime is before midnight and wake is after
    const isInSleepHours = bedtimeHour > wakeTimeHour
      ? (h >= bedtimeHour || h < wakeTimeHour)  // Sleep wraps around midnight
      : (h >= bedtimeHour && h < wakeTimeHour)   // Sleep within same day

    if (isInSleepHours) {
      return energy * 0.3
    }

    return energy
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
    isMeeting?: boolean
    meetingType?: string
    meetingStartMinutes?: number
    meetingEndMinutes?: number
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

  // Add meetings lane at the beginning if there are meetings
  if (meetings.length > 0) {
    // Convert meeting sessions to match WorkSessionData format for rendering
    const meetingSessions: WorkSessionData[] = meetings.map(meeting => {
      const [startHour, startMin] = meeting.startTime.split(':').map(Number)
      const [endHour, endMin] = meeting.endTime.split(':').map(Number)
      const startMinutes = startHour * 60 + startMin
      const endMinutes = endHour * 60 + endMin

      return {
        id: `meeting-${meeting.id}`,
        taskId: '',
        taskName: meeting.name,
        startMinutes,
        endMinutes,
        type: TaskType.Admin, // Use Admin type for meetings
        isDragging: false,
        color: meeting.type === 'meeting' ? '#722ed1' :
               meeting.type === 'break' ? '#13c2c2' :
               meeting.type === 'personal' ? '#52c41a' : '#8c8c8c',
      }
    })

    swimLanes.unshift({
      id: 'meetings-lane',
      name: '📅 Meetings & Events',
      sessions: meetingSessions,
      isMeeting: true,
    })
  }

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
    const rect = timelineRef.current?.getBoundingClientRect()
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
        const container = timelineRef.current
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
    <div style={{ height: '100%', position: 'relative' }}>
      {/* Zoom Controls - Floating Overlay */}
      <div style={{
        position: 'absolute',
        top: 8,
        right: 8,
        zIndex: 100,
        background: 'rgba(255, 255, 255, 0.95)',
        border: '1px solid #e5e6eb',
        borderRadius: 6,
        padding: '4px 8px',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
      }}>
        {/* Compact zoom controls */}
        <Tooltip content="Zoom Out">
          <Button
            size="mini"
            icon={<IconZoomOut />}
            onClick={() => setBaseHourWidth(Math.max(MIN_HOUR_WIDTH, baseHourWidth - 20))}
            disabled={baseHourWidth <= MIN_HOUR_WIDTH}
          />
        </Tooltip>
        <Text style={{ fontSize: 11, color: '#86909c' }}>
          Zoom: {Math.round(zoomFactor * 100)}% | H:{laneHeight}px | W:{Math.round(hourWidth)}px
        </Text>
        <Tooltip content="Zoom In">
          <Button
            size="mini"
            icon={<IconZoomIn />}
            onClick={() => setBaseHourWidth(Math.min(MAX_HOUR_WIDTH, baseHourWidth + 20))}
            disabled={baseHourWidth >= MAX_HOUR_WIDTH}
          />
        </Tooltip>
        <div style={{ width: 1, height: 16, background: '#e5e6eb' }} />
        <Tooltip content="Circadian Rhythm">
          <Switch
            checked={showCircadianRhythm}
            onChange={setShowCircadianRhythm}
            size="small"
          />
        </Tooltip>
      </div>

      <div
        ref={timelineRef}
        className="swimlane-timeline"
        style={{
          position: 'relative',
          overflowX: 'auto', // Allow horizontal scroll for 3-day timeline
          overflowY: 'hidden', // Never show vertical scrollbar
          background: '#fafbfc',
          borderRadius: 8,
          height: '100%',
          width: '100%',
          maxWidth: '100%',
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
        <div style={{
          flex: 1,
          position: 'relative',
          width: TOTAL_HOURS * hourWidth, // Let timeline be its natural width
          minWidth: TOTAL_HOURS * hourWidth,
          overflow: 'visible', // Allow content to be visible for scrolling
        }}>
          {Array.from({ length: TOTAL_HOURS + 1 }, (_, i) => {
            const dayIndex = Math.floor(i / HOURS_PER_DAY) // 0 = yesterday, 1 = today, 2 = tomorrow
            const hourInDay = i % HOURS_PER_DAY
            const actualHour = START_HOUR + hourInDay

            const today = new Date()
            const displayDate = new Date(today)
            displayDate.setDate(today.getDate() + (dayIndex - 1)) // -1, 0, +1 days

            const dayLabel = dayIndex === 0 ? 'Yesterday' :
                           dayIndex === 1 ? 'Today' : 'Tomorrow'

            return (
              <div
                key={i}
                style={{
                  position: 'absolute',
                  left: i * hourWidth,
                  top: 0,
                  height: '100%',
                  width: Math.max(hourWidth, 40), // Ensure minimum column width
                  borderLeft: i % HOURS_PER_DAY === 0 ? '2px solid #165DFF' : '1px solid #e5e6eb',
                  paddingLeft: 4,
                  display: 'flex',
                  alignItems: 'center',
                  flexDirection: 'column',
                  background: i % HOURS_PER_DAY === 0 ? '#f5f7fa' : 'transparent',
                  boxSizing: 'border-box',
                }}
              >
                {i % HOURS_PER_DAY === 0 && (
                  <Text style={{ fontSize: headerFontSize, color: '#165DFF', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                    {dayLabel}
                  </Text>
                )}
                <Text style={{ fontSize: timeFontSize, color: '#86909c', whiteSpace: 'nowrap' }}>
                  {actualHour.toString().padStart(2, '0')}:00
                </Text>
              </div>
            )
          })}
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
                    fontSize: sessionFontSize,
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
                width: TOTAL_HOURS * hourWidth, // Let timeline be its natural width
                minWidth: TOTAL_HOURS * hourWidth,
                position: 'relative',
                cursor: 'crosshair',
                overflow: 'visible', // Allow content to be visible for scrolling
              }}
              onMouseDown={(e) => {
                // Don't allow creating on meetings lane
                if (lane.isMeeting) {
                  return
                }

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
              {/* Circadian Rhythm Curve */}
              {showCircadianRhythm && (
                <svg
                  style={{
                    position: 'absolute',
                    left: TIME_LABEL_WIDTH,
                    top: 0,
                    width: TOTAL_HOURS * hourWidth,
                    height: '100%',
                    pointerEvents: 'none',
                    zIndex: 0,
                  }}
                >
                  <defs>
                    <linearGradient id="circadianGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%" stopColor="#FFD700" stopOpacity="0.3" />
                      <stop offset="100%" stopColor="#FFD700" stopOpacity="0.05" />
                    </linearGradient>
                  </defs>

                  {/* Generate smooth curve path */}
                  <path
                    d={(() => {
                      const points: string[] = []
                      const height = 400 // Fixed height for the curve
                      const samples = 100 // Number of points for smooth curve

                      for (let i = 0; i <= samples; i++) {
                        const hour = START_HOUR + (i / samples) * TOTAL_HOURS
                        const x = (i / samples) * TOTAL_HOURS * hourWidth
                        const energy = getCircadianEnergy(hour)
                        // Invert Y and scale to use bottom 60% of height
                        const y = height - (energy * height * 0.6)

                        if (i === 0) {
                          points.push(`M ${x} ${y}`)
                        } else {
                          // Use line for smooth curve (with many points it appears smooth)
                          points.push(`L ${x} ${y}`)
                        }
                      }

                      // Close the path to create filled area
                      points.push(`L ${TOTAL_HOURS * hourWidth} ${height}`)
                      points.push(`L 0 ${height}`)
                      points.push('Z')

                      return points.join(' ')
                    })()}
                    fill="url(#circadianGradient)"
                    stroke="#FFD700"
                    strokeWidth="2"
                    opacity="0.7"
                  />

                  {/* Add curve line on top for clarity */}
                  <path
                    d={(() => {
                      const points: string[] = []
                      const height = 400 // Fixed height for the curve
                      const samples = 100

                      for (let i = 0; i <= samples; i++) {
                        const hour = START_HOUR + (i / samples) * TOTAL_HOURS
                        const x = (i / samples) * TOTAL_HOURS * hourWidth
                        const energy = getCircadianEnergy(hour)
                        const y = height - (energy * height * 0.6)

                        if (i === 0) {
                          points.push(`M ${x} ${y}`)
                        } else {
                          points.push(`L ${x} ${y}`)
                        }
                      }

                      return points.join(' ')
                    })()}
                    fill="none"
                    stroke="#FFA500"
                    strokeWidth="2"
                    opacity="0.8"
                  />

                  {/* Peak and dip labels */}
                  <text
                    x={4 * hourWidth}
                    y={20}
                    fill="#FF8C00"
                    fontSize="11"
                    fontWeight="bold"
                    textAnchor="middle"
                  >
                    Morning Peak
                  </text>
                  <text
                    x={10 * hourWidth}
                    y={20}
                    fill="#FF8C00"
                    fontSize="11"
                    fontWeight="bold"
                    textAnchor="middle"
                  >
                    Afternoon Peak
                  </text>
                  <text
                    x={7.5 * hourWidth}
                    y={380}
                    fill="#4169E1"
                    fontSize="11"
                    textAnchor="middle"
                  >
                    Post-lunch Dip
                  </text>
                </svg>
              )}

              {/* Hour grid lines */}
              {Array.from({ length: TOTAL_HOURS + 1 }, (_, i) => (
                <div
                  key={i}
                  style={{
                    position: 'absolute',
                    left: TIME_LABEL_WIDTH + i * hourWidth,
                    top: 0,
                    bottom: 0,
                    borderLeft: '1px solid #f0f0f0',
                  }}
                />
              ))}

              {/* Now marker - only show if current time is within the timeline range */}
              {(() => {
                const nowHours = currentTime.getHours() + currentTime.getMinutes() / 60
                if (nowHours >= START_HOUR && nowHours <= END_HOUR) {
                  const nowMinutes = currentTime.getHours() * 60 + currentTime.getMinutes()
                  const nowLeft = minutesToPixels(nowMinutes) - TIME_LABEL_WIDTH
                  return (
                    <div
                      style={{
                        position: 'absolute',
                        left: nowLeft,
                        top: 0,
                        bottom: 0,
                        width: 2,
                        backgroundColor: '#ff4d4f',
                        zIndex: 15,
                        pointerEvents: 'none',
                      }}
                    >
                      <div
                        style={{
                          position: 'absolute',
                          top: -8,
                          left: -4,
                          width: 10,
                          height: 10,
                          borderRadius: '50%',
                          backgroundColor: '#ff4d4f',
                        }}
                      />
                    </div>
                  )
                }
                return null
              })()}

              {/* Sessions */}
              {lane.sessions.map((session, sessionIndex) => {
                const left = minutesToPixels(session.startMinutes)
                const width = (session.endMinutes - session.startMinutes) / 60 * hourWidth
                const isSelected = session.id === selectedSessionId
                const isHovered = session.id === hoveredSession
                const isMeetingSession = session.id.startsWith('meeting-')

                const sessionKey = `${lane.id}-${session.id}-${sessionIndex}`

                return (
                  <div
                    key={sessionKey}
                    style={{
                      position: 'absolute',
                      left: left - TIME_LABEL_WIDTH,
                      top: Math.max(2, 4 * zoomFactor),
                      bottom: Math.max(2, 4 * zoomFactor),
                      width,
                      background: isMeetingSession
                        ? '#722ed1aa'
                        : session.completed
                        ? `repeating-linear-gradient(45deg, ${session.color}33, ${session.color}33 10px, ${session.color}55 10px, ${session.color}55 20px)`
                        : session.color + (isSelected ? '33' : '22'),
                      border: `${Math.max(1, 2 * zoomFactor)}px solid ${isMeetingSession ? '#722ed1' : session.color}`,
                      borderRadius: isMeetingSession ? 8 : Math.max(2, 4 * zoomFactor),
                      cursor: isMeetingSession ? 'default' : 'move',
                      display: 'flex',
                      alignItems: 'center',
                      padding: `0 ${Math.max(2, 4 * zoomFactor)}px`,
                      overflow: 'hidden',
                      boxShadow: isHovered ? '0 2px 8px rgba(0,0,0,0.15)' : undefined,
                      transition: 'box-shadow 0.2s',
                      opacity: session.completed ? 0.8 : 1,
                    }}
                    onMouseDown={isMeetingSession ? undefined : (e) => handleMouseDown(e, session.id, 'move')}
                    onMouseEnter={() => setHoveredSession(session.id)}
                    onMouseLeave={() => setHoveredSession(null)}
                    onClick={(e) => {
                      e.stopPropagation()
                      onSessionSelect(session.id)
                    }}
                  >
                    {/* Resize handles - only show when selected and not a meeting */}
                    {isSelected && !isMeetingSession && (
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
                          <div style={{ fontWeight: 'bold' }}>{session.taskName}</div>
                          {session.stepName && <div>{session.stepName}</div>}
                          <div>
                            {minutesToTime(session.startMinutes)} - {minutesToTime(session.endMinutes)}
                          </div>
                          <div>{session.endMinutes - session.startMinutes} minutes</div>
                          {isMeetingSession && <div style={{ marginTop: 4, fontStyle: 'italic' }}>Meeting/Event</div>}
                        </div>
                      }
                    >
                      <Text
                        style={{
                          fontSize: sessionFontSize,
                          color: isMeetingSession ? 'white' : 'white',
                          fontWeight: isMeetingSession ? 600 : 500,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          display: 'flex',
                          alignItems: 'center',
                          gap: Math.max(2, 4 * zoomFactor),
                        }}
                      >
                        {isMeetingSession && width > 30 ? (
                          <>
                            {width > 80 && session.taskName}
                            {width > 50 && width <= 80 && `${session.taskName.substring(0, 8)}...`}
                            {width <= 50 && `${Math.round((session.endMinutes - session.startMinutes) / 60 * 10) / 10}h`}
                          </>
                        ) : (
                          width > 60 && `${Math.round((session.endMinutes - session.startMinutes) / 60 * 10) / 10}h`
                        )}
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
