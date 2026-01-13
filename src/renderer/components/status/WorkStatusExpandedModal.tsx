/**
 * WorkStatusExpandedModal Component
 *
 * Full-screen expanded view of work status with radar chart visualization
 * and detailed statistics by task type. Supports toggling time sinks on/off
 * in the radar chart visualization.
 */

import React, { useMemo, useState, useEffect } from 'react'
import { Modal, Space, Typography, Progress, Statistic, Divider, Grid, Checkbox, Button, Spin } from '@arco-design/web-react'
import { DatePicker } from '@arco-design/web-react'
import { IconClose, IconLeft, IconRight } from '@arco-design/web-react/icon'
import dayjs from 'dayjs'
import { RadarChart, prepareRadarChartData, RadarChartDataPoint, createRadarDataPointFromSink } from './RadarChart'
import { UserTaskType, getBlockTypeConfigName } from '@shared/user-task-types'
import { TimeSink } from '@shared/time-sink-types'
import { WorkBlock, getTotalCapacityByType, DateString, HistoricalWorkData, Meeting } from '@shared/work-blocks-types'
import { formatMinutes, calculateDuration } from '@shared/time-utils'
import { getDatabase } from '../../services/database'
import { useWorkPatternStore } from '../../store/useWorkPatternStore'
import { logger } from '@/logger'

const { Title, Text } = Typography
const { Row, Col } = Grid

// ============================================================================
// Types
// ============================================================================

export interface WorkStatusExpandedModalProps {
  visible: boolean
  onClose: () => void
  initialDate: DateString // The date for the initially loaded data (today), "YYYY-MM-DD" format
  accumulatedByType: Record<string, number>
  accumulatedBySink: Record<string, number>
  capacityByType: Record<string, number>
  userTaskTypes: UserTaskType[]
  timeSinks: TimeSink[]
  meetingMinutes: number
  totalPlannedMinutes: number
  accumulatedTotal: number
  currentBlock: WorkBlock | null
  nextBlock: WorkBlock | null
}


// ============================================================================
// Sub-Components
// ============================================================================

interface TypeBreakdownRowProps {
  type: UserTaskType
  logged: number
  planned: number
}

function TypeBreakdownRow({ type, logged, planned }: TypeBreakdownRowProps): React.ReactElement {
  const progress = planned > 0 ? Math.round((logged / planned) * 100) : 0
  const hasUnplannedWork = planned === 0 && logged > 0

  return (
    <div style={{ marginBottom: 16 }}>
      <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 4 }}>
        <Text>
          {type.emoji} {type.name}
        </Text>
        <Text>
          {formatMinutes(logged)} / {formatMinutes(planned)}
          {planned > 0 && <Text style={{ marginLeft: 8, fontWeight: 600 }}>{progress}%</Text>}
        </Text>
      </Space>
      <Progress
        percent={hasUnplannedWork ? 100 : Math.min(progress, 100)}
        color={
          hasUnplannedWork
            ? '#ff7d00' // Orange for unplanned
            : progress >= 100
              ? '#00b42a' // Green for complete
              : type.color
        }
        showText={false}
      />
      {hasUnplannedWork && (
        <Text type="warning" style={{ fontSize: '12px' }}>
          ⚠️ Unplanned work logged
        </Text>
      )}
    </div>
  )
}

// ============================================================================
// Helper Functions
// ============================================================================

function formatDateTitle(date: DateString, today: DateString): string {
  if (date === today) return "Today's Work Distribution"
  const yesterday = dayjs(today).subtract(1, 'day').format('YYYY-MM-DD')
  if (date === yesterday) return "Yesterday's Work Distribution"
  return `Work Distribution - ${dayjs(date).format('MMM D, YYYY')}`
}

function formatDateRangeTitle(startDate: DateString, endDate: DateString): string {
  const start = dayjs(startDate)
  const end = dayjs(endDate)
  const dayCount = end.diff(start, 'day') + 1
  return `${dayCount}-Day Summary: ${start.format('MMM D')} - ${end.format('MMM D, YYYY')}`
}

/**
 * Aggregate work data across multiple dates
 */
function aggregateWorkData(dataPoints: HistoricalWorkData[]): HistoricalWorkData {
  const result: HistoricalWorkData = {
    accumulatedByType: {},
    accumulatedBySink: {},
    capacityByType: {},
    meetingMinutes: 0,
    totalPlannedMinutes: 0,
    accumulatedTotal: 0,
  }

  for (const data of dataPoints) {
    // Aggregate by type
    for (const [typeId, minutes] of Object.entries(data.accumulatedByType)) {
      result.accumulatedByType[typeId] = (result.accumulatedByType[typeId] || 0) + minutes
    }

    // Aggregate by sink
    for (const [sinkId, minutes] of Object.entries(data.accumulatedBySink)) {
      result.accumulatedBySink[sinkId] = (result.accumulatedBySink[sinkId] || 0) + minutes
    }

    // Aggregate capacity by type
    for (const [typeId, minutes] of Object.entries(data.capacityByType)) {
      result.capacityByType[typeId] = (result.capacityByType[typeId] || 0) + minutes
    }

    result.meetingMinutes += data.meetingMinutes
    result.totalPlannedMinutes += data.totalPlannedMinutes
    result.accumulatedTotal += data.accumulatedTotal
  }

  return result
}

// ============================================================================
// Main Component
// ============================================================================

export function WorkStatusExpandedModal({
  visible,
  onClose,
  initialDate,
  accumulatedByType,
  accumulatedBySink,
  capacityByType,
  userTaskTypes,
  timeSinks,
  meetingMinutes,
  totalPlannedMinutes,
  accumulatedTotal,
  currentBlock,
  nextBlock,
}: WorkStatusExpandedModalProps): React.ReactElement {
  // Work patterns for historical date lookup
  const workPatterns = useWorkPatternStore(state => state.workPatterns)

  // Date selection state - supports both single day and date range modes
  const [isRangeMode, setIsRangeMode] = useState(false)
  const [selectedDate, setSelectedDate] = useState<DateString>(initialDate)
  // Initialize range to last 7 days (computed once, then managed by state)
  const [rangeStartDate, setRangeStartDate] = useState<DateString>(() => {
    // Safe computation that works even if dayjs isn't fully available in tests
    try {
      return dayjs(initialDate).subtract(6, 'day').format('YYYY-MM-DD')
    } catch {
      // Fallback: compute manually
      const date = new Date(initialDate)
      date.setDate(date.getDate() - 6)
      return date.toISOString().split('T')[0] as DateString
    }
  })
  const [rangeEndDate, setRangeEndDate] = useState<DateString>(initialDate)
  const [isLoading, setIsLoading] = useState(false)

  // Historical data state (overrides props when viewing non-initial dates or ranges)
  const [historicalData, setHistoricalData] = useState<HistoricalWorkData | null>(null)

  // State for which time sinks are shown in the radar chart
  const [enabledSinkIds, setEnabledSinkIds] = useState<Set<string>>(new Set())

  // Reset state when modal closes
  const handleClose = (): void => {
    setSelectedDate(initialDate)
    setIsRangeMode(false)
    setHistoricalData(null)
    onClose()
  }

  // Toggle between single day and range mode
  const toggleRangeMode = (): void => {
    setIsRangeMode(!isRangeMode)
    setHistoricalData(null) // Reset data when switching modes
  }

  // Navigate to previous/next day (single day mode)
  const goToPreviousDay = (): void => {
    setSelectedDate(dayjs(selectedDate).subtract(1, 'day').format('YYYY-MM-DD'))
  }

  const goToNextDay = (): void => {
    setSelectedDate(dayjs(selectedDate).add(1, 'day').format('YYYY-MM-DD'))
  }

  const goToToday = (): void => {
    setSelectedDate(initialDate)
    setRangeEndDate(initialDate)
  }

  // Helper to fetch data for a single date
  const fetchSingleDayData = async (date: DateString): Promise<HistoricalWorkData> => {
    const db = getDatabase()
    const pattern = workPatterns.find(p => p.date === date)

    const accumulatedData = await db.getTodayAccumulated(date)
    const sinkData = await db.getTimeSinkAccumulated(date, date)

    const histCapacityByType = pattern
      ? getTotalCapacityByType(pattern.blocks, [])
      : {}

    const histMeetingMinutes = pattern?.meetings?.reduce((total: number, meeting: Meeting) => {
      return total + calculateDuration(meeting.startTime, meeting.endTime)
    }, 0) || 0

    const histTotalPlannedMinutes = Object.values(histCapacityByType).reduce(
      (sum, mins) => sum + mins, 0,
    )

    return {
      accumulatedByType: accumulatedData.byType || {},
      accumulatedBySink: sinkData.bySink || {},
      capacityByType: histCapacityByType,
      meetingMinutes: histMeetingMinutes,
      totalPlannedMinutes: histTotalPlannedMinutes,
      accumulatedTotal: accumulatedData.total || 0,
    }
  }

  // Fetch historical data when date/range changes
  useEffect(() => {
    // In single-day mode viewing today, use props data
    if (!isRangeMode && selectedDate === initialDate) {
      setHistoricalData(null)
      return
    }

    const fetchData = async (): Promise<void> => {
      setIsLoading(true)
      try {
        if (isRangeMode) {
          // Fetch data for each day in the range and aggregate
          const start = dayjs(rangeStartDate)
          const end = dayjs(rangeEndDate)
          const dayCount = end.diff(start, 'day') + 1
          const dataPoints: HistoricalWorkData[] = []

          for (let i = 0; i < dayCount; i++) {
            const date = start.add(i, 'day').format('YYYY-MM-DD') as DateString
            const dayData = await fetchSingleDayData(date)
            dataPoints.push(dayData)
          }

          setHistoricalData(aggregateWorkData(dataPoints))
        } else {
          // Single day mode - fetch just that day
          const dayData = await fetchSingleDayData(selectedDate)
          setHistoricalData(dayData)
        }
      } catch (error) {
        logger.ui.error('Failed to fetch work data', { error, isRangeMode, selectedDate, rangeStartDate, rangeEndDate })
      } finally {
        setIsLoading(false)
      }
    }

    fetchData()
  }, [isRangeMode, selectedDate, rangeStartDate, rangeEndDate, initialDate, workPatterns])

  // Use historical data if loaded, otherwise use props
  const displayData = historicalData ?? {
    accumulatedByType,
    accumulatedBySink,
    capacityByType,
    meetingMinutes,
    totalPlannedMinutes,
    accumulatedTotal,
  }

  // Whether we're viewing today (show current/next block) or a historical date/range
  const isViewingToday = !isRangeMode && selectedDate === initialDate

  // Toggle a time sink in the radar chart
  const handleToggleSink = (sinkId: string): void => {
    setEnabledSinkIds(prev => {
      const newSet = new Set(prev)
      if (newSet.has(sinkId)) {
        newSet.delete(sinkId)
      } else {
        newSet.add(sinkId)
      }
      return newSet
    })
  }

  // Toggle all time sinks on/off
  const handleToggleAllSinks = (checked: boolean): void => {
    if (checked) {
      setEnabledSinkIds(new Set(timeSinks.map(s => s.id)))
    } else {
      setEnabledSinkIds(new Set())
    }
  }

  // Prepare radar chart data (task types + enabled time sinks)
  const radarData: RadarChartDataPoint[] = useMemo(() => {
    // Start with task type data
    const taskTypeData = prepareRadarChartData({
      accumulatedByType: displayData.accumulatedByType,
      userTaskTypes,
    })

    // Add enabled time sink data using factory function
    const sinkData: RadarChartDataPoint[] = timeSinks
      .filter(sink => enabledSinkIds.has(sink.id))
      .map(sink => createRadarDataPointFromSink(sink, displayData.accumulatedBySink[sink.id] ?? 0))

    // Combine and normalize
    const allData = [...taskTypeData, ...sinkData]

    // Re-normalize values based on combined max
    const maxValue = Math.max(...allData.map(d => d.rawValue), 1)
    return allData.map(d => ({
      ...d,
      value: d.rawValue / maxValue,
    }))
  }, [displayData.accumulatedByType, displayData.accumulatedBySink, userTaskTypes, timeSinks, enabledSinkIds])

  // Calculate overall progress
  const overallProgress = useMemo(() => {
    if (displayData.totalPlannedMinutes === 0) return 0
    return Math.round((displayData.accumulatedTotal / displayData.totalPlannedMinutes) * 100)
  }, [displayData.accumulatedTotal, displayData.totalPlannedMinutes])

  return (
    <Modal
      visible={visible}
      onCancel={handleClose}
      title={
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', paddingRight: 24 }}>
          <Space>
            <span>📊</span>
            <span>
              {isRangeMode
                ? formatDateRangeTitle(rangeStartDate, rangeEndDate)
                : formatDateTitle(selectedDate, initialDate)}
            </span>
          </Space>
          <Space size="small">
            {/* Mode toggle button */}
            <Button
              size="small"
              type={isRangeMode ? 'primary' : 'secondary'}
              onClick={toggleRangeMode}
              style={{ marginRight: 8 }}
            >
              {isRangeMode ? '📅 Range' : '📅 Single'}
            </Button>

            {isRangeMode ? (
              /* Date range mode - show start and end date pickers */
              <>
                <DatePicker
                  size="small"
                  value={rangeStartDate}
                  onChange={(dateString) => dateString && setRangeStartDate(dateString as DateString)}
                  style={{ width: 130 }}
                  allowClear={false}
                  placeholder="Start"
                />
                <Text style={{ margin: '0 4px' }}>→</Text>
                <DatePicker
                  size="small"
                  value={rangeEndDate}
                  onChange={(dateString) => dateString && setRangeEndDate(dateString as DateString)}
                  style={{ width: 130 }}
                  allowClear={false}
                  placeholder="End"
                />
              </>
            ) : (
              /* Single day mode - show navigation buttons and date picker */
              <>
                <Button
                  size="small"
                  type="secondary"
                  icon={<IconLeft />}
                  onClick={goToPreviousDay}
                />
                <DatePicker
                  size="small"
                  value={selectedDate}
                  onChange={(dateString) => dateString && setSelectedDate(dateString as DateString)}
                  style={{ width: 140 }}
                  allowClear={false}
                />
                <Button
                  size="small"
                  type="secondary"
                  icon={<IconRight />}
                  onClick={goToNextDay}
                />
              </>
            )}

            {!isViewingToday && (
              <Button size="small" type="primary" onClick={goToToday}>
                Today
              </Button>
            )}
          </Space>
        </div>
      }
      footer={null}
      style={{ width: '90vw', maxWidth: 900 }}
      closeIcon={<IconClose />}
    >
      {isLoading ? (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 60 }}>
          <Spin size={32} tip="Loading..." />
        </div>
      ) : (
        <>
      <Row gutter={24}>
        {/* Left Column - Radar Chart */}
        <Col span={12}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <Title heading={6} style={{ marginBottom: 16 }}>
              Time Distribution by Type
            </Title>
            <RadarChart
              data={radarData}
              size={350}
              showLabels={true}
              showGrid={true}
              fillOpacity={0.4}
            />
            {userTaskTypes.length < 3 && (
              <Text type="secondary" style={{ marginTop: 8, fontSize: '12px' }}>
                Add more task types for a full radar visualization
              </Text>
            )}

            {/* Time Sink Toggles */}
            {timeSinks.length > 0 && (
              <div style={{ marginTop: 16, width: '100%' }}>
                <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
                  Include Time Sinks:
                </Text>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {/* Select All checkbox */}
                  <Checkbox
                    checked={enabledSinkIds.size === timeSinks.length && timeSinks.length > 0}
                    indeterminate={enabledSinkIds.size > 0 && enabledSinkIds.size < timeSinks.length}
                    onChange={handleToggleAllSinks}
                    style={{ marginRight: 8 }}
                  >
                    <Text type="secondary">All</Text>
                  </Checkbox>
                  {timeSinks.map(sink => (
                    <Checkbox
                      key={sink.id}
                      checked={enabledSinkIds.has(sink.id)}
                      onChange={() => handleToggleSink(sink.id)}
                      style={{ marginRight: 0 }}
                    >
                      <span style={{ color: sink.color }}>
                        {sink.emoji} {sink.name}
                      </span>
                      {(displayData.accumulatedBySink[sink.id] ?? 0) > 0 && (
                        <Text type="secondary" style={{ fontSize: 11, marginLeft: 4 }}>
                          ({formatMinutes(displayData.accumulatedBySink[sink.id] ?? 0)})
                        </Text>
                      )}
                    </Checkbox>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Col>

        {/* Right Column - Type Breakdown */}
        <Col span={12}>
          <Title heading={6} style={{ marginBottom: 16 }}>
            Progress by Type
          </Title>
          {userTaskTypes.length === 0 ? (
            <Text type="secondary">No task types defined. Go to Settings to create types.</Text>
          ) : (
            userTaskTypes.map(type => (
              <TypeBreakdownRow
                key={type.id}
                type={type}
                logged={displayData.accumulatedByType[type.id] || 0}
                planned={displayData.capacityByType[type.id] || 0}
              />
            ))
          )}

          {/* Meeting time */}
          {displayData.meetingMinutes > 0 && (
            <div style={{ marginTop: 8, marginBottom: 16 }}>
              <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                <Text>🤝 Meetings</Text>
                <Text>{formatMinutes(displayData.meetingMinutes)}</Text>
              </Space>
            </div>
          )}
        </Col>
      </Row>

      <Divider />

      {/* Day Statistics */}
      <Title heading={6} style={{ marginBottom: 16 }}>
        Day Statistics
      </Title>
      <Row gutter={24}>
        <Col span={6}>
          <Statistic
            title="Total Logged"
            value={displayData.accumulatedTotal}
            suffix="min"
            styleValue={{ color: '#165DFF' }}
          />
          <Text type="secondary" style={{ fontSize: '12px' }}>
            {formatMinutes(displayData.accumulatedTotal)}
          </Text>
        </Col>
        <Col span={6}>
          <Statistic
            title="Total Planned"
            value={displayData.totalPlannedMinutes + displayData.meetingMinutes}
            suffix="min"
          />
          <Text type="secondary" style={{ fontSize: '12px' }}>
            {formatMinutes(displayData.totalPlannedMinutes + displayData.meetingMinutes)}
          </Text>
        </Col>
        <Col span={6}>
          <Statistic
            title="Progress"
            value={overallProgress}
            suffix="%"
            styleValue={{ color: overallProgress >= 100 ? '#00b42a' : '#165DFF' }}
          />
        </Col>
        <Col span={6}>
          <Statistic
            title="Remaining"
            value={Math.max(0, displayData.totalPlannedMinutes - displayData.accumulatedTotal)}
            suffix="min"
          />
          <Text type="secondary" style={{ fontSize: '12px' }}>
            {formatMinutes(Math.max(0, displayData.totalPlannedMinutes - displayData.accumulatedTotal))}
          </Text>
        </Col>
      </Row>

      {/* Current Block Info - only show for today */}
      {isViewingToday && (
        <>
          <Divider />
          <Row gutter={24}>
            <Col span={12}>
              <Title heading={6} style={{ marginBottom: 8 }}>
                Current Block
              </Title>
              {currentBlock ? (
                <Space direction="vertical">
                  <Text>
                    <strong>{currentBlock.startTime} - {currentBlock.endTime}</strong>
                  </Text>
                  <Text>{getBlockTypeConfigName(currentBlock.typeConfig, userTaskTypes)}</Text>
                  {currentBlock.capacity && (
                    <Text type="secondary">
                      Capacity: {formatMinutes(currentBlock.capacity.totalMinutes)}
                    </Text>
                  )}
                </Space>
              ) : (
                <Text type="secondary">No active work block</Text>
              )}
            </Col>
            <Col span={12}>
              <Title heading={6} style={{ marginBottom: 8 }}>
                Next Block
              </Title>
              {nextBlock ? (
                <Space direction="vertical">
                  <Text>
                    <strong>{nextBlock.startTime} - {nextBlock.endTime}</strong>
                  </Text>
                  <Text>{getBlockTypeConfigName(nextBlock.typeConfig, userTaskTypes)}</Text>
                  {nextBlock.capacity && (
                    <Text type="secondary">
                      Capacity: {formatMinutes(nextBlock.capacity.totalMinutes)}
                    </Text>
                  )}
                </Space>
              ) : (
                <Text type="secondary">No more blocks today</Text>
              )}
            </Col>
          </Row>
        </>
      )}
        </>
      )}
    </Modal>
  )
}
