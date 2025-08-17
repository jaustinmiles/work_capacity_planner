import { useState, useEffect, useMemo } from 'react'
import { Calendar, Card, Typography, Space, Statistic, Grid, Tag, Alert, Empty, Spin } from '@arco-design/web-react'
import { IconClockCircle, IconDesktop, IconUserGroup, IconCalendar } from '@arco-design/web-react/icon'
import { useTaskStore } from '../../store/useTaskStore'
import { scheduleItemsWithBlocks, ScheduledItem } from '../../utils/flexible-scheduler'
import { DailyWorkPattern } from '@shared/work-blocks-types'
import { getDatabase } from '../../services/database'
import { DailyScheduleView } from '../schedule/DailyScheduleView'
import dayjs from 'dayjs'

const { Title, Text } = Typography
const { Row, Col } = Grid

export function WeeklyCalendar() {
  const { tasks, sequencedTasks } = useTaskStore()
  const [selectedDate, setSelectedDate] = useState<dayjs.Dayjs | null>(dayjs())
  const [workPatterns, setWorkPatterns] = useState<DailyWorkPattern[]>([])
  const [loading, setLoading] = useState(false)

  // Load work patterns for the next 30 days
  useEffect(() => {
    loadWorkPatterns()
  }, [])

  const loadWorkPatterns = async () => {
    setLoading(true)
    try {
      const db = getDatabase()
      const patterns: DailyWorkPattern[] = []
      const today = dayjs().startOf('day')

      // Load patterns for the next 30 days
      for (let i = 0; i < 30; i++) {
        const date = today.add(i, 'day')
        const dateStr = date.format('YYYY-MM-DD')
        const dayOfWeek = date.day()

        const pattern = await db.getWorkPattern(dateStr)
        if (pattern) {
          patterns.push({
            date: dateStr,
            blocks: pattern.blocks,
            meetings: pattern.meetings,
            accumulated: { focusMinutes: 0, adminMinutes: 0 },
          })
        } else if (dayOfWeek !== 0 && dayOfWeek !== 6) {
          // If no pattern exists and it's a weekday, create a default pattern
          patterns.push({
            date: dateStr,
            blocks: [
              {
                id: `default-morning-${dateStr}`,
                startTime: '09:00',
                endTime: '12:00',
                type: 'mixed',
                capacity: { focusMinutes: 120, adminMinutes: 60 },
              },
              {
                id: `default-afternoon-${dateStr}`,
                startTime: '13:00',
                endTime: '17:00',
                type: 'mixed',
                capacity: { focusMinutes: 180, adminMinutes: 60 },
              },
            ],
            meetings: [],
            accumulated: { focusMinutes: 0, adminMinutes: 0 },
          })
        }
      }

      setWorkPatterns(patterns)
    } catch (error) {
      console.error('Failed to load work patterns:', error)
    } finally {
      setLoading(false)
    }
  }

  // Use the scheduler to get properly scheduled items
  const scheduledItems = useMemo(() => {
    if (workPatterns.length === 0) return []
    return scheduleItemsWithBlocks(tasks, sequencedTasks, workPatterns, new Date())
  }, [tasks, sequencedTasks, workPatterns])

  // Group scheduled items by date
  const itemsByDate = useMemo(() => {
    const grouped = new Map<string, ScheduledItem[]>()

    scheduledItems.forEach(item => {
      if (!item.isWaitTime) {
        const dateStr = dayjs(item.startTime).format('YYYY-MM-DD')
        const existing = grouped.get(dateStr) || []
        existing.push(item)
        grouped.set(dateStr, existing)
      }
    })

    return grouped
  }, [scheduledItems])

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
    totalAdminMinutes / 180,    // 3 hours = 180 minutes
  ))

  // Get tasks with upcoming deadlines
  const upcomingDeadlines = useMemo(() => {
    const allTasks = [...tasks, ...sequencedTasks]
    const now = dayjs()
    const oneWeekFromNow = now.add(7, 'day')

    return allTasks
      .filter(task => task.deadline && !task.completed)
      .filter(task => {
        const deadline = dayjs(task.deadline)
        return deadline.isAfter(now) && deadline.isBefore(oneWeekFromNow)
      })
      .sort((a, b) => dayjs(a.deadline!).valueOf() - dayjs(b.deadline!).valueOf())
      .slice(0, 5) // Show top 5
  }, [tasks, sequencedTasks])

  // Custom date cell render for showing task allocation
  const dateRender = (currentDate: dayjs.Dayjs) => {
    const isWeekend = currentDate.day() === 0 || currentDate.day() === 6
    const isToday = currentDate.isSame(dayjs(), 'day')
    const isPast = currentDate.isBefore(dayjs(), 'day')
    const dateStr = currentDate.format('YYYY-MM-DD')
    const daySchedule = itemsByDate.get(dateStr) || []

    // Calculate time by type for this day
    const focusedMinutes = daySchedule
      .filter(item => item.originalItem && 'type' in item.originalItem &&
        (item.originalItem as any).type === 'focused')
      .reduce((sum, item) => sum + item.duration, 0)

    const adminMinutes = daySchedule
      .filter(item => item.originalItem && 'type' in item.originalItem &&
        (item.originalItem as any).type === 'admin')
      .reduce((sum, item) => sum + item.duration, 0)

    const hasScheduledTasks = daySchedule.length > 0
    const workPattern = workPatterns.find(p => p.date === dateStr)
    const hasWorkBlocks = workPattern && workPattern.blocks.length > 0

    return (
      <div style={{
        padding: '4px',
        height: '100%',
        background: isToday ? '#E8F3FF' :
                   isPast ? '#F5F5F5' :
                   isWeekend ? '#FAFAFA' : 'transparent',
        borderRadius: '4px',
        opacity: isPast && !isToday ? 0.7 : 1,
      }}>
        <div style={{
          fontSize: 16,
          fontWeight: isToday ? 600 : 400,
          color: isWeekend ? '#86909C' : undefined,
        }}>
          {currentDate.date()}
        </div>
        {hasScheduledTasks && (
          <Space direction="vertical" size={4} style={{ marginTop: 4 }}>
            {focusedMinutes > 0 && (
              <Tag size="small" color="blue" style={{ margin: 0 }}>
                {Math.floor(focusedMinutes / 60)}h {focusedMinutes % 60 > 0 ? `${focusedMinutes % 60}m` : ''}
              </Tag>
            )}
            {adminMinutes > 0 && (
              <Tag size="small" color="green" style={{ margin: 0 }}>
                {Math.floor(adminMinutes / 60)}h {adminMinutes % 60 > 0 ? `${adminMinutes % 60}m` : ''}
              </Tag>
            )}
          </Space>
        )}
        {!hasScheduledTasks && !isWeekend && hasWorkBlocks && !isPast && (
          <Tag size="small" color="gray" style={{ margin: 0, marginTop: 4 }}>
            Available
          </Tag>
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

        {incompleteTasks.length > 0 && (
          <Alert
            type="info"
            content={`Based on 4 hours of focused work and 3 hours of admin time per day, you'll need approximately ${daysNeeded} working days to complete all active tasks.`}
            style={{ marginTop: 16 }}
          />
        )}
      </Card>

      {/* Upcoming Deadlines */}
      {upcomingDeadlines.length > 0 && (
        <Card>
          <Title heading={5} style={{ marginBottom: 16 }}>Upcoming Deadlines</Title>
          <Space direction="vertical" style={{ width: '100%' }}>
            {upcomingDeadlines.map(task => {
              const daysUntil = dayjs(task.deadline!).diff(dayjs(), 'day')
              const hoursUntil = dayjs(task.deadline!).diff(dayjs(), 'hour')

              return (
                <div
                  key={task.id}
                  style={{
                    padding: '12px',
                    background: daysUntil <= 1 ? '#FFF7E8' : '#F5F5F5',
                    borderRadius: 6,
                    borderLeft: `3px solid ${
                      daysUntil <= 1 ? '#FF7D00' :
                      daysUntil <= 3 ? '#FAAD14' :
                      '#52C41A'
                    }`,
                  }}
                >
                  <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                    <div>
                      <Text style={{ fontWeight: 600 }}>{task.name}</Text>
                      <br />
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {task.duration} min •
                        Priority: {task.importance * task.urgency} •
                        {'steps' in task && task.steps ? `Workflow (${task.steps.length} steps)` : 'Task'}
                      </Text>
                    </div>
                    <Tag
                      color={daysUntil <= 1 ? 'red' : daysUntil <= 3 ? 'orange' : 'green'}
                      style={{ marginLeft: 8 }}
                    >
                      {daysUntil === 0
                        ? `${hoursUntil} hours`
                        : daysUntil === 1
                        ? 'Tomorrow'
                        : `${daysUntil} days`
                      }
                    </Tag>
                  </Space>
                </div>
              )
            })}
          </Space>
        </Card>
      )}

      {/* Calendar and Schedule View */}
      <Row gutter={16}>
        <Col span={14}>
          <Card>
            <Title heading={5} style={{ marginBottom: 16 }}>
              <Space>
                <IconCalendar />
                Calendar View
              </Space>
            </Title>

            {loading ? (
              <div style={{ textAlign: 'center', padding: 40 }}>
                <Spin size={40} />
                <div style={{ marginTop: 16 }}>Loading schedule...</div>
              </div>
            ) : scheduledItems.length === 0 ? (
              <Empty
                description={
                  <Space direction="vertical">
                    <Text>No scheduled items to display</Text>
                    <Text type="secondary">
                      {workPatterns.length === 0
                        ? 'Set up your work schedule to see tasks distributed across days'
                        : 'Add some tasks to see them scheduled'
                      }
                    </Text>
                  </Space>
                }
              />
            ) : (
              <>
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
                  <Space direction="vertical" size="small">
                    <Space>
                      <Tag color="blue">Focused Work</Tag>
                      <Tag color="green">Admin/Meetings</Tag>
                      <Tag color="gray">Available Day</Tag>
                    </Space>
                    <Text type="secondary">
                      Tasks are automatically scheduled based on priority, deadlines, and available capacity.
                      {workPatterns.some(p => p.blocks.some(b => b.id.startsWith('default-'))) && (
                        <> Using default schedule (9-12, 1-5) for days without custom patterns.</>
                      )}
                    </Text>
                  </Space>
                </div>
              </>
            )}
          </Card>
        </Col>

        {/* Daily Schedule View */}
        <Col span={10}>
          {selectedDate ? (
            <DailyScheduleView
              date={selectedDate.format('YYYY-MM-DD')}
              scheduledItems={itemsByDate.get(selectedDate.format('YYYY-MM-DD')) || []}
              workPattern={workPatterns.find(p => p.date === selectedDate.format('YYYY-MM-DD'))}
              style={{ height: '100%' }}
            />
          ) : (
            <Card style={{ height: '100%' }}>
              <Empty
                description="Select a day from the calendar to view the detailed schedule"
                style={{ marginTop: 100 }}
              />
            </Card>
          )}
        </Col>
      </Row>
    </Space>
  )
}
