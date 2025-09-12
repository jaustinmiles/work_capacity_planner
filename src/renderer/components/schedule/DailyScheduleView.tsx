import { useState, useEffect } from 'react'
import { TaskType } from '@shared/enums'
import { Card, Space, Typography, Tag, Empty, Timeline, Badge } from '@arco-design/web-react'
import { IconClockCircle, IconDesktop, IconUserGroup, IconCalendar, IconMoon } from '@arco-design/web-react/icon'
import { DailyWorkPattern } from '@shared/work-blocks-types'

// UI representation of a scheduled item - different from the adapter's ScheduledItem
// which wraps a Task object. This is a flattened structure for UI components.
interface ScheduledItem {
  id: string
  name: string
  type: 'task' | 'workflow-step' | 'async-wait' | 'blocked-time' | 'meeting' | 'break'
  priority: number
  duration: number
  startTime: Date
  endTime: Date
  color: string
  workflowId?: string
  workflowName?: string
  stepIndex?: number
  deadline?: Date
  originalItem?: any
}
import { getDatabase } from '../../services/database'
import dayjs from 'dayjs'
import { logger } from '../../utils/logger'


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
      logger.ui.error('Failed to load work pattern:', error)
    }
  }

  // Sort items by start time
  const sortedItems = [...scheduledItems].sort((a, b) =>
    a.startTime.getTime() - b.startTime.getTime(),
  )

  // Sort blocks by start time to ensure chronological order
  const sortedBlocks = [...blocks].sort((a, b) => {
    const timeA = dayjs(`2000-01-01 ${a.startTime}`).valueOf()
    const timeB = dayjs(`2000-01-01 ${b.startTime}`).valueOf()
    return timeA - timeB
  })

  // Group items by time blocks
  const timeBlocks = sortedBlocks.map(block => {
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
      items: itemsInBlock,
    }
  })

  // Find meetings that overlap with this day and sort by start time
  const dayMeetings = meetings.filter(__meeting => {
    // For now, assume all meetings are on the same day
    // In future, handle cross-day meetings (like sleep blocks)
    return true
  }).sort((a, b) => {
    const timeA = dayjs(`2000-01-01 ${a.startTime}`).valueOf()
    const timeB = dayjs(`2000-01-01 ${b.startTime}`).valueOf()
    return timeA - timeB
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
            count={`${formatDuration(getTotalMinutes(sortedItems.filter(i => i.type === 'task' && (i.originalItem as any).type === TaskType.Focused)))}`}
            style={{ backgroundColor: '#165DFF' }}
          />
          <Text type="secondary">Focused</Text>
          <Badge
            count={`${formatDuration(getTotalMinutes(sortedItems.filter(i => i.type === 'task' && (i.originalItem as any).type === TaskType.Admin)))}`}
            style={{ backgroundColor: '#00B42A' }}
          />
          <Text type="secondary">Admin</Text>
        </Space>

        {/* Timeline View - Combine blocks and meetings in chronological order */}
        <Timeline>
          {(() => {
            // Combine blocks and meetings into a single timeline
            const timelineItems: Array<{ type: 'block' | 'meeting', data: any, startTime: string }> = [
              ...timeBlocks.map(block => ({
                type: 'block' as const,
                data: block,
                startTime: block.startTime,
              })),
              ...dayMeetings.map(meeting => ({
                type: 'meeting' as const,
                data: meeting,
                startTime: meeting.startTime,
              })),
            ]

            // Sort all items chronologically
            timelineItems.sort((a, b) => {
              const timeA = dayjs(`2000-01-01 ${a.startTime}`).valueOf()
              const timeB = dayjs(`2000-01-01 ${b.startTime}`).valueOf()
              return timeA - timeB
            })

            return timelineItems.map((item) => {
              if (item.type === 'block') {
                const block = item.data
                const hasItems = block.items.length > 0
                const blockIcon = block.type === TaskType.Focused ? <IconDesktop /> :
                                block.type === TaskType.Admin ? <IconUserGroup /> :
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
                       block.type === 'flexible' ? 'Flexible Work Block' :
                       block.type === TaskType.Focused ? 'Focus Block' :
                       block.type === TaskType.Admin ? 'Admin Block' :
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
                            borderLeft: `3px solid ${item.color}`,
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
          } else {
            // Render meeting
            const meeting = item.data
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
          }
        })
      })()}
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
                    borderLeft: `3px solid ${item.color}`,
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
