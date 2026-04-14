import { useState, useEffect, useMemo } from 'react'
import {
  Card,
  Space,
  Button,
  Typography,
  Spin,
  Tag,
  Dropdown,
  Menu,
  Popconfirm,
} from '@arco-design/web-react'
import {
  IconLeft,
  IconRight,
  IconMore,
  IconCopy,
  IconPaste,
  IconDelete,
  IconSync,
} from '@arco-design/web-react/icon'
import { WorkBlock, WorkMeeting, DailyWorkPattern } from '@shared/work-blocks-types'
import { getDatabase } from '../../services/database'
import { WorkBlocksEditor } from './WorkBlocksEditor'
import { Message } from '../common/Message'
import dayjs from 'dayjs'
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore'
import { logger } from '@/logger'
import { getCurrentTime } from '@shared/time-provider'
import { useWorkPatternStore } from '../../store/useWorkPatternStore'
import { useResponsive } from '../../providers/ResponsiveProvider'


dayjs.extend(isSameOrBefore)

const { Text } = Typography

interface MultiDayScheduleEditorProps {
  visible: boolean
  onClose: () => void
  onSave?: () => void
}

export function MultiDayScheduleEditor({ visible, onClose: _onClose, onSave }: MultiDayScheduleEditorProps) {
  const currentTime = getCurrentTime()
  const { isUltraWide, isSuperUltraWide } = useResponsive()

  // Dynamic max-width for ultra-wide screens
  const maxWidth = useMemo(() => {
    if (isSuperUltraWide) return 2400
    if (isUltraWide) return 1800
    return 1200
  }, [isUltraWide, isSuperUltraWide])

  const [showClearConfirm, setShowClearConfirm] = useState(false)
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([
    dayjs(currentTime),
    dayjs(currentTime).add(6, 'day'),
  ])
  const [selectedDate, setSelectedDate] = useState<string>(dayjs(currentTime).format('YYYY-MM-DD'))
  const [patterns, setPatterns] = useState<Map<string, DailyWorkPattern>>(new Map())
  const [loading, setLoading] = useState(false)
  const [copiedPattern, setCopiedPattern] = useState<{
    blocks: WorkBlock[]
    meetings: WorkMeeting[]
  } | null>(null)

  // Load patterns for date range
  useEffect(() => {
    if (visible) {
      loadPatterns()
    }
  }, [visible, dateRange])

  // Load accumulated data when selected date changes
  useEffect(() => {
    if (visible && selectedDate) {
      loadAccumulatedForDate(selectedDate)
    }
  }, [visible, selectedDate])

  const loadPatterns = async () => {
    setLoading(true)
    try {
      const db = getDatabase()
      const patternsMap = new Map<string, DailyWorkPattern>()

      // Ensure we're working with dayjs objects
      const startDate = dayjs(dateRange[0])
      const endDate = dayjs(dateRange[1])
      let currentDate = startDate

      while (currentDate.isSameOrBefore(endDate, 'day')) {
        const dateStr = currentDate.format('YYYY-MM-DD')
        const [pattern, accumulatedData] = await Promise.all([
          db.getWorkPattern(dateStr),
          db.getTodayAccumulated(dateStr),
        ])

        if (pattern) {
          patternsMap.set(dateStr, {
            date: dateStr,
            blocks: pattern.blocks || [],
            meetings: pattern.meetings || [],
            accumulated: accumulatedData?.byType || {},
          })
        }

        currentDate = currentDate.add(1, 'day')
      }

      setPatterns(patternsMap)
    } catch (error) {
      logger.ui.error('Failed to load patterns', {
        error: error instanceof Error ? error.message : String(error),
      }, 'patterns-load-error')
      Message.error('Failed to load schedules')
    } finally {
      setLoading(false)
    }
  }

  const loadAccumulatedForDate = async (date: string) => {
    try {
      const db = getDatabase()
      const accumulatedData = await db.getTodayAccumulated(date)

      // Update the pattern map if it exists
      const pattern = patterns.get(date)
      if (pattern) {
        const updatedPattern = {
          ...pattern,
          accumulated: accumulatedData?.byType || {},
        }
        setPatterns(new Map(patterns).set(date, updatedPattern))
      }
    } catch (error) {
      logger.ui.error('Failed to load accumulated data', {
        date,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  const handleSavePattern = async (date: string, blocks: WorkBlock[], meetings: WorkMeeting[]) => {
    try {
      const db = getDatabase()

      const existingPattern = patterns.get(date)

      if (existingPattern && 'id' in existingPattern) {
        await db.updateWorkPattern((existingPattern as any).id, {
          blocks,
          meetings,
        })
      } else {
        // Create new pattern (sleep/recurring handling is done at the database level)
        await db.createWorkPattern({
          date,
          blocks,
          meetings,
        })
      }

      Message.success(`Schedule saved for ${dayjs(date).format('MMM D, YYYY')}`)

      // Reload patterns
      await loadPatterns()
      onSave?.()

      // Refresh stores to update UI
      await useWorkPatternStore.getState().loadWorkPatterns()
      // Schedule will automatically recompute via reactive subscriptions
    } catch (error) {
      logger.ui.error('Failed to save pattern', {
        error: error instanceof Error ? error.message : String(error),
        date,
      }, 'pattern-save-error')
      Message.error('Failed to save schedule')
    }
  }

  const handleCopyPattern = (date: string) => {
    const pattern = patterns.get(date)
    if (pattern) {
      setCopiedPattern({
        blocks: pattern.blocks,
        meetings: pattern.meetings,
      })
      Message.success('Schedule copied to clipboard')
    }
  }

  const handlePastePattern = async (date: string) => {
    if (!copiedPattern) {
      Message.warning('No schedule in clipboard')
      return
    }

    // Create new IDs for pasted items
    const newBlocks = copiedPattern.blocks.map((b, index) => ({
      ...b,
      id: `block-${Date.now()}-${index}`,
    }))

    const newMeetings = copiedPattern.meetings.map((m, index) => ({
      ...m,
      id: `meeting-${Date.now()}-${index}-${Math.random().toString(36).substr(2, 9)}`,
    }))

    await handleSavePattern(date, newBlocks, newMeetings)
  }

  const handleApplyToWeekdays = async () => {
    const currentPattern = patterns.get(selectedDate)
    if (!currentPattern) {
      Message.warning('No schedule to apply')
      return
    }

    const startDate = dateRange[0]
    const endDate = dateRange[1]
    let currentDate = startDate
    let appliedCount = 0

    while (currentDate.isSameOrBefore(endDate, 'day')) {
      const dateStr = currentDate.format('YYYY-MM-DD')
      const dayOfWeek = currentDate.day()

      // Skip only the current date and weekends (unless you want to apply to weekends too)
      // For now, skip weekends (0 = Sunday, 6 = Saturday)
      if (dateStr !== selectedDate && dayOfWeek !== 0 && dayOfWeek !== 6) {
        const newBlocks = currentPattern.blocks.map((b, index) => ({
          ...b,
          id: `block-${Date.now()}-${dateStr}-${index}`,
        }))

        const newMeetings = currentPattern.meetings.map((m, index) => ({
          ...m,
          id: `meeting-${Date.now()}-${dateStr}-${index}-${Math.random().toString(36).substr(2, 9)}`,
        }))

        await handleSavePattern(dateStr, newBlocks, newMeetings)
        appliedCount++
      }

      currentDate = currentDate.add(1, 'day')
    }

    if (appliedCount > 0) {
      Message.success(`Applied schedule to ${appliedCount} weekdays`)
    }
  }

  const handleClearAllSchedules = async () => {
    setLoading(true)
    try {
      const db = getDatabase()
      // Get all future dates (including today)
      const today = dayjs().format('YYYY-MM-DD')
      const allPatterns = await db.getWorkPatterns()

      logger.ui.info('Clear All Schedules - Found patterns:', {
        totalPatterns: allPatterns.length,
        today,
        patterns: allPatterns.map(p => ({ id: p.id, date: p.date })),
      })

      let clearedCount = 0
      logger.ui.info('[MultiDayScheduleEditor] Starting delete of future patterns', {
        totalPatterns: allPatterns.length,
        todayDate: today,
      })

      for (const pattern of allPatterns) {
        // Clear today and all future dates
        if (pattern.date >= today) {
          logger.ui.info('[MultiDayScheduleEditor] Deleting pattern', {
            id: pattern.id,
            date: pattern.date,
            comparison: `${pattern.date} >= ${today}`,
          })
          try {
            await db.deleteWorkPattern(pattern.id!)
            logger.ui.info('Successfully deleted pattern', { id: pattern.id }, 'pattern-delete-success')
            clearedCount++
          } catch (error) {
            logger.ui.error('Failed to delete pattern', {
              error: error instanceof Error ? error.message : String(error),
              id: pattern.id,
            }, 'pattern-delete-error')
          }
        } else {
          logger.ui.debug('[MultiDayScheduleEditor] Skipping past pattern', {
            date: pattern.date,
            comparison: `${pattern.date} < ${today}`,
          })
        }
      }

      logger.ui.info('[MultiDayScheduleEditor] Completed delete operation', {
        clearedCount,
        totalProcessed: allPatterns.length,
      })

      if (clearedCount === 0) {
        Message.info('No future schedules to clear')
      } else {
        Message.success(`Cleared ${clearedCount} schedules`)
      }

      // Clear the local patterns state immediately
      setPatterns(new Map())

      // Then reload to get any remaining patterns (should be empty or only past dates)
      await loadPatterns()

      // Trigger the parent component's save handler to reload GanttChart patterns
      if (onSave) {
        await onSave()
      }

      // Refresh stores to update UI
      await useWorkPatternStore.getState().loadWorkPatterns()
      // Schedule will automatically recompute via reactive subscriptions
    } catch (error) {
      logger.ui.error('Failed to clear schedules', {
        error: error instanceof Error ? error.message : String(error),
      }, 'schedules-clear-error')
      Message.error('Failed to clear schedules')
    } finally {
      setLoading(false)
    }
  }

  const navigateDay = (direction: 1 | -1): void => {
    const newDate = dayjs(selectedDate).add(direction, 'day').format('YYYY-MM-DD')
    setSelectedDate(newDate)

    // Expand date range if navigating outside it
    const newDayjs = dayjs(newDate)
    if (newDayjs.isBefore(dateRange[0], 'day')) {
      setDateRange([newDayjs, dateRange[1]])
    } else if (newDayjs.isAfter(dateRange[1], 'day')) {
      setDateRange([dateRange[0], newDayjs])
    }
  }

  const handleApplyToAll = async (): Promise<void> => {
    const currentPattern = patterns.get(selectedDate)
    if (!currentPattern) {
      Message.warning('No schedule to apply')
      return
    }

    const startDate = dateRange[0]
    const endDate = dateRange[1]
    let currentDate = startDate
    let appliedCount = 0

    while (currentDate.isSameOrBefore(endDate, 'day')) {
      const dateStr = currentDate.format('YYYY-MM-DD')

      if (dateStr !== selectedDate) {
        const newBlocks = currentPattern.blocks.map((b, index) => ({
          ...b,
          id: `block-${Date.now()}-${dateStr}-${index}`,
        }))
        const newMeetings = currentPattern.meetings.map((m, index) => ({
          ...m,
          id: `meeting-${Date.now()}-${dateStr}-${index}-${Math.random().toString(36).substr(2, 9)}`,
        }))
        await handleSavePattern(dateStr, newBlocks, newMeetings)
        appliedCount++
      }
      currentDate = currentDate.add(1, 'day')
    }

    if (appliedCount > 0) {
      Message.success(`Applied schedule to ${appliedCount} days`)
    }
  }

  const selectedDayjs = dayjs(selectedDate)
  const isToday = selectedDayjs.isSame(dayjs(currentTime), 'day')
  const hasBlocks = (patterns.get(selectedDate)?.blocks.length ?? 0) > 0

  return (
    <div style={{ width: '100%', maxWidth, margin: '0 auto' }}>
      {/* Compact header: arrows + date + actions dropdown */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          marginBottom: 12,
          background: 'var(--color-bg-2)',
          borderRadius: 8,
        }}
      >
        {/* Left: day navigation */}
        <Space size={8}>
          <Button
            shape="circle"
            size="small"
            icon={<IconLeft />}
            onClick={() => navigateDay(-1)}
          />
          <div style={{ textAlign: 'center', minWidth: 140 }}>
            <Text style={{ fontSize: 16, fontWeight: 600 }}>
              {selectedDayjs.format('ddd, MMM D')}
            </Text>
            {isToday && (
              <Tag color="arcoblue" size="small" style={{ marginLeft: 8 }}>
                Today
              </Tag>
            )}
          </div>
          <Button
            shape="circle"
            size="small"
            icon={<IconRight />}
            onClick={() => navigateDay(1)}
          />
          {!isToday && (
            <Button
              size="small"
              onClick={() => setSelectedDate(dayjs(currentTime).format('YYYY-MM-DD'))}
            >
              Today
            </Button>
          )}
        </Space>

        {/* Right: actions dropdown */}
        <Dropdown
          droplist={
            <Menu onClickMenuItem={(key) => {
              switch (key) {
                case 'copy': handleCopyPattern(selectedDate); break
                case 'paste': handlePastePattern(selectedDate); break
                case 'apply-weekdays': handleApplyToWeekdays(); break
                case 'apply-all': handleApplyToAll(); break
                case 'clear': setShowClearConfirm(true); break
              }
            }}>
              <Menu.Item key="copy" disabled={!hasBlocks}>
                <IconCopy style={{ marginRight: 8 }} />Copy Day
              </Menu.Item>
              <Menu.Item key="paste" disabled={!copiedPattern}>
                <IconPaste style={{ marginRight: 8 }} />Paste
              </Menu.Item>
              <Menu.SubMenu key="apply" title={<><IconSync style={{ marginRight: 8 }} />Apply to...</>}>
                <Menu.Item key="apply-weekdays" disabled={!hasBlocks}>Weekdays in range</Menu.Item>
                <Menu.Item key="apply-all" disabled={!hasBlocks}>All days in range</Menu.Item>
              </Menu.SubMenu>
              <Menu.Item key="clear" className="arco-menu-danger">
                <IconDelete style={{ marginRight: 8, color: 'var(--color-danger-6)' }} />Clear All Future
              </Menu.Item>
            </Menu>
          }
          position="br"
        >
          <Button icon={<IconMore />} size="small">
            Actions
          </Button>
        </Dropdown>
      </div>

      {/* Clear confirmation (triggered from dropdown) */}
      {showClearConfirm && (
        <Popconfirm
          title="Clear All Future Schedules?"
          content="This will delete ALL schedules for all future days. This cannot be undone."
          okText="Clear All"
          cancelText="Cancel"
          okButtonProps={{ status: 'danger' }}
          onOk={() => { handleClearAllSchedules(); setShowClearConfirm(false) }}
          onCancel={() => setShowClearConfirm(false)}
          popupVisible={showClearConfirm}
        >
          <span />
        </Popconfirm>
      )}

      {/* Schedule Editor for Selected Day */}
      {loading ? (
        <Card style={{ textAlign: 'center', padding: 40 }}>
          <Spin size={40} />
          <div style={{ marginTop: 16 }}>Loading schedule...</div>
        </Card>
      ) : selectedDate ? (
        <WorkBlocksEditor
          date={selectedDate}
          pattern={{
            blocks: patterns.get(selectedDate)?.blocks || [],
            meetings: patterns.get(selectedDate)?.meetings || [],
          }}
          accumulated={patterns.get(selectedDate)?.accumulated || {}}
          onSave={(blocks, meetings) => handleSavePattern(selectedDate, blocks, meetings)}
        />
      ) : null}
    </div>
  )
}
