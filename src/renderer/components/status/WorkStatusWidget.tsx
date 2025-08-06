import React, { useState, useEffect } from 'react'
import { Card, Space, Typography, Progress, Tag, Button, Statistic } from '@arco-design/web-react'
import { IconSchedule, IconCheck, IconEdit, IconStop, IconCaretRight } from '@arco-design/web-react/icon'
import { WorkBlock, getCurrentBlock, getNextBlock } from '@shared/work-blocks-types'
import { getDatabase } from '../../services/database'
import dayjs from 'dayjs'

const { Title, Text } = Typography

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
  const [currentSession, setCurrentSession] = useState<any>(null)

  useEffect(() => {
    loadWorkData()
    const interval = setInterval(loadWorkData, 60000) // Update every minute
    return () => clearInterval(interval)
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
    const [startHour, startMin] = block.startTime.split(':').map(Number)
    const [endHour, endMin] = block.endTime.split(':').map(Number)
    return (endHour * 60 + endMin) - (startHour * 60 + startMin)
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

    const db = getDatabase()
    const session = await db.createWorkSession({
      patternId: pattern.id,
      type: 'focused', // Default, user can change
      startTime: new Date(),
      plannedMinutes: 30, // Default pomodoro
    })

    setCurrentSession(session)
    setIsTracking(true)
  }

  const handleStopTracking = async () => {
    if (!currentSession) return

    const db = getDatabase()
    const endTime = new Date()
    const actualMinutes = Math.round((endTime.getTime() - new Date(currentSession.startTime).getTime()) / 60000)

    await db.updateWorkSession(currentSession.id, {
      endTime,
      actualMinutes,
    })

    setCurrentSession(null)
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
            valueStyle={{ fontSize: 20 }}
          />
          <Statistic
            title="Remaining Admin"
            value={Math.max(0, totalCapacity.adminMinutes - accumulated.adminMinutes)}
            suffix="min"
            valueStyle={{ fontSize: 20 }}
          />
        </Space>

        {/* Active Session */}
        {currentSession && (
          <Card size="small" style={{ background: '#f0f5ff' }}>
            <Space>
              <IconSchedule style={{ animation: 'pulse 2s infinite' }} />
              <Text>
                Tracking: {currentSession.type === 'focused' ? 'Focus' : 'Admin'} work
              </Text>
              <Text type="secondary">
                Started {dayjs(currentSession.startTime).format('HH:mm')}
              </Text>
            </Space>
          </Card>
        )}
      </Space>
    </Card>
  )
}
