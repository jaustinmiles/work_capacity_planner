import { useState, useEffect } from 'react'
import { Card, Space, Typography, Tag, Empty, Timeline, Badge } from '@arco-design/web-react'
import { IconClockCircle, IconDesktop, IconUserGroup, IconCalendar, IconMoon } from '@arco-design/web-react/icon'
import { ScheduledItem } from '../../utils/flexible-scheduler'
import { DailyWorkPattern } from '@shared/work-blocks-types'
import { getDatabase } from '../../services/database'
import dayjs from 'dayjs'

const { Title, Text } = Typography

interface DailyScheduleViewProps {
  date: string
  scheduledItems: ScheduledItem[]
  workPattern?: DailyWorkPattern
  style?: React.CSSProperties
}

export function DailyScheduleView({ date, scheduledItems, workPattern, style }: DailyScheduleViewProps) {
  const [blocks, setBlocks] = useState(workPattern?.blocks || [])
  const [meetings, setMeetings] = useState(workPattern?.meetings || [])

  useEffect(() => {
    if (workPattern) {
      setBlocks(workPattern.blocks || [])
      setMeetings(workPattern.meetings || [])
    } else {
      // Load work pattern for this specific date
      loadWorkPattern()
    }
  }, [date, workPattern])

  const loadWorkPattern = async () => {
    try {
      const db = getDatabase()
      const pattern = await db.getWorkPattern(date)
      if (pattern) {
        setBlocks(pattern.blocks || [])
        setMeetings(pattern.meetings || [])
      }
    } catch (error) {
      console.error('Failed to load work pattern:', error)
    }
  }

  // Sort items by start time
  const sortedItems = [...scheduledItems].sort((a, b) => 
    a.startTime.getTime() - b.startTime.getTime()
  )

  // Group items by time blocks
  const timeBlocks = blocks.map(block => {
    const blockStart = dayjs(`${date} ${block.startTime}`)
    const blockEnd = dayjs(`${date} ${block.endTime}`)
    
    const itemsInBlock = sortedItems.filter(item => {
      const itemStart = dayjs(item.startTime)
      return itemStart.isSame(blockStart, 'day') && 
             itemStart.isAfter(blockStart.subtract(1, 'minute')) &&
             itemStart.isBefore(blockEnd)
    })

    return {
      ...block,
      items: itemsInBlock
    }
  })

  // Find meetings that overlap with this day
  const dayMeetings = meetings.filter(meeting => {
    // For now, assume all meetings are on the same day
    // In future, handle cross-day meetings (like sleep blocks)
    return true
  })

  const getTotalMinutes = (items: ScheduledItem[]) => {
    return items.reduce((sum, item) => sum + item.duration, 0)
  }

  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    return hours > 0 ? `${hours}h ${mins > 0 ? `${mins}m` : ''}` : `${mins}m`
  }

  if (blocks.length === 0 && scheduledItems.length === 0) {
    return (
      <Card style={style}>
        <Empty description="No schedule for this day" />
      </Card>
    )
  }

  return (
    <Card style={style}>
      <Space direction="vertical" style={{ width: '100%' }} size="medium">
        <Title heading={6}>
          <Space>
            <IconCalendar />
            Daily Schedule - {dayjs(date).format('MMM D, YYYY')}
          </Space>
        </Title>

        {/* Summary Stats */}
        <Space>
          <Badge 
            count={`${formatDuration(getTotalMinutes(sortedItems.filter(i => i.type === 'task' && (i.originalItem as any).type === 'focused')))}`}
            style={{ backgroundColor: '#165DFF' }}
          />
          <Text type="secondary">Focused</Text>
          <Badge 
            count={`${formatDuration(getTotalMinutes(sortedItems.filter(i => i.type === 'task' && (i.originalItem as any).type === 'admin')))}`}
            style={{ backgroundColor: '#00B42A' }}
          />
          <Text type="secondary">Admin</Text>
        </Space>

        {/* Timeline View */}
        <Timeline>
          {timeBlocks.map((block, index) => {
            const hasItems = block.items.length > 0
            const blockIcon = block.type === 'focused' ? <IconDesktop /> : 
                            block.type === 'admin' ? <IconUserGroup /> : 
                            <IconClockCircle />

            return (
              <Timeline.Item 
                key={block.id} 
                label={`${block.startTime} - ${block.endTime}`}
                dotColor={hasItems ? 'blue' : 'gray'}
              >
                <Space direction="vertical" style={{ width: '100%' }}>
                  <Space>
                    {blockIcon}
                    <Text style={{ fontWeight: 500 }}>
                      {block.type === 'mixed' ? 'Mixed Work Block' : 
                       block.type === 'focused' ? 'Focus Block' : 
                       block.type === 'admin' ? 'Admin Block' : 
                       'Personal Time'}
                    </Text>
                    {!hasItems && (
                      <Tag size="small" color="gray">Available</Tag>
                    )}
                  </Space>

                  {block.items.length > 0 && (
                    <div style={{ marginLeft: 24 }}>
                      {block.items.map(item => (
                        <div 
                          key={item.id}
                          style={{
                            padding: '8px 12px',
                            marginBottom: 8,
                            background: '#f5f5f5',
                            borderRadius: 4,
                            borderLeft: `3px solid ${item.color}`
                          }}
                        >
                          <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                            <Text style={{ fontWeight: 500 }}>{item.name}</Text>
                            <Text type="secondary" style={{ fontSize: 12 }}>
                              {formatDuration(item.duration)}
                            </Text>
                          </Space>
                          {item.type === 'workflow-step' && item.stepIndex !== undefined && (
                            <Text type="secondary" style={{ fontSize: 12 }}>
                              Step {item.stepIndex + 1} of workflow
                            </Text>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </Space>
              </Timeline.Item>
            )
          })}

          {/* Show meetings/blocked time */}
          {dayMeetings.map(meeting => {
            const isSleep = meeting.name.toLowerCase() === 'sleep'
            return (
              <Timeline.Item
                key={meeting.id}
                label={`${meeting.startTime} - ${meeting.endTime}`}
                dotColor={meeting.type === 'blocked' ? 'red' : 'orange'}
              >
                <Space>
                  {isSleep ? <IconMoon /> : <IconCalendar />}
                  <Text style={{ fontWeight: 500 }}>{meeting.name}</Text>
                  <Tag size="small" color={
                    meeting.type === 'meeting' ? 'blue' :
                    meeting.type === 'blocked' ? 'red' :
                    meeting.type === 'break' ? 'green' : 'orange'
                  }>
                    {meeting.type}
                  </Tag>
                </Space>
              </Timeline.Item>
            )
          })}
        </Timeline>

        {/* Unscheduled items (if any) */}
        {sortedItems.some(item => !timeBlocks.some(block => block.items.includes(item))) && (
          <>
            <Title heading={6}>Outside Work Hours</Title>
            {sortedItems
              .filter(item => !timeBlocks.some(block => block.items.includes(item)))
              .map(item => (
                <div 
                  key={item.id}
                  style={{
                    padding: '8px 12px',
                    marginBottom: 8,
                    background: '#fff7e8',
                    borderRadius: 4,
                    borderLeft: `3px solid ${item.color}`
                  }}
                >
                  <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                    <div>
                      <Text style={{ fontWeight: 500 }}>{item.name}</Text>
                      <Text type="secondary" style={{ fontSize: 12, marginLeft: 8 }}>
                        {dayjs(item.startTime).format('h:mm A')} - {formatDuration(item.duration)}
                      </Text>
                    </div>
                  </Space>
                </div>
              ))}
          </>
        )}
      </Space>
    </Card>
  )
}