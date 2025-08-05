import React, { useState } from 'react'
import { Calendar, Card, Typography, Space, Statistic, Grid, Tag, Alert } from '@arco-design/web-react'
import { IconClockCircle, IconDesktop, IconUserGroup } from '@arco-design/web-react/icon'
import { useTaskStore } from '../../store/useTaskStore'
import dayjs from 'dayjs'

const { Title, Text } = Typography
const { Row, Col } = Grid

export function WeeklyCalendar() {
  const { tasks } = useTaskStore()
  const [selectedDate, setSelectedDate] = useState(dayjs())
  
  const incompleteTasks = tasks.filter(task => !task.completed)
  
  // Calculate total work capacity needed
  const totalFocusedMinutes = incompleteTasks
    .filter(task => task.type === 'focused')
    .reduce((sum, task) => sum + task.duration, 0)
  
  const totalAdminMinutes = incompleteTasks
    .filter(task => task.type === 'admin')
    .reduce((sum, task) => sum + task.duration, 0)
  
  const focusedHours = Math.floor(totalFocusedMinutes / 60)
  const focusedMins = totalFocusedMinutes % 60
  
  const adminHours = Math.floor(totalAdminMinutes / 60)
  const adminMins = totalAdminMinutes % 60
  
  // Calculate days needed (4 hours focused + 3 hours admin per day)
  const daysNeeded = Math.ceil(Math.max(
    totalFocusedMinutes / 240, // 4 hours = 240 minutes
    totalAdminMinutes / 180    // 3 hours = 180 minutes
  ))
  
  // Custom date cell render for showing task allocation
  const dateRender = (currentDate: dayjs.Dayjs) => {
    const isWeekend = currentDate.day() === 0 || currentDate.day() === 6
    const isToday = currentDate.isSame(dayjs(), 'day')
    const isFuture = currentDate.isAfter(dayjs(), 'day')
    
    // Mock scheduled tasks for demonstration
    const hasScheduledTasks = isFuture && !isWeekend && Math.random() > 0.5
    
    return (
      <div style={{ 
        padding: '4px',
        height: '100%',
        background: isToday ? '#E8F3FF' : 'transparent',
        borderRadius: '4px',
      }}>
        <div style={{ fontSize: 16, fontWeight: isToday ? 600 : 400 }}>
          {currentDate.date()}
        </div>
        {hasScheduledTasks && (
          <Space direction="vertical" size={4} style={{ marginTop: 4 }}>
            <Tag size="small" color="blue" style={{ margin: 0 }}>
              2h focused
            </Tag>
            <Tag size="small" color="green" style={{ margin: 0 }}>
              1h admin
            </Tag>
          </Space>
        )}
      </div>
    )
  }
  
  return (
    <Space direction="vertical" style={{ width: '100%' }} size="large">
      {/* Workload Summary Card */}
      <Card>
        <Title heading={5} style={{ marginBottom: 16 }}>Workload Summary</Title>
        
        <Row gutter={16}>
          <Col span={8}>
            <Statistic
              title={
                <Space>
                  <IconDesktop />
                  <span>Focused Work</span>
                </Space>
              }
              value={`${focusedHours}h ${focusedMins > 0 ? `${focusedMins}m` : ''}`}
              style={{ color: '#165DFF' }}
            />
          </Col>
          <Col span={8}>
            <Statistic
              title={
                <Space>
                  <IconUserGroup />
                  <span>Admin/Meetings</span>
                </Space>
              }
              value={`${adminHours}h ${adminMins > 0 ? `${adminMins}m` : ''}`}
              style={{ color: '#00B42A' }}
            />
          </Col>
          <Col span={8}>
            <Statistic
              title={
                <Space>
                  <IconClockCircle />
                  <span>Days to Complete</span>
                </Space>
              }
              value={daysNeeded}
              suffix="days"
              style={{ color: '#FF7D00' }}
            />
          </Col>
        </Row>
        
        <Alert
          type="info"
          content={`Based on 4 hours of focused work and 3 hours of admin time per day, you'll need approximately ${daysNeeded} working days to complete all active tasks.`}
          style={{ marginTop: 16 }}
        />
      </Card>
      
      {/* Calendar View */}
      <Card>
        <Title heading={5} style={{ marginBottom: 16 }}>Schedule View</Title>
        
        <Calendar
          dateRender={dateRender}
          onChange={(date: dayjs.Dayjs) => setSelectedDate(date)}
          panel
          panelWidth={300}
          style={{
            background: '#fff',
            borderRadius: '8px',
            fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          }}
        />
        
        <div style={{ marginTop: 16, padding: 16, background: '#F7F8FA', borderRadius: 8 }}>
          <Space>
            <Tag color="blue">Focused Work</Tag>
            <Tag color="green">Admin/Meetings</Tag>
            <Text type="secondary">
              Tasks will be automatically scheduled based on priority and available capacity
            </Text>
          </Space>
        </div>
      </Card>
    </Space>
  )
}