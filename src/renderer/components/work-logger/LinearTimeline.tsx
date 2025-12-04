/**
 * LinearTimeline - A horizontal zoomable timeline for editing work sessions
 *
 * Features:
 * - SVG-based horizontal timeline (0-24 hours)
 * - Work blocks shown as background rectangles
 * - Sessions as interactive colored blocks
 * - Drag edges to resize, drag middle to move
 * - Click empty space to create new session
 * - Zoom control with persistence
 * - Current time indicator
 * - 5-minute snap intervals
 */

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Slider } from '@arco-design/web-react'
import { WorkBlock, BlockTypeConfig } from '@shared/work-blocks-types'
import { UserTaskType, getTypeColor } from '@shared/user-task-types'
import { BlockConfigKind, WorkBlockType } from '@shared/enums'
import { useSortedUserTaskTypes } from '../../store/useUserTaskTypeStore'
import {
  WorkSessionData,
  timeToMinutes,
  checkOverlap,
  roundToFiveMinutes,
} from './SessionState'

// ============================================================================
// Types
// ============================================================================

interface LinearTimelineProps {
  sessions: WorkSessionData[]
  workBlocks: WorkBlock[]
  meetings?: Array<{ id: string; name: string; startTime: string; endTime: string; type: string }>
  onSessionUpdate: (id: string, startMinutes: number, endMinutes: number) => void
  onSessionCreate: (startMinutes: number, endMinutes: number) => void
  onSessionDelete: (id: string) => void
  selectedSessionId: string | null
  onSessionSelect: (id: string | null) => void
  currentTime: Date
  date: string
}

interface DragState {
  sessionId: string
  edge: 'start' | 'end' | 'move'
  initialMouseX: number
  initialStartMinutes: number
  initialEndMinutes: number
}

interface CreatingSession {
  startMinutes: number
  currentMinutes: number
}

// ============================================================================
// Constants
// ============================================================================

const TIMELINE_HEIGHT = 160
const BLOCK_LANE_HEIGHT = 28
const SESSION_LANE_HEIGHT = 50
const SESSION_LANE_Y = 55
const HOUR_LABEL_HEIGHT = 20
const TIME_LABEL_WIDTH = 0
const MIN_ZOOM = 40
const MAX_ZOOM = 200
const DEFAULT_ZOOM = 80
const SNAP_INTERVAL = 5
const ZOOM_STORAGE_KEY = 'linear-timeline-zoom'

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get the display color for a work block based on its type configuration
 */
function getBlockColor(block: WorkBlock, userTypes: UserTaskType[]): string {
  const typeConfig = block.typeConfig as BlockTypeConfig

  if (typeConfig.kind === BlockConfigKind.Single) {
    return getTypeColor(userTypes, typeConfig.typeId)
  } else if (typeConfig.kind === BlockConfigKind.Combo) {
    return '#722ED1' // Purple for combo blocks
  } else {
    // System blocks (sleep, blocked)
    return typeConfig.systemType === WorkBlockType.Sleep ? '#86909c' : '#F53F3F'
  }
}

// ============================================================================
// Component
// ============================================================================

export function LinearTimeline({
  sessions,
  workBlocks,
  meetings = [],
  onSessionUpdate,
  onSessionCreate,
  selectedSessionId,
  onSessionSelect,
  currentTime,
}: LinearTimelineProps): React.ReactElement {
  // eslint-disable-next-line no-undef
  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const userTaskTypes = useSortedUserTaskTypes()

  // Zoom state (persisted to localStorage)
  const [hourWidth, setHourWidth] = useState<number>(() => {
    if (typeof window === 'undefined') return DEFAULT_ZOOM
    const stored = window.localStorage.getItem(ZOOM_STORAGE_KEY)
    return stored ? Number(stored) : DEFAULT_ZOOM
  })

  // Drag state
  const [dragState, setDragState] = useState<DragState | null>(null)
  const [creatingSession, setCreatingSession] = useState<CreatingSession | null>(null)

  // Current time indicator
  const [currentMinutes, setCurrentMinutes] = useState<number>(
    currentTime.getHours() * 60 + currentTime.getMinutes(),
  )

  // Update current time indicator when prop changes
  useEffect(() => {
    setCurrentMinutes(currentTime.getHours() * 60 + currentTime.getMinutes())
  }, [currentTime])

  // ============================================================================
  // Coordinate Conversion
  // ============================================================================

  const minutesToX = useCallback((minutes: number): number => {
    return TIME_LABEL_WIDTH + minutes * (hourWidth / 60)
  }, [hourWidth])

  const xToMinutes = useCallback((x: number): number => {
    const minutes = (x - TIME_LABEL_WIDTH) / (hourWidth / 60)
    return Math.max(0, Math.min(1440, minutes))
  }, [hourWidth])

  // ============================================================================
  // Event Handlers
  // ============================================================================

  const getMinutesFromMouseEvent = useCallback((e: MouseEvent): number => {
    if (!svgRef.current) return 0
    const rect = svgRef.current.getBoundingClientRect()
    const scrollLeft = containerRef.current?.scrollLeft ?? 0
    const x = e.clientX - rect.left + scrollLeft
    return roundToFiveMinutes(xToMinutes(x))
  }, [xToMinutes])

  const handleSessionMouseDown = useCallback((
    e: React.MouseEvent,
    session: WorkSessionData,
    edge: 'start' | 'end' | 'move',
  ): void => {
    e.stopPropagation()
    onSessionSelect(session.id)

    setDragState({
      sessionId: session.id,
      edge,
      initialMouseX: e.clientX,
      initialStartMinutes: session.startMinutes,
      initialEndMinutes: session.endMinutes,
    })
  }, [onSessionSelect])

  const handleBackgroundMouseDown = useCallback((e: React.MouseEvent): void => {
    if (dragState) return

    // Only start creating if clicking directly on SVG background
    // eslint-disable-next-line no-undef
    const target = e.target as SVGElement
    if (target.tagName !== 'svg' && !target.classList.contains('timeline-background')) return

    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return

    const scrollLeft = containerRef.current?.scrollLeft ?? 0
    const x = e.clientX - rect.left + scrollLeft
    const minutes = roundToFiveMinutes(xToMinutes(x))

    setCreatingSession({ startMinutes: minutes, currentMinutes: minutes })
    onSessionSelect(null)
  }, [dragState, xToMinutes, onSessionSelect])

  // Document-level drag handling
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent): void => {
      const minutes = getMinutesFromMouseEvent(e)

      if (dragState) {
        const session = sessions.find(s => s.id === dragState.sessionId)
        if (!session) return

        if (dragState.edge === 'move') {
          const duration = dragState.initialEndMinutes - dragState.initialStartMinutes
          const rect = svgRef.current?.getBoundingClientRect()
          if (!rect) return

          const scrollLeft = containerRef.current?.scrollLeft ?? 0
          const currentX = e.clientX - rect.left + scrollLeft
          const initialX = dragState.initialMouseX - rect.left + scrollLeft
          const deltaX = currentX - initialX
          const deltaMinutes = Math.round(deltaX / (hourWidth / 60))

          let newStart = roundToFiveMinutes(dragState.initialStartMinutes + deltaMinutes)
          let newEnd = newStart + duration

          // Clamp to day bounds
          if (newStart < 0) {
            newStart = 0
            newEnd = duration
          }
          if (newEnd > 1440) {
            newEnd = 1440
            newStart = 1440 - duration
          }

          const movedSession: WorkSessionData = {
            ...session,
            startMinutes: newStart,
            endMinutes: newEnd,
          }

          if (!checkOverlap(movedSession, sessions, dragState.sessionId)) {
            onSessionUpdate(dragState.sessionId, newStart, newEnd)
          }
        } else if (dragState.edge === 'start') {
          const newStart = Math.min(minutes, dragState.initialEndMinutes - SNAP_INTERVAL)
          const clampedStart = Math.max(0, newStart)

          const resizedSession: WorkSessionData = {
            ...session,
            startMinutes: clampedStart,
            endMinutes: dragState.initialEndMinutes,
          }

          if (!checkOverlap(resizedSession, sessions, dragState.sessionId)) {
            onSessionUpdate(dragState.sessionId, clampedStart, dragState.initialEndMinutes)
          }
        } else if (dragState.edge === 'end') {
          const newEnd = Math.max(minutes, dragState.initialStartMinutes + SNAP_INTERVAL)
          const clampedEnd = Math.min(1440, newEnd)

          const resizedSession: WorkSessionData = {
            ...session,
            startMinutes: dragState.initialStartMinutes,
            endMinutes: clampedEnd,
          }

          if (!checkOverlap(resizedSession, sessions, dragState.sessionId)) {
            onSessionUpdate(dragState.sessionId, dragState.initialStartMinutes, clampedEnd)
          }
        }
      } else if (creatingSession) {
        setCreatingSession(prev => prev ? { ...prev, currentMinutes: minutes } : null)
      }
    }

    const handleMouseUp = (): void => {
      if (creatingSession) {
        const start = Math.min(creatingSession.startMinutes, creatingSession.currentMinutes)
        const end = Math.max(creatingSession.startMinutes, creatingSession.currentMinutes)

        if (end - start >= SNAP_INTERVAL) {
          const newSession: WorkSessionData = {
            id: 'temp-new',
            taskId: '',
            taskName: '',
            startMinutes: start,
            endMinutes: end,
            type: '',
            color: '#ccc',
          }

          if (!checkOverlap(newSession, sessions)) {
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
      return (): void => {
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
      }
    }
    return undefined
  }, [
    dragState,
    creatingSession,
    sessions,
    onSessionUpdate,
    onSessionCreate,
    getMinutesFromMouseEvent,
    hourWidth,
  ])

  // ============================================================================
  // Render
  // ============================================================================

  const totalWidth = 24 * hourWidth + TIME_LABEL_WIDTH

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* Zoom Control */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 8 }}>
        <span style={{ fontSize: 12, color: '#86909c' }}>Zoom:</span>
        <Slider
          value={hourWidth}
          min={MIN_ZOOM}
          max={MAX_ZOOM}
          style={{ width: 120 }}
          onChange={(val): void => {
            const newVal = val as number
            setHourWidth(newVal)
            window.localStorage.setItem(ZOOM_STORAGE_KEY, String(newVal))
          }}
        />
        <span style={{ fontSize: 11, color: '#c9cdd4', minWidth: 45 }}>
          {Math.round(hourWidth)}px/hr
        </span>
      </div>

      {/* Timeline Container (scrollable) */}
      <div
        ref={containerRef}
        style={{ overflowX: 'auto', overflowY: 'hidden' }}
      >
        <svg
          ref={svgRef}
          width={totalWidth}
          height={TIMELINE_HEIGHT}
          style={{ cursor: dragState || creatingSession ? 'grabbing' : 'crosshair' }}
          onMouseDown={handleBackgroundMouseDown}
        >
          {/* Background rect for click detection */}
          <rect
            className="timeline-background"
            x={0}
            y={HOUR_LABEL_HEIGHT}
            width={totalWidth}
            height={TIMELINE_HEIGHT - HOUR_LABEL_HEIGHT}
            fill="transparent"
          />

          {/* Hour grid lines and labels */}
          {Array.from({ length: 25 }).map((_, hour) => (
            <g key={hour}>
              <line
                x1={minutesToX(hour * 60)}
                y1={HOUR_LABEL_HEIGHT}
                x2={minutesToX(hour * 60)}
                y2={TIMELINE_HEIGHT}
                stroke="#e5e6eb"
                strokeWidth={hour % 6 === 0 ? 2 : 1}
              />
              {hour < 24 && (
                <text
                  x={minutesToX(hour * 60) + 4}
                  y={14}
                  fontSize={10}
                  fill="#86909c"
                >
                  {hour.toString().padStart(2, '0')}:00
                </text>
              )}
            </g>
          ))}

          {/* Work Blocks (background layer) */}
          {workBlocks.map(block => {
            const startMin = timeToMinutes(block.startTime)
            const endMin = timeToMinutes(block.endTime)
            const blockColor = getBlockColor(block, userTaskTypes)
            const width = minutesToX(endMin) - minutesToX(startMin)

            // Skip blocks with zero or negative width
            if (width <= 0) return null

            return (
              <rect
                key={block.id}
                x={minutesToX(startMin)}
                y={HOUR_LABEL_HEIGHT}
                width={width}
                height={BLOCK_LANE_HEIGHT}
                fill={blockColor}
                opacity={0.25}
                rx={2}
              />
            )
          })}

          {/* Meetings (dashed overlay) */}
          {meetings.map(meeting => {
            const startMin = timeToMinutes(meeting.startTime)
            const endMin = timeToMinutes(meeting.endTime)
            const width = minutesToX(endMin) - minutesToX(startMin)

            if (width <= 0) return null

            return (
              <g key={meeting.id}>
                <rect
                  x={minutesToX(startMin)}
                  y={SESSION_LANE_Y}
                  width={width}
                  height={SESSION_LANE_HEIGHT}
                  fill="#F77234"
                  opacity={0.15}
                  stroke="#F77234"
                  strokeDasharray="4,2"
                  rx={4}
                />
                {width > 50 && (
                  <text
                    x={minutesToX(startMin) + 6}
                    y={SESSION_LANE_Y + SESSION_LANE_HEIGHT / 2 + 4}
                    fontSize={10}
                    fill="#F77234"
                    style={{ pointerEvents: 'none' }}
                  >
                    {meeting.name}
                  </text>
                )}
              </g>
            )
          })}

          {/* Sessions (interactive layer) */}
          {sessions.map(session => {
            const x = minutesToX(session.startMinutes)
            const width = minutesToX(session.endMinutes) - x
            const isSelected = session.id === selectedSessionId

            if (width <= 0) return null

            return (
              <g key={session.id}>
                {/* Session rectangle */}
                <rect
                  x={x}
                  y={SESSION_LANE_Y}
                  width={width}
                  height={SESSION_LANE_HEIGHT}
                  fill={session.color || '#8c8c8c'}
                  stroke={isSelected ? '#165DFF' : 'none'}
                  strokeWidth={isSelected ? 2 : 0}
                  rx={4}
                  style={{ cursor: 'grab' }}
                  onMouseDown={(e): void => handleSessionMouseDown(e, session, 'move')}
                />

                {/* Left resize handle */}
                <rect
                  x={x}
                  y={SESSION_LANE_Y}
                  width={Math.min(8, width / 3)}
                  height={SESSION_LANE_HEIGHT}
                  fill="transparent"
                  style={{ cursor: 'ew-resize' }}
                  onMouseDown={(e): void => handleSessionMouseDown(e, session, 'start')}
                />

                {/* Right resize handle */}
                <rect
                  x={x + width - Math.min(8, width / 3)}
                  y={SESSION_LANE_Y}
                  width={Math.min(8, width / 3)}
                  height={SESSION_LANE_HEIGHT}
                  fill="transparent"
                  style={{ cursor: 'ew-resize' }}
                  onMouseDown={(e): void => handleSessionMouseDown(e, session, 'end')}
                />

                {/* Task name label */}
                {width > 40 && (
                  <text
                    x={x + 6}
                    y={SESSION_LANE_Y + SESSION_LANE_HEIGHT / 2 + 4}
                    fontSize={11}
                    fill="#fff"
                    style={{ pointerEvents: 'none' }}
                  >
                    {session.taskName.length > width / 8
                      ? session.taskName.slice(0, Math.floor(width / 8)) + '…'
                      : session.taskName}
                  </text>
                )}
              </g>
            )
          })}

          {/* Creating session preview */}
          {creatingSession && (
            <rect
              x={minutesToX(Math.min(creatingSession.startMinutes, creatingSession.currentMinutes))}
              y={SESSION_LANE_Y}
              width={Math.abs(
                minutesToX(creatingSession.currentMinutes) -
                minutesToX(creatingSession.startMinutes),
              )}
              height={SESSION_LANE_HEIGHT}
              fill="#165DFF"
              opacity={0.3}
              stroke="#165DFF"
              strokeDasharray="4,2"
              rx={4}
            />
          )}

          {/* Current time indicator */}
          <line
            x1={minutesToX(currentMinutes)}
            y1={HOUR_LABEL_HEIGHT}
            x2={minutesToX(currentMinutes)}
            y2={TIMELINE_HEIGHT}
            stroke="#F53F3F"
            strokeWidth={2}
          />
          <circle
            cx={minutesToX(currentMinutes)}
            cy={HOUR_LABEL_HEIGHT}
            r={4}
            fill="#F53F3F"
          />
        </svg>
      </div>
    </div>
  )
}
