import React, { useMemo } from 'react'
import { Card, Typography, Space, Tag, Tooltip, Progress, Button, Empty } from '@arco-design/web-react'
import { IconCalendar, IconClockCircle, IconPlayArrow, IconPause } from '@arco-design/web-react/icon'
import { ScheduledWorkItem, WeeklySchedule } from '@shared/scheduling-models'
import './Timeline.css'

const { Title, Text } = Typography

interface TimelineProps {
  weeklySchedule: WeeklySchedule | null
  onItemClick?: (item: ScheduledWorkItem) => void
  onStartItem?: (item: ScheduledWorkItem) => void
  onPauseItem?: (item: ScheduledWorkItem) => void
}

export const Timeline: React.FC<TimelineProps> = ({
  weeklySchedule,
  onItemClick,
  onStartItem,
  onPauseItem
}) => {
  const timelineData = useMemo(() => {
    if (!weeklySchedule) return null

    // Group scheduled items by day
    const itemsByDay = new Map<string, ScheduledWorkItem[]>()
    
    weeklySchedule.scheduledItems.forEach(item => {
      const dayKey = item.scheduledDate.toDateString()
      if (!itemsByDay.has(dayKey)) {
        itemsByDay.set(dayKey, [])
      }
      itemsByDay.get(dayKey)!.push(item)
    })

    // Sort items within each day by start time
    itemsByDay.forEach(items => {
      items.sort((a, b) => a.scheduledStartTime.getTime() - b.scheduledStartTime.getTime())
    })

    return { itemsByDay, weeklySchedule }
  }, [weeklySchedule])

  if (!timelineData || timelineData.itemsByDay.size === 0) {
    return (
      <Card>
        <Empty
          description={
            <div>
              <Text>No scheduled items for this week</Text>
              <div style={{ marginTop: 8 }}>
                <Text type="secondary">
                  Add tasks and workflows to see them on the timeline.
                </Text>
              </div>
            </div>
          }
        />
      </Card>
    )
  }

  const { itemsByDay, weeklySchedule: schedule } = timelineData

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: false 
    })
  }

  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    if (hours > 0) {
      return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`
    }
    return `${mins}m`
  }

  const getItemTypeColor = (type: 'focused' | 'admin') => {
    return type === 'focused' ? '#165DFF' : '#00B42A'
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return '#00B42A'
      case 'in_progress': return '#FF7D00'
      case 'scheduled': return '#165DFF'
      case 'waiting': return '#86909C'
      default: return '#C9CDD4'
    }
  }

  return (
    <div className="timeline-container">
      {/* Timeline Header */}
      <Card className="timeline-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <Title heading={5} style={{ margin: 0 }}>
              Weekly Timeline
            </Title>
            <Text type="secondary">
              {schedule.weekStartDate.toLocaleDateString()} - {
                new Date(schedule.weekStartDate.getTime() + 6 * 24 * 60 * 60 * 1000).toLocaleDateString()
              }
            </Text>
          </div>
          
          <div style={{ textAlign: 'right' }}>
            <Space direction="vertical" size="small">
              <div>
                <Text style={{ fontWeight: 'bold' }}>Capacity Utilization</Text>
              </div>
              <div style={{ display: 'flex', gap: 16 }}>
                <div>
                  <Text type="secondary" style={{ fontSize: 12 }}>Focused</Text>
                  <Progress
                    percent={schedule.utilization.focusedPercentage}
                    status={schedule.utilization.focusedPercentage > 85 ? 'error' : 'normal'}
                    showText={false}
                    size="mini"
                    style={{ width: 80 }}
                  />
                  <Text style={{ fontSize: 12 }}>
                    {Math.round(schedule.utilization.focusedPercentage)}%
                  </Text>
                </div>
                <div>
                  <Text type="secondary" style={{ fontSize: 12 }}>Admin</Text>
                  <Progress
                    percent={schedule.utilization.adminPercentage}
                    status={schedule.utilization.adminPercentage > 85 ? 'error' : 'normal'}
                    showText={false}
                    size="mini"
                    style={{ width: 80 }}
                  />
                  <Text style={{ fontSize: 12 }}>
                    {Math.round(schedule.utilization.adminPercentage)}%
                  </Text>
                </div>
              </div>
            </Space>
          </div>
        </div>
      </Card>

      {/* Timeline Days */}
      <div className="timeline-days">
        {Array.from(itemsByDay.entries()).map(([dayKey, items]) => {
          const dayDate = new Date(dayKey)
          const dayName = dayDate.toLocaleDateString('en-US', { weekday: 'long' })
          const dayShort = dayDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
          
          const focusedMinutes = items.filter(item => item.type === 'focused').reduce((sum, item) => sum + item.duration, 0)
          const adminMinutes = items.filter(item => item.type === 'admin').reduce((sum, item) => sum + item.duration, 0)
          
          return (
            <Card key={dayKey} className="timeline-day">
              <div className="timeline-day-header">
                <div>
                  <Text style={{ fontWeight: 'bold', fontSize: 16, margin: 0 }}>
                    {dayName}
                  </Text>
                  <Text type="secondary">{dayShort}</Text>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <Space size="small">
                    <Tag color="blue" size="small">
                      {formatDuration(focusedMinutes)} focused
                    </Tag>
                    <Tag color="green" size="small">
                      {formatDuration(adminMinutes)} admin
                    </Tag>
                  </Space>
                </div>
              </div>
              
              <div className="timeline-items">
                {items.map((item, index) => (
                  <div key={item.id} className="timeline-item">
                    <div className="timeline-item-time">
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {formatTime(item.scheduledStartTime)}
                      </Text>
                      <div className="timeline-connector" />
                    </div>
                    
                    <Card 
                      className={`timeline-item-card ${item.type}`}
                      hoverable
                      onClick={() => onItemClick?.(item)}
                    >
                      <div className="timeline-item-content">
                        <div className="timeline-item-header">
                          <div style={{ flex: 1 }}>
                            <Text style={{ color: getItemTypeColor(item.type), fontWeight: 'bold' }}>
                              {item.name}
                            </Text>
                            {item.sourceType === 'workflow_step' && (
                              <Text type="secondary" style={{ fontSize: 12, marginLeft: 8 }}>
                                (Step {(item.workflowStepIndex || 0) + 1})
                              </Text>
                            )}
                          </div>
                          
                          <Space size="small">
                            <Tag 
                              color={getStatusColor(item.status)}
                              size="small"
                            >
                              {item.status}
                            </Tag>
                            
                            <Tooltip content={`${formatDuration(item.duration)} • ${item.type} work`}>
                              <Tag size="small">
                                <IconClockCircle style={{ marginRight: 4 }} />
                                {formatDuration(item.duration)}
                              </Tag>
                            </Tooltip>
                          </Space>
                        </div>
                        
                        <div className="timeline-item-details">
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            {formatTime(item.scheduledStartTime)} - {formatTime(item.scheduledEndTime)}
                          </Text>
                          
                          {item.asyncWaitTime > 0 && (
                            <Text type="secondary" style={{ fontSize: 12, marginLeft: 16 }}>
                              + {formatDuration(item.asyncWaitTime)} wait
                            </Text>
                          )}
                        </div>
                        
                        {(onStartItem || onPauseItem) && (
                          <div className="timeline-item-actions">
                            {item.status === 'scheduled' && onStartItem && (
                              <Button
                                type="text"
                                size="mini"
                                icon={<IconPlayArrow />}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  onStartItem(item)
                                }}
                              >
                                Start
                              </Button>
                            )}
                            
                            {item.status === 'in_progress' && onPauseItem && (
                              <Button
                                type="text"
                                size="mini"
                                icon={<IconPause />}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  onPauseItem(item)
                                }}
                              >
                                Pause
                              </Button>
                            )}
                          </div>
                        )}
                      </div>
                      
                      {/* Progress bar for capacity visualization */}
                      <div className="timeline-item-progress">
                        <div 
                          className="timeline-item-progress-bar"
                          style={{
                            backgroundColor: getItemTypeColor(item.type),
                            opacity: 0.3,
                            width: `${Math.min(100, (item.duration / 240) * 100)}%` // Relative to 4-hour max
                          }}
                        />
                      </div>
                    </Card>
                  </div>
                ))}
              </div>
            </Card>
          )
        })}
      </div>
    </div>
  )
}