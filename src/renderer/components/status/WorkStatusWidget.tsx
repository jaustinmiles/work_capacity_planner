import { useState, useEffect } from 'react'
import { Card, Space, Typography, Progress, Tag, Button, Statistic } from '@arco-design/web-react'
import { IconSchedule, IconEdit, IconCaretRight } from '@arco-design/web-react/icon'
import { WorkBlock, getCurrentBlock, getNextBlock } from '@shared/work-blocks-types'
import { calculateDuration } from '@shared/time-utils'
import { getDatabase } from '../../services/database'
import { appEvents, EVENTS } from '../../utils/events'
import dayjs from 'dayjs'
import { logger } from '../../utils/logger'


const { Text } = Typography

interface WorkStatusWidgetProps {
  onEditSchedule?: () => void
}

export function WorkStatusWidget({ onEditSchedule }: WorkStatusWidgetProps) {
  const [currentDate] = useState(dayjs().format('YYYY-MM-DD'))
  const [pattern, setPattern] = useState<any>(null)
  const [accumulated, setAccumulated] = useState({ focused: 0, admin: 0 })
  const [meetingMinutes, setMeetingMinutes] = useState(0)
  const [currentBlock, setCurrentBlock] = useState<WorkBlock | null>(null)
  const [nextBlock, setNextBlock] = useState<WorkBlock | null>(null)
  // Tracking state removed - handled through time logging modal

  useEffect(() => {
    loadWorkData()
    const interval = setInterval(loadWorkData, 60000) // Update every minute

    // Listen for time logging events
    const handleTimeLogged = () => {
      loadWorkData()
    }

    // Listen for workflow updates (which might change step types)
    const handleWorkflowUpdated = () => {
      loadWorkData()
    }

    appEvents.on(EVENTS.TIME_LOGGED, handleTimeLogged)
    appEvents.on(EVENTS.WORKFLOW_UPDATED, handleWorkflowUpdated)

    return () => {
      clearInterval(interval)
      appEvents.off(EVENTS.TIME_LOGGED, handleTimeLogged)
      appEvents.off(EVENTS.WORKFLOW_UPDATED, handleWorkflowUpdated)
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
      setAccumulated({
        focused: accumulatedData.focused || 0,
        admin: accumulatedData.admin || 0,
      })

      // Calculate meeting time from work sessions
      let totalMeetingMinutes = 0
      if (patternData && patternData.meetings) {
        patternData.meetings.forEach((meeting: any) => {
          if (meeting.type === 'meeting') {
            const [startHour, startMin] = meeting.startTime.split(':').map(Number)
            const [endHour, endMin] = meeting.endTime.split(':').map(Number)
            const startMinutes = startHour * 60 + startMin
            const endMinutes = endHour * 60 + endMin
            const duration = endMinutes - startMinutes
            totalMeetingMinutes += duration > 0 ? duration : 0
          }
        })
      }
      setMeetingMinutes(totalMeetingMinutes)
    } catch (error) {
      logger.ui.error('Failed to load work data:', error)
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

  // Tracking functions removed - functionality handled through time logging modal

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
    ? Math.round((accumulated.focused / totalCapacity.focusMinutes) * 100)
    : 0
  const adminProgress = totalCapacity.adminMinutes > 0
    ? Math.round((accumulated.admin / totalCapacity.adminMinutes) * 100)
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
            <Text style={{ fontWeight: 600 }}>{"Today's Planned Capacity"}</Text>
            <Space style={{ width: '100%', justifyContent: 'space-between' }}>
              <Text>🎯 Focus Time:</Text>
              <Tag color="blue">{formatMinutes(totalCapacity.focusMinutes)}</Tag>
            </Space>
            <Space style={{ width: '100%', justifyContent: 'space-between' }}>
              <Text>📋 Admin Time:</Text>
              <Tag color="orange">{formatMinutes(totalCapacity.adminMinutes)}</Tag>
            </Space>
            <Space style={{ width: '100%', justifyContent: 'space-between' }}>
              <Text>🤝 Meeting Time:</Text>
              <Tag color="purple">{formatMinutes(meetingMinutes)}</Tag>
            </Space>
            <div style={{ borderTop: '1px solid #e5e5e5', marginTop: 8, paddingTop: 8 }}>
              <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                <Text style={{ fontWeight: 600 }}>📊 Total Time:</Text>
                <Tag color="green">{formatMinutes(totalCapacity.focusMinutes + totalCapacity.adminMinutes + meetingMinutes)}</Tag>
              </Space>
            </div>
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
                   currentBlock.type === 'admin' ? '📋 Admin' :
                   currentBlock.type === 'personal' ? '👤 Personal' : '🔄 Mixed'}
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
                       nextBlock.type === 'admin' ? '📋 Admin' :
                       nextBlock.type === 'personal' ? '👤 Personal' : '🔄 Mixed'}
                    </Tag>
                  </Space>
                  <Text type="secondary" style={{ fontSize: '12px' }}>
                    {(() => {
                      const capacity = getBlockCapacity(nextBlock)
                      return `Capacity: ${formatMinutes(capacity.focusMinutes)} focus, ${formatMinutes(capacity.adminMinutes)} admin`
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
                <Text>{formatMinutes(accumulated.focused)} / {formatMinutes(totalCapacity.focusMinutes)}</Text>
              </Space>
              <Progress percent={focusProgress} color={focusProgress >= 100 ? '#00b42a' : '#165dff'} />
            </div>
            <div>
              <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                <Text>Admin</Text>
                <Text>{formatMinutes(accumulated.admin)} / {formatMinutes(totalCapacity.adminMinutes)}</Text>
              </Space>
              <Progress percent={adminProgress} color={adminProgress >= 100 ? '#00b42a' : '#ff7d00'} />
            </div>
            <div style={{ borderTop: '1px solid #f0f0f0', marginTop: 8, paddingTop: 8 }}>
              <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                <Text style={{ fontWeight: 600 }}>Total Logged</Text>
                <Text style={{ fontWeight: 600 }}>
                  {formatMinutes(accumulated.focused + accumulated.admin)}
                  {meetingMinutes > 0 && ` (+ ${formatMinutes(meetingMinutes)} meetings)`}
                </Text>
              </Space>
            </div>
          </Space>
        </div>

        {/* Quick Stats */}
        <Space style={{ width: '100%', justifyContent: 'space-around' }}>
          <Statistic
            title="Remaining Focus"
            value={Math.max(0, totalCapacity.focusMinutes - accumulated.focused)}
            suffix="min"
          />
          <Statistic
            title="Remaining Admin"
            value={Math.max(0, totalCapacity.adminMinutes - accumulated.admin)}
            suffix="min"
          />
        </Space>

      </Space>
    </Card>
  )
}
