import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { Card, Typography, Space, Tag, Grid, Empty, Tooltip, Button, DatePicker, Alert, Dropdown, Menu, Spin } from '@arco-design/web-react'
import { IconZoomIn, IconZoomOut, IconSettings, IconCalendar, IconMoon, IconInfoCircle, IconExpand, IconRefresh, IconClockCircle, IconUp, IconDown } from '@arco-design/web-react/icon'
import { Task } from '@shared/types'
import { SequencedTask } from '@shared/sequencing-types'
import { TaskType } from '@shared/enums'
import { DailyWorkPattern, WorkMeeting } from '@shared/work-blocks-types'
// Updated to use UnifiedScheduler via useUnifiedScheduler hook
import { useUnifiedScheduler, ScheduleResult } from '../../hooks/useUnifiedScheduler'
import { ScheduledItem } from '@shared/unified-scheduler-adapter'
import { SchedulingDebugPanel as DebugInfoComponent } from './SchedulingDebugInfo'
import { SchedulingDebugInfo } from '@shared/unified-scheduler'
import { DeadlineViolationBadge } from './DeadlineViolationBadge'
import { WorkScheduleModal } from '../settings/WorkScheduleModal'
import { MultiDayScheduleEditor } from '../settings/MultiDayScheduleEditor'
import { useTaskStore } from '../../store/useTaskStore'
import dayjs from 'dayjs'
import { logger } from '@/logger'
import { getCurrentTime, isTimeOverridden } from '@shared/time-provider'
import { appEvents, EVENTS } from '../../utils/events'


const { Title, Text } = Typography
const { Row, Col } = Grid

interface GanttChartProps {
  tasks: Task[]
  sequencedTasks: SequencedTask[]
}

interface GanttItemWorkflowMetadata {
  workflowId?: string
  workflowName?: string
  stepIndex?: number
  isWorkflowStep?: boolean
}

interface GanttItem extends GanttItemWorkflowMetadata {
  id: string
  name: string
  type: 'task' | 'workflow-step' | 'meeting' | 'blocked-time'
  priority: number
  duration: number
  startTime: Date
  endTime: Date
  color: string
  deadline?: Date
  originalItem: Task | SequencedTask | WorkMeeting
  blockId?: string
  isBlocked?: boolean
  isWaitTime?: boolean
}

// Zoom presets
const ZOOM_PRESETS = [
  { label: 'Week View', value: 30, description: 'See entire week' },
  { label: 'Day View', value: 60, description: 'See full days' },
  { label: 'Half Day', value: 120, description: 'Standard view' },
  { label: 'Detailed', value: 180, description: 'See task details' },
  { label: 'Hourly', value: 240, description: 'Hour by hour' },
]

export function GanttChart({ tasks, sequencedTasks }: GanttChartProps) {
  const { updateTask, updateSequencedTask, workPatterns = [], workPatternsLoading, loadWorkPatterns } = useTaskStore()
  const { scheduleForGantt } = useUnifiedScheduler()
  const [pixelsPerHour, setPixelsPerHour] = useState(120) // pixels per hour for scaling
  const [hoveredItem, setHoveredItem] = useState<string | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [showMultiDayEditor, setShowMultiDayEditor] = useState(false)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [debugInfo, setDebugInfo] = useState<SchedulingDebugInfo | null>(null)
  const [showDebugInfo, setShowDebugInfo] = useState(false)
  const [isPinching, setIsPinching] = useState(false)
  const [draggedItem, setDraggedItem] = useState<any>(null)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const [dropTarget, setDropTarget] = useState<{ time: Date, row: number } | null>(null)
  const [refreshKey, setRefreshKey] = useState(0) // Force re-render when time changes
  const [summaryCollapsed, setSummaryCollapsed] = useState(false)

  const { workSettings, setOptimalSchedule } = useTaskStore()

  // Listen for time override changes
  useEffect(() => {
    const handleTimeChange = () => {
      logger.ui.info('Time override changed, reloading patterns', {}, 'time-override-change')
      // CRITICAL: Reload patterns with new time context
      loadWorkPatterns()
      // Clear any saved schedule when time changes
      setOptimalSchedule([])
      // Force re-render by incrementing key
      setRefreshKey(prev => prev + 1)
    }

    appEvents.on(EVENTS.TIME_OVERRIDE_CHANGED, handleTimeChange)
    return () => {
      appEvents.off(EVENTS.TIME_OVERRIDE_CHANGED, handleTimeChange)
    }
  }, [setOptimalSchedule, loadWorkPatterns])

  // Zoom controls
  const handleZoomIn = useCallback(() => {
    setPixelsPerHour(prev => Math.min(prev + 30, 300))
  }, [])

  const handleZoomOut = useCallback(() => {
    setPixelsPerHour(prev => Math.max(prev - 30, 15))
  }, [])

  const handleZoomReset = useCallback(() => {
    setPixelsPerHour(120)
  }, [])

  // Keyboard shortcuts for zoom
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check if Gantt chart is in view (you might want to add a more specific check)
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return
      }

      if (e.ctrlKey || e.metaKey) {
        if (e.key === '=' || e.key === '+') {
          e.preventDefault()
          handleZoomIn()
        } else if (e.key === '-') {
          e.preventDefault()
          handleZoomOut()
        } else if (e.key === '0') {
          e.preventDefault()
          handleZoomReset()
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleZoomIn, handleZoomOut, handleZoomReset])

  // Mouse wheel zoom and pinch-to-zoom support
  const chartContainerRef = useRef<HTMLDivElement>(null)
  const initialPinchDistance = useRef<number>(0)
  const initialZoom = useRef<number>(120)

  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      // On Mac, pinch-to-zoom triggers wheel event with ctrlKey=true
      // Regular Ctrl+scroll also has ctrlKey=true
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault()

        // For pinch gestures, deltaY represents the zoom factor
        // For mouse wheel, it's the scroll amount
        // Pinch gestures typically have smaller deltaY values
        const isPinch = Math.abs(e.deltaY) < 10
        const delta = isPinch
          ? -e.deltaY * 3  // Amplify pinch gesture
          : (e.deltaY > 0 ? -15 : 15)  // Regular scroll

        setPixelsPerHour(prev => Math.max(15, Math.min(300, prev + delta)))
      }
    }

    // Safari-specific gesture events for better pinch support
    const handleGestureStart = (e: any) => {
      e.preventDefault()
      initialPinchDistance.current = e.scale
      initialZoom.current = pixelsPerHour
      setIsPinching(true)
    }

    const handleGestureChange = (e: any) => {
      e.preventDefault()
      const scale = e.scale / initialPinchDistance.current
      const newZoom = Math.round(initialZoom.current * scale)
      setPixelsPerHour(Math.max(15, Math.min(300, newZoom)))
    }

    const handleGestureEnd = (e: any) => {
      e.preventDefault()
      setIsPinching(false)
    }

    // Touch events for pinch-to-zoom on devices without gesture events
    let touches: Touch[] = []
    let lastDistance = 0

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        touches = Array.from(e.touches)
        const dx = touches[0].clientX - touches[1].clientX
        const dy = touches[0].clientY - touches[1].clientY
        lastDistance = Math.sqrt(dx * dx + dy * dy)
        setIsPinching(true)
      }
    }

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && touches.length === 2) {
        e.preventDefault()
        const newTouches = Array.from(e.touches)
        const dx = newTouches[0].clientX - newTouches[1].clientX
        const dy = newTouches[0].clientY - newTouches[1].clientY
        const distance = Math.sqrt(dx * dx + dy * dy)

        if (lastDistance > 0) {
          const scale = distance / lastDistance
          const delta = (scale - 1) * 100
          setPixelsPerHour(prev => Math.max(15, Math.min(300, prev + delta)))
        }

        lastDistance = distance
      }
    }

    const handleTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) {
        touches = []
        lastDistance = 0
        setIsPinching(false)
      }
    }

    const container = chartContainerRef.current
    if (container) {
      // Add wheel event for pinch-to-zoom via trackpad
      container.addEventListener('wheel', handleWheel, { passive: false })

      // Add Safari gesture events
      container.addEventListener('gesturestart', handleGestureStart, { passive: false })
      container.addEventListener('gesturechange', handleGestureChange, { passive: false })
      container.addEventListener('gestureend', handleGestureEnd, { passive: false })

      // Add touch events for other devices
      container.addEventListener('touchstart', handleTouchStart, { passive: false })
      container.addEventListener('touchmove', handleTouchMove, { passive: false })
      container.addEventListener('touchend', handleTouchEnd, { passive: false })

      return () => {
        container.removeEventListener('wheel', handleWheel)
        container.removeEventListener('gesturestart', handleGestureStart)
        container.removeEventListener('gesturechange', handleGestureChange)
        container.removeEventListener('gestureend', handleGestureEnd)
        container.removeEventListener('touchstart', handleTouchStart)
        container.removeEventListener('touchmove', handleTouchMove)
        container.removeEventListener('touchend', handleTouchEnd)
      }
    }
  }, [pixelsPerHour, setIsPinching])

  // Reload work patterns when WorkScheduleModal closes or data changes
  useEffect(() => {
    const handleDataRefresh = () => {
      logger.ui.info('Data refresh event, reloading work patterns', {}, 'gantt-data-refresh')
      loadWorkPatterns()
    }

    appEvents.on(EVENTS.DATA_REFRESH_NEEDED, handleDataRefresh)
    return () => {
      appEvents.off(EVENTS.DATA_REFRESH_NEEDED, handleDataRefresh)
    }
  }, [loadWorkPatterns])

  // Helper function to convert UnifiedScheduler results to GanttChart format
  const convertUnifiedToGanttItems = useCallback((result: ScheduleResult): GanttItem[] => {
    logger.ui.info('Converting UnifiedScheduler results to Gantt format', {    isWorkflowStep: itemWithMetadata.isWorkflowStep,
        }),
      }

      return ganttItem
    })
  }, [])

  // Helper function to convert meetings from workPatterns to ScheduledItem format
  const getMeetingScheduledItems = useCallback((workPatterns: DailyWorkPattern[]): GanttItem[] => {
    const meetingItems: GanttItem[] = []
    const meetingMap = new Map<string, number>()

    workPatterns.forEach(pattern => {
      if (!pattern.meetings || pattern.meetings.length === 0) return

      const date = new Date(pattern.date + 'T00:00:00')

      pattern.meetings.forEach(meeting => {
        // Parse times for this date
        const parseTimeOnDate = (date: Date, timeStr: string): Date => {
          const [hours, minutes] = timeStr.split(':').map(Number)
          const result = new Date(date)
          result.setHours(hours, minutes, 0, 0)
          return result
        }

        const startTime = parseTimeOnDate(date, meeting.startTime)
        const endTime = parseTimeOnDate(date, meeting.endTime)

        // Generate unique meeting IDs per day
        const dateStr = date.toISOString().split('T')[0]
        const baseId = `${meeting.id}-${dateStr}`
        const count = meetingMap.get(baseId) || 0
        meetingMap.set(baseId, count + 1)
        const uniqueMeetingId = count > 0 ? `${baseId}-${count}` : baseId

        // Check if this meeting crosses midnight (end time is earlier than start time)
        const crossesMidnight = endTime <= startTime
        const isSleepBlock = meeting.type === 'blocked' && meeting.name === 'Sleep'

        // Handle meetings that cross midnight (like sleep blocks)
        if (crossesMidnight) {
          if (isSleepBlock) {
            // Split sleep blocks across midnight
            const midnight = new Date(date)
            midnight.setDate(midnight.getDate() + 1)
            midnight.setHours(0, 0, 0, 0)

            // Night portion (from start time to midnight)
            meetingItems.push({
              id: `${uniqueMeetingId}-night`,
              name: meeting.name,
              type: 'blocked-time',
              priority: 0,
              duration: (midnight.getTime() - startTime.getTime()) / 60000,
              startTime,
              endTime: midnight,
              color: '#ff4d4f',
              isBlocked: true,
              originalItem: meeting,
            })

            // Morning portion (from midnight to end time next day)
            const nextDayStart = new Date(date)
            nextDayStart.setDate(nextDayStart.getDate() + 1)
            nextDayStart.setHours(0, 0, 0, 0)

            const nextDayEnd = parseTimeOnDate(new Date(date.getTime() + 24 * 60 * 60 * 1000), meeting.endTime)

            meetingItems.push({
              id: `${uniqueMeetingId}-morning`,
              name: meeting.name,
              type: 'blocked-time',
              priority: 0,
              duration: (nextDayEnd.getTime() - nextDayStart.getTime()) / 60000,
              startTime: nextDayStart,
              endTime: nextDayEnd,
              color: '#ff4d4f',
              isBlocked: true,
              originalItem: meeting,
            })
          } else {
            // For other meetings crossing midnight, adjust end time to next day
            endTime.setDate(endTime.getDate() + 1)

            // Add the meeting with corrected end time
            meetingItems.push({
              id: uniqueMeetingId,
              name: meeting.name,
              type: meeting.type === 'meeting' ? 'meeting' : 'blocked-time',
              priority: 0,
              duration: (endTime.getTime() - startTime.getTime()) / 60000,
              startTime,
              endTime,
              color: meeting.type === 'meeting' ? '#3370ff' :
                     meeting.type === 'break' ? '#00b42a' :
                     meeting.type === 'personal' ? '#ff7d00' : '#ff4d4f',
              isBlocked: true,
              originalItem: meeting,
            })
          }
        } else {
          // Add regular meeting (doesn't cross midnight)
          meetingItems.push({
            id: uniqueMeetingId,
            name: meeting.name,
            type: meeting.type === 'meeting' ? 'meeting' : 'blocked-time',
            priority: 0,
            duration: (endTime.getTime() - startTime.getTime()) / 60000,
            startTime,
            endTime,
            color: meeting.type === 'meeting' ? '#3370ff' :
                   meeting.type === 'break' ? '#00b42a' :
                   meeting.type === 'personal' ? '#ff7d00' : '#ff4d4f',
            isBlocked: true,
            originalItem: meeting,
          })
        }
      })
    })

    return meetingItems
  }, [])

  // Use the scheduler to get properly ordered items
  // Include refreshKey in dependencies to force recalculation when time changes
  const scheduledItems = useMemo(() => {
    logger.ui.info('Computing schedule', {    priority: item.priority,
      }))


      // Log final schedule results with deadline analysis
      const finalItemsWithDeadlines = ganttItems.filter(item => item.deadline)
      const violatedDeadlines = finalItemsWithDeadlines.filter(item =>
        dayjs(item.endTime).isAfter(dayjs(item.deadline)),
      )

      logger.ui.info('UnifiedScheduler calculation complete', {    isWorkflow: !!item.workflowId,
        })),
      }, 'gantt-schedule-complete')
    }

    // Add meeting items from work patterns
    const meetingItems = getMeetingScheduledItems(workPatterns)

    logger.ui.info('Merging UnifiedScheduler results with meetings', {    type: workflow.type,
            })
            if (!workflowRows.has(workflow.id)) {
              workflowRows.set(workflow.id, currentRow)
              currentRow++
            }
            positions.set(step.id, workflowRows.get(workflow.id)!)
          }
        })
      }
    })

    return { positions, totalRows: currentRow, workflowProgress, totalMeetingMinutes, unscheduledTasks }
  }, [scheduledItems])

  // Check for empty state but don't early return - show timeline with empty state message
  const hasScheduledItems = scheduledItems.length > 0

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="large">
      {/* Loading state for work patterns */}
      {workPatternsLoading && (
        <Card>
          <Space direction="vertical" align="center" style={{ width: '100%', padding: '40px 0' }}>
            <Spin size={32} />
            <Text type="secondary">Loading work patterns...</Text>
          </Space>
        </Card>
      )}

      {/* Info about default patterns */}
      {!workPatternsLoading && workPatterns.some(p => p.blocks.some((b: any) => b.id.startsWith('default-'))) && (
        <Alert
          type="info"
          content={
            <Space>
              <Text>
                Days without defined work blocks will have no tasks scheduled.
              </Text>
              <Button
                type="text"
                size="small"
                onClick={() => {
                  setSelectedDate(dayjs().add(1, 'day').format('YYYY-MM-DD'))
                  setShowSettings(true)
                }}
              >
                {"Customize Tomorrow's Schedule"}
              </Button>
            </Space>
          }
          closable
        />
      )}

      {/* Time Override Indicator and Refresh */}
      {isTimeOverridden() && (
        <Alert
          type="warning"
          icon={<IconClockCircle />}
          content={
            <Space style={{ width: '100%', justifyContent: 'space-between' }}>
              <Space>
                <Text style={{ fontWeight: 'bold' }}>Time Override Active:</Text>
                <Text>{getCurrentTime().toLocaleString()}</Text>
              </Space>
              <Button
                type="primary"
                size="small"
                icon={<IconRefresh />}
                onClick={() => {
                  logger.ui.info('Manual refresh triggered', {}, 'gantt-manual-refresh')
                  setOptimalSchedule([])
                  setRefreshKey(prev => prev + 1)
                }}
              >
                Refresh Schedule
              </Button>
            </Space>
          }
        />
      )}

      {/* Summary - Only show when patterns are loaded */}
      {!workPatternsLoading && (
        <Card
          title="Schedule Summary"
        bordered={false}
        style={{ marginBottom: 16 }}
        extra={
          <Button
            size="small"
            type="text"
            onClick={() => setSummaryCollapsed(!summaryCollapsed)}
            icon={summaryCollapsed ? <IconDown /> : <IconUp />}
          />
        }
      >
        {!summaryCollapsed && (
        <Row gutter={16} align="center">
          <Col xs={24} sm={12} md={6} lg={4}>
            <Space direction="vertical">
              <Text type="secondary">Total Items</Text>
              <Title heading={4}>{scheduledItems.filter((item: any) => !item.isWaitTime).length}</Title>
            </Space>
          </Col>
          <Col xs={24} sm={12} md={6} lg={4}>
            <Space direction="vertical">
              <Text type="secondary">Completion</Text>
              <Title heading={4}>{formatDate(chartEndTime)}</Title>
              <Text type="secondary">{formatTime(chartEndTime)}</Text>
            </Space>
          </Col>
          <Col xs={12} sm={8} md={4} lg={3}>
            <Space direction="vertical">
              <Text type="secondary">Work Days</Text>
              <Title heading={4}>{totalDays} days</Title>
            </Space>
          </Col>
          <Col xs={12} sm={8} md={4} lg={3}>
            <Space direction="vertical">
              <Text type="secondary">Workflows</Text>
              <Title heading={4}>{sequencedTasks.filter(w => w.overallStatus !== 'completed').length}</Title>
            </Space>
          </Col>
          <Col xs={12} sm={8} md={4} lg={3}>
            <Space direction="vertical">
              <Text type="secondary">Meeting Time</Text>
              <Title heading={4}>
                {itemRowPositions.totalMeetingMinutes > 0
                  ? `${Math.floor(itemRowPositions.totalMeetingMinutes / 60)}h ${itemRowPositions.totalMeetingMinutes % 60}m`
                  : '0h'}
              </Title>
            </Space>
          </Col>
          <Col xs={12} sm={8} md={4} lg={3}>
            <Space direction="vertical">
              <Text type="secondary">Deadline Violations</Text>
              <Title heading={4} style={{ color: scheduledItems.filter((item: any) => {
                const parentWorkflow = item.workflowId ? sequencedTasks.find(w => w.id === item.workflowId) : null
                const effectiveDeadline = item.deadline || (parentWorkflow?.deadline ? parentWorkflow.deadline : null)
                return effectiveDeadline && dayjs(item.endTime).isAfter(dayjs(effectiveDeadline))
              }).length > 0 ? '#ff4d4f' : '#00b42a' }}>
                {scheduledItems.filter((item: any) => {
                  const parentWorkflow = item.workflowId ? sequencedTasks.find(w => w.id === item.workflowId) : null
                  const effectiveDeadline = item.deadline || (parentWorkflow?.deadline ? parentWorkflow.deadline : null)
                  return effectiveDeadline && dayjs(item.endTime).isAfter(dayjs(effectiveDeadline))
                }).length}
              </Title>
            </Space>
          </Col>
          <Col xs={24} sm={24} md={10} lg={7}>
            <Space direction="vertical" style={{ width: '100%' }}>
              <Text type="secondary">Schedule Options</Text>
              <Space direction="vertical" size="small" style={{ width: '100%' }}>
                  <DatePicker
                    value={selectedDate ? dayjs(selectedDate) : undefined}
                    onChange={(dateString, __date) => {
                      if (dateString) {
                        setSelectedDate(dateString)
                        setShowSettings(true)
                      }
                    }}
                    placeholder="Select day to edit"
                    style={{ width: '100%' }}
                    disabledDate={(_current) => {
                      // Don't disable any dates - allow editing past and future
                      return false
                    }}
                  />
                  <Button
                    icon={<IconSettings />}
                    onClick={() => {
                      setSelectedDate(dayjs().format('YYYY-MM-DD'))
                      setShowSettings(true)
                    }}
                    style={{ width: '100%' }}
                  >
                    {"Edit Today's Schedule"}
                  </Button>
                  <Button
                    type="primary"
                    icon={<IconCalendar />}
                    onClick={() => setShowMultiDayEditor(true)}
                    style={{ width: '100%' }}
                  >
                    Multi-Day Editor
                  </Button>
                  <Button
                    icon={<IconInfoCircle />}
                    onClick={() => setShowDebugInfo(!showDebugInfo)}
                    style={{ width: '100%' }}
                    type={debugInfo && (debugInfo.unscheduledItems.length > 0 || debugInfo.warnings.length > 0) ? 'primary' : 'default'}
                  >
                    Debug Info
                  </Button>
              </Space>
            </Space>
          </Col>
        </Row>
        )}
      </Card>
      )}

      {/* Gantt Chart - Only show when patterns are loaded */}
      {!workPatternsLoading && (
        <Card
          title="Scheduled Tasks (Priority Order)"
          style={{ position: 'relative' }}
          extra={
            <Space>
              <Button
                size="small"
                type="primary"
                icon={<IconRefresh />}
                onClick={() => {
                  logger.ui.info('Manual refresh triggered', {}, 'gantt-manual-refresh')
                  setRefreshKey(prev => prev + 1)
                  loadWorkPatterns()
                  setOptimalSchedule([])
                }}
              >
                Refresh
              </Button>
            </Space>
          }
        >
        {/* Pinch indicator */}
        {isPinching && (
          <div style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            color: 'white',
            padding: '12px 24px',
            borderRadius: 8,
            zIndex: 1000,
            fontSize: 18,
            fontWeight: 600,
            pointerEvents: 'none',
          }}>
            {Math.round((pixelsPerHour / 120) * 100)}%
          </div>
        )}
        {/* Floating zoom controls - absolute overlay */}
        <div style={{
          position: 'absolute',
          top: 10,
          right: 10,
          zIndex: 100,
          backgroundColor: 'white',
          padding: 8,
          borderRadius: 8,
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        }}>
          <Space>
            <Button.Group>
              <Tooltip content="Zoom Out (Ctrl/Cmd + -)">
                <Button
                  size="small"
                  icon={<IconZoomOut />}
                  onClick={handleZoomOut}
                  disabled={pixelsPerHour <= 15}
                />
              </Tooltip>
              <Tooltip content="Reset Zoom (Ctrl/Cmd + 0)">
                <Button size="small" onClick={handleZoomReset}>
                  {Math.round((pixelsPerHour / 120) * 100)}%
                </Button>
              </Tooltip>
              <Tooltip content="Zoom In (Ctrl/Cmd + +)">
                <Button
                  size="small"
                  icon={<IconZoomIn />}
                  onClick={handleZoomIn}
                  disabled={pixelsPerHour >= 300}
                />
              </Tooltip>
            </Button.Group>
            <Tooltip content="Jump to current time">
              <Button
                size="small"
                icon={<IconClockCircle />}
                onClick={handleSnapToNow}
                type="primary"
              />
            </Tooltip>
            <Dropdown
              droplist={
                <Menu onClickMenuItem={(key) => setPixelsPerHour(Number(key))}>
                  {ZOOM_PRESETS.map(preset => (
                    <Menu.Item key={String(preset.value)}>
                      <Space>
                        <span>{preset.label}</span>
                        {pixelsPerHour === preset.value && <span>✓</span>}
                      </Space>
                    </Menu.Item>
                  ))}
                </Menu>
              }
              trigger="click"
            >
              <Button size="small" icon={<IconExpand />} />
            </Dropdown>
          </Space>
        </div>
        <div
          ref={chartContainerRef}
          style={{ overflowX: 'auto', overflowY: 'hidden', position: 'relative' }}
        >
          <div style={{
            position: 'relative',
            minHeight: itemRowPositions.totalRows * rowHeight + 100,
            width: `${chartWidthPx}px`,
            minWidth: '100%',
          }}>
            {/* Time header */}
            <div style={{
              position: 'sticky',
              top: 0,
              background: '#fff',
              borderBottom: '2px solid #e5e5e5',
              zIndex: 10,
              height: 60,
            }}>
              {/* Date labels */}
              <div style={{ position: 'relative', height: 30, borderBottom: '1px solid #e5e5e5' }}>
                {dayBoundaries.map((day: any, index: number) => {
                  const nextDay = dayBoundaries[index + 1]
                  const widthPx = nextDay
                    ? getPositionPx(nextDay) - getPositionPx(day)
                    : chartWidthPx - getPositionPx(day)

                  const dateStr = dayjs(day).format('YYYY-MM-DD')
                  const pattern = workPatterns.find(p => p.date === dateStr)
                  const hasCustomPattern = pattern && !pattern.blocks.some((b: any) => b.id.startsWith('default-'))
                  const dayOfWeek = day.getDay()
                  // Check if weekend days have work hours configured
                  const hasWeekendWork = workSettings?.customWorkHours?.[dayOfWeek] !== undefined
                  const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6) && !hasWeekendWork

                  return (
                    <div
                      key={day.getTime()}
                      style={{
                        position: 'absolute',
                        left: `${getPositionPx(day)}px`,
                        width: `${widthPx}px`,
                        padding: '4px 8px',
                        fontWeight: 500,
                        borderRight: '1px solid #e5e5e5',
                        background: isWeekend ? '#f5f5f5' : hasCustomPattern ? '#e6f7ff' : '#fff',
                        cursor: 'pointer',
                      }}
                      onClick={() => {
                        setSelectedDate(dateStr)
                        setShowSettings(true)
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span>{formatDate(day)}</span>
                        {hasCustomPattern && (
                          <Tag size="small" color="blue" style={{ marginLeft: 4 }}>
                            Custom
                          </Tag>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Time labels */}
              <div style={{
                position: 'relative',
                height: 30,
                background: '#f8f8f8',
                borderTop: '1px solid #e5e5e5',
                overflow: 'visible',
              }}>
                <div style={{ position: 'absolute', left: 10, top: 5, fontSize: 10, color: '#999' }}>
                  {timeMarkers.length} time markers, showing every {pixelsPerHour >= 60 ? 1 : 2} hours
                </div>
                {timeMarkers
                  .filter(time => {
                    // Show every hour when zoomed in, every 2 hours when zoomed out
                    const hourInterval = pixelsPerHour >= 60 ? 1 : 2
                    return time.getHours() % hourInterval === 0 && time.getMinutes() === 0
                  })
                  .map((time) => {
                    const position = getPositionPx(time)
                    return (
                      <div
                        key={time.getTime()}
                        style={{
                          position: 'absolute',
                          left: `${position}px`,
                          top: '50%',
                          transform: 'translate(-50%, -50%)',
                          fontSize: 11,
                          color: '#666',
                          fontWeight: 'normal',
                          padding: '2px 6px',
                          whiteSpace: 'nowrap',
                          background: 'white',
                          border: '1px solid #ddd',
                          borderRadius: 2,
                        }}
                      >
                        {formatTime(time)}
                      </div>
                    )
                  })
                }
              </div>
            </div>

            {/* Chart body */}
            <div
              style={{ position: 'relative', paddingTop: 10 }}
              onDragOver={(e) => {
                if (!draggedItem) return
                e.preventDefault()
                e.dataTransfer.dropEffect = 'move'

                // Calculate drop position
                const rect = e.currentTarget.getBoundingClientRect()
                const relativeX = e.clientX - rect.left - dragOffset.x
                const relativeY = e.clientY - rect.top - dragOffset.y

                // Convert X position to time
                const dropTime = new Date(chartStartTime.getTime() + (relativeX / pixelsPerHour) * 3600000)

                // Convert Y position to row
                const dropRow = Math.floor(relativeY / rowHeight)

                setDropTarget({ time: dropTime, row: dropRow })
              }}
              onDragLeave={(e) => {
                // Only clear if leaving the entire chart area
                if (!e.currentTarget.contains(e.relatedTarget as Element)) {
                  setDropTarget(null)
                }
              }}
              onDrop={async (e) => {
                e.preventDefault()

                if (!draggedItem || !dropTarget) return

                const { Message } = await import('../common/Message')

                try {
                  // Extract the task/workflow ID from the dragged item
                  const itemId = draggedItem.originalItem?.id || draggedItem.id

                  // Set a hard deadline at the dropped time
                  // Add the item's duration to get the deadline time
                  const deadlineTime = new Date(dropTarget.time)
                  const durationMinutes = draggedItem.duration || 60
                  deadlineTime.setMinutes(deadlineTime.getMinutes() + durationMinutes)

                  // Update the task or workflow with the new deadline
                  if (draggedItem.type === 'task') {
                    await updateTask(itemId, {
                      deadline: deadlineTime,
                    })
                    Message.success(`Task deadline set to ${dayjs(deadlineTime).format('MMM D, h:mm A')}`)
                  } else if (draggedItem.type === 'workflow' || draggedItem.type === 'workflow-step' || draggedItem.workflowId) {
                    // For workflow steps, update the parent workflow
                    const workflowId = draggedItem.workflowId || itemId
                    await updateSequencedTask(workflowId, {
                      deadline: deadlineTime,
                    })
                    Message.success(`Workflow deadline set to ${dayjs(deadlineTime).format('MMM D, h:mm A')}`)
                  }

                  // Trigger a reschedule to respect the new deadline
                  // TODO: Replace with UnifiedScheduler refresh trigger
                  // await generateSchedule() - removed legacy method
                  setRefreshKey(prev => prev + 1) // Force refresh to respect new deadline
                  Message.info('Schedule updated to respect the new deadline')
                } catch (error) {
                  logger.ui.info('Failed to set deadline', {    y: e.clientY - rect.top,
                      })

                      setDraggedItem(item)
                      e.dataTransfer.effectAllowed = 'move'

                      // Store item data for drop handling
                      e.dataTransfer.setData('text/plain', JSON.stringify({
                        id: item.id,
                        duration: item.duration,
                        type: item.type,
                      }))
                    }}
                    onDragEnd={() => {
                      setDraggedItem(null)
                      setDropTarget(null)
                    }}
                  >
                    <Tooltip
                      content={(() => {
                        const lines = [`${item.name}`]

                        if (!item.isWaitTime && !item.isBlocked) {
                          lines.push(`Priority: ${getPriorityLabel(item.priority)} (${item.priority})`)
                          lines.push(`Type: ${item.type === 'task' ? 'Task' : 'Workflow Step'}`)
                        }

                        lines.push(`Duration: ${item.duration < 60 ? `${item.duration} minutes` : `${(item.duration / 60).toFixed(1)} hours`}`)
                        lines.push(`Start: ${formatDate(item.startTime)} ${formatTime(item.startTime)}`)
                        lines.push(`End: ${formatDate(item.endTime)} ${formatTime(item.endTime)}`)

                        if (item.workflowName) {
                          lines.push(`Workflow: ${item.workflowName}`)
                        }

                        if (item.deadline) {
                          const deadlineStr = dayjs(item.deadline).format('MMM D, YYYY h:mm A')
                          const isOverdue = dayjs(item.deadline).isBefore(dayjs())
                          const isUrgent = dayjs(item.deadline).isBefore(dayjs().add(1, 'day'))
                          lines.push(`Deadline: ${deadlineStr} ${isOverdue ? '(OVERDUE!)' : isUrgent ? '(DUE SOON!)' : ''}`)
                        }

                        if (item.isWaitTime) {
                          lines.push('Status: Waiting for async operation')
                        }

                        if (item.isBlocked) {
                          lines.push('Status: Blocked time')
                        }

                        return lines.join('\n')
                      })()}
                      position="top"
                      trigger="hover"
                    >
                      <div
                        style={{
                          height: '100%',
                          background: isSleep
                            ? 'linear-gradient(135deg, #1a1a2e 0%, #0f0f1e 100%)'
                            : isBlocked
                            ? `repeating-linear-gradient(45deg, ${item.color}, ${item.color} 10px, ${item.color}88 10px, ${item.color}88 20px)`
                            : isWaitTime
                            ? `repeating-linear-gradient(45deg, ${item.color}44, ${item.color}44 5px, transparent 5px, transparent 10px)`
                            : item.color,
                          opacity: isBlocked ? 0.7 : isWaitTime ? 0.5 : (isHovered ? 1 : 0.85),
                          borderRadius: 4,
                          border: isDeadlineViolated ? '3px solid #ff4d4f' : `1px solid ${item.color}`,
                          borderStyle: isBlocked ? 'solid' : isWaitTime ? 'dashed' : 'solid',
                          display: 'flex',
                          alignItems: 'center',
                          padding: '0 8px',
                          cursor: 'pointer',
                          transition: 'all 0.2s',
                          position: 'relative',
                          overflow: 'hidden',
                          transform: isHovered ? 'scaleY(1.1)' : 'scaleY(1)',
                          zIndex: isHovered ? 10 : 2,
                          boxShadow: isHovered ? '0 2px 8px rgba(0,0,0,0.15)' : 'none',
                        }}
                      >
                        {/* Deadline Violation Badge */}
                        {effectiveDeadline && !isWaitTime && isDeadlineViolated && (
                          <DeadlineViolationBadge
                            deadline={effectiveDeadline}
                            endTime={item.endTime}
                            isWorkflow={!!item.workflowId}
                            workflowName={item.workflowName}
                          />
                        )}

                        {/* Priority indicator */}
                        {!isWaitTime && (
                          <div
                            style={{
                              position: 'absolute',
                              left: 0,
                              top: 0,
                              bottom: 0,
                              width: 4,
                              background: getPriorityColor(item.priority),
                            }}
                          />
                        )}

                        {/* Deadline indicator */}
                        {item.deadline && !isWaitTime && (
                          <div
                            style={{
                              position: 'absolute',
                              right: 4,
                              top: '50%',
                              transform: 'translateY(-50%)',
                              background: dayjs(item.deadline).isBefore(dayjs()) ? '#ff4d4f' :
                                         dayjs(item.deadline).isBefore(dayjs().add(1, 'day')) ? '#ff7d00' : '#3370ff',
                              color: '#fff',
                              padding: '2px 6px',
                              borderRadius: 3,
                              fontSize: 10,
                              fontWeight: 600,
                              whiteSpace: 'nowrap',
                              display: widthPx > 80 ? 'block' : 'none',
                            }}
                          >
                            📅 {dayjs(item.deadline).format('MMM D')}
                          </div>
                        )}

                        {/* Sleep icon for sleep blocks */}
                        {isSleep && widthPx > 20 && (
                          <IconMoon style={{ color: '#fff', marginRight: 4, fontSize: 16 }} />
                        )}

                        {/* Task name */}
                        {widthPx > 30 && (
                          <Text
                            style={{
                              color: '#fff',
                              fontSize: pixelsPerHour < 60 ? 11 : 13,
                              fontWeight: isWaitTime ? 400 : 500,
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              paddingLeft: isWaitTime ? 0 : 8,
                              display: 'block',
                            }}
                          >
                            {item.stepIndex !== undefined && !isWaitTime && (
                              <span style={{
                                marginRight: 4,
                                fontWeight: 'bold',
                                backgroundColor: 'rgba(255,255,255,0.2)',
                                padding: '0 3px',
                                borderRadius: 3,
                                fontSize: '0.9em',
                              }}>
                                {item.stepIndex + 1}
                              </span>
                            )}
                            {item.workflowId ? item.name.replace(/^\[.*?\]\s*/, '') : item.name}
                          </Text>
                        )}
                      </div>
                    </Tooltip>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Legend */}
        <div style={{ marginTop: 20, borderTop: '1px solid #e5e5e5', paddingTop: 16 }}>
          <Space direction="vertical" size="small">
            <Space>
              <Tag color="red">Critical Priority (64+)</Tag>
              <Tag color="orange">High Priority (49-63)</Tag>
              <Tag color="gold">Medium Priority (36-48)</Tag>
              <Tag color="green">Low Priority (&lt;36)</Tag>
            </Space>
            <Space>
              <Text type="secondary">
                <span style={{ marginRight: 16 }}>
                  <span style={{
                    display: 'inline-block',
                    width: 20,
                    height: 2,
                    backgroundColor: '#999',
                    verticalAlign: 'middle',
                    marginRight: 4,
                  }} />
                  Dependencies
                </span>
                <span style={{ marginRight: 16 }}>Dashed = Async waiting</span>
                <span style={{ marginRight: 16 }}>Striped = Blocked time</span>
                <span style={{ marginRight: 16 }}>
                  <IconMoon style={{ marginRight: 4 }} />
                  Sleep blocks
                </span>
                <span style={{
                  backgroundColor: 'rgba(255,255,255,0.2)',
                  padding: '0 4px',
                  borderRadius: 3,
                  marginRight: 4,
                  color: '#666',
                }}>1</span>
                Step number
              </Text>
            </Space>
          </Space>
        </div>
      </Card>
      )}

      {/* Work Schedule Modal */}
      <WorkScheduleModal
        visible={showSettings}
        date={selectedDate || dayjs().format('YYYY-MM-DD')}
        onClose={() => {
          setShowSettings(false)
          setSelectedDate(null)
        }}
        onSave={async () => {
          await loadWorkPatterns() // Reload patterns after saving
          setShowSettings(false)
          setSelectedDate(null)
        }}
      />

      {/* Multi-Day Schedule Editor */}
      <MultiDayScheduleEditor
        visible={showMultiDayEditor}
        onClose={() => setShowMultiDayEditor(false)}
        onSave={() => loadWorkPatterns()}
      />

      {/* Scheduling Debug Info */}
      {showDebugInfo && debugInfo && (
        <DebugInfoComponent debugInfo={{
          unscheduledItems: debugInfo.unscheduledItems.map(item => ({
            id: item.id || '',
            name: item.name,
            duration: item.duration,
            type: item.type,
            reason: item.reason,
            priorityBreakdown: item.priorityBreakdown,
          })),
          scheduledItems: debugInfo.scheduledItems.map(item => ({
            id: item.id || '',
            name: item.name,
            type: item.type,
            startTime: item.startTime || '',
            duration: item.duration,
            priority: item.priority,
            priorityBreakdown: item.priorityBreakdown,
          })),
          warnings: debugInfo.warnings,
          blockUtilization: debugInfo.blockUtilization,
          totalScheduled: debugInfo.totalScheduled,
          totalUnscheduled: debugInfo.totalUnscheduled,
          scheduleEfficiency: debugInfo.scheduleEfficiency,
        }} />
      )}
    </Space>
  )
}
