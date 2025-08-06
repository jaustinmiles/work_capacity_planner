import React, { useMemo, useState, useEffect } from 'react'
import { Card, Typography, Space, Tag, Grid, Empty, Tooltip, Button, Slider } from '@arco-design/web-react'
import { IconPlus, IconMinus, IconZoomIn, IconZoomOut, IconSettings } from '@arco-design/web-react/icon'
import { Task } from '@shared/types'
import { SequencedTask } from '@shared/sequencing-types'
import { scheduleItemsWithBlocks, ScheduledItem } from '../../utils/flexible-scheduler'
import { DailyWorkPattern } from '@shared/work-blocks-types'
import { useTaskStore } from '../../store/useTaskStore'
import { WorkScheduleModal } from '../settings/WorkScheduleModal'
import { getDatabase } from '../../services/database'
import dayjs from 'dayjs'

const { Title, Text } = Typography
const { Row, Col } = Grid

interface GanttChartProps {
  tasks: Task[]
  sequencedTasks: SequencedTask[]
}

export function GanttChart({ tasks, sequencedTasks }: GanttChartProps) {
  const [pixelsPerHour, setPixelsPerHour] = useState(120) // pixels per hour for scaling
  const [hoveredItem, setHoveredItem] = useState<string | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [workPatterns, setWorkPatterns] = useState<DailyWorkPattern[]>([])
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  // Load work patterns for the next 30 days
  useEffect(() => {
    loadWorkPatterns()
  }, [])

  const loadWorkPatterns = async () => {
    const db = getDatabase()
    const patterns: DailyWorkPattern[] = []
    const today = new Date()

    // Load patterns for the next 30 days
    for (let i = 0; i < 30; i++) {
      const date = new Date(today)
      date.setDate(date.getDate() + i)
      const dateStr = dayjs(date).format('YYYY-MM-DD')

      const pattern = await db.getWorkPattern(dateStr)
      if (pattern) {
        patterns.push({
          date: dateStr,
          blocks: pattern.blocks,
          meetings: pattern.meetings,
          accumulated: { focusMinutes: 0, adminMinutes: 0 },
        })
      }
    }

    setWorkPatterns(patterns)
  }

  // Use the scheduler to get properly ordered items
  const scheduledItems = useMemo(() => {
    if (workPatterns.length === 0) return []
    return scheduleItemsWithBlocks(tasks, sequencedTasks, workPatterns)
  }, [tasks, sequencedTasks, workPatterns])

  // Calculate chart dimensions
  const chartStartTime = scheduledItems.length > 0 ? scheduledItems[0].startTime : new Date()
  const chartEndTime = scheduledItems.length > 0
    ? new Date(Math.max(...scheduledItems.map(item => item.endTime.getTime())))
    : new Date()

  const totalDuration = chartEndTime.getTime() - chartStartTime.getTime()
  const totalHours = totalDuration / (1000 * 60 * 60)
  const totalDays = Math.ceil(totalHours / 8) // Assuming 8-hour workdays

  // Calculate chart width based on pixelsPerHour
  const chartWidthPx = totalHours * pixelsPerHour
  const minBlockWidth = 60 // Minimum width for a block in pixels

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

  const getPositionPx = (date: Date) => {
    const offsetHours = (date.getTime() - chartStartTime.getTime()) / (1000 * 60 * 60)
    return offsetHours * pixelsPerHour
  }

  const getDurationPx = (minutes: number) => {
    const hours = minutes / 60
    return Math.max(hours * pixelsPerHour, minBlockWidth)
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
        <Empty 
          description={
            <Space direction="vertical" align="center">
              <Text>No scheduled items to display</Text>
              {workPatterns.length === 0 ? (
                <>
                  <Text type="secondary">You need to set up your work schedule first</Text>
                  <Button 
                    type="primary" 
                    icon={<IconSettings />}
                    onClick={() => {
                      setSelectedDate(dayjs().format('YYYY-MM-DD'))
                      setShowSettings(true)
                    }}
                  >
                    Create Work Schedule
                  </Button>
                </>
              ) : (
                <Text type="secondary">Add some tasks or workflows to see them scheduled</Text>
              )}
            </Space>
          }
        />
        {/* Work Schedule Modal */}
        <WorkScheduleModal
          visible={showSettings}
          date={selectedDate || dayjs().format('YYYY-MM-DD')}
          onClose={() => {
            setShowSettings(false)
            setSelectedDate(null)
          }}
          onSave={async () => {
            await loadWorkPatterns()
            setShowSettings(false)
            setSelectedDate(null)
          }}
        />
      </Card>
    )
  }

  // Row height based on zoom
  const rowHeight = 40

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="large">
      {/* Summary */}
      <Card>
        <Row gutter={16} align="center">
          <Col span={4}>
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
          <Col span={4}>
            <Space direction="vertical">
              <Text type="secondary">Work Days</Text>
              <Title heading={4}>{totalDays} days</Title>
            </Space>
          </Col>
          <Col span={4}>
            <Space direction="vertical">
              <Text type="secondary">Workflows</Text>
              <Title heading={4}>{sequencedTasks.filter(w => w.overallStatus !== 'completed').length}</Title>
            </Space>
          </Col>
          <Col span={7}>
            <Space direction="vertical" style={{ width: '100%' }}>
              <Text type="secondary">View Controls</Text>
              <Space direction="vertical" size="small" style={{ width: '100%' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <IconZoomOut />
                  <Slider
                    min={30}
                    max={240}
                    step={10}
                    value={pixelsPerHour}
                    onChange={(value) => setPixelsPerHour(value as number)}
                    style={{ flex: 1 }}
                    formatTooltip={(value) => {
                      if (value < 60) return 'Compact'
                      if (value < 120) return 'Normal'
                      if (value < 180) return 'Detailed'
                      return 'Extra Detailed'
                    }}
                  />
                  <IconZoomIn />
                </div>
                <Button
                  icon={<IconSettings />}
                  onClick={() => {
                    setSelectedDate(dayjs().format('YYYY-MM-DD'))
                    setShowSettings(true)
                  }}
                  style={{ width: '100%' }}
                >
                  Edit Today's Schedule
                </Button>
              </Space>
            </Space>
          </Col>
        </Row>
      </Card>

      {/* Gantt Chart */}
      <Card title="Scheduled Tasks (Priority Order)">
        <div style={{ overflowX: 'auto', overflowY: 'hidden', position: 'relative' }}>
          <div style={{
            position: 'relative',
            minHeight: scheduledItems.length * rowHeight + 100,
            width: `${chartWidthPx}px`,
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
                  const widthPx = nextDay
                    ? getPositionPx(nextDay) - getPositionPx(day)
                    : chartWidthPx - getPositionPx(day)

                  return (
                    <div
                      key={day.getTime()}
                      style={{
                        position: 'absolute',
                        left: `${getPositionPx(day)}px`,
                        width: `${widthPx}px`,
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
                        left: `${getPositionPx(time)}px`,
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
                      left: `${getPositionPx(time)}px`,
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
                    left: `${getPositionPx(day)}px`,
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
                    left: `${getPositionPx(new Date())}px`,
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
                const leftPx = getPositionPx(item.startTime)
                const widthPx = getDurationPx(item.duration)
                const isWaitTime = item.isWaitTime
                const isBlocked = item.isBlocked
                const isHovered = hoveredItem === item.id ||
                  (item.workflowId && hoveredItem?.startsWith(item.workflowId))

                return (
                  <div
                    key={item.id}
                    style={{
                      position: 'absolute',
                      top: index * rowHeight + 5,
                      height: rowHeight - 10,
                      left: `${leftPx}px`,
                      width: `${widthPx}px`,
                    }}
                    onMouseEnter={() => setHoveredItem(item.id)}
                    onMouseLeave={() => setHoveredItem(null)}
                  >
                    <Tooltip
                      content={(() => {
                        const lines = [`${item.name}`]

                        if (!item.isWaitTime && !item.isBlocked) {
                          lines.push(`Priority: ${getPriorityLabel(item.priority)} (${item.priority})`)
                          lines.push(`Type: ${item.type === 'task' ? 'Task' : 'Workflow Step'}`)
                        }

                        lines.push(`Duration: ${item.duration < 60 ? `${item.duration} minutes` : `${(item.duration / 60).toFixed(1)} hours`}`)
                        lines.push(`Start: ${formatDate(item.startTime)} ${formatTime(item.startTime)}`)
                        lines.push(`End: ${formatDate(item.endTime)} ${formatTime(item.endTime)}`)

                        if (item.workflowName) {
                          lines.push(`Workflow: ${item.workflowName}`)
                        }

                        if (item.isWaitTime) {
                          lines.push('Status: Waiting for async operation')
                        }

                        if (item.isBlocked) {
                          lines.push('Status: Blocked time')
                        }

                        return lines.join('\n')
                      })()}
                      position="top"
                      trigger="hover"
                    >
                      <div
                        style={{
                          height: '100%',
                          background: isBlocked
                            ? `repeating-linear-gradient(45deg, ${item.color}, ${item.color} 10px, ${item.color}88 10px, ${item.color}88 20px)`
                            : isWaitTime
                            ? `repeating-linear-gradient(45deg, ${item.color}44, ${item.color}44 5px, transparent 5px, transparent 10px)`
                            : item.color,
                          opacity: isBlocked ? 0.7 : isWaitTime ? 0.5 : (isHovered ? 1 : 0.85),
                          borderRadius: 4,
                          border: `1px solid ${item.color}`,
                          borderStyle: isBlocked ? 'solid' : isWaitTime ? 'dashed' : 'solid',
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
                        {widthPx > 30 && (
                          <Text
                            style={{
                              color: '#fff',
                              fontSize: pixelsPerHour < 60 ? 11 : 13,
                              fontWeight: isWaitTime ? 400 : 500,
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              paddingLeft: isWaitTime ? 0 : 8,
                              display: 'block',
                            }}
                          >
                            {item.name}
                          </Text>
                        )}
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
              <Text type="secondary">Dashed = Async waiting | Striped = Blocked time</Text>
            </div>
          </Space>
        </div>
      </Card>

      {/* Work Schedule Modal */}
      <WorkScheduleModal
        visible={showSettings}
        date={selectedDate || dayjs().format('YYYY-MM-DD')}
        onClose={() => {
          setShowSettings(false)
          setSelectedDate(null)
        }}
        onSave={() => {
          loadWorkPatterns() // Reload patterns after saving
        }}
      />
    </Space>
  )
}
