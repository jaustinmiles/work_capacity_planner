/**
 * TimeSinkAnalytics Component
 *
 * View accumulated time per time sink over different periods.
 */

import React, { useState, useEffect, useMemo } from 'react'
import {
  Card,
  Space,
  Typography,
  Select,
  Progress,
  Statistic,
  Empty,
  Spin,
} from '@arco-design/web-react'
import {
  useTimeSinkStore,
  useSortedTimeSinks,
} from '../../store/useTimeSinkStore'
import { TimeSinkAccumulatedResult } from '@shared/time-sink-types'
import { getCurrentTime } from '@shared/time-provider'
import { dateToYYYYMMDD } from '@shared/time-utils'
import { formatMinutes } from '@shared/time-utils'

const { Title, Text } = Typography
const Option = Select.Option

// ============================================================================
// Types
// ============================================================================

type DateRange = 'today' | 'week' | 'month'

interface DateRangeOption {
  value: DateRange
  label: string
}

// ============================================================================
// Constants
// ============================================================================

const DATE_RANGE_OPTIONS: DateRangeOption[] = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This Week' },
  { value: 'month', label: 'This Month' },
]

// ============================================================================
// Helper Functions
// ============================================================================

function getDateRange(range: DateRange): { startDate: string; endDate: string } {
  const now = getCurrentTime()
  const endDate = dateToYYYYMMDD(now)

  let startDate: string

  switch (range) {
    case 'today':
      startDate = endDate
      break
    case 'week': {
      const weekAgo = new Date(now)
      weekAgo.setDate(weekAgo.getDate() - 7)
      startDate = dateToYYYYMMDD(weekAgo)
      break
    }
    case 'month': {
      const monthAgo = new Date(now)
      monthAgo.setDate(monthAgo.getDate() - 30)
      startDate = dateToYYYYMMDD(monthAgo)
      break
    }
    default:
      startDate = endDate
  }

  return { startDate, endDate }
}

// ============================================================================
// Main Component
// ============================================================================

export function TimeSinkAnalytics(): React.ReactElement {
  const sinks = useSortedTimeSinks()
  const getAccumulatedTime = useTimeSinkStore((state) => state.getAccumulatedTime)

  const [dateRange, setDateRange] = useState<DateRange>('today')
  const [accumulated, setAccumulated] = useState<TimeSinkAccumulatedResult | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Load accumulated time when date range changes
  useEffect(() => {
    const loadData = async (): Promise<void> => {
      setIsLoading(true)
      try {
        const { startDate, endDate } = getDateRange(dateRange)
        const data = await getAccumulatedTime(startDate, endDate)
        setAccumulated(data)
      } catch {
        setAccumulated({ bySink: {}, total: 0 })
      } finally {
        setIsLoading(false)
      }
    }

    loadData()
  }, [dateRange, getAccumulatedTime])

  // Calculate max value for progress normalization
  const maxMinutes = useMemo(() => {
    if (!accumulated) return 0
    const values = Object.values(accumulated.bySink)
    return Math.max(...values, 1) // Prevent division by zero
  }, [accumulated])

  // Sort sinks by accumulated time (descending)
  const sortedSinkData = useMemo(() => {
    if (!accumulated) return []

    return sinks
      .map((sink) => ({
        sink,
        minutes: accumulated.bySink[sink.id] || 0,
      }))
      .sort((a, b) => b.minutes - a.minutes)
  }, [sinks, accumulated])

  if (sinks.length === 0) {
    return (
      <Card>
        <Empty description="No time sinks defined" />
      </Card>
    )
  }

  return (
    <Card>
      <Space direction="vertical" style={{ width: '100%' }}>
        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
          <Title heading={6} style={{ margin: 0 }}>
            📊 Time Sink Analytics
          </Title>
          <Select
            value={dateRange}
            onChange={(value: DateRange) => setDateRange(value)}
            style={{ width: 140 }}
          >
            {DATE_RANGE_OPTIONS.map((option) => (
              <Option key={option.value} value={option.value}>
                {option.label}
              </Option>
            ))}
          </Select>
        </Space>

        {isLoading ? (
          <div style={{ textAlign: 'center', padding: 24 }}>
            <Spin />
          </div>
        ) : accumulated && accumulated.total > 0 ? (
          <>
            {/* Total Summary */}
            <div style={{ background: '#f5f5f5', padding: 12, borderRadius: 4 }}>
              <Statistic
                title={`Total Time (${DATE_RANGE_OPTIONS.find((o) => o.value === dateRange)?.label})`}
                value={accumulated.total}
                suffix="min"
              />
              <Text type="secondary" style={{ fontSize: '12px' }}>
                {formatMinutes(accumulated.total)}
              </Text>
            </div>

            {/* Per-Sink Breakdown */}
            <Space direction="vertical" style={{ width: '100%', marginTop: 8 }}>
              {sortedSinkData.map(({ sink, minutes }) => {
                const percent = Math.round((minutes / maxMinutes) * 100)

                return (
                  <div key={sink.id}>
                    <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 4 }}>
                      <Text>
                        {sink.emoji} {sink.name}
                      </Text>
                      <Text>{formatMinutes(minutes)}</Text>
                    </Space>
                    <Progress
                      percent={percent}
                      color={sink.color}
                      showText={false}
                    />
                  </div>
                )
              })}
            </Space>
          </>
        ) : (
          <Empty description={`No time logged ${dateRange === 'today' ? 'today' : `this ${dateRange}`}`} />
        )}
      </Space>
    </Card>
  )
}
