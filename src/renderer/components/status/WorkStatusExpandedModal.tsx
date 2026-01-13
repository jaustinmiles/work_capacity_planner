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
import { WorkBlock, getTotalCapacityByType } from '@shared/work-blocks-types'
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
  initialDate: string // The date for the initially loaded data (today)
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

function formatDateTitle(date: string, today: string): string {
  if (date === today) return "Today's Work Distribution"
  const yesterday = dayjs(today).subtract(1, 'day').format('YYYY-MM-DD')
  if (date === yesterday) return "Yesterday's Work Distribution"
  return `Work Distribution - ${dayjs(date).format('MMM D, YYYY')}`
}

// ============================================================================
// Main Component
// ============================================================================

interface HistoricalData {
  accumulatedByType: Record<string, number>
  accumulatedBySink: Record<string, number>
  capacityByType: Record<string, number>
  meetingMinutes: number
  totalPlannedMinutes: number
  accumulatedTotal: number
}

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

  // Date selection state
  const [selectedDate, setSelectedDate] = useState<string>(initialDate)
  const [isLoading, setIsLoading] = useState(false)

  // Historical data state (overrides props when viewing non-initial dates)
  const [historicalData, setHistoricalData] = useState<HistoricalData | null>(null)

  // State for which time sinks are shown in the radar chart
  const [enabledSinkIds, setEnabledSinkIds] = useState<Set<string>>(new Set())

  // Reset date when modal closes
  const handleClose = (): void => {
    setSelectedDate(initialDate)
    setHistoricalData(null)
    onClose()
  }

  // Navigate to previous/next day
  const goToPreviousDay = (): void => {
    setSelectedDate(dayjs(selectedDate).subtract(1, 'day').format('YYYY-MM-DD'))
  }

  const goToNextDay = (): void => {
    setSelectedDate(dayjs(selectedDate).add(1, 'day').format('YYYY-MM-DD'))
  }

  const goToToday = (): void => {
    setSelectedDate(initialDate)
  }

  // Fetch historical data when date changes
  useEffect(() => {
    // If viewing the initial date (today), use props data
    if (selectedDate === initialDate) {
      setHistoricalData(null)
      return
    }

    const fetchHistoricalData = async (): Promise<void> => {
      setIsLoading(true)
      try {
        const db = getDatabase()

        // Get pattern for selected date
        const pattern = workPatterns.find(p => p.date === selectedDate)

        // Fetch accumulated work time
        const accumulatedData = await db.getTodayAccumulated(selectedDate)

        // Fetch time sink accumulated
        const sinkData = await db.getTimeSinkAccumulated(selectedDate, selectedDate)

        // Calculate capacity from pattern blocks
        const histCapacityByType = pattern
          ? getTotalCapacityByType(pattern.blocks, [])
          : {}

        // Calculate meeting minutes
        interface MeetingWithTime {
          startTime: string
          endTime: string
        }
        const histMeetingMinutes = pattern?.meetings?.reduce((total: number, meeting: MeetingWithTime) => {
          return total + calculateDuration(meeting.startTime, meeting.endTime)
        }, 0) || 0

        // Total planned = sum of all capacities
        const histTotalPlannedMinutes = Object.values(histCapacityByType).reduce(
          (sum, mins) => sum + mins, 0,
        )

        setHistoricalData({
          accumulatedByType: accumulatedData.byType || {},
          accumulatedBySink: sinkData.bySink || {},
          capacityByType: histCapacityByType,
          meetingMinutes: histMeetingMinutes,
          totalPlannedMinutes: histTotalPlannedMinutes,
          accumulatedTotal: accumulatedData.total || 0,
        })
      } catch (error) {
        logger.ui.error('Failed to fetch historical work data', { error })
      } finally {
        setIsLoading(false)
      }
    }

    fetchHistoricalData()
  }, [selectedDate, initialDate, workPatterns])

  // Use historical data if loaded, otherwise use props
  const displayData = historicalData ?? {
    accumulatedByType,
    accumulatedBySink,
    capacityByType,
    meetingMinutes,
    totalPlannedMinutes,
    accumulatedTotal,
  }

  // Whether we're viewing today (show current/next block) or a historical date
  const isViewingToday = selectedDate === initialDate

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
            <span>{formatDateTitle(selectedDate, initialDate)}</span>
          </Space>
          <Space size="small">
            <Button
              size="small"
              type="secondary"
              icon={<IconLeft />}
              onClick={goToPreviousDay}
            />
            <DatePicker
              size="small"
              value={selectedDate}
              onChange={(dateString) => dateString && setSelectedDate(dateString as string)}
              style={{ width: 140 }}
              allowClear={false}
            />
            <Button
              size="small"
              type="secondary"
              icon={<IconRight />}
              onClick={goToNextDay}
            />
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
