import React, { useMemo, useState } from 'react'
import { Card, Typography, Space, Tag, Grid, Empty, Tooltip, Button, Slider } from '@arco-design/web-react'
import { IconPlus, IconMinus, IconZoomIn, IconZoomOut } from '@arco-design/web-react/icon'
import { Task } from '@shared/types'
import { SequencedTask } from '@shared/sequencing-types'
import { scheduleItems, ScheduledItem } from '../../utils/scheduler'

const { Title, Text } = Typography
const { Row, Col } = Grid

interface GanttChartProps {
  tasks: Task[]
  sequencedTasks: SequencedTask[]
}

export function GanttChart({ tasks, sequencedTasks }: GanttChartProps) {
  const [zoom, setZoom] = useState(100) // 100% default zoom
  const [hoveredItem, setHoveredItem] = useState<string | null>(null)
  
  // Use the scheduler to get properly ordered items
  const scheduledItems = useMemo(() => {
    return scheduleItems(tasks, sequencedTasks)
  }, [tasks, sequencedTasks])

  // Calculate chart dimensions
  const chartStartTime = scheduledItems.length > 0 ? scheduledItems[0].startTime : new Date()
  const chartEndTime = scheduledItems.length > 0 
    ? new Date(Math.max(...scheduledItems.map(item => item.endTime.getTime())))
    : new Date()
  
  const totalDuration = chartEndTime.getTime() - chartStartTime.getTime()
  const totalHours = totalDuration / (1000 * 60 * 60)
  const totalDays = Math.ceil(totalHours / 8) // Assuming 8-hour workdays
  
  // Calculate time markers
  const timeMarkers = useMemo(() => {
    const markers = []
    const markerTime = new Date(chartStartTime)
    markerTime.setMinutes(0, 0, 0)
    
    while (markerTime <= chartEndTime) {
      markers.push(new Date(markerTime))
      markerTime.setHours(markerTime.getHours() + 1)
    }
    return markers
  }, [chartStartTime, chartEndTime])
  
  // Calculate day boundaries for visual separation
  const dayBoundaries = useMemo(() => {
    const boundaries = []
    const dayTime = new Date(chartStartTime)
    dayTime.setHours(0, 0, 0, 0)
    
    while (dayTime <= chartEndTime) {
      boundaries.push(new Date(dayTime))
      dayTime.setDate(dayTime.getDate() + 1)
    }
    return boundaries
  }, [chartStartTime, chartEndTime])
  
  const getPosition = (date: Date) => {
    const offset = date.getTime() - chartStartTime.getTime()
    return (offset / totalDuration) * 100
  }
  
  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }
  
  const formatDate = (date: Date) => {
    return date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
  }
  
  const getPriorityLabel = (priority: number) => {
    if (priority >= 64) return 'Critical'
    if (priority >= 49) return 'High'
    if (priority >= 36) return 'Medium'
    return 'Low'
  }
  
  const getPriorityColor = (priority: number) => {
    if (priority >= 64) return '#FF4D4F'
    if (priority >= 49) return '#FF7A45'
    if (priority >= 36) return '#FAAD14'
    return '#52C41A'
  }

  if (scheduledItems.length === 0) {
    return (
      <Card>
        <Empty description="No tasks or workflows to display" />
      </Card>
    )
  }

  // Row height based on zoom
  const rowHeight = Math.max(30, 40 * (zoom / 100))
  const chartWidth = `${zoom}%`

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="large">
      {/* Summary */}
      <Card>
        <Row gutter={16} align="center">
          <Col span={5}>
            <Space direction="vertical">
              <Text type="secondary">Total Items</Text>
              <Title heading={4}>{scheduledItems.filter(item => !item.isWaitTime).length}</Title>
            </Space>
          </Col>
          <Col span={5}>
            <Space direction="vertical">
              <Text type="secondary">Completion</Text>
              <Title heading={4}>{formatDate(chartEndTime)}</Title>
              <Text type="secondary">{formatTime(chartEndTime)}</Text>
            </Space>
          </Col>
          <Col span={5}>
            <Space direction="vertical">
              <Text type="secondary">Work Days</Text>
              <Title heading={4}>{totalDays} days</Title>
            </Space>
          </Col>
          <Col span={5}>
            <Space direction="vertical">
              <Text type="secondary">Workflows</Text>
              <Title heading={4}>{sequencedTasks.filter(w => w.overallStatus !== 'completed').length}</Title>
            </Space>
          </Col>
          <Col span={4}>
            <Space direction="vertical" style={{ width: '100%' }}>
              <Text type="secondary">Zoom</Text>
              <Space>
                <Button
                  icon={<IconMinus />}
                  size="small"
                  onClick={() => setZoom(Math.max(50, zoom - 10))}
                  disabled={zoom <= 50}
                />
                <Text style={{ minWidth: 40, textAlign: 'center' }}>{zoom}%</Text>
                <Button
                  icon={<IconPlus />}
                  size="small"
                  onClick={() => setZoom(Math.min(200, zoom + 10))}
                  disabled={zoom >= 200}
                />
              </Space>
            </Space>
          </Col>
        </Row>
      </Card>

      {/* Gantt Chart */}
      <Card title="Scheduled Tasks (Priority Order)">
        <div style={{ overflowX: 'auto', overflowY: 'hidden' }}>
          <div style={{ 
            position: 'relative', 
            minHeight: scheduledItems.length * rowHeight + 100,
            width: chartWidth,
            minWidth: '100%',
          }}>
            {/* Time header */}
            <div style={{ 
              position: 'sticky', 
              top: 0, 
              background: '#fff', 
              borderBottom: '2px solid #e5e5e5',
              zIndex: 10,
              height: 60,
            }}>
              {/* Date labels */}
              <div style={{ position: 'relative', height: 30, borderBottom: '1px solid #e5e5e5' }}>
                {dayBoundaries.map((day, index) => {
                  const nextDay = dayBoundaries[index + 1]
                  const width = nextDay 
                    ? getPosition(nextDay) - getPosition(day)
                    : 100 - getPosition(day)
                  
                  return (
                    <div
                      key={day.getTime()}
                      style={{
                        position: 'absolute',
                        left: `${getPosition(day)}%`,
                        width: `${width}%`,
                        padding: '4px 8px',
                        fontWeight: 500,
                        borderRight: '1px solid #e5e5e5',
                        background: day.getDay() === 0 || day.getDay() === 6 ? '#f5f5f5' : '#fff',
                      }}
                    >
                      {formatDate(day)}
                    </div>
                  )
                })}
              </div>
              
              {/* Time labels */}
              <div style={{ position: 'relative', height: 30 }}>
                {timeMarkers
                  .filter(time => time.getHours() % 2 === 0 && time.getMinutes() === 0)
                  .map((time) => (
                    <div
                      key={time.getTime()}
                      style={{
                        position: 'absolute',
                        left: `${getPosition(time)}%`,
                        transform: 'translateX(-50%)',
                        fontSize: 11,
                        color: '#666',
                        padding: '4px',
                      }}
                    >
                      {formatTime(time)}
                    </div>
                  ))
                }
              </div>
            </div>

            {/* Chart body */}
            <div style={{ position: 'relative', paddingTop: 10 }}>
              {/* Grid lines */}
              {timeMarkers
                .filter(time => time.getHours() % 2 === 0)
                .map((time) => (
                  <div
                    key={time.getTime()}
                    style={{
                      position: 'absolute',
                      left: `${getPosition(time)}%`,
                      top: 0,
                      bottom: 0,
                      width: 1,
                      background: '#f0f0f0',
                      zIndex: 0,
                    }}
                  />
                ))
              }

              {/* Day separators */}
              {dayBoundaries.slice(1).map((day) => (
                <div
                  key={`sep-${day.getTime()}`}
                  style={{
                    position: 'absolute',
                    left: `${getPosition(day)}%`,
                    top: 0,
                    bottom: 0,
                    width: 2,
                    background: '#e0e0e0',
                    zIndex: 1,
                  }}
                />
              ))}

              {/* Current time indicator */}
              {new Date() >= chartStartTime && new Date() <= chartEndTime && (
                <div
                  style={{
                    position: 'absolute',
                    left: `${getPosition(new Date())}%`,
                    top: 0,
                    bottom: 0,
                    width: 2,
                    background: '#ff4d4f',
                    zIndex: 5,
                  }}
                >
                  <div
                    style={{
                      position: 'absolute',
                      top: -10,
                      left: '50%',
                      transform: 'translateX(-50%)',
                      background: '#ff4d4f',
                      color: 'white',
                      padding: '2px 8px',
                      borderRadius: 4,
                      fontSize: 12,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    Now
                  </div>
                </div>
              )}

              {/* Gantt bars */}
              {scheduledItems.map((item, index) => {
                const left = getPosition(item.startTime)
                const width = getPosition(item.endTime) - left
                const isWaitTime = item.isWaitTime
                const isHovered = hoveredItem === item.id || 
                  (item.workflowId && hoveredItem?.startsWith(item.workflowId))
                
                return (
                  <div
                    key={item.id}
                    style={{
                      position: 'absolute',
                      top: index * rowHeight + 5,
                      height: rowHeight - 10,
                      left: `${left}%`,
                      width: `${width}%`,
                      minWidth: 2,
                    }}
                    onMouseEnter={() => setHoveredItem(item.id)}
                    onMouseLeave={() => setHoveredItem(null)}
                  >
                    <Tooltip
                      content={
                        <Space direction="vertical" size="small">
                          <Text>{item.name}</Text>
                          <Text>Priority: {getPriorityLabel(item.priority)} ({item.priority})</Text>
                          <Text>Duration: {item.duration}m</Text>
                          <Text>Start: {formatTime(item.startTime)}</Text>
                          <Text>End: {formatTime(item.endTime)}</Text>
                          {item.workflowName && <Text>Workflow: {item.workflowName}</Text>}
                        </Space>
                      }
                    >
                      <div
                        style={{
                          height: '100%',
                          background: isWaitTime 
                            ? `repeating-linear-gradient(45deg, ${item.color}44, ${item.color}44 5px, transparent 5px, transparent 10px)`
                            : item.color,
                          opacity: isWaitTime ? 0.5 : (isHovered ? 1 : 0.85),
                          borderRadius: 4,
                          border: `1px solid ${item.color}`,
                          borderStyle: isWaitTime ? 'dashed' : 'solid',
                          display: 'flex',
                          alignItems: 'center',
                          padding: '0 8px',
                          cursor: 'pointer',
                          transition: 'all 0.2s',
                          position: 'relative',
                          overflow: 'hidden',
                          transform: isHovered ? 'scaleY(1.1)' : 'scaleY(1)',
                          zIndex: isHovered ? 10 : 2,
                          boxShadow: isHovered ? '0 2px 8px rgba(0,0,0,0.15)' : 'none',
                        }}
                      >
                        {/* Priority indicator */}
                        {!isWaitTime && (
                          <div
                            style={{
                              position: 'absolute',
                              left: 0,
                              top: 0,
                              bottom: 0,
                              width: 4,
                              background: getPriorityColor(item.priority),
                            }}
                          />
                        )}
                        
                        {/* Task name */}
                        <Text
                          style={{
                            color: '#fff',
                            fontSize: Math.max(11, 13 * (zoom / 100)),
                            fontWeight: isWaitTime ? 400 : 500,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            paddingLeft: isWaitTime ? 0 : 8,
                          }}
                        >
                          {item.name}
                        </Text>
                      </div>
                    </Tooltip>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Legend */}
        <div style={{ marginTop: 20, borderTop: '1px solid #e5e5e5', paddingTop: 16 }}>
          <Space>
            <Tag color="red">Critical Priority (64+)</Tag>
            <Tag color="orange">High Priority (49-63)</Tag>
            <Tag color="gold">Medium Priority (36-48)</Tag>
            <Tag color="green">Low Priority (&lt;36)</Tag>
            <div style={{ marginLeft: 20 }}>
              <Text type="secondary">Dashed = Async waiting time</Text>
            </div>
          </Space>
        </div>
      </Card>
    </Space>
  )
}