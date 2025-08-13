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
  const [accumulated, setAccumulated] = useState({ focused: 0, admin: 0 })
  const [currentBlock, setCurrentBlock] = useState<WorkBlock | null>(null)
  const [nextBlock, setNextBlock] = useState<WorkBlock | null>(null)

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
    // Handle NaN or invalid values
    if (!minutes || isNaN(minutes)) {
      return '0m'
    }
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    return hours > 0 ? `${hours}h ${mins > 0 ? `${mins}m` : ''}` : `${mins}m`
  }

  const getBlockDuration = (block: WorkBlock) => {
    return calculateDuration(block.startTime, block.endTime)
  }

  const getBlockCapacity = (block: WorkBlock) => {
    const duration = getBlockDuration(block)

    if (block.capacity) {
      return {
        focused: block.capacity.focused || 0,
        admin: block.capacity.admin || 0,
      }
    } else if (block.type === 'focused') {
      return { focused: duration, admin: 0 }
    } else if (block.type === 'admin') {
      return { focused: 0, admin: duration }
    } else {
      return { focused: duration / 2, admin: duration / 2 }
    }
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
    acc.focused += capacity.focused
    acc.admin += capacity.admin
    return acc
  }, { focused: 0, admin: 0 })

  const focusProgress = totalCapacity.focused > 0
    ? Math.round((accumulated.focused / totalCapacity.focused) * 100)
    : 0
  const adminProgress = totalCapacity.admin > 0
    ? Math.round((accumulated.admin / totalCapacity.admin) * 100)
    : 0

  return (
    <Card
      title={
        <Space>
          <IconSchedule />
          <Text>Work Capacity - {dayjs().format('MMM D')}</Text>
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
        {/* Planned Capacity */}
        <div style={{ background: '#f5f5f5', padding: '12px', borderRadius: '4px' }}>
          <Space direction="vertical" style={{ width: '100%' }}>
            <Text strong>Today's Planned Capacity</Text>
            <Space style={{ width: '100%', justifyContent: 'space-between' }}>
              <Text>🎯 Focus Time:</Text>
              <Tag color="blue">{formatMinutes(totalCapacity.focused)}</Tag>
            </Space>
            <Space style={{ width: '100%', justifyContent: 'space-between' }}>
              <Text>📋 Admin Time:</Text>
              <Tag color="orange">{formatMinutes(totalCapacity.admin)}</Tag>
            </Space>
          </Space>
        </div>

        {/* Current/Next Block */}
        <div>
          {currentBlock ? (
            <Space direction="vertical" style={{ width: '100%' }}>
              <Text type="secondary">Currently in Work Block</Text>
              <Space>
                <Tag color="green" icon={<IconCaretRight />}>
                  {currentBlock.startTime} - {currentBlock.endTime}
                </Tag>
                <Tag>
                  {currentBlock.type === 'focused' ? '🎯 Focused' :
                   currentBlock.type === 'admin' ? '📋 Admin' : '🔄 Mixed'}
                </Tag>
              </Space>
            </Space>
          ) : (
            <Space direction="vertical" style={{ width: '100%' }}>
              {nextBlock ? (
                <>
                  <Text type="secondary">Next Work Block</Text>
                  <Space>
                    <Tag color="cyan">
                      {nextBlock.startTime} - {nextBlock.endTime}
                    </Tag>
                    <Tag>
                      {nextBlock.type === 'focused' ? '🎯 Focus' :
                       nextBlock.type === 'admin' ? '📋 Admin' : '🔄 Mixed'}
                    </Tag>
                  </Space>
                  <Text type="secondary" style={{ fontSize: '12px' }}>
                    {(() => {
                      const capacity = getBlockCapacity(nextBlock)
                      return `Capacity: ${formatMinutes(capacity.focused)} focus, ${formatMinutes(capacity.admin)} admin`
                    })()}
                  </Text>
                </>
              ) : (
                <Text type="secondary">No more work blocks today</Text>
              )}
            </Space>
          )}
        </div>

        {/* Progress */}
        <div>
          <Text type="secondary" style={{ marginBottom: '8px', display: 'block' }}>Completed Today</Text>
          <Space direction="vertical" style={{ width: '100%' }}>
            <div>
              <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                <Text>Focus</Text>
                <Text>{formatMinutes(accumulated.focused)} / {formatMinutes(totalCapacity.focused)}</Text>
              </Space>
              <Progress percent={focusProgress} color={focusProgress >= 100 ? '#00b42a' : '#165dff'} />
            </div>
            <div>
              <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                <Text>Admin</Text>
                <Text>{formatMinutes(accumulated.admin)} / {formatMinutes(totalCapacity.admin)}</Text>
              </Space>
              <Progress percent={adminProgress} color={adminProgress >= 100 ? '#00b42a' : '#ff7d00'} />
            </div>
          </Space>
        </div>

        {/* Quick Stats */}
        <Space style={{ width: '100%', justifyContent: 'space-around' }}>
          <Statistic
            title="Remaining Focus"
            value={Math.max(0, totalCapacity.focused - accumulated.focused)}
            suffix="min"
          />
          <Statistic
            title="Remaining Admin"
            value={Math.max(0, totalCapacity.admin - accumulated.admin)}
            suffix="min"
          />
        </Space>

      </Space>
    </Card>
  )
}
