import React, { useState, useRef, useEffect } from 'react'
import { WorkBlock, WorkMeeting } from '@shared/work-blocks-types'
import { isSingleTypeBlock, isComboBlock, isSystemBlock, getTypeColor } from '@shared/user-task-types'
import { useSortedUserTaskTypes } from '@renderer/store/useUserTaskTypeStore'
import { getCurrentTime } from '@shared/time-provider'

interface TimelineVisualizerProps {
  blocks: WorkBlock[]
  meetings: WorkMeeting[]
  onBlockUpdate?: (__blockId: string, updates: Partial<WorkBlock>) => void
  onMeetingUpdate?: (__meetingId: string, updates: Partial<WorkMeeting>) => void
  startHour?: number
  endHour?: number
  height?: number
}

interface DragState {
  type: 'block' | 'meeting'
  id: string
  edge: 'start' | 'end' | 'move'
  initialY: number
  initialTime: string
  initialEndTime?: string
}

const HOUR_HEIGHT = 60 // pixels per hour
const TIME_LABELS_WIDTH = 60
const CONTENT_WIDTH = 250

export function TimelineVisualizer({
  blocks = [],
  meetings = [],
  onBlockUpdate,
  onMeetingUpdate,
  startHour = 6,
  endHour = 22,
  height = 600,
}: TimelineVisualizerProps) {
  const userTypes = useSortedUserTaskTypes()
  const [dragState, setDragState] = useState<DragState | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const totalHours = endHour - startHour
  const __totalHeight = totalHours * HOUR_HEIGHT

  // Convert time string (HH:mm) to pixels from top
  const timeToPixels = (timeStr: string): number => {
    const [hours, minutes] = timeStr.split(':').map(Number)
    const totalMinutes = (hours - startHour) * 60 + minutes
    return (totalMinutes / 60) * HOUR_HEIGHT
  }

  // Convert pixels from top to time string (HH:mm)
  const pixelsToTime = (pixels: number): string => {
    const totalMinutes = Math.round((pixels / HOUR_HEIGHT) * 60)
    const hours = Math.floor(totalMinutes / 60) + startHour
    const minutes = totalMinutes % 60

    // Clamp to valid range
    const clampedHours = Math.max(startHour, Math.min(endHour - 1, hours))
    const clampedMinutes = hours >= endHour ? 59 : minutes

    return `${clampedHours.toString().padStart(2, '0')}:${clampedMinutes.toString().padStart(2, '0')}`
  }

  // Return time as-is without rounding
  const roundToQuarter = (timeStr: string): string => {
    // No rounding - return the exact time
    return timeStr
  }

  const handleMouseDown = (e: React.MouseEvent, type: 'block' | 'meeting', id: string, edge: 'start' | 'end' | 'move') => {
    e.preventDefault()
    e.stopPropagation()

    const item = type === 'block'
      ? blocks.find(b => b.id === id)
      : meetings.find(m => m.id === id)

    if (!item) return

    setDragState({
      type,
      id,
      edge,
      initialY: e.clientY,
      initialTime: edge === 'move' ? item.startTime : (edge === 'start' ? item.startTime : item.endTime),
      initialEndTime: edge === 'move' ? item.endTime : undefined,
    })
  }

  const handleMouseMove = (e: MouseEvent) => {
    if (!dragState || !containerRef.current) return

    const rect = containerRef.current.getBoundingClientRect()
    const relativeY = e.clientY - rect.top + containerRef.current.scrollTop

    if (dragState.edge === 'move') {
      // Moving the entire block
      const deltaY = e.clientY - dragState.initialY
      const deltaMinutes = Math.round((deltaY / HOUR_HEIGHT) * 60)

      // Calculate new start and end times
      const [startHours, startMinutes] = dragState.initialTime.split(':').map(Number)
      const [endHours, endMinutes] = (dragState.initialEndTime || '').split(':').map(Number)

      const newStartTotalMinutes = (startHours - startHour) * 60 + startMinutes + deltaMinutes
      const newEndTotalMinutes = (endHours - startHour) * 60 + endMinutes + deltaMinutes

      // Check bounds
      if (newStartTotalMinutes >= 0 && newEndTotalMinutes <= (endHour - startHour) * 60) {
        const newStartTime = roundToQuarter(pixelsToTime((newStartTotalMinutes / 60) * HOUR_HEIGHT))
        const newEndTime = roundToQuarter(pixelsToTime((newEndTotalMinutes / 60) * HOUR_HEIGHT))

        if (dragState.type === 'block' && onBlockUpdate) {
          onBlockUpdate(dragState.id, { startTime: newStartTime, endTime: newEndTime })
        } else if (dragState.type === 'meeting' && onMeetingUpdate) {
          onMeetingUpdate(dragState.id, { startTime: newStartTime, endTime: newEndTime })
        }
      }
    } else {
      // Resizing edges (existing code)
      const newTime = roundToQuarter(pixelsToTime(relativeY))

      if (dragState.type === 'block' && onBlockUpdate) {
        const block = blocks.find(b => b.id === dragState.id)
        if (!block) return

        if (dragState.edge === 'start') {
          // Don't allow start to go past end
          if (newTime < block.endTime) {
            onBlockUpdate(dragState.id, { startTime: newTime })
          }
        } else if (dragState.edge === 'end') {
          // Don't allow end to go before start
          if (newTime > block.startTime) {
            onBlockUpdate(dragState.id, { endTime: newTime })
          }
        }
      } else if (dragState.type === 'meeting' && onMeetingUpdate) {
        const meeting = meetings.find(m => m.id === dragState.id)
        if (!meeting) return

        if (dragState.edge === 'start') {
          if (newTime < meeting.endTime) {
            onMeetingUpdate(dragState.id, { startTime: newTime })
          }
        } else if (dragState.edge === 'end') {
          if (newTime > meeting.startTime) {
            onMeetingUpdate(dragState.id, { endTime: newTime })
          }
        }
      }
    }
  }

  const handleMouseUp = () => {
    setDragState(null)
  }

  useEffect(() => {
    if (dragState) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)

      return () => {
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
      }
    }
  }, [dragState])

  const getBlockColor = (typeConfig: WorkBlock['typeConfig']) => {
    if (isSystemBlock(typeConfig)) {
      return '#86909C' // Gray for system blocks
    }
    if (isSingleTypeBlock(typeConfig)) {
      // Use dynamic color lookup from user types
      return getTypeColor(userTypes, typeConfig.typeId)
    }
    if (isComboBlock(typeConfig)) {
      return '#722ED1' // Purple for combo blocks
    }
    return '#86909C'
  }

  const getMeetingColor = (type: string) => {
    switch (type) {
      case 'meeting':
        return '#F53F3F'
      case 'break':
        return '#00B42A'
      case 'personal':
        return '#B71DE8'
      case 'blocked':
        return '#86909C'
      default:
        return '#F77234'
    }
  }

  // Render time labels
  const renderTimeLabels = () => {
    const labels: React.ReactElement[] = []
    for (let hour = startHour; hour <= endHour; hour++) {
      const y = (hour - startHour) * HOUR_HEIGHT
      labels.push(
        <div
          key={hour}
          style={{
            position: 'absolute',
            top: y - 10,
            left: 0,
            width: TIME_LABELS_WIDTH,
            textAlign: 'right',
            paddingRight: 10,
            fontSize: 12,
            color: '#86909C',
          }}
        >
          {hour.toString().padStart(2, '0')}:00
        </div>,
      )
    }
    return labels
  }

  // Render grid lines
  const renderGridLines = () => {
    const lines: React.ReactElement[] = []
    for (let hour = startHour; hour <= endHour; hour++) {
      const y = (hour - startHour) * HOUR_HEIGHT

      // Hour line
      lines.push(
        <div
          key={`hour-${hour}`}
          style={{
            position: 'absolute',
            top: y,
            left: TIME_LABELS_WIDTH,
            right: 0,
            height: 1,
            backgroundColor: '#E5E8EF',
          }}
        />,
      )

      // Half-hour line
      if (hour < endHour) {
        lines.push(
          <div
            key={`half-${hour}`}
            style={{
              position: 'absolute',
              top: y + HOUR_HEIGHT / 2,
              left: TIME_LABELS_WIDTH,
              right: 0,
              height: 1,
              backgroundColor: '#F2F3F5',
              borderStyle: 'dashed',
            }}
          />,
        )
      }
    }
    return lines
  }

  // Render a single block or meeting
  const renderItem = (
    item: WorkBlock | WorkMeeting,
    type: 'block' | 'meeting',
    color: string,
  ) => {
    const top = timeToPixels(item.startTime)
    const bottom = timeToPixels(item.endTime)
    const itemHeight = bottom - top

    // Determine if it's a block or meeting for different rendering
    const isBlock = 'capacity' in item

    return (
      <div
        key={item.id}
        style={{
          position: 'absolute',
          top,
          left: TIME_LABELS_WIDTH + 10,
          width: CONTENT_WIDTH,
          height: itemHeight,
          backgroundColor: color,
          opacity: 0.9,
          borderRadius: 4,
          padding: '8px 12px',
          color: 'white',
          fontSize: 12,
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
          cursor: 'move',
          userSelect: 'none',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
        }}
        onMouseDown={(e) => {
          // Only trigger move if not clicking on resize handles
          const rect = e.currentTarget.getBoundingClientRect()
          const relativeY = e.clientY - rect.top
          if (relativeY > 8 && relativeY < rect.height - 8) {
            handleMouseDown(e, type, item.id, 'move')
          }
        }}
      >
        {/* Drag handle for start time */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 8,
            cursor: 'ns-resize',
            backgroundColor: 'rgba(255,255,255,0.3)',
          }}
          onMouseDown={(e) => handleMouseDown(e, type, item.id, 'start')}
        />

        {/* Content */}
        <div>
          <div style={{ fontWeight: 'bold', marginBottom: 4 }}>
            {item.startTime} - {item.endTime}
          </div>
          <div>
            {isBlock ? (() => {
              const block = item as WorkBlock
              const { typeConfig } = block
              if (isSystemBlock(typeConfig)) {
                return `🚫 ${typeConfig.systemType === 'sleep' ? 'Sleep' : 'Blocked'}`
              }
              if (isSingleTypeBlock(typeConfig)) {
                return `📋 ${typeConfig.typeId} Work`
              }
              if (isComboBlock(typeConfig)) {
                const types = typeConfig.allocations.map(a => a.typeId).join('/')
                return `🔄 ${types} (Combo)`
              }
              return 'Work Block'
            })() : (() => {
              const meeting = item as WorkMeeting
              return meeting.name || meeting.type
            })()}
          </div>
          {isBlock && (() => {
            const block = item as WorkBlock
            if (!block.capacity) return null
            return (
              <div style={{ fontSize: 10, marginTop: 4, opacity: 0.9 }}>
                Total: {block.capacity.totalMinutes}m
              </div>
            )
          })()}
        </div>

        {/* Drag handle for end time */}
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: 8,
            cursor: 'ns-resize',
            backgroundColor: 'rgba(255,255,255,0.3)',
          }}
          onMouseDown={(e) => handleMouseDown(e, type, item.id, 'end')}
        />
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        height,
        overflow: 'auto',
        backgroundColor: '#FAFBFC',
        borderRadius: 4,
        border: '1px solid #e5e8ef',
      }}
    >
        {/* Time labels */}
        {renderTimeLabels()}

        {/* Grid lines */}
        {renderGridLines()}

        {/* Work blocks */}
        {blocks.map(block =>
          renderItem(block, 'block', getBlockColor(block.typeConfig)),
        )}

        {/* Meetings */}
        {meetings.map(meeting =>
          renderItem(meeting, 'meeting', getMeetingColor(meeting.type)),
        )}

        {/* Current time indicator */}
        {(() => {
          const now = getCurrentTime()
          const currentHour = now.getHours()
          const currentMinute = now.getMinutes()

          if (currentHour >= startHour && currentHour < endHour) {
            const currentTimePixels = timeToPixels(
              `${currentHour.toString().padStart(2, '0')}:${currentMinute.toString().padStart(2, '0')}`,
            )

            return (
              <div
                style={{
                  position: 'absolute',
                  top: currentTimePixels,
                  left: TIME_LABELS_WIDTH,
                  right: 0,
                  height: 2,
                  backgroundColor: '#F53F3F',
                  zIndex: 10,
                }}
              >
                <div
                  style={{
                    position: 'absolute',
                    left: -4,
                    top: -4,
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    backgroundColor: '#F53F3F',
                  }}
                />
              </div>
            )
          }
          return null
        })()}
    </div>
  )
}
