import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { Card, Typography, Space, Tag, Grid, Empty, Tooltip, Button, DatePicker, Alert, Dropdown, Menu, Spin } from '@arco-design/web-react'
import { IconZoomIn, IconZoomOut, IconSettings, IconCalendar, IconMoon, IconInfoCircle, IconExpand, IconRefresh, IconClockCircle, IconUp, IconDown } from '@arco-design/web-react/icon'
import { Task } from '@shared/types'
import { SequencedTask } from '@shared/sequencing-types'
import { TaskType } from '@shared/enums'
import { DailyWorkPattern, WorkMeeting } from '@shared/work-blocks-types'
// Updated to use UnifiedScheduler via useUnifiedScheduler hook
import { useUnifiedScheduler, ScheduleResult } from '../../hooks/useUnifiedScheduler'
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
  deadline?: Date | undefined
  originalItem: Task | SequencedTask | WorkMeeting
  blockId?: string | undefined
  isBlocked?: boolean | undefined
  isWaitTime?: boolean | undefined
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
  const scheduler = useUnifiedScheduler()
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
      logger.system.info('Time override changed, reloading patterns', {}, 'time-override-change')
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
    logger.ui.debug('Converting UnifiedScheduler results to Gantt format', {
      scheduledCount: result.scheduled.length,
      unscheduledCount: result.unscheduled.length,
    }, 'gantt-convert-results')

    // Filter out meetings, breaks, and blocked time - they're handled separately by getMeetingScheduledItems
    return result.scheduled
      .filter(item => item.type !== 'meeting' && item.type !== 'break' && item.type !== 'blocked-time')
      .map((item) => {
        // Get task color based on type
        const getTaskColor = (taskType: TaskType): string => {
          switch (taskType) {
            case TaskType.Focused: return '#3b82f6'
            case TaskType.Admin: return '#f59e0b'
            case TaskType.Personal: return '#10b981'
            default: return '#6b7280'
          }
        }

        // UnifiedScheduleItem has properties directly, not nested in 'task'
        const hasWorkflowMetadata = item.workflowId !== undefined
        const itemType = item.type === 'workflow-step' ? 'workflow-step' : 'task'

        const ganttItem: GanttItem = {
          id: item.id,
          name: item.name,
          type: itemType,
          priority: item.priority || 0,
          duration: item.duration,
          startTime: item.startTime || new Date(),
          endTime: item.endTime || new Date(),
          color: getTaskColor(item.taskType || TaskType.Focused),
          deadline: item.deadline,
          originalItem: (item.originalItem || item) as Task | SequencedTask | WorkMeeting,
          blockId: item.blockId,
          // Add workflow metadata if present
          ...(hasWorkflowMetadata && {
            workflowId: item.workflowId,
            workflowName: item.workflowName,
            stepIndex: item.stepIndex,
            isWorkflowStep: true,
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
    logger.ui.info('Computing schedule', {
      workPatternsLoading,
      workPatternsCount: workPatterns.length,
      tasksCount: tasks.length,
      sequencedTasksCount: sequencedTasks.length,
      refreshKey,
      currentTime: getCurrentTime().toISOString(),
    }, 'gantt-compute-schedule')

    // Don't try to schedule if patterns are still loading
    if (workPatternsLoading) {
      logger.ui.info('Patterns still loading, waiting', {}, 'gantt-patterns-loading')
      return []
    }

    if (workPatterns.length === 0) {
      logger.ui.warn('No work patterns available after loading', {}, 'gantt-no-patterns')
      return []
    }

    // Log all tasks with their deadline status
    const tasksWithDeadlines = tasks.filter(task => task.deadline)
    const workflowsWithDeadlines = sequencedTasks.filter(workflow => workflow.deadline)

    logger.ui.info('Input data analysis', {
      totalTasks: tasks.length,
      tasksWithDeadlines: tasksWithDeadlines.length,
      totalWorkflows: sequencedTasks.length,
      workflowsWithDeadlines: workflowsWithDeadlines.length,
      deadlineTaskNames: tasksWithDeadlines.map(t => ({ name: t.name, deadline: t.deadline })),
      deadlineWorkflowNames: workflowsWithDeadlines.map(w => ({ name: w.name, deadline: w.deadline })),
    }, 'gantt-data-analysis')

    // Always use UnifiedScheduler for scheduling - no saved schedules

    // IMPORTANT: Pass all tasks to UnifiedScheduler - it will handle deduplication
    // The scheduler handles removing any tasks that are also in sequencedTasks
    logger.ui.info('Using UnifiedScheduler for calculation', {
      schedulerType: 'unified',
      tasksCount: tasks.length,
      sequencedTasksCount: sequencedTasks.length,
      currentTime: getCurrentTime().toISOString(),
    }, 'gantt-scheduler-start')

    // Call UnifiedScheduler directly
    const currentTime = getCurrentTime()
    const startDateString = currentTime.toISOString().split('T')[0] || ''

    const context = {
      startDate: startDateString,
      tasks,
      workflows: sequencedTasks,
      workPatterns,
      workSettings,
      currentTime,
    }

    const config = {
      startDate: currentTime,
      allowTaskSplitting: true,
      respectMeetings: true,
      optimizationMode: 'realistic' as const,
      debugMode: true,
    }

    const items = [...tasks, ...sequencedTasks]
    const unifiedScheduleResult = scheduler.scheduleForDisplay(items, context, config)

    // Convert UnifiedScheduler results to GanttChart format
    const ganttItems = convertUnifiedToGanttItems(unifiedScheduleResult)

    // Use real debug info from UnifiedScheduler if available
    // Debug info should always be defined (scheduler always generates it)
    // For now, handle cases where it might be undefined (e.g., hooks/adapters not updated yet)
    const debugInfo = unifiedScheduleResult.debugInfo
    if (debugInfo) {
      setDebugInfo(debugInfo)

      // Auto-show debug info if there are issues
      if (debugInfo.unscheduledItems.length > 0 || debugInfo.warnings.length > 0) {
        setShowDebugInfo(true)
      }

      // Log the Gantt chart data for AI debugging
      const _viewWindow = {
        start: ganttItems.length > 0 ? ganttItems[0].startTime : getCurrentTime(),
        end: ganttItems.length > 0 ?
          ganttItems[ganttItems.length - 1].endTime :
          new Date(getCurrentTime().getTime() + 7 * 24 * 60 * 60 * 1000), // 7 days ahead
      }
      // Convert GanttItems to ScheduledItem format for logging
      const _scheduledItems = ganttItems.map(item => ({
        task: item.originalItem as Task,
        startTime: item.startTime,
        endTime: item.endTime,
        blockId: item.blockId,
        priority: item.priority,
      }))
      // LOGGER_REMOVED: logGanttChart(logger.ui, scheduledItems, workPatterns, viewWindow, tasks, sequencedTasks, debugInfo)

      // Log final schedule results with deadline analysis
      const finalItemsWithDeadlines = ganttItems.filter(item => item.deadline)
      const violatedDeadlines = finalItemsWithDeadlines.filter(item =>
        dayjs(item.endTime).isAfter(dayjs(item.deadline)),
      )

      logger.ui.info('UnifiedScheduler calculation complete', {
        totalScheduledItems: ganttItems.length,
        itemsWithDeadlines: finalItemsWithDeadlines.length,
        violatedDeadlines: violatedDeadlines.length,
        unscheduledItems: debugInfo.unscheduledItems.length,
        warnings: debugInfo.warnings.length,
        violationDetails: violatedDeadlines.map(item => ({
          name: item.name,
          deadline: dayjs(item.deadline).format('YYYY-MM-DD HH:mm'),
          actualEnd: dayjs(item.endTime).format('YYYY-MM-DD HH:mm'),
          delayMinutes: dayjs(item.endTime).diff(dayjs(item.deadline), 'minutes'),
          isWorkflow: !!item.workflowId,
        })),
      }, 'gantt-schedule-complete')
    }

    // Add meeting items from work patterns
    const meetingItems = getMeetingScheduledItems(workPatterns)

    logger.ui.info('Merging UnifiedScheduler results with meetings', {
      taskItems: ganttItems.length,
      meetingItems: meetingItems.length,
      totalItems: ganttItems.length + meetingItems.length,
    }, 'gantt-merge-meetings')

    // Combine task items and meeting items
    const allItems = [...meetingItems, ...ganttItems]

    return allItems
  }, [tasks, sequencedTasks, workPatterns, workPatternsLoading, refreshKey, workSettings, scheduler, convertUnifiedToGanttItems, getMeetingScheduledItems])

  // Calculate chart dimensions
  const now = getCurrentTime()

  // Start at beginning of current day (or first scheduled item if earlier)
  const todayStart = new Date(now)
  todayStart.setHours(0, 0, 0, 0)

  const chartStartTime = scheduledItems.length > 0
    ? new Date(Math.min(scheduledItems[0].startTime.getTime(), todayStart.getTime()))
    : todayStart

  // Calculate end time based on work patterns AND scheduled items
  // Always show at least 7 days ahead or to the last work pattern
  const sevenDaysFromNow = new Date(now)
  sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7)

  // Find the last work pattern date
  const lastPatternDate = workPatterns.length > 0
    ? new Date(workPatterns[workPatterns.length - 1].date + 'T23:59:59')
    : sevenDaysFromNow

  // Use the latest of: last scheduled item, 7 days from now, or last work pattern
  const minimumEndTime = new Date(Math.max(sevenDaysFromNow.getTime(), lastPatternDate.getTime()))

  const chartEndTime = scheduledItems.length > 0
    ? new Date(Math.max(...scheduledItems.map((item: any) => item.endTime.getTime()), minimumEndTime.getTime()))
    : minimumEndTime

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

  // Snap to current time
  const handleSnapToNow = useCallback(() => {
    if (!chartContainerRef.current) return

    const now = getCurrentTime()
    const nowPosition = getPositionPx(now)
    const containerWidth = chartContainerRef.current.clientWidth

    // Center the current time in the viewport
    const scrollPosition = nowPosition - containerWidth / 2
    chartContainerRef.current.scrollLeft = Math.max(0, scrollPosition)
  }, [chartStartTime, pixelsPerHour])

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

  // Helper function to calculate remaining wait time for a wait block
  const calculateRemainingWaitTime = useCallback((waitItem: any): { remaining: number; total: number } | null => {
    // Extract parent step ID from wait item ID (format: "step-id-wait")
    const parentStepId = waitItem.id.replace('-wait', '')

    // Find the parent step in sequenced tasks
    const parentStep = sequencedTasks.flatMap(t => t.steps).find(s => s.id === parentStepId)

    if (!parentStep || !parentStep.completedAt || parentStep.status !== 'completed') {
      // Not completed yet - show full wait time
      return null
    }

    // Calculate elapsed time since completion
    const elapsedMs = getCurrentTime().getTime() - new Date(parentStep.completedAt).getTime()
    const elapsedMinutes = Math.floor(elapsedMs / 60000)

    // Calculate remaining wait time
    const totalWaitMinutes = parentStep.asyncWaitTime || 0
    const remainingMinutes = Math.max(0, totalWaitMinutes - elapsedMinutes)

    return {
      remaining: remainingMinutes,
      total: totalWaitMinutes,
    }
  }, [sequencedTasks])

  // Calculate row positions for items (group workflow steps together) and meeting time
  const itemRowPositions = useMemo(() => {
    const positions = new Map<string, number>()
    let currentRow = 0
    const workflowRows = new Map<string, number>()
    const workflowProgress = new Map<string, { completed: number, total: number }>()
    let totalMeetingMinutes = 0
    const unscheduledTasks: Array<{ id: string, name: string, type?: string }> = []

    // Separate items by type
    const blockedItems = scheduledItems.filter((item: any) => item.isBlocked)
    const taskItems = scheduledItems.filter((item: any) => !item.isBlocked && !item.isWaitTime)
    const waitItems = scheduledItems.filter((item: any) => item.isWaitTime)

    // First pass: calculate workflow progress and meeting time
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

      // Calculate meeting time
      if (item.isBlocked && item.type === 'meeting' && item.startTime && item.endTime) {
        const duration = (item.endTime.getTime() - item.startTime.getTime()) / (1000 * 60)
        totalMeetingMinutes += duration
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

    // Fourth pass: assign wait times to same row as their parent workflow
    waitItems.forEach((item: any) => {
      // For workflow async waits, use the workflow row
      if (item.workflowId && workflowRows.has(item.workflowId)) {
        positions.set(item.id, workflowRows.get(item.workflowId)!)
      } else {
        // Fallback: try to find parent by removing '-wait' suffix
        const parentId = item.id.replace('-wait', '')
        const parentPosition = positions.get(parentId)
        if (parentPosition !== undefined) {
          positions.set(item.id, parentPosition)
        } else {
          // If we can't find parent, put it on its own row
          positions.set(item.id, currentRow)
          currentRow++
        }
      }
    })

    // Fifth pass: add unscheduled tasks to display (they don't have scheduled times but need rows)
    // Check which tasks were not scheduled
    const scheduledTaskIds = new Set(scheduledItems.map((item: any) => item.id))
    tasks.forEach(task => {
      if (!scheduledTaskIds.has(task.id) && !task.completed) {
        unscheduledTasks.push({ id: task.id, name: task.name, type: task.type })
        positions.set(task.id, currentRow)
        currentRow++
      }
    })

    // Also check unscheduled workflow steps
    sequencedTasks.forEach(workflow => {
      if (workflow.overallStatus !== 'completed') {
        workflow.steps?.forEach(step => {
          if (step.status !== 'completed' && !scheduledTaskIds.has(step.id)) {
            unscheduledTasks.push({
              id: step.id,
              name: `[${workflow.name}] ${step.name}`,
              type: workflow.type,
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
                  logger.db.error('Failed to set deadline', {
                    error: error instanceof Error ? error.message : String(error),
                    itemId: draggedItem?.taskId || draggedItem?.workflowId,
                  }, 'deadline-set-error')
                  Message.error('Failed to set deadline')
                } finally {
                  setDraggedItem(null)
                  setDropTarget(null)
                }
              }}
            >
              {/* Row labels and backgrounds */}
              <div style={{
                position: 'absolute',
                left: 0,
                top: 0,
                width: '100%',
                zIndex: 1,
              }}>
                {Array.from({ length: itemRowPositions.totalRows }).map((_, rowIndex) => {
                  // Find what's in this row
                  const rowItems = scheduledItems.filter(item =>
                    itemRowPositions.positions.get(item.id) === rowIndex,
                  )
                  const unscheduledInRow = itemRowPositions.unscheduledTasks.find(t =>
                    itemRowPositions.positions.get(t.id) === rowIndex,
                  )
                  const firstItem = rowItems[0]
                  const isWorkflowRow = firstItem?.workflowId
                  const isBlockedRow = rowIndex === 0 && rowItems.some(item => item.isBlocked)
                  const isUnscheduledRow = !firstItem && unscheduledInRow
                  const rowLabel = isBlockedRow
                    ? 'Meetings & Blocked Time'
                    : isWorkflowRow
                    ? firstItem.workflowName
                    : isUnscheduledRow
                    ? `${unscheduledInRow.name} (Unscheduled${unscheduledInRow.type === TaskType.Personal ? ' - Personal' : ''})`
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
                            borderRight: '2px solid #d0d0d0',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            width: 180,
                            minWidth: 180,
                            height: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            zIndex: 20,
                            boxShadow: '2px 0 4px rgba(0,0,0,0.1)',
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
                    Set deadline: {dayjs(dropTarget.time).format('MMM D, h:mm A')}
                  </div>
                </div>
              )}

              {/* Grid lines */}
              {timeMarkers
                .filter(time => {
                  const hourInterval = pixelsPerHour >= 60 ? 1 : 2
                  return time.getHours() % hourInterval === 0
                })
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
              {getCurrentTime() >= chartStartTime && getCurrentTime() <= chartEndTime && (
                <div
                  style={{
                    position: 'absolute',
                    left: `${getPositionPx(getCurrentTime())}px`,
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

              {/* Empty state message */}
              {!hasScheduledItems && (
                <div
                  style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    textAlign: 'center',
                    zIndex: 10,
                  }}
                >
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
                </div>
              )}

              {/* Gantt bars */}
              {scheduledItems.map((item, index) => {
                const leftPx = getPositionPx(item.startTime)
                const widthPx = getDurationPx(item.duration)
                const isWaitTime = item.isWaitTime
                const isBlocked = item.isBlocked
                const isSleep = item.type === 'blocked-time' &&
                  item.originalItem && 'name' in item.originalItem && item.originalItem.name === 'Sleep'
                const isHovered = hoveredItem === item.id ||
                  (item.workflowId && hoveredItem?.startsWith(item.workflowId))

                // Check for deadline violation with extensive logging
                // For workflow steps, inherit deadline from parent workflow ONLY if parent has deadline
                const parentWorkflow = item.workflowId ? sequencedTasks.find(w => w.id === item.workflowId) : null
                const effectiveDeadline = item.deadline || (parentWorkflow?.deadline ? parentWorkflow.deadline : null)

                // Commented out to reduce log spam - this was running for EVERY item on EVERY render
                // logger.ui.debug('🔍 [DEADLINE] Checking deadline for item', {
                //   itemId: item.id,
                //   itemName: item.name,
                //   hasOwnDeadline: !!item.deadline,
                //   ownDeadline: item.deadline,
                //   effectiveDeadline: effectiveDeadline,
                //   endTime: item.endTime,
                //   isWorkflow: !!item.workflowId,
                //   workflowName: item.workflowName,
                //   inheritedFromWorkflow: !item.deadline && !!effectiveDeadline,
                // })

                const isDeadlineViolated = effectiveDeadline &&
                  dayjs(item.endTime).isAfter(dayjs(effectiveDeadline))

                if (effectiveDeadline) {
                  const deadlineDate = dayjs(effectiveDeadline)
                  const endTimeDate = dayjs(item.endTime)
                  const delayMinutes = endTimeDate.diff(deadlineDate, 'minutes')
                  const isInheritedDeadline = !item.deadline && !!effectiveDeadline

                  logger.ui.debug('Item has deadline', {
                    itemId: item.id,
                    itemName: item.name,
                    deadline: deadlineDate.format('YYYY-MM-DD HH:mm'),
                    endTime: endTimeDate.format('YYYY-MM-DD HH:mm'),
                    isViolated: isDeadlineViolated,
                    delayMinutes: isDeadlineViolated ? delayMinutes : 0,
                    delayHours: isDeadlineViolated ? Math.floor(delayMinutes / 60) : 0,
                    isWorkflow: !!item.workflowId,
                    workflowName: item.workflowName,
                    deadlineSource: isInheritedDeadline ? 'INHERITED_FROM_WORKFLOW' : 'DIRECT_DEADLINE',
                  }, 'deadline-check')

                  if (isDeadlineViolated) {
                    logger.ui.warn('Deadline violation detected', {
                      itemId: item.id,
                      itemName: item.name,
                      deadline: deadlineDate.format('YYYY-MM-DD HH:mm:ss'),
                      actualEnd: endTimeDate.format('YYYY-MM-DD HH:mm:ss'),
                      delayMinutes,
                      delayHours: Math.floor(delayMinutes / 60),
                      delayText: delayMinutes >= 60
                        ? `${Math.floor(delayMinutes / 60)}h ${delayMinutes % 60}m`
                        : `${delayMinutes}m`,
                      isWorkflow: !!item.workflowId,
                      workflowName: item.workflowName,
                      deadlineSource: isInheritedDeadline ? 'INHERITED_FROM_WORKFLOW' : 'DIRECT_DEADLINE',
                      violationType: item.workflowId
                        ? (isInheritedDeadline ? 'WORKFLOW_STEP_DEADLINE' : 'WORKFLOW_DEADLINE')
                        : 'TASK_DEADLINE',
                    }, 'deadline-violation')
                  } else {
                    logger.ui.trace('Deadline on time', {
                      itemId: item.id,
                      itemName: item.name,
                      deadline: deadlineDate.format('YYYY-MM-DD HH:mm'),
                      endTime: endTimeDate.format('YYYY-MM-DD HH:mm'),
                      marginMinutes: deadlineDate.diff(endTimeDate, 'minutes'),
                      deadlineSource: isInheritedDeadline ? 'INHERITED_FROM_WORKFLOW' : 'DIRECT_DEADLINE',
                    }, 'deadline-ok')
                  }
                }

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

                        {/* Wait time countdown overlay */}
                        {isWaitTime && (() => {
                          const countdown = calculateRemainingWaitTime(item)
                          if (countdown && countdown.remaining < countdown.total) {
                            return (
                              <div
                                style={{
                                  position: 'absolute',
                                  top: '50%',
                                  left: '50%',
                                  transform: 'translate(-50%, -50%)',
                                  background: countdown.remaining > 0 ? 'rgba(255, 255, 255, 0.95)' : 'rgba(76, 175, 80, 0.95)',
                                  color: countdown.remaining > 0 ? '#333' : '#fff',
                                  padding: '4px 10px',
                                  borderRadius: 4,
                                  fontSize: 11,
                                  fontWeight: 600,
                                  whiteSpace: 'nowrap',
                                  boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
                                  border: countdown.remaining > 0 ? '1px solid #ddd' : '1px solid #4caf50',
                                }}
                              >
                                {countdown.remaining > 0 ? (
                                  <>⏱️ {Math.floor(countdown.remaining / 60)}h {countdown.remaining % 60}m left</>
                                ) : (
                                  <>✓ Wait complete!</>
                                )}
                              </div>
                            )
                          }
                          return null
                        })()}

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
