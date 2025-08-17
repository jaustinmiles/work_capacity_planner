import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { Card, Typography, Space, Tag, Grid, Empty, Tooltip, Button, Slider, DatePicker, Alert, Dropdown, Menu } from '@arco-design/web-react'
import { IconZoomIn, IconZoomOut, IconSettings, IconCalendar, IconMoon, IconInfoCircle, IconExpand } from '@arco-design/web-react/icon'
import { Task } from '@shared/types'
import { SequencedTask } from '@shared/sequencing-types'
import { DailyWorkPattern } from '@shared/work-blocks-types'
import { scheduleItemsWithBlocks, scheduleItemsWithBlocksAndDebug, SchedulingDebugInfo } from '../../utils/flexible-scheduler'
import { SchedulingDebugInfo as DebugInfoComponent } from './SchedulingDebugInfo'
import { WorkScheduleModal } from '../settings/WorkScheduleModal'
import { MultiDayScheduleEditor } from '../settings/MultiDayScheduleEditor'
import { getDatabase } from '../../services/database'
import { useTaskStore } from '../../store/useTaskStore'
import dayjs from 'dayjs'

const { Title, Text } = Typography
const { Row, Col } = Grid

interface GanttChartProps {
  tasks: Task[]
  sequencedTasks: SequencedTask[]
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
  const [pixelsPerHour, setPixelsPerHour] = useState(120) // pixels per hour for scaling
  const [hoveredItem, setHoveredItem] = useState<string | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [showMultiDayEditor, setShowMultiDayEditor] = useState(false)
  const [workPatterns, setWorkPatterns] = useState<DailyWorkPattern[]>([])
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [debugInfo, setDebugInfo] = useState<SchedulingDebugInfo | null>(null)
  const [showDebugInfo, setShowDebugInfo] = useState(false)
  const [isPinching, setIsPinching] = useState(false)
  const [draggedItem, setDraggedItem] = useState<any>(null)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const [dropTarget, setDropTarget] = useState<{ time: Date, row: number } | null>(null)

  const { workSettings } = useTaskStore()

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

  // Load work patterns for the next 30 days
  useEffect(() => {
    loadWorkPatterns()
  }, [])

  const loadWorkPatterns = async () => {
    const db = getDatabase()
    const patterns: DailyWorkPattern[] = []
    const today = dayjs().startOf('day')

    // Load patterns for the next 30 days
    for (let i = 0; i < 30; i++) {
      const date = today.add(i, 'day')
      const dateStr = date.format('YYYY-MM-DD')
      const dayOfWeek = date.day()

      const pattern = await db.getWorkPattern(dateStr)
      if (pattern) {
        patterns.push({
          date: dateStr,
          blocks: pattern.blocks,
          meetings: pattern.meetings,
          accumulated: { focusMinutes: 0, adminMinutes: 0 },
        })
      } else if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        // If no pattern exists and it's a weekday, create a default pattern
        // This allows scheduling on future days even without explicit patterns
        patterns.push({
          date: dateStr,
          blocks: [
            {
              id: `default-morning-${dateStr}`,
              startTime: '09:00',
              endTime: '12:00',
              type: 'mixed',
              capacity: { focusMinutes: 120, adminMinutes: 60 },
            },
            {
              id: `default-afternoon-${dateStr}`,
              startTime: '13:00',
              endTime: '17:00',
              type: 'mixed',
              capacity: { focusMinutes: 180, adminMinutes: 60 },
            },
          ],
          meetings: [],
          accumulated: { focusMinutes: 0, adminMinutes: 0 },
        })
      }

    }

    setWorkPatterns(patterns)
  }

  // Use the scheduler to get properly ordered items
  const scheduledItems = useMemo(() => {
    if (workPatterns.length === 0) return []

    // IMPORTANT: Filter out workflows from tasks to avoid duplicates
    // Workflows (tasks with hasSteps=true) are already in sequencedTasks
    const simpleTasksOnly = tasks.filter(t => !t.hasSteps)

    console.log(`GanttChart: Scheduling with ${simpleTasksOnly.length} simple tasks and ${sequencedTasks.length} workflows`)

    // Pass current time as start date to ensure scheduling starts from now
    const result = scheduleItemsWithBlocksAndDebug(simpleTasksOnly, sequencedTasks, workPatterns, new Date())
    setDebugInfo(result.debugInfo)
    // Auto-show debug info if there are issues
    if (result.debugInfo.unscheduledItems.length > 0 || result.debugInfo.warnings.length > 0) {
      setShowDebugInfo(true)
    }
    return result.scheduledItems
  }, [tasks, sequencedTasks, workPatterns])

  // Calculate chart dimensions
  const now = new Date()
  const chartStartTime = scheduledItems.length > 0
    ? new Date(Math.min(scheduledItems[0].startTime.getTime(), now.getTime()))
    : now
  const chartEndTime = scheduledItems.length > 0
    ? new Date(Math.max(...scheduledItems.map((item: any) => item.endTime.getTime())))
    : new Date(now.getTime() + 8 * 60 * 60 * 1000) // Default to 8 hours from now

  const totalDuration = chartEndTime.getTime() - chartStartTime.getTime()
  const totalHours = totalDuration / (1000 * 60 * 60)
  const totalDays = Math.ceil(totalHours / 8) // Assuming 8-hour workdays

  // Calculate chart width based on pixelsPerHour
  const chartWidthPx = totalHours * pixelsPerHour
  const minBlockWidth = 60 // Minimum width for a block in pixels

  // Calculate time markers
  const timeMarkers = useMemo(() => {
    const markers: Date[] = []
    const markerTime = new Date(chartStartTime)
    markerTime.setMinutes(0, 0, 0)

    while (markerTime <= chartEndTime) {
      markers.push(new Date(markerTime))
      markerTime.setHours(markerTime.getHours() + 1)
    }
    return markers
  }, [chartStartTime, chartEndTime])

  // Calculate day boundaries for visual separation
  const dayBoundaries = useMemo(() => {
    const boundaries: Date[] = []
    const dayTime = new Date(chartStartTime)
    dayTime.setHours(0, 0, 0, 0)

    while (dayTime <= chartEndTime) {
      boundaries.push(new Date(dayTime))
      dayTime.setDate(dayTime.getDate() + 1)
    }
    return boundaries
  }, [chartStartTime, chartEndTime])

  const getPositionPx = (date: Date) => {
    const offsetHours = (date.getTime() - chartStartTime.getTime()) / (1000 * 60 * 60)
    return offsetHours * pixelsPerHour
  }

  const getDurationPx = (minutes: number) => {
    const hours = minutes / 60
    return Math.max(hours * pixelsPerHour, minBlockWidth)
  }

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  const formatDate = (date: Date) => {
    return date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
  }

  const getPriorityLabel = (priority: number) => {
    if (priority >= 64) return 'Critical'
    if (priority >= 49) return 'High'
    if (priority >= 36) return 'Medium'
    return 'Low'
  }

  const getPriorityColor = (priority: number) => {
    if (priority >= 64) return '#FF4D4F'
    if (priority >= 49) return '#FF7A45'
    if (priority >= 36) return '#FAAD14'
    return '#52C41A'
  }

  // Row height based on zoom
  const rowHeight = 40

  // Calculate row positions for items (group workflow steps together)
  const itemRowPositions = useMemo(() => {
    const positions = new Map<string, number>()
    let currentRow = 0
    const workflowRows = new Map<string, number>()
    const workflowProgress = new Map<string, { completed: number, total: number }>()

    // Separate items by type
    const blockedItems = scheduledItems.filter((item: any) => item.isBlocked)
    const taskItems = scheduledItems.filter((item: any) => !item.isBlocked && !item.isWaitTime)
    const waitItems = scheduledItems.filter((item: any) => item.isWaitTime)

    // First pass: calculate workflow progress
    scheduledItems.forEach((item: any) => {
      if (item.workflowId && item.type === 'workflow-step' && !item.isWaitTime) {
        if (!workflowProgress.has(item.workflowId)) {
          workflowProgress.set(item.workflowId, { completed: 0, total: 0 })
        }
        const progress = workflowProgress.get(item.workflowId)!
        progress.total++
        if (item.originalItem && 'status' in item.originalItem && item.originalItem.status === 'completed') {
          progress.completed++
        }
      }
    })

    // Second pass: assign positions to blocked items first (meetings, breaks, etc.)
    // Put all blocked items on the same row (row 0) since they don't overlap with tasks
    if (blockedItems.length > 0) {
      blockedItems.forEach((item: any) => {
        positions.set(item.id, currentRow)
      })
      currentRow++
    }

    // Third pass: assign positions to tasks and workflows
    taskItems.forEach((item: any) => {
      if (item.workflowId) {
        // This is a workflow step
        if (!workflowRows.has(item.workflowId)) {
          workflowRows.set(item.workflowId, currentRow)
          currentRow++
        }
        positions.set(item.id, workflowRows.get(item.workflowId)!)
      } else {
        // This is a standalone task
        positions.set(item.id, currentRow)
        currentRow++
      }
    })

    // Fourth pass: assign wait times to same row as their parent
    waitItems.forEach((item: any) => {
      const parentId = item.id.replace('-wait', '')
      positions.set(item.id, positions.get(parentId) || currentRow)
    })

    return { positions, totalRows: currentRow, workflowProgress }
  }, [scheduledItems])

  // Early return for empty state - AFTER all hooks
  if (scheduledItems.length === 0) {
    return (
      <Card>
        <Empty
          description={
            <Space direction="vertical" align="center">
              <Text>No scheduled items to display</Text>
              {workPatterns.length === 0 ? (
                <>
                  <Text type="secondary">You need to set up your work schedule first</Text>
                  <Button
                    type="primary"
                    icon={<IconSettings />}
                    onClick={() => {
                      setSelectedDate(dayjs().format('YYYY-MM-DD'))
                      setShowSettings(true)
                    }}
                  >
                    Create Work Schedule
                  </Button>
                </>
              ) : (
                <Text type="secondary">Add some tasks or workflows to see them scheduled</Text>
              )}
            </Space>
          }
        />
        {/* Work Schedule Modal */}
        <WorkScheduleModal
          visible={showSettings}
          date={selectedDate || dayjs().format('YYYY-MM-DD')}
          onClose={() => {
            setShowSettings(false)
            setSelectedDate(null)
          }}
          onSave={async () => {
            await loadWorkPatterns()
            setShowSettings(false)
            setSelectedDate(null)
          }}
        />
      </Card>
    )
  }

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="large">
      {/* Info about default patterns */}
      {workPatterns.some(p => p.blocks.some((b: any) => b.id.startsWith('default-'))) && (
        <Alert
          type="info"
          content={
            <Space>
              <Text>
                Using default work schedule (9AM-12PM, 1PM-5PM) for future weekdays without custom patterns.
              </Text>
              <Button
                type="text"
                size="small"
                onClick={() => {
                  setSelectedDate(dayjs().add(1, 'day').format('YYYY-MM-DD'))
                  setShowSettings(true)
                }}
              >
                Customize Tomorrow's Schedule
              </Button>
            </Space>
          }
          closable
        />
      )}

      {/* Summary */}
      <Card>
        <Row gutter={16} align="center">
          <Col span={4}>
            <Space direction="vertical">
              <Text type="secondary">Total Items</Text>
              <Title heading={4}>{scheduledItems.filter((item: any) => !item.isWaitTime).length}</Title>
            </Space>
          </Col>
          <Col span={5}>
            <Space direction="vertical">
              <Text type="secondary">Completion</Text>
              <Title heading={4}>{formatDate(chartEndTime)}</Title>
              <Text type="secondary">{formatTime(chartEndTime)}</Text>
            </Space>
          </Col>
          <Col span={4}>
            <Space direction="vertical">
              <Text type="secondary">Work Days</Text>
              <Title heading={4}>{totalDays} days</Title>
            </Space>
          </Col>
          <Col span={4}>
            <Space direction="vertical">
              <Text type="secondary">Workflows</Text>
              <Title heading={4}>{sequencedTasks.filter(w => w.overallStatus !== 'completed').length}</Title>
            </Space>
          </Col>
          <Col span={7}>
            <Space direction="vertical" style={{ width: '100%' }}>
              <Text type="secondary">Zoom Controls</Text>
              <Space direction="vertical" size="small" style={{ width: '100%' }}>
                {/* Zoom buttons and slider */}
                <Space style={{ width: '100%' }}>
                  <Button.Group>
                    <Button
                      icon={<IconZoomOut />}
                      onClick={handleZoomOut}
                      disabled={pixelsPerHour <= 15}
                    />
                    <Button
                      onClick={handleZoomReset}
                    >
                      Reset
                    </Button>
                    <Button
                      icon={<IconZoomIn />}
                      onClick={handleZoomIn}
                      disabled={pixelsPerHour >= 300}
                    />
                  </Button.Group>
                  <Dropdown
                    droplist={
                      <Menu onClickMenuItem={(key) => setPixelsPerHour(Number(key))}>
                        {ZOOM_PRESETS.map(preset => (
                          <Menu.Item
                            key={String(preset.value)}
                            style={{
                              backgroundColor: pixelsPerHour === preset.value ? '#e6f7ff' : undefined,
                            }}
                          >
                            <Space>
                              <span style={{ fontWeight: pixelsPerHour === preset.value ? 600 : 400 }}>
                                {preset.label}
                              </span>
                              <Text type="secondary" style={{ fontSize: 12 }}>
                                {preset.description}
                              </Text>
                            </Space>
                          </Menu.Item>
                        ))}
                      </Menu>
                    }
                    trigger="click"
                  >
                    <Button icon={<IconExpand />}>
                      Presets
                    </Button>
                  </Dropdown>
                </Space>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Slider
                    min={15}
                    max={300}
                    step={15}
                    value={pixelsPerHour}
                    onChange={(value) => setPixelsPerHour(value as number)}
                    style={{ flex: 1 }}
                    marks={{
                      15: '15',
                      30: '1w',
                      60: '1d',
                      120: '½d',
                      180: 'Detail',
                      240: '1h',
                      300: 'Max',
                    }}
                  />
                </div>
                <Text type="secondary" style={{ fontSize: 11 }}>
                  Tip: Use Ctrl/Cmd + (+/-/0) for zoom
                </Text>
                <Space direction="vertical" style={{ width: '100%' }}>
                  <DatePicker
                    value={selectedDate ? dayjs(selectedDate) : undefined}
                    onChange={(dateString, date) => {
                      if (dateString) {
                        setSelectedDate(dateString)
                        setShowSettings(true)
                      }
                    }}
                    placeholder="Select day to edit"
                    style={{ width: '100%' }}
                    disabledDate={(current) => {
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
                    Edit Today's Schedule
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
            </Space>
          </Col>
        </Row>
      </Card>

      {/* Gantt Chart */}
      <Card title="Scheduled Tasks (Priority Order)">
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
        {/* Floating zoom controls */}
        <div style={{
          position: 'sticky',
          top: 10,
          right: 10,
          float: 'right',
          zIndex: 100,
          backgroundColor: 'white',
          padding: 8,
          borderRadius: 8,
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          marginBottom: -40,
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
              <div style={{ position: 'relative', height: 30 }}>
                {timeMarkers
                  .filter(time => time.getHours() % 2 === 0 && time.getMinutes() === 0)
                  .map((time) => (
                    <div
                      key={time.getTime()}
                      style={{
                        position: 'absolute',
                        left: `${getPositionPx(time)}px`,
                        transform: 'translateX(-50%)',
                        fontSize: 11,
                        color: '#666',
                        padding: '4px',
                      }}
                    >
                      {formatTime(time)}
                    </div>
                  ))
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
                if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                  setDropTarget(null)
                }
              }}
              onDrop={async (e) => {
                e.preventDefault()
                
                if (!draggedItem || !dropTarget) return
                
                // TODO: Implement actual rescheduling logic here
                // For now, just show where the item would be dropped
                console.log('Drop item:', draggedItem.name, 'at time:', dropTarget.time, 'row:', dropTarget.row)
                
                // You would need to:
                // 1. Update the task's scheduled time in the database
                // 2. Recalculate the schedule
                // 3. Refresh the display
                
                setDraggedItem(null)
                setDropTarget(null)
                
                // Show message for now
                const { Message } = await import('../common/Message')
                Message.info(`Would reschedule "${draggedItem.name}" to ${dayjs(dropTarget.time).format('MMM D h:mm A')}`)
              }}
            >
              {/* Row labels and backgrounds */}
              <div style={{
                position: 'absolute',
                left: 0,
                top: 0,
                width: '100%',
                zIndex: 0,
              }}>
                {Array.from({ length: itemRowPositions.totalRows }).map((_, rowIndex) => {
                  // Find what's in this row
                  const rowItems = scheduledItems.filter(item =>
                    itemRowPositions.positions.get(item.id) === rowIndex,
                  )
                  const firstItem = rowItems[0]
                  const isWorkflowRow = firstItem?.workflowId
                  const isBlockedRow = rowIndex === 0 && rowItems.some(item => item.isBlocked)
                  const rowLabel = isBlockedRow
                    ? 'Meetings & Blocked Time'
                    : isWorkflowRow
                    ? firstItem.workflowName
                    : firstItem?.name.replace(/\[.*\]\s*/, '')

                  return (
                    <div
                      key={rowIndex}
                      style={{
                        position: 'absolute',
                        top: rowIndex * rowHeight,
                        height: rowHeight,
                        width: '100%',
                        background: rowIndex % 2 === 0 ? 'transparent' : '#fafafa',
                        borderBottom: isWorkflowRow ? '2px solid #e5e5e5' : '1px solid #f0f0f0',
                      }}
                    >
                      {rowLabel && (
                        <div
                          style={{
                            position: 'sticky',
                            left: 0,
                            background: isBlockedRow ? '#fff0f0' : isWorkflowRow ? '#f0f0ff' : '#f5f5f5',
                            padding: '8px 12px',
                            fontSize: 12,
                            fontWeight: isBlockedRow || isWorkflowRow ? 600 : 400,
                            color: isBlockedRow ? '#ff4d4f' : isWorkflowRow ? '#5865f2' : '#666',
                            borderRight: '1px solid #e5e5e5',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            maxWidth: 200,
                            height: '100%',
                            display: 'flex',
                            alignItems: 'center',
                          }}
                        >
                          {isBlockedRow && (
                            <>
                              <span style={{ marginRight: 6 }}>📅</span>
                              <span style={{ flex: 1 }}>{rowLabel}</span>
                              <span style={{
                                marginLeft: 8,
                                fontSize: 11,
                                color: '#999',
                                backgroundColor: 'rgba(0,0,0,0.05)',
                                padding: '2px 6px',
                                borderRadius: 10,
                              }}>
                                {rowItems.length} items
                              </span>
                            </>
                          )}
                          {!isBlockedRow && isWorkflowRow && (
                            <>
                              <span style={{ marginRight: 6 }}>🔄</span>
                              <span style={{ flex: 1 }}>{rowLabel}</span>
                              {firstItem.workflowId && itemRowPositions.workflowProgress.has(firstItem.workflowId) && (
                                <span style={{
                                  marginLeft: 8,
                                  fontSize: 11,
                                  color: '#999',
                                  backgroundColor: 'rgba(0,0,0,0.05)',
                                  padding: '2px 6px',
                                  borderRadius: 10,
                                }}>
                                  {itemRowPositions.workflowProgress.get(firstItem.workflowId!)!.completed}/
                                  {itemRowPositions.workflowProgress.get(firstItem.workflowId!)!.total}
                                </span>
                              )}
                            </>
                          )}
                          {!isBlockedRow && !isWorkflowRow && rowLabel}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
              {/* Drop target indicator */}
              {dropTarget && draggedItem && (
                <div
                  style={{
                    position: 'absolute',
                    left: `${getPositionPx(dropTarget.time)}px`,
                    top: dropTarget.row * rowHeight + 5,
                    width: `${getDurationPx(draggedItem.duration)}px`,
                    height: rowHeight - 10,
                    background: 'rgba(51, 112, 255, 0.2)',
                    border: '2px dashed #3370ff',
                    borderRadius: 4,
                    pointerEvents: 'none',
                    zIndex: 100,
                  }}
                >
                  <div
                    style={{
                      padding: '4px 8px',
                      fontSize: 11,
                      color: '#3370ff',
                      fontWeight: 600,
                    }}
                  >
                    Drop here: {dayjs(dropTarget.time).format('h:mm A')}
                  </div>
                </div>
              )}
              
              {/* Grid lines */}
              {timeMarkers
                .filter(time => time.getHours() % 2 === 0)
                .map((time) => (
                  <div
                    key={time.getTime()}
                    style={{
                      position: 'absolute',
                      left: `${getPositionPx(time)}px`,
                      top: 0,
                      bottom: 0,
                      width: 1,
                      background: '#f0f0f0',
                      zIndex: 0,
                    }}
                  />
                ))
              }

              {/* Day separators */}
              {dayBoundaries.slice(1).map((day) => (
                <div
                  key={`sep-${day.getTime()}`}
                  style={{
                    position: 'absolute',
                    left: `${getPositionPx(day)}px`,
                    top: 0,
                    bottom: 0,
                    width: 2,
                    background: '#e0e0e0',
                    zIndex: 1,
                  }}
                />
              ))}

              {/* Current time indicator */}
              {new Date() >= chartStartTime && new Date() <= chartEndTime && (
                <div
                  style={{
                    position: 'absolute',
                    left: `${getPositionPx(new Date())}px`,
                    top: 0,
                    bottom: 0,
                    width: 2,
                    background: '#ff4d4f',
                    zIndex: 5,
                  }}
                >
                  <div
                    style={{
                      position: 'absolute',
                      top: -10,
                      left: '50%',
                      transform: 'translateX(-50%)',
                      background: '#ff4d4f',
                      color: 'white',
                      padding: '2px 8px',
                      borderRadius: 4,
                      fontSize: 12,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    Now
                  </div>
                </div>
              )}

              {/* Dependency arrows - render before bars so they appear behind */}
              <svg
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  pointerEvents: 'none',
                  zIndex: 1,
                }}
              >
                {scheduledItems.map((item) => {
                  if (!item.originalItem || !('dependsOn' in item.originalItem) || !item.originalItem.dependsOn) {
                    return null
                  }

                  const dependencies = item.originalItem.dependsOn as string[]

                  return dependencies.map((depId) => {
                    // Find the dependent item
                    const dependentItem = scheduledItems.find(si =>
                      si.originalItem && 'id' in si.originalItem && si.originalItem.id === depId,
                    )

                    if (!dependentItem || !itemRowPositions.positions.has(dependentItem.id) || !itemRowPositions.positions.has(item.id)) {
                      return null
                    }

                    const fromX = getPositionPx(dependentItem.endTime)
                    const fromY = (itemRowPositions.positions.get(dependentItem.id) || 0) * rowHeight + rowHeight / 2
                    const toX = getPositionPx(item.startTime)
                    const toY = (itemRowPositions.positions.get(item.id) || 0) * rowHeight + rowHeight / 2

                    // Calculate control points for a nice curve
                    const midX = (fromX + toX) / 2
                    const ctrlX1 = midX
                    const ctrlX2 = midX

                    return (
                      <g key={`${dependentItem.id}-${item.id}`}>
                        {/* Arrow path */}
                        <path
                          d={`M ${fromX} ${fromY} C ${ctrlX1} ${fromY}, ${ctrlX2} ${toY}, ${toX} ${toY}`}
                          stroke={item.color}
                          strokeWidth="2"
                          fill="none"
                          strokeDasharray={item.isWaitTime ? '5,5' : 'none'}
                          opacity={0.6}
                        />
                        {/* Arrow head */}
                        {!item.isWaitTime && (
                          <polygon
                            points={`${toX},${toY} ${toX - 8},${toY - 4} ${toX - 8},${toY + 4}`}
                            fill={item.color}
                            opacity={0.8}
                          />
                        )}
                      </g>
                    )
                  })
                })}
              </svg>

              {/* Gantt bars */}
              {scheduledItems.map((item, index) => {
                const leftPx = getPositionPx(item.startTime)
                const widthPx = getDurationPx(item.duration)
                const isWaitTime = item.isWaitTime
                const isBlocked = item.isBlocked
                const isSleep = item.type === 'blocked-time' && item.originalItem &&
                  'name' in item.originalItem && item.originalItem.name === 'Sleep'
                const isHovered = hoveredItem === item.id ||
                  (item.workflowId && hoveredItem?.startsWith(item.workflowId))

                // Calculate proper position for all items including blocked ones
                const topPosition = (itemRowPositions.positions.get(item.id) || 0) * rowHeight + 5

                return (
                  <div
                    key={`${item.id}-${index}`}
                    draggable={!isWaitTime && !isBlocked}
                    style={{
                      position: 'absolute',
                      top: topPosition,
                      height: rowHeight - 10,
                      left: `${leftPx}px`,
                      width: `${widthPx}px`,
                      cursor: (!isWaitTime && !isBlocked) ? 'move' : 'pointer',
                      opacity: draggedItem?.id === item.id ? 0.5 : 1,
                    }}
                    onMouseEnter={() => setHoveredItem(item.id)}
                    onMouseLeave={() => setHoveredItem(null)}
                    onDragStart={(e) => {
                      if (isWaitTime || isBlocked) return
                      
                      // Calculate offset from mouse to item start
                      const rect = e.currentTarget.getBoundingClientRect()
                      setDragOffset({
                        x: e.clientX - rect.left,
                        y: e.clientY - rect.top,
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
                          border: `1px solid ${item.color}`,
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
        <DebugInfoComponent debugInfo={debugInfo} />
      )}
    </Space>
  )
}
