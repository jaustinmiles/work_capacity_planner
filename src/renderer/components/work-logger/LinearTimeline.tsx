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

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Slider, Switch, Modal, Button, Tooltip } from '@arco-design/web-react'
import { IconScissor } from '@arco-design/web-react/icon'
import { WorkBlock, BlockTypeConfig } from '@shared/work-blocks-types'
import { UserTaskType, getTypeColor } from '@shared/user-task-types'
import { TimeSink } from '@shared/time-sink-types'
import { BlockConfigKind, WorkBlockType, SplitMode, UnifiedScheduleItemType } from '@shared/enums'
import { useSortedUserTaskTypes } from '../../store/useUserTaskTypeStore'
import {
  WorkSessionData,
  PlannedSessionItem,
  timeToMinutes,
  minutesToTime,
  checkOverlap,
  roundToFiveMinutes,
  SplitCursorState,
  INITIAL_SPLIT_CURSOR_STATE,
  validateSplitPoint,
  MIN_SPLIT_DURATION_MINUTES,
} from './SessionState'

// ============================================================================
// Types
// ============================================================================

interface LinearTimelineProps {
  // Unified sessions array - contains both work sessions and time sinks
  // Each session has isTimeSink flag to determine rendering lane
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
  // Planned vs Actual comparison
  plannedItems?: PlannedSessionItem[]
  showPlannedOverlay?: boolean
  onTogglePlannedOverlay?: () => void
  // Time sink drag-to-create support
  timeSinks?: TimeSink[]
  onTimeSinkSessionCreate?: (sinkId: string, startMinutes: number, endMinutes: number) => void
  // Split session support
  onSessionSplit?: (sessionId: string, splitMinutes: number) => Promise<void>
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

interface CreatingTimeSinkSession {
  startMinutes: number
  currentMinutes: number
  sinkId?: string // Set after sink selection
}

// ============================================================================
// Constants
// ============================================================================

const TIMELINE_HEIGHT = 240 // SVG height (scrubber is separate HTML element)
const SCRUBBER_HEIGHT = 20 // Height of the split cursor ruler bar (HTML element above SVG)
const HOUR_LABEL_HEIGHT = 20
const BLOCK_LANE_Y = 22 // Y position of work block lane
const BLOCK_LANE_HEIGHT = 28
const PLANNED_LANE_Y = 52 // Above session lane
const PLANNED_LANE_HEIGHT = 32 // Planned overlay
const SESSION_LANE_Y = 88 // Main session lane
const SESSION_LANE_HEIGHT = 50
const TIME_SINK_LANE_Y = 146 // Below session lane
const TIME_SINK_LANE_HEIGHT = 40
const TIME_SINK_LABEL_Y = 144 // For "Time Sinks" label
const TIME_LABEL_WIDTH = 0
const MIN_ZOOM = 40
const MAX_ZOOM = 400
const DEFAULT_ZOOM = 80
const SNAP_INTERVAL = 5
const ZOOM_STORAGE_KEY = 'linear-timeline-zoom'

// Zone detection constants for event overlay (Y coordinates in overlay space)
// When scrubber is enabled, overlay covers scrubber + SVG
const SCRUBBER_ZONE_END = SCRUBBER_HEIGHT // 0-20px = scrubber zone
// Time sink zone (in SVG coordinate space)
const TIME_SINK_ZONE_START_OFFSET = TIME_SINK_LANE_Y
const TIME_SINK_ZONE_END_OFFSET = TIME_SINK_LANE_Y + TIME_SINK_LANE_HEIGHT

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
  plannedItems = [],
  showPlannedOverlay = false,
  onTogglePlannedOverlay,
  timeSinks = [],
  onTimeSinkSessionCreate,
  onSessionSplit,
}: LinearTimelineProps): React.ReactElement {
  // eslint-disable-next-line no-undef
  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const userTaskTypes = useSortedUserTaskTypes()

  // Calculate variance metrics when showing planned overlay
  const varianceMetrics = useMemo(() => {
    if (!showPlannedOverlay || plannedItems.length === 0) return null

    const plannedDuration = plannedItems.reduce(
      (sum, p) => sum + (p.endMinutes - p.startMinutes),
      0,
    )
    const actualDuration = sessions.reduce(
      (sum, s) => sum + (s.endMinutes - s.startMinutes),
      0,
    )
    const variance = actualDuration - plannedDuration
    const variancePercent = plannedDuration > 0
      ? Math.round((variance / plannedDuration) * 100)
      : 0

    return {
      planned: plannedDuration,
      actual: actualDuration,
      variance,
      variancePercent,
      isOver: variance > 0,
    }
  }, [showPlannedOverlay, plannedItems, sessions])

  // Zoom state (persisted to localStorage)
  const [hourWidth, setHourWidth] = useState<number>(() => {
    if (typeof window === 'undefined') return DEFAULT_ZOOM
    const stored = window.localStorage.getItem(ZOOM_STORAGE_KEY)
    return stored ? Number(stored) : DEFAULT_ZOOM
  })

  // Drag state
  const [dragState, setDragState] = useState<DragState | null>(null)
  const [creatingSession, setCreatingSession] = useState<CreatingSession | null>(null)
  const [creatingTimeSinkSession, setCreatingTimeSinkSession] = useState<CreatingTimeSinkSession | null>(null)
  const [showSinkSelector, setShowSinkSelector] = useState(false)
  const [pendingTimeSinkRange, setPendingTimeSinkRange] = useState<{ start: number; end: number } | null>(null)

  // Split cursor state
  const [splitCursor, setSplitCursor] = useState<SplitCursorState>(INITIAL_SPLIT_CURSOR_STATE)

  // Sessions array is now unified - work sessions and time sinks share the same editing behavior
  // Split into separate arrays only for rendering at different Y positions
  const workSessions = useMemo(() => sessions.filter(s => !s.isTimeSink), [sessions])
  const timeSinkSessions = useMemo(() => sessions.filter(s => s.isTimeSink), [sessions])

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
    // NOTE: Do NOT add scrollLeft - getBoundingClientRect() already accounts for scroll position.
    // The rect.left is relative to viewport, and clientX is also viewport-relative,
    // so the difference gives the correct X within the element.
    const x = e.clientX - rect.left
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


  // ============================================================================
  // Unified Event Overlay Handlers (Zone-based event routing)
  // ============================================================================

  // Helper to get zone-adjusted Y (accounts for scrubber offset when enabled)
  const getSvgY = useCallback((overlayY: number): number => {
    return onSessionSplit ? overlayY - SCRUBBER_HEIGHT : overlayY
  }, [onSessionSplit])

  // Unified mouse move handler - routes to appropriate zone logic
  const handleOverlayMouseMove = useCallback((e: React.MouseEvent): void => {
    const rect = e.currentTarget.getBoundingClientRect()
    // NOTE: Do NOT add scrollLeft - the overlay is position:absolute with full width,
    // so getBoundingClientRect().left is always relative to scroll container's left edge.
    // clientX - rect.left gives the correct X within the full-width overlay.
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const minutes = roundToFiveMinutes(xToMinutes(x))

    // Zone detection
    if (onSessionSplit && y < SCRUBBER_ZONE_END) {
      // SCRUBBER ZONE - handle split cursor
      if (dragState || creatingSession || creatingTimeSinkSession) return
      if (splitCursor.mode === SplitMode.Frozen) return

      // Find session at this X position (time)
      // Both work sessions and time sinks can be split (unified editing)
      const sessionAtPosition = sessions.find(session => {
        return minutes > session.startMinutes + MIN_SPLIT_DURATION_MINUTES &&
               minutes < session.endMinutes - MIN_SPLIT_DURATION_MINUTES
      })

      if (sessionAtPosition) {
        setSplitCursor({
          mode: SplitMode.Hovering,
          sessionId: sessionAtPosition.id,
          splitMinutes: minutes,
          frozenAt: null,
        })
      } else if (splitCursor.mode === SplitMode.Hovering) {
        setSplitCursor(INITIAL_SPLIT_CURSOR_STATE)
      }
    } else {
      // SVG ZONE - clear split cursor if hovering and in non-scrubber area
      if (splitCursor.mode === SplitMode.Hovering) {
        setSplitCursor(INITIAL_SPLIT_CURSOR_STATE)
      }
    }
  }, [onSessionSplit, dragState, creatingSession, creatingTimeSinkSession, splitCursor.mode, xToMinutes, sessions])

  // Unified mouse down handler - routes to appropriate zone logic
  const handleOverlayMouseDown = useCallback((e: React.MouseEvent): void => {
    if (dragState) return

    const rect = e.currentTarget.getBoundingClientRect()
    // NOTE: Do NOT add scrollLeft - the overlay is position:absolute with full width,
    // so getBoundingClientRect().left is always relative to scroll container's left edge.
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const rawMinutes = xToMinutes(x)
    const minutes = roundToFiveMinutes(rawMinutes)

    // Zone detection
    const svgY = getSvgY(y)
    const isInScrubberZone = onSessionSplit && y < SCRUBBER_ZONE_END
    const isInSessionLane = svgY >= SESSION_LANE_Y && svgY <= SESSION_LANE_Y + SESSION_LANE_HEIGHT
    const isInTimeSinkLane = svgY >= TIME_SINK_ZONE_START_OFFSET && svgY <= TIME_SINK_ZONE_END_OFFSET

    // Scrubber zone - handle split cursor freeze
    if (isInScrubberZone) {
      if (splitCursor.mode === SplitMode.Hovering && splitCursor.sessionId) {
        e.stopPropagation()
        setSplitCursor(prev => ({
          ...prev,
          mode: SplitMode.Frozen,
          frozenAt: prev.splitMinutes,
        }))
      }
      return
    }

    // Session lane - check if clicking on existing session first
    if (isInSessionLane) {
      // Find session at this position (use raw minutes for precise hit detection)
      const clickedSession = sessions.find(session =>
        !session.isTimeSink && // Skip time sink sessions for selection
        rawMinutes >= session.startMinutes &&
        rawMinutes <= session.endMinutes,
      )

      if (clickedSession) {
        // Determine if clicking near edge (for resize) or middle (for move)
        const sessionX = minutesToX(clickedSession.startMinutes)
        const sessionWidth = minutesToX(clickedSession.endMinutes) - sessionX
        const clickXInSession = x - sessionX
        const edgeThreshold = Math.min(8, sessionWidth / 3)

        let edge: 'start' | 'end' | 'move' = 'move'
        if (clickXInSession <= edgeThreshold) {
          edge = 'start'
        } else if (clickXInSession >= sessionWidth - edgeThreshold) {
          edge = 'end'
        }

        onSessionSelect(clickedSession.id)
        setDragState({
          sessionId: clickedSession.id,
          edge,
          initialMouseX: e.clientX,
          initialStartMinutes: clickedSession.startMinutes,
          initialEndMinutes: clickedSession.endMinutes,
        })
        return
      }

      // No session clicked - create new one
      setCreatingSession({ startMinutes: minutes, currentMinutes: minutes })
      onSessionSelect(null)
      return
    }

    // Time sink lane - handle time sink session creation
    if (isInTimeSinkLane && timeSinks.length > 0 && onTimeSinkSessionCreate) {
      setCreatingTimeSinkSession({ startMinutes: minutes, currentMinutes: minutes })
      onSessionSelect(null)
      return
    }

    // Other areas - deselect
    onSessionSelect(null)
  }, [dragState, xToMinutes, minutesToX, onSessionSplit, splitCursor, getSvgY, sessions, timeSinks.length, onTimeSinkSessionCreate, onSessionSelect])

  // Unified mouse leave handler
  const handleOverlayMouseLeave = useCallback((): void => {
    if (splitCursor.mode === SplitMode.Hovering) {
      setSplitCursor(INITIAL_SPLIT_CURSOR_STATE)
    }
  }, [splitCursor.mode])

  // Get cursor style based on current state and zone
  const getOverlayCursor = useCallback((): string => {
    if (dragState || creatingSession || creatingTimeSinkSession) {
      return 'grabbing'
    }
    if (splitCursor.mode === SplitMode.Frozen) {
      return 'default'
    }
    return 'crosshair'
  }, [dragState, creatingSession, creatingTimeSinkSession, splitCursor.mode])

  // Cancel frozen split cursor
  const handleCancelSplit = useCallback((): void => {
    setSplitCursor(INITIAL_SPLIT_CURSOR_STATE)
  }, [])

  // Execute split
  const handleExecuteSplit = useCallback(async (): Promise<void> => {
    if (splitCursor.mode !== SplitMode.Frozen || !splitCursor.sessionId || splitCursor.frozenAt === null) {
      return
    }

    const session = sessions.find(s => s.id === splitCursor.sessionId)
    if (!session) return

    const validation = validateSplitPoint(session, splitCursor.frozenAt, currentMinutes)
    if (!validation.valid) {
      // Could show notification here
      return
    }

    if (onSessionSplit) {
      await onSessionSplit(splitCursor.sessionId, splitCursor.frozenAt)
    }

    setSplitCursor(INITIAL_SPLIT_CURSOR_STATE)
  }, [splitCursor, sessions, currentMinutes, onSessionSplit])

  // Document-level drag handling
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent): void => {
      const minutes = getMinutesFromMouseEvent(e)

      if (dragState) {
        const session = sessions.find(s => s.id === dragState.sessionId)
        if (!session) return

        if (dragState.edge === 'move') {
          const duration = dragState.initialEndMinutes - dragState.initialStartMinutes
          // For move: calculate delta from initial mouse position (scroll-independent)
          const deltaX = e.clientX - dragState.initialMouseX
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
      } else if (creatingTimeSinkSession) {
        setCreatingTimeSinkSession(prev => prev ? { ...prev, currentMinutes: minutes } : null)
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
      } else if (creatingTimeSinkSession && onTimeSinkSessionCreate) {
        const start = Math.min(creatingTimeSinkSession.startMinutes, creatingTimeSinkSession.currentMinutes)
        const end = Math.max(creatingTimeSinkSession.startMinutes, creatingTimeSinkSession.currentMinutes)

        if (end - start >= SNAP_INTERVAL) {
          // If only one sink, use it directly; otherwise show selector
          if (timeSinks.length === 1 && timeSinks[0]) {
            onTimeSinkSessionCreate(timeSinks[0].id, start, end)
          } else if (timeSinks.length > 1) {
            // Show sink selector modal
            setPendingTimeSinkRange({ start, end })
            setShowSinkSelector(true)
          }
        }
        setCreatingTimeSinkSession(null)
      }
      setDragState(null)
    }

    if (dragState || creatingSession || creatingTimeSinkSession) {
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
    creatingTimeSinkSession,
    sessions,
    timeSinks,
    onSessionUpdate,
    onSessionCreate,
    onTimeSinkSessionCreate,
    getMinutesFromMouseEvent,
    hourWidth,
  ])

  // ============================================================================
  // Render
  // ============================================================================

  const totalWidth = 24 * hourWidth + TIME_LABEL_WIDTH

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* Zoom Control & Planned Overlay Toggle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 8, flexWrap: 'wrap' }}>
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

        {/* Planned vs Actual toggle - only show if we have planned items */}
        {plannedItems.length > 0 && onTogglePlannedOverlay && (
          <>
            <div style={{ width: 1, height: 16, backgroundColor: '#e5e6eb', margin: '0 4px' }} />
            <Switch
              size="small"
              checked={showPlannedOverlay}
              onChange={onTogglePlannedOverlay}
            />
            <span style={{ fontSize: 11, color: showPlannedOverlay ? '#165DFF' : '#86909c' }}>
              Planned
            </span>
          </>
        )}

        {/* Variance metrics when overlay is active */}
        {showPlannedOverlay && varianceMetrics && (
          <div style={{
            display: 'flex',
            gap: 12,
            fontSize: 11,
            marginLeft: 8,
            padding: '4px 10px',
            backgroundColor: '#f7f8fa',
            borderRadius: 4,
          }}>
            <span style={{ color: '#86909c' }}>
              Planned: <strong>{Math.round(varianceMetrics.planned / 60 * 10) / 10}h</strong>
            </span>
            <span style={{ color: '#86909c' }}>
              Actual: <strong>{Math.round(varianceMetrics.actual / 60 * 10) / 10}h</strong>
            </span>
            <span style={{
              color: varianceMetrics.isOver ? '#F53F3F' : '#00B42A',
              fontWeight: 600,
            }}>
              {varianceMetrics.isOver ? '+' : ''}{varianceMetrics.variancePercent}%
            </span>
          </div>
        )}

        {/* Split controls */}
        {onSessionSplit && (
          <>
            <div style={{ width: 1, height: 16, backgroundColor: '#e5e6eb', margin: '0 4px' }} />
            {splitCursor.mode === SplitMode.Frozen ? (
              <>
                <Tooltip content="Cancel split">
                  <Button size="small" onClick={handleCancelSplit}>
                    Cancel
                  </Button>
                </Tooltip>
                <Tooltip content="Split session at cursor position">
                  <Button
                    size="small"
                    type="primary"
                    icon={<IconScissor />}
                    onClick={handleExecuteSplit}
                  >
                    Split
                  </Button>
                </Tooltip>
              </>
            ) : (
              <Tooltip content="Hover over a session to set split point">
                <Button size="small" icon={<IconScissor />} disabled>
                  Split
                </Button>
              </Tooltip>
            )}
          </>
        )}
      </div>

      {/* Timeline Container (scrollable) */}
      <div
        ref={containerRef}
        style={{ overflowX: 'auto', overflowY: 'hidden' }}
      >
        {/* Wrapper for event overlay pattern */}
        {/* When scrubber enabled: wrapper = SCRUBBER_HEIGHT + SVG height */}
        <div style={{
          position: 'relative',
          width: totalWidth,
          height: onSessionSplit ? SCRUBBER_HEIGHT + TIMELINE_HEIGHT : TIMELINE_HEIGHT,
        }}>
          {/* Event Overlay - captures ALL mouse events, routes by zone */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: totalWidth,
              height: onSessionSplit ? SCRUBBER_HEIGHT + TIMELINE_HEIGHT : TIMELINE_HEIGHT,
              zIndex: 10,
              cursor: getOverlayCursor(),
              // DEBUG: red tint removed - overlay now correctly sized
            }}
            onMouseMove={handleOverlayMouseMove}
            onMouseDown={handleOverlayMouseDown}
            onMouseLeave={handleOverlayMouseLeave}
          />

          {/* Scrubber ruler bar - VISUAL ONLY (pointerEvents: none) */}
          {onSessionSplit && (
            <div
              style={{
                width: totalWidth,
                height: SCRUBBER_HEIGHT,
                backgroundColor: '#f7f8fa',
                borderBottom: '1px solid #e5e6eb',
                position: 'relative',
                pointerEvents: 'none',
              }}
            >
            {/* Scrubber label */}
            <span style={{
              position: 'absolute',
              left: 4,
              top: 3,
              fontSize: 9,
              color: '#86909c',
              pointerEvents: 'none',
            }}>
              ✂️ Split
            </span>
            {/* Tick marks rendered as divs for performance */}
            {Array.from({ length: 25 }).map((_, hour) => (
              <div
                key={`scrub-tick-${hour}`}
                style={{
                  position: 'absolute',
                  left: TIME_LABEL_WIDTH + hour * hourWidth,
                  bottom: 0,
                  width: 1,
                  height: 8,
                  backgroundColor: '#c9cdd4',
                  pointerEvents: 'none',
                }}
              />
            ))}
            {/* Split cursor position indicator on scrubber */}
            {splitCursor.mode !== SplitMode.Inactive && splitCursor.splitMinutes !== null && (
              <div
                style={{
                  position: 'absolute',
                  left: TIME_LABEL_WIDTH + (splitCursor.frozenAt ?? splitCursor.splitMinutes) * (hourWidth / 60),
                  top: 0,
                  bottom: 0,
                  width: splitCursor.mode === SplitMode.Frozen ? 2 : 1,
                  backgroundColor: '#165DFF',
                  opacity: splitCursor.mode === SplitMode.Frozen ? 1 : 0.6,
                  pointerEvents: 'none',
                }}
              />
            )}
          </div>
        )}

        <svg
          ref={svgRef}
          width={totalWidth}
          height={onSessionSplit ? TIMELINE_HEIGHT - SCRUBBER_HEIGHT : TIMELINE_HEIGHT}
          style={{ pointerEvents: 'none' }}
        >
          {/* SVG Defs for patterns */}
          <defs>
            <pattern id="planned-stripes" patternUnits="userSpaceOnUse" width="6" height="6">
              <path
                d="M0,6 l6,-6 M-1.5,1.5 l3,-3 M4.5,7.5 l3,-3"
                stroke="#666"
                strokeWidth="1"
                opacity="0.5"
              />
            </pattern>
          </defs>

          {/* Background rect for click detection */}
          <rect
            className="timeline-background"
            x={0}
            y={0}
            width={totalWidth}
            height={onSessionSplit ? TIMELINE_HEIGHT - SCRUBBER_HEIGHT : TIMELINE_HEIGHT}
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

          {/* Zone background indicators */}
          {/* Session lane - subtle blue tint */}
          <rect
            x={0}
            y={SESSION_LANE_Y}
            width={totalWidth}
            height={SESSION_LANE_HEIGHT}
            fill="#165DFF"
            opacity={0.03}
          />
          {/* Time sink lane - subtle purple tint (only if time sinks exist) */}
          {timeSinks.length > 0 && (
            <rect
              x={0}
              y={TIME_SINK_LANE_Y}
              width={totalWidth}
              height={TIME_SINK_LANE_HEIGHT}
              fill="#9B59B6"
              opacity={0.05}
            />
          )}

          {/* Work Blocks (background layer) */}
          {workBlocks.map(block => {
            const startMin = timeToMinutes(block.startTime)
            const endMin = timeToMinutes(block.endTime)
            const blockColor = getBlockColor(block, userTaskTypes)
            const width = minutesToX(endMin) - minutesToX(startMin)
            const typeConfig = block.typeConfig as BlockTypeConfig

            // Get block type name for tooltip and label
            let blockTypeName = 'Work Block'
            if (typeConfig.kind === BlockConfigKind.Single) {
              const userType = userTaskTypes.find(t => t.id === typeConfig.typeId)
              blockTypeName = userType ? `${userType.emoji} ${userType.name}` : 'Unknown Type'
            } else if (typeConfig.kind === BlockConfigKind.Combo) {
              blockTypeName = '🎨 Combo Block'
            } else if (typeConfig.systemType === WorkBlockType.Sleep) {
              blockTypeName = '😴 Sleep'
            } else {
              blockTypeName = '🚫 Blocked'
            }

            // Skip blocks with zero or negative width
            if (width <= 0) return null

            return (
              <g key={block.id}>
                <rect
                  x={minutesToX(startMin)}
                  y={BLOCK_LANE_Y}
                  width={width}
                  height={BLOCK_LANE_HEIGHT}
                  fill={blockColor}
                  opacity={0.25}
                  rx={2}
                >
                  <title>{blockTypeName} ({block.startTime} - {block.endTime})</title>
                </rect>
                {width > 80 && (
                  <text
                    x={minutesToX(startMin) + 4}
                    y={BLOCK_LANE_Y + BLOCK_LANE_HEIGHT / 2 + 4}
                    fontSize={10}
                    fill={blockColor}
                    opacity={0.8}
                    style={{ pointerEvents: 'none', fontWeight: 500 }}
                  >
                    {blockTypeName}
                  </text>
                )}
              </g>
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

          {/* Planned items overlay (from frozen schedule snapshot) */}
          {/* Filter out async-wait items - only show actual tasks */}
          {showPlannedOverlay && plannedItems
            .filter(item => item.type !== UnifiedScheduleItemType.AsyncWait)
            .map(item => {
            const x = minutesToX(item.startMinutes)
            const width = minutesToX(item.endMinutes) - x

            if (width <= 0) return null

            return (
              <g key={`planned-${item.id}`}>
                <rect
                  x={x}
                  y={PLANNED_LANE_Y}
                  width={width}
                  height={PLANNED_LANE_HEIGHT}
                  fill={item.color}
                  opacity={0.2}
                  rx={4}
                  style={{ cursor: 'default' }}
                >
                  <title>Planned: {item.name} ({Math.round(item.endMinutes - item.startMinutes)} min)</title>
                </rect>
                <rect
                  x={x}
                  y={PLANNED_LANE_Y}
                  width={width}
                  height={PLANNED_LANE_HEIGHT}
                  fill="url(#planned-stripes)"
                  opacity={0.6}
                  stroke={item.color}
                  strokeWidth={2}
                  strokeDasharray="6,3"
                  rx={4}
                  style={{ cursor: 'default' }}
                />
                {width > 50 && (
                  <text
                    x={x + 6}
                    y={PLANNED_LANE_Y + PLANNED_LANE_HEIGHT / 2 + 4}
                    fontSize={11}
                    fill={item.color}
                    fontWeight={500}
                    style={{ pointerEvents: 'none' }}
                  >
                    {item.name.length > Math.floor(width / 8) ? item.name.slice(0, Math.floor(width / 8)) + '…' : item.name}
                  </text>
                )}
              </g>
            )
          })}

          {/* Work Sessions (interactive layer - rendered at SESSION_LANE_Y) */}
          {workSessions.map(session => {
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

          {/* Time Sink Lane Label */}
          {timeSinks.length > 0 && (
            <text
              x={4}
              y={TIME_SINK_LABEL_Y}
              fontSize={10}
              fill="#86909c"
              fontWeight={500}
            >
              ⏱️ Time Sinks
            </text>
          )}

          {/* Time Sink Sessions (now interactive like work sessions) */}
          {timeSinkSessions.map(session => {
            const x = minutesToX(session.startMinutes)
            const width = minutesToX(session.endMinutes) - x
            const isSelected = session.id === selectedSessionId

            if (width <= 0) return null

            return (
              <g key={`sink-${session.id}`}>
                <rect
                  x={x}
                  y={TIME_SINK_LANE_Y}
                  width={width}
                  height={TIME_SINK_LANE_HEIGHT}
                  fill={session.color || '#9B59B6'}
                  stroke={isSelected ? '#165DFF' : 'none'}
                  strokeWidth={isSelected ? 2 : 0}
                  opacity={0.7}
                  rx={4}
                  style={{ cursor: 'pointer' }}
                  onClick={() => onSessionSelect(session.id)}
                >
                  <title>{session.taskName} ({Math.round(session.endMinutes - session.startMinutes)} min)</title>
                </rect>
                {width > 40 && (
                  <text
                    x={x + 6}
                    y={TIME_SINK_LANE_Y + TIME_SINK_LANE_HEIGHT / 2 + 4}
                    fontSize={10}
                    fill="#fff"
                    style={{ pointerEvents: 'none' }}
                  >
                    {session.taskName.length > Math.floor(width / 7)
                      ? session.taskName.slice(0, Math.floor(width / 7)) + '…'
                      : session.taskName}
                  </text>
                )}
              </g>
            )
          })}

          {/* Creating time sink session preview */}
          {creatingTimeSinkSession && (
            <rect
              x={minutesToX(Math.min(creatingTimeSinkSession.startMinutes, creatingTimeSinkSession.currentMinutes))}
              y={TIME_SINK_LANE_Y}
              width={Math.abs(
                minutesToX(creatingTimeSinkSession.currentMinutes) -
                minutesToX(creatingTimeSinkSession.startMinutes),
              )}
              height={TIME_SINK_LANE_HEIGHT}
              fill="#9B59B6"
              opacity={0.3}
              stroke="#9B59B6"
              strokeDasharray="4,2"
              rx={4}
            />
          )}

          {/* Split cursor indicator - spans both work session and time sink lanes */}
          {splitCursor.mode !== SplitMode.Inactive && splitCursor.splitMinutes !== null && (() => {
            // Extract values for TypeScript null safety
            const splitPos = splitCursor.frozenAt ?? splitCursor.splitMinutes
            // Determine which lane the target session is in
            const targetSession = sessions.find(s =>
              s.startMinutes < splitPos && s.endMinutes > splitPos,
            )
            const isTimeSinkTarget = targetSession?.isTimeSink === true
            const laneY = isTimeSinkTarget ? TIME_SINK_LANE_Y : SESSION_LANE_Y
            const laneHeight = isTimeSinkTarget ? TIME_SINK_LANE_HEIGHT : SESSION_LANE_HEIGHT

            return (
              <g style={{ pointerEvents: 'none' }}>
                <line
                  x1={minutesToX(splitPos)}
                  y1={laneY - 5}
                  x2={minutesToX(splitPos)}
                  y2={laneY + laneHeight + 5}
                  stroke="#165DFF"
                  strokeWidth={splitCursor.mode === SplitMode.Frozen ? 2 : 1}
                  strokeDasharray={splitCursor.mode === SplitMode.Frozen ? 'none' : '4,2'}
                  opacity={splitCursor.mode === SplitMode.Frozen ? 1 : 0.6}
                />
                {/* Scissors icon at top */}
                <text
                  x={minutesToX(splitPos)}
                  y={laneY - 10}
                  fontSize={12}
                  fill="#165DFF"
                  textAnchor="middle"
                  opacity={splitCursor.mode === SplitMode.Frozen ? 1 : 0.6}
                >
                  ✂️
                </text>
                {/* Time label */}
                <text
                  x={minutesToX(splitPos) + 4}
                  y={laneY + laneHeight + 15}
                  fontSize={10}
                  fill="#165DFF"
                  opacity={0.8}
                >
                  {minutesToTime(splitPos)}
                </text>
              </g>
            )
          })()}

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
        </div>{/* Close wrapper div */}
      </div>{/* Close scroll container */}

      {/* Time Sink Selector Modal */}
      <Modal
        title="Select Time Sink"
        visible={showSinkSelector}
        onCancel={() => {
          setShowSinkSelector(false)
          setPendingTimeSinkRange(null)
        }}
        footer={null}
        style={{ maxWidth: 400 }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <p style={{ margin: '0 0 8px', color: '#86909c', fontSize: 13 }}>
            Choose which time sink to log this time to:
          </p>
          {timeSinks.map(sink => (
            <div
              key={sink.id}
              onClick={() => {
                if (pendingTimeSinkRange && onTimeSinkSessionCreate) {
                  onTimeSinkSessionCreate(sink.id, pendingTimeSinkRange.start, pendingTimeSinkRange.end)
                }
                setShowSinkSelector(false)
                setPendingTimeSinkRange(null)
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '12px 16px',
                borderRadius: 8,
                backgroundColor: '#f7f8fa',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.backgroundColor = sink.color + '20'
                e.currentTarget.style.borderColor = sink.color
              }}
              onMouseLeave={e => {
                e.currentTarget.style.backgroundColor = '#f7f8fa'
                e.currentTarget.style.borderColor = 'transparent'
              }}
            >
              <span style={{ fontSize: 24 }}>{sink.emoji}</span>
              <div>
                <div style={{ fontWeight: 500 }}>{sink.name}</div>
                <div style={{ fontSize: 11, color: '#86909c' }}>
                  {pendingTimeSinkRange
                    ? `${pendingTimeSinkRange.end - pendingTimeSinkRange.start} minutes`
                    : ''}
                </div>
              </div>
              <div
                style={{
                  marginLeft: 'auto',
                  width: 16,
                  height: 16,
                  borderRadius: 4,
                  backgroundColor: sink.color,
                }}
              />
            </div>
          ))}
        </div>
      </Modal>
    </div>
  )
}
