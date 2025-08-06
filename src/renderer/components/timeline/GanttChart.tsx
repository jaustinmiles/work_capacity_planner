import React, { useMemo } from 'react'
import { Card, Typography, Space, Tag, Grid, Empty, Tooltip } from '@arco-design/web-react'
import { Task } from '@shared/types'
import { SequencedTask } from '@shared/sequencing-types'

const { Title, Text } = Typography
const { Row, Col } = Grid

interface GanttChartProps {
  tasks: Task[]
  sequencedTasks: SequencedTask[]
}

interface GanttItem {
  id: string
  name: string
  type: 'task' | 'workflow' | 'step'
  start: Date
  end: Date
  duration: number
  asyncWaitTime: number
  color: string
  workflowId?: string
  workflowName?: string
  importance: number
  urgency: number
  status: string
}

export function GanttChart({ tasks, sequencedTasks }: GanttChartProps) {
  // Calculate gantt items with start/end times
  const ganttItems = useMemo(() => {
    const items: GanttItem[] = []
    let currentTime = new Date()
    currentTime.setHours(9, 0, 0, 0) // Start at 9 AM
    
    // Process workflows first
    sequencedTasks.forEach((workflow, wIndex) => {
      if (workflow.overallStatus === 'completed') return
      
      const workflowColor = `hsl(${wIndex * 60}, 70%, 50%)`
      let workflowStart = new Date(currentTime)
      
      // Add workflow header
      const totalDuration = workflow.steps.reduce((sum, step) => 
        sum + step.duration + step.asyncWaitTime, 0
      )
      
      items.push({
        id: workflow.id,
        name: workflow.name,
        type: 'workflow',
        start: new Date(workflowStart),
        end: new Date(workflowStart.getTime() + totalDuration * 60000),
        duration: workflow.totalDuration,
        asyncWaitTime: workflow.steps.reduce((sum, step) => sum + step.asyncWaitTime, 0),
        color: workflowColor,
        importance: workflow.importance,
        urgency: workflow.urgency,
        status: workflow.overallStatus,
      })
      
      // Add workflow steps
      let stepStart = new Date(workflowStart)
      workflow.steps.forEach((step) => {
        if (step.status === 'completed') return
        
        const stepEnd = new Date(stepStart.getTime() + (step.duration + step.asyncWaitTime) * 60000)
        
        items.push({
          id: step.id,
          name: `  └─ ${step.name}`,
          type: 'step',
          start: new Date(stepStart),
          end: stepEnd,
          duration: step.duration,
          asyncWaitTime: step.asyncWaitTime,
          color: workflowColor,
          workflowId: workflow.id,
          workflowName: workflow.name,
          importance: workflow.importance,
          urgency: workflow.urgency,
          status: step.status,
        })
        
        stepStart = new Date(stepEnd)
      })
      
      // Move to next workflow
      currentTime = new Date(stepStart.getTime() + 30 * 60000) // 30 min buffer
    })
    
    // Process standalone tasks
    const incompleteTasks = tasks.filter(task => !task.completed)
    incompleteTasks.forEach((task) => {
      const taskEnd = new Date(currentTime.getTime() + (task.duration + task.asyncWaitTime) * 60000)
      
      items.push({
        id: task.id,
        name: task.name,
        type: 'task',
        start: new Date(currentTime),
        end: taskEnd,
        duration: task.duration,
        asyncWaitTime: task.asyncWaitTime,
        color: '#6B7280',
        importance: task.importance,
        urgency: task.urgency,
        status: task.completed ? 'completed' : 'pending',
      })
      
      currentTime = new Date(taskEnd.getTime() + 15 * 60000) // 15 min buffer
    })
    
    return items
  }, [tasks, sequencedTasks])

  // Calculate chart dimensions
  const chartStartTime = ganttItems.length > 0 ? ganttItems[0].start : new Date()
  const chartEndTime = ganttItems.length > 0 
    ? new Date(Math.max(...ganttItems.map(item => item.end.getTime())))
    : new Date()
  
  const totalDuration = chartEndTime.getTime() - chartStartTime.getTime()
  const totalHours = totalDuration / (1000 * 60 * 60)
  const totalDays = Math.ceil(totalHours / 8) // Assuming 8-hour workdays
  
  // Calculate time markers
  const timeMarkers = []
  const markerTime = new Date(chartStartTime)
  markerTime.setMinutes(0, 0, 0)
  while (markerTime <= chartEndTime) {
    timeMarkers.push(new Date(markerTime))
    markerTime.setHours(markerTime.getHours() + 1)
  }
  
  const getPosition = (date: Date) => {
    const offset = date.getTime() - chartStartTime.getTime()
    return (offset / totalDuration) * 100
  }
  
  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }
  
  const formatDate = (date: Date) => {
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
  }
  
  const getPriorityColor = (importance: number, urgency: number) => {
    const score = importance * urgency
    if (score >= 64) return '#FF4D4F'
    if (score >= 36) return '#FAAD14'
    return '#52C41A'
  }

  if (ganttItems.length === 0) {
    return (
      <Card>
        <Empty description="No tasks or workflows to display" />
      </Card>
    )
  }

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="large">
      {/* Summary */}
      <Card>
        <Row gutter={16}>
          <Col span={6}>
            <Space direction="vertical">
              <Text type="secondary">Total Items</Text>
              <Title heading={4}>{ganttItems.length}</Title>
            </Space>
          </Col>
          <Col span={6}>
            <Space direction="vertical">
              <Text type="secondary">Estimated Completion</Text>
              <Title heading={4}>{formatDate(chartEndTime)} {formatTime(chartEndTime)}</Title>
            </Space>
          </Col>
          <Col span={6}>
            <Space direction="vertical">
              <Text type="secondary">Total Work Days</Text>
              <Title heading={4}>{totalDays} days</Title>
            </Space>
          </Col>
          <Col span={6}>
            <Space direction="vertical">
              <Text type="secondary">Active Workflows</Text>
              <Title heading={4}>{sequencedTasks.filter(w => w.overallStatus !== 'completed').length}</Title>
            </Space>
          </Col>
        </Row>
      </Card>

      {/* Gantt Chart */}
      <Card title="Timeline View">
        <div style={{ position: 'relative', minHeight: ganttItems.length * 50 + 100, overflow: 'auto' }}>
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
              {Array.from(new Set(timeMarkers.map(t => formatDate(t)))).map((date, index) => (
                <div
                  key={date}
                  style={{
                    position: 'absolute',
                    left: `${index * 25}%`,
                    padding: '4px 8px',
                    fontWeight: 500,
                  }}
                >
                  {date}
                </div>
              ))}
            </div>
            
            {/* Time labels */}
            <div style={{ position: 'relative', height: 30 }}>
              {timeMarkers.filter((_, i) => i % 2 === 0).map((time) => (
                <div
                  key={time.getTime()}
                  style={{
                    position: 'absolute',
                    left: `${getPosition(time)}%`,
                    transform: 'translateX(-50%)',
                    fontSize: 12,
                    color: '#666',
                    padding: '4px',
                  }}
                >
                  {formatTime(time)}
                </div>
              ))}
            </div>
          </div>

          {/* Chart body */}
          <div style={{ position: 'relative', paddingTop: 20 }}>
            {/* Grid lines */}
            {timeMarkers.map((time) => (
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
            ))}

            {/* Current time indicator */}
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

            {/* Gantt bars */}
            {ganttItems.map((item, index) => {
              const left = getPosition(item.start)
              const width = getPosition(item.end) - left
              const isWorkflow = item.type === 'workflow'
              const isStep = item.type === 'step'
              
              return (
                <div
                  key={item.id}
                  style={{
                    position: 'absolute',
                    top: index * 50 + 10,
                    height: 36,
                    left: `${left}%`,
                    width: `${width}%`,
                    minWidth: 2,
                  }}
                >
                  <Tooltip
                    content={
                      <Space direction="vertical" size="small">
                        <Text>{item.name}</Text>
                        <Text>Duration: {item.duration}m</Text>
                        {item.asyncWaitTime > 0 && (
                          <Text>Wait time: {item.asyncWaitTime}m</Text>
                        )}
                        <Text>Start: {formatTime(item.start)}</Text>
                        <Text>End: {formatTime(item.end)}</Text>
                      </Space>
                    }
                  >
                    <div
                      style={{
                        height: '100%',
                        opacity: isStep ? 0.7 : 1,
                        borderRadius: 4,
                        border: isWorkflow ? '2px solid ' + item.color : 'none',
                        borderStyle: isWorkflow ? 'solid' : 'none',
                        background: isWorkflow 
                          ? `repeating-linear-gradient(45deg, ${item.color}22, ${item.color}22 10px, ${item.color}33 10px, ${item.color}33 20px)`
                          : item.color,
                        display: 'flex',
                        alignItems: 'center',
                        padding: '0 8px',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        position: 'relative',
                        overflow: 'hidden',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'scaleY(1.1)'
                        e.currentTarget.style.zIndex = '10'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'scaleY(1)'
                        e.currentTarget.style.zIndex = '1'
                      }}
                    >
                      {/* Priority indicator */}
                      <div
                        style={{
                          position: 'absolute',
                          left: 0,
                          top: 0,
                          bottom: 0,
                          width: 4,
                          background: getPriorityColor(item.importance, item.urgency),
                        }}
                      />
                      
                      {/* Task name */}
                      <Text
                        style={{
                          color: isWorkflow ? '#000' : '#fff',
                          fontSize: isStep ? 12 : 14,
                          fontWeight: isWorkflow ? 600 : 400,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          paddingLeft: isStep ? 20 : 8,
                        }}
                      >
                        {item.name}
                      </Text>
                      
                      {/* Async wait indicator */}
                      {item.asyncWaitTime > 0 && (
                        <div
                          style={{
                            position: 'absolute',
                            right: 0,
                            top: 0,
                            bottom: 0,
                            width: `${(item.asyncWaitTime / (item.duration + item.asyncWaitTime)) * 100}%`,
                            background: 'rgba(0,0,0,0.2)',
                            borderLeft: '1px dashed rgba(255,255,255,0.5)',
                          }}
                        />
                      )}
                    </div>
                  </Tooltip>
                </div>
              )
            })}
          </div>
        </div>

        {/* Legend */}
        <div style={{ marginTop: 20, borderTop: '1px solid #e5e5e5', paddingTop: 16 }}>
          <Space>
            <Tag color="red">High Priority</Tag>
            <Tag color="orange">Medium Priority</Tag>
            <Tag color="green">Low Priority</Tag>
            <div style={{ marginLeft: 20 }}>
              <Text type="secondary">Striped bars = Workflows | Solid bars = Tasks/Steps</Text>
            </div>
          </Space>
        </div>
      </Card>
    </Space>
  )
}