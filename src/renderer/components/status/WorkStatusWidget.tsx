import { useState, useEffect } from 'react'
import { Card, Space, Typography, Progress, Tag, Button, Statistic } from '@arco-design/web-react'
import { IconSchedule, IconEdit, IconCaretRight } from '@arco-design/web-react/icon'
import { WorkBlock, getCurrentBlock, getNextBlock } from '@shared/work-blocks-types'
import { calculateDuration } from '@shared/time-utils'
import { getDatabase } from '../../services/database'
import { appEvents, EVENTS } from '../../utils/events'
import dayjs from 'dayjs'

const { Text } = Typography

interface WorkStatusWidgetProps {
  onEditSchedule?: () => void
}

export function WorkStatusWidget({ onEditSchedule }: WorkStatusWidgetProps) {
  const [currentDate] = useState(dayjs().format('YYYY-MM-DD'))
  const [pattern, setPattern] = useState<any>(null)
  const [accumulated, setAccumulated] = useState({ focusMinutes: 0, adminMinutes: 0 })
  const [currentBlock, setCurrentBlock] = useState<WorkBlock | null>(null)
  const [nextBlock, setNextBlock] = useState<WorkBlock | null>(null)
  const [isTracking, setIsTracking] = useState(false)

  useEffect(() => {
    loadWorkData()
    const interval = setInterval(loadWorkData, 60000) // Update every minute
    
    // Listen for time logging events
    const handleTimeLogged = () => {
      loadWorkData()
    }
    
    appEvents.on(EVENTS.TIME_LOGGED, handleTimeLogged)
    
    return () => {
      clearInterval(interval)
      appEvents.off(EVENTS.TIME_LOGGED, handleTimeLogged)
    }
  }, [currentDate])

  useEffect(() => {
    if (pattern) {
      setCurrentBlock(getCurrentBlock(pattern.blocks))
      setNextBlock(getNextBlock(pattern.blocks))
    }
  }, [pattern])

  const loadWorkData = async () => {
    try {
      const db = getDatabase()
      const [patternData, accumulatedData] = await Promise.all([
        db.getWorkPattern(currentDate),
        db.getTodayAccumulated(currentDate),
      ])

      setPattern(patternData)
      setAccumulated(accumulatedData)
    } catch (error) {
      console.error('Failed to load work data:', error)
    }
  }

  const formatMinutes = (minutes: number) => {
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`
  }

  const getBlockDuration = (block: WorkBlock) => {
    return calculateDuration(block.startTime, block.endTime)
  }

  const getBlockCapacity = (block: WorkBlock) => {
    const duration = getBlockDuration(block)

    if (block.capacity) {
      return {
        focusMinutes: block.capacity.focusMinutes || 0,
        adminMinutes: block.capacity.adminMinutes || 0,
      }
    } else if (block.type === 'focused') {
      return { focusMinutes: duration, adminMinutes: 0 }
    } else if (block.type === 'admin') {
      return { focusMinutes: 0, adminMinutes: duration }
    } else {
      return { focusMinutes: duration / 2, adminMinutes: duration / 2 }
    }
  }

  const handleStartTracking = async () => {
    if (!currentBlock) return
    
    // For now, just indicate tracking state
    // Real work session creation happens when logging time
    setIsTracking(true)
  }

  const handleStopTracking = async () => {
    setIsTracking(false)
    loadWorkData() // Refresh accumulated time
  }

  if (!pattern) {
    return (
      <Card>
        <Space direction="vertical" style={{ width: '100%', textAlign: 'center' }}>
          <Text type="secondary">No work schedule defined for today</Text>
          <Button type="primary" onClick={onEditSchedule}>
            Create Schedule
          </Button>
        </Space>
      </Card>
    )
  }

  const totalCapacity = pattern.blocks.reduce((acc: any, block: WorkBlock) => {
    const capacity = getBlockCapacity(block)
    acc.focusMinutes += capacity.focusMinutes
    acc.adminMinutes += capacity.adminMinutes
    return acc
  }, { focusMinutes: 0, adminMinutes: 0 })

  const focusProgress = totalCapacity.focusMinutes > 0
    ? Math.round((accumulated.focusMinutes / totalCapacity.focusMinutes) * 100)
    : 0
  const adminProgress = totalCapacity.adminMinutes > 0
    ? Math.round((accumulated.adminMinutes / totalCapacity.adminMinutes) * 100)
    : 0

  return (
    <Card
      title={
        <Space>
          <IconSchedule />
          <Text>Today's Progress</Text>
        </Space>
      }
      extra={
        <Space>
          {onEditSchedule && (
            <Button size="small" icon={<IconEdit />} onClick={onEditSchedule}>
              Edit Schedule
            </Button>
          )}
        </Space>
      }
    >
      <Space direction="vertical" style={{ width: '100%' }} size="large">
        {/* Current Status */}
        <div>
          {currentBlock ? (
            <Space direction="vertical" style={{ width: '100%' }}>
              <Text type="secondary">Current Block</Text>
              <Space>
                <Tag color="green" icon={<IconCaretRight />}>
                  {currentBlock.startTime} - {currentBlock.endTime}
                </Tag>
                <Tag>
                  {currentBlock.type === 'focused' ? '🎯 Focused' :
                   currentBlock.type === 'admin' ? '📋 Admin' : '🔄 Mixed'}
                </Tag>
              </Space>
              {!isTracking ? (
                <Button type="primary" onClick={handleStartTracking}>
                  Start Tracking
                </Button>
              ) : (
                <Button status="warning" onClick={handleStopTracking}>
                  Stop Tracking
                </Button>
              )}
            </Space>
          ) : (
            <Space direction="vertical" style={{ width: '100%' }}>
              <Text type="secondary">Not in work hours</Text>
              {nextBlock && (
                <Text>
                  Next block starts at <Tag>{nextBlock.startTime}</Tag>
                </Text>
              )}
            </Space>
          )}
        </div>

        {/* Progress */}
        <div>
          <Space direction="vertical" style={{ width: '100%' }}>
            <div>
              <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                <Text>Focus Time</Text>
                <Text>{formatMinutes(accumulated.focusMinutes)} / {formatMinutes(totalCapacity.focusMinutes)}</Text>
              </Space>
              <Progress percent={focusProgress} color={focusProgress >= 100 ? '#00b42a' : '#165dff'} />
            </div>
            <div>
              <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                <Text>Admin Time</Text>
                <Text>{formatMinutes(accumulated.adminMinutes)} / {formatMinutes(totalCapacity.adminMinutes)}</Text>
              </Space>
              <Progress percent={adminProgress} color={adminProgress >= 100 ? '#00b42a' : '#ff7d00'} />
            </div>
          </Space>
        </div>

        {/* Quick Stats */}
        <Space style={{ width: '100%', justifyContent: 'space-around' }}>
          <Statistic
            title="Remaining Focus"
            value={Math.max(0, totalCapacity.focusMinutes - accumulated.focusMinutes)}
            suffix="min"
          />
          <Statistic
            title="Remaining Admin"
            value={Math.max(0, totalCapacity.adminMinutes - accumulated.adminMinutes)}
            suffix="min"
          />
        </Space>

        {/* Active Session */}
        {isTracking && (
          <Card size="small" style={{ background: '#f0f5ff' }}>
            <Space>
              <IconSchedule style={{ animation: 'pulse 2s infinite' }} />
              <Text>
                Tracking work time...
              </Text>
              <Text type="secondary">
                Remember to log your time when finished
              </Text>
            </Space>
          </Card>
        )}
      </Space>
    </Card>
  )
}
