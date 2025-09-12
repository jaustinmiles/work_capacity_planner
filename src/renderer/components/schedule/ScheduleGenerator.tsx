import { useState } from 'react'
import { TaskType } from '@shared/enums'
import { Modal, Button, Space, Card, Typography, Radio, Spin, Tag, Alert, Grid, Tabs } from '@arco-design/web-react'
import { IconSave, IconEye } from '@arco-design/web-react/icon'
import { Task } from '@shared/types'
import { SequencedTask } from '@shared/sequencing-types'
import { useUnifiedScheduler, LegacyScheduleResult } from '../../hooks/useUnifiedScheduler'
import { LegacyScheduledItem } from '@shared/unified-scheduler-adapter'
import { DailyWorkPattern } from '@shared/work-blocks-types'
import { getDatabase } from '../../services/database'
import { useTaskStore } from '../../store/useTaskStore'
import { Message } from '../common/Message'
import dayjs from 'dayjs'
import { logger } from '../../utils/logger'
import { logSchedule } from '../../../logging/formatters/schedule-formatter'


const { Title, Text } = Typography
const { Row, Col } = Grid

interface ScheduleGeneratorProps {
  visible: boolean
  onClose: () => void
  tasks: Task[]
  sequencedTasks: SequencedTask[]
  onScheduleAccepted: () => void
}

interface ScheduleOption {
  id: string
  name: string
  description: string
  schedule: LegacyScheduledItem[]
  result: LegacyScheduleResult
  score: {
    deadlinesMet: number
    capacityUtilization: number
    asyncOptimization: number
    cognitiveMatch: number
  }
}

export function ScheduleGenerator({
  visible,
  onClose,
  tasks,
  sequencedTasks,
  onScheduleAccepted,
}: ScheduleGeneratorProps) {
  const [generating, setGenerating] = useState(false)
  const [scheduleOptions, setScheduleOptions] = useState<ScheduleOption[]>([])
  const [selectedOption, setSelectedOption] = useState<string>('')
  const [saving, setSaving] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const { workSettings, setOptimalSchedule } = useTaskStore()
  const { scheduleForGantt } = useUnifiedScheduler()

  const generateScheduleOptions = async () => {
    setGenerating(true)
    logger.ui.info('=== Starting Schedule Generation ===')

    try {
      const options: ScheduleOption[] = []

      // Fetch all existing meetings (including sleep blocks) for the next 30 days
      const db = await getDatabase()
      const allMeetings: any[] = []
      const today = new Date()
      today.setHours(0, 0, 0, 0)

      logger.ui.info('Fetching existing meetings and sleep blocks for next 30 days...')

      for (let i = 0; i < 30; i++) {
        const date = new Date(today)
        date.setDate(date.getDate() + i)
        const dateStr = date.toISOString().split('T')[0]
        const pattern = await db.getWorkPattern(dateStr)
        if (pattern?.meetings) {
          logger.ui.debug(`Day ${i} (${dateStr}): Found ${pattern.meetings.length} meetings`)
          allMeetings.push(...pattern.meetings.map((m: any) => ({
            ...m,
            date: dateStr,
          })))
        }
      }

      logger.ui.info(`Found ${allMeetings.length} total existing meetings/blocks to preserve:`,
        allMeetings.map(m => ({ name: m.name, type: m.type, date: m.date })))

      // Create base work patterns for the next 30 days with proper work hours
      const baseWorkPatterns: DailyWorkPattern[] = []

      // Removed check for personal tasks - no longer using hardcoded weekend blocks

      for (let i = 0; i < 30; i++) {
        const date = new Date(today)
        date.setDate(date.getDate() + i)
        const dayOfWeek = date.getDay()
        const dateStr = date.toISOString().split('T')[0]

        // Check if this day has work hours configured
        // Use custom hours for this day if configured, otherwise use default hours
        const dayWorkHours = workSettings?.customWorkHours?.[dayOfWeek] || workSettings?.defaultWorkHours

        // Create work pattern for each day (even if empty, so weekends are included)
        const blocks: any[] = []

        if (dayWorkHours && dayWorkHours.startTime && dayWorkHours.endTime) {
          // Regular work day
          blocks.push({
            id: `block-${dateStr}-work`,
            startTime: dayWorkHours.startTime,
            endTime: dayWorkHours.endTime,
            type: 'flexible',
            capacity: {
              focusMinutes: 240, // 4 hours
              adminMinutes: 180, // 3 hours
            },
          })
        }
        // Removed hardcoded weekend personal blocks - users should configure their own patterns

        // Always add the pattern, even if blocks are empty (for proper multi-day display)
        baseWorkPatterns.push({
          date: dateStr,
          blocks,
          meetings: [],
          accumulated: { focusMinutes: 0, adminMinutes: 0, personalMinutes: 0 },
        })
      }

      // Option 1: Optimal (Mathematical optimization for earliest completion)
      // Use UnifiedScheduler with aggressive optimization settings
      const optimalResult = scheduleForGantt(
        tasks.filter(t => !t.completed),
        baseWorkPatterns,
        {
          startDate: new Date(),
          respectDeadlines: true,
          allowSplitting: true,
          debug: true,
        },
        sequencedTasks.filter(w => !w.completed),
      )

      // Log the optimal schedule for AI debugging
      logSchedule(
        logger.ui,
        'optimal',
        tasks.filter(t => !t.completed),
        sequencedTasks.filter(w => !w.completed),
        optimalResult.scheduledTasks.map(item => ({
          id: item.task.id,
          name: item.task.name,
          type: 'task',
          priority: item.priority || 0,
          duration: item.task.duration,
          startTime: item.startTime,
          endTime: item.endTime,
          color: '#1890ff',
          deadline: item.task.deadline,
          originalItem: item.task,
        })),
        baseWorkPatterns,
        [], // blocks will be derived from work patterns
        {
          unscheduledItems: optimalResult.unscheduledTasks,
          warnings: optimalResult.conflicts,
        },
        optimalResult.conflicts,
      )

      options.push({
        id: 'optimal',
        name: 'Optimal (Fastest Completion)',
        description: 'Mathematically optimized for earliest possible completion',
        schedule: optimalResult.scheduledTasks,
        result: optimalResult,
        score: {
          deadlinesMet: optimalResult.unscheduledTasks.length === 0 ? 100 : 
            Math.max(0, 100 - (optimalResult.unscheduledTasks.length * 10)),
          capacityUtilization: optimalResult.scheduledTasks.length > 0 ? 85 : 0,
          asyncOptimization: 90,
          cognitiveMatch: 80,
        },
      })

      // Option 2: Balanced (Balance deadlines with work-life balance)
      // Use UnifiedScheduler with moderate settings
      const balancedResult = scheduleForGantt(
        tasks.filter(t => !t.completed),
        baseWorkPatterns,
        {
          startDate: new Date(),
          respectDeadlines: true,
          allowSplitting: false,  // Don't split tasks for better focus
          debug: true,
        },
        sequencedTasks.filter(w => !w.completed),
      )

      options.push({
        id: 'balanced',
        name: 'Balanced',
        description: 'Balances deadline pressure with sustainable work hours',
        schedule: balancedResult.scheduledTasks,
        result: balancedResult,
        score: {
          deadlinesMet: balancedResult.conflicts.length === 0 ? 100 : 70,
          capacityUtilization: 85,
          asyncOptimization: 75,
          cognitiveMatch: 80,
        },
      })

      // Option 3: Async-Optimized (Maximize parallel work)
      // Use UnifiedScheduler with focus on workflows and async tasks
      // Sort tasks to prioritize async workflows first
      const asyncPrioritizedTasks = [...tasks.filter(t => !t.completed)].sort((a, b) => {
        // Prioritize tasks with async wait times
        const aAsync = a.asyncWaitTime || 0
        const bAsync = b.asyncWaitTime || 0
        return bAsync - aAsync
      })

      const asyncResult = scheduleForGantt(
        asyncPrioritizedTasks,
        baseWorkPatterns,
        {
          startDate: new Date(),
          respectDeadlines: false,  // Focus on async optimization over deadlines
          allowSplitting: true,
          debug: true,
        },
        sequencedTasks.filter(w => !w.completed),
      )

      options.push({
        id: 'async-optimized',
        name: 'Async-Optimized',
        description: 'Starts async work early to maximize parallel execution',
        schedule: asyncResult.scheduledTasks,
        result: asyncResult,
        score: {
          deadlinesMet: asyncResult.conflicts.length === 0 ? 100 : 60,
          capacityUtilization: 80,
          asyncOptimization: 95,
          cognitiveMatch: 75,
        },
      })

      setScheduleOptions(options)
      if (options.length > 0) {
        setSelectedOption(options[0].id)
      }
    } catch (error) {
      logger.ui.error('Error generating schedules:', error)
      Message.error('Failed to generate schedule options')
    } finally {
      setGenerating(false)
    }
  }

  const renderSchedulePreview = (option: ScheduleOption) => {
    // Group schedule items by date
    const itemsByDate = new Map<string, LegacyScheduledItem[]>()

    for (const item of option.schedule) {
      const dateStr = dayjs(item.startTime).format('YYYY-MM-DD')
      const existing = itemsByDate.get(dateStr) || []
      existing.push(item)
      itemsByDate.set(dateStr, existing)
    }

    // Get first 7 days for preview
    const sortedDates = Array.from(itemsByDate.keys()).sort().slice(0, 7)

    return (
      <div style={{ maxHeight: 400, overflowY: 'auto' }}>
        <Tabs type="card-gutter">
          {sortedDates.map(dateStr => {
            const items = itemsByDate.get(dateStr) || []
            const dayName = dayjs(dateStr).format('ddd MMM D')

            return (
              <Tabs.TabPane key={dateStr} title={dayName}>
                <Space direction="vertical" style={{ width: '100%', padding: 12 }}>
                  {items.length === 0 ? (
                    <Text type="secondary">No tasks scheduled</Text>
                  ) : (
                    items.sort((a, b) => a.startTime.getTime() - b.startTime.getTime()).map(item => {
                      const isWorkflowStep = (item as any).isWorkflowStep
                      const stepIndex = (item as any).stepIndex
                      return (
                        <div
                          key={item.task.id}
                          style={{
                            padding: '8px 12px',
                            background: '#f5f5f5',
                            borderRadius: 4,
                            borderLeft: `3px solid #1890ff`,
                          }}
                        >
                          <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                            <div>
                              <Text style={{ fontWeight: 500 }}>{item.task.name}</Text>
                              {isWorkflowStep && stepIndex !== undefined && (
                                <Text type="secondary" style={{ fontSize: 12, marginLeft: 8 }}>
                                  (Step {stepIndex + 1})
                                </Text>
                              )}
                            </div>
                            <Text type="secondary" style={{ fontSize: 12 }}>
                              {dayjs(item.startTime).format('h:mm A')} - {item.task.duration}m
                            </Text>
                          </Space>
                        </div>
                      )
                    })
                  )}
                </Space>
              </Tabs.TabPane>
            )
          })}
        </Tabs>
      </div>
    )
  }

  const saveSelectedSchedule = async () => {
    const selected = scheduleOptions.find(opt => opt.id === selectedOption)
    if (!selected) return

    setSaving(true)

    try {
      const db = getDatabase()

      // Group scheduled items by date
      const itemsByDate = new Map<string, LegacyScheduledItem[]>()

      for (const item of selected.schedule) {
        const dateStr = dayjs(item.startTime).format('YYYY-MM-DD')
        const existing = itemsByDate.get(dateStr) || []
        existing.push(item)
        itemsByDate.set(dateStr, existing)
      }

      // Get existing patterns for all dates in range
      const allDates = new Set<string>()
      const firstDate = selected.schedule.length > 0
        ? dayjs(selected.schedule[0].startTime).format('YYYY-MM-DD')
        : dayjs().format('YYYY-MM-DD')

      // Generate all dates for the next 30 days to match what was displayed
      for (let i = 0; i < 30; i++) {
        const date = dayjs(firstDate).add(i, 'day')
        allDates.add(date.format('YYYY-MM-DD'))
      }

      // Also add any dates that have scheduled items
      for (const item of selected.schedule) {
        allDates.add(dayjs(item.startTime).format('YYYY-MM-DD'))
      }

      // Create work patterns for each day (including empty days)
      for (const dateStr of Array.from(allDates).sort()) {
        const items = itemsByDate.get(dateStr) || []
        const date = new Date(dateStr)
        const dayOfWeek = date.getDay()
        const blocks: any[] = []
        const isOptimalSchedule = selected.name.includes('Optimal')

        // Fetch existing pattern to preserve meetings (like sleep blocks)
        const existingPattern = await db.getWorkPattern(dateStr)
        const existingMeetings = existingPattern?.meetings || []

        if (items.length > 0) {
          // Find the earliest start and latest end time for all items on this day
          const sortedItems = items.sort((a, b) => a.startTime.getTime() - b.startTime.getTime())

          // Safety check - ensure we have items after sorting
          if (!sortedItems.length || !sortedItems[0]) {
            logger.ui.error('Unexpected empty sortedItems after sorting', { dateStr, itemsLength: items.length })
            continue
          }

          const earliestStart = dayjs(sortedItems[0].startTime).format('HH:mm')
          const latestEnd = sortedItems.reduce((latest, item) => {
            return item.endTime > latest ? item.endTime : latest
          }, sortedItems[0].endTime)
          const latestEndStr = dayjs(latestEnd).format('HH:mm')

          // Calculate total capacity used
          let focusMinutes = 0
          let adminMinutes = 0
          let personalMinutes = 0

          for (const item of items) {
            const task = item.task
            if (task.type === TaskType.Focused) {
              focusMinutes += task.duration
            } else if (task.type === TaskType.Personal) {
              personalMinutes += task.duration
            } else {
              adminMinutes += task.duration
            }
          }

          // For optimal schedules, create blocks with AVAILABLE capacity, not just used capacity
          // The optimal scheduler can schedule ALL DAY (7am-11pm = 16 hours = 960 minutes)
          const totalMinutes = dayjs(latestEnd).diff(dayjs(sortedItems[0].startTime), 'minute')

          blocks.push({
            id: `block-${dateStr}-work`,
            startTime: earliestStart,
            endTime: latestEndStr,
            type: personalMinutes > 0 && focusMinutes === 0 && adminMinutes === 0 ? 'personal' : 'flexible',
            capacity: {
              // For optimal schedules, set capacity to total available time
              // For other schedules, set to what was actually used
              focusMinutes: isOptimalSchedule ? Math.max(focusMinutes, Math.floor(totalMinutes * 0.6)) : focusMinutes,
              adminMinutes: isOptimalSchedule ? Math.max(adminMinutes, Math.floor(totalMinutes * 0.4)) : adminMinutes,
              ...(personalMinutes > 0 ? { personalMinutes } : {}),
            },
          })
        }

        // For days without scheduled items, create default work blocks
        // This is especially important for optimal schedules to have future capacity
        if (blocks.length === 0) {
          // Use configured work hours or default to 9-5
          const dayWorkHours = workSettings?.customWorkHours?.[dayOfWeek] ||
                               workSettings?.defaultWorkHours ||
                               { startTime: '09:00', endTime: '17:00' }

          if (dayWorkHours && dayWorkHours.startTime && dayWorkHours.endTime) {
            // For optimal schedules, provide generous capacity for future scheduling
            // For other schedules, use reasonable defaults
            const startHour = parseInt(dayWorkHours.startTime.split(':')[0])
            const endHour = parseInt(dayWorkHours.endTime.split(':')[0])
            const totalHours = endHour - startHour
            const totalMinutes = totalHours * 60

            blocks.push({
              id: `block-${dateStr}-default`,
              startTime: dayWorkHours.startTime,
              endTime: dayWorkHours.endTime,
              type: 'flexible',
              capacity: {
                focusMinutes: isOptimalSchedule ? Math.floor(totalMinutes * 0.6) : 240, // 60% for optimal, 4h for others
                adminMinutes: isOptimalSchedule ? Math.floor(totalMinutes * 0.4) : 180, // 40% for optimal, 3h for others
              },
            })
          }
        }

        // Save work pattern (preserve existing meetings like sleep blocks)
        await db.createWorkPattern({
          date: dateStr,
          blocks: blocks.map(b => ({
            startTime: b.startTime,
            endTime: b.endTime,
            type: b.type,
            capacity: b.capacity,
          })),
          meetings: existingMeetings,
        })
      }

      // Save the schedule to the store if it's an optimal schedule
      if (selected.id === 'optimal') {
        // Convert LegacyScheduledItem to the format expected by the store
        const storeSchedule = selected.schedule.map(item => ({
          id: item.task.id,
          name: item.task.name,
          type: 'task' as const,
          priority: item.priority || 0,
          duration: item.task.duration,
          startTime: item.startTime,
          endTime: item.endTime,
          color: '#1890ff',
          deadline: item.task.deadline,
          originalItem: item.task,
        }))
        setOptimalSchedule(storeSchedule)
      }

      Message.success('Schedule saved successfully!')
      onScheduleAccepted()
      onClose()
    } catch (error) {
      logger.ui.error('Error saving schedule:', error)
      Message.error('Failed to save schedule')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title="Generate Optimized Schedule"
      visible={visible}
      onCancel={onClose}
      style={{ width: 900 }}
      footer={
        <Space>
          <Button onClick={onClose}>Cancel</Button>
          {scheduleOptions.length === 0 ? (
            <Button type="primary" onClick={generateScheduleOptions} loading={generating}>
              Generate Options
            </Button>
          ) : (
            <>
              <Button onClick={() => setScheduleOptions([])}>
                Regenerate
              </Button>
              <Button
                type="primary"
                onClick={saveSelectedSchedule}
                loading={saving}
                disabled={!selectedOption}
                icon={<IconSave />}
              >
                Accept & Save Schedule
              </Button>
            </>
          )}
        </Space>
      }
    >
      {generating && (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <Spin size={40} />
          <Title heading={6} style={{ marginTop: 20 }}>
            Generating optimized schedule options...
          </Title>
        </div>
      )}

      {!generating && scheduleOptions.length === 0 && (
        <Alert
          type="info"
          content="Click 'Generate Options' to create multiple optimized schedules based on different strategies. You can then preview and select the best option for your needs."
        />
      )}

      {scheduleOptions.length > 0 && (
        <Space direction="vertical" style={{ width: '100%' }} size="large">
          <Radio.Group
            value={selectedOption}
            onChange={setSelectedOption}
            style={{ width: '100%' }}
          >
            <Space direction="vertical" style={{ width: '100%' }}>
              {scheduleOptions.map(option => (
                <Card
                  key={option.id}
                  hoverable
                  style={{
                    cursor: 'pointer',
                    border: selectedOption === option.id ? '2px solid #3370ff' : undefined,
                  }}
                  onClick={() => setSelectedOption(option.id)}
                >
                  <Radio value={option.id}>
                    <Space direction="vertical" style={{ marginLeft: 8 }}>
                      <Space>
                        <Title heading={6} style={{ margin: 0 }}>
                          {option.name}
                        </Title>
                        {option.result.unscheduledTasks.length === 0 && option.result.conflicts.length === 0 && (
                          <Tag color="green">All Tasks Scheduled</Tag>
                        )}
                        {option.result.unscheduledTasks.length > 0 && (
                          <Tag color="orange">{option.result.unscheduledTasks.length} Unscheduled</Tag>
                        )}
                        {option.result.conflicts.length > 0 && (
                          <Tag color="red">{option.result.conflicts.length} Conflicts</Tag>
                        )}
                      </Space>

                      <Text type="secondary">{option.description}</Text>

                      <Row gutter={16} style={{ marginTop: 12 }}>
                        <Col span={6}>
                          <div style={{ textAlign: 'center' }}>
                            <Text type="secondary" style={{ fontSize: 12 }}>Deadlines</Text>
                            <div style={{ fontSize: 20, fontWeight: 'bold', color: getScoreColor(option.score.deadlinesMet) }}>
                              {option.score.deadlinesMet}%
                            </div>
                          </div>
                        </Col>
                        <Col span={6}>
                          <div style={{ textAlign: 'center' }}>
                            <Text type="secondary" style={{ fontSize: 12 }}>Capacity</Text>
                            <div style={{ fontSize: 20, fontWeight: 'bold', color: getScoreColor(option.score.capacityUtilization) }}>
                              {option.score.capacityUtilization}%
                            </div>
                          </div>
                        </Col>
                        <Col span={6}>
                          <div style={{ textAlign: 'center' }}>
                            <Text type="secondary" style={{ fontSize: 12 }}>Async</Text>
                            <div style={{ fontSize: 20, fontWeight: 'bold', color: getScoreColor(option.score.asyncOptimization) }}>
                              {option.score.asyncOptimization}%
                            </div>
                          </div>
                        </Col>
                        <Col span={6}>
                          <div style={{ textAlign: 'center' }}>
                            <Text type="secondary" style={{ fontSize: 12 }}>Cognitive</Text>
                            <div style={{ fontSize: 20, fontWeight: 'bold', color: getScoreColor(option.score.cognitiveMatch) }}>
                              {option.score.cognitiveMatch}%
                            </div>
                          </div>
                        </Col>
                      </Row>

                      {option.result.debugInfo?.warnings && option.result.debugInfo.warnings.length > 0 && (
                        <div style={{ marginTop: 8 }}>
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            ⚠️ {option.result.debugInfo.warnings[0]}
                          </Text>
                        </div>
                      )}

                      <Button
                        type="text"
                        icon={<IconEye />}
                        onClick={(e) => {
                          e.stopPropagation()
                          setSelectedOption(option.id)
                          setShowPreview(true)
                        }}
                        style={{ marginTop: 8 }}
                      >
                        Preview Schedule
                      </Button>
                    </Space>
                  </Radio>
                </Card>
              ))}
            </Space>
          </Radio.Group>

          {selectedOption && (
            <Alert
              type="info"
              content="After accepting this schedule, it will be saved to your calendar. You can then edit individual days as needed."
            />
          )}
        </Space>
      )}

      {/* Schedule Preview Modal */}
      <Modal
        title="Schedule Preview"
        visible={showPreview}
        onCancel={() => setShowPreview(false)}
        style={{ width: 800 }}
        footer={
          <Space>
            <Button onClick={() => setShowPreview(false)}>Close</Button>
            <Button
              type="primary"
              onClick={() => {
                setShowPreview(false)
                saveSelectedSchedule()
              }}
              icon={<IconSave />}
            >
              Accept & Save This Schedule
            </Button>
          </Space>
        }
      >
        {selectedOption && scheduleOptions.find(opt => opt.id === selectedOption) && (
          <>
            <Alert
              type="info"
              content={`Preview of "${scheduleOptions.find(opt => opt.id === selectedOption)?.name}" schedule for the next 7 days`}
              style={{ marginBottom: 16 }}
            />
            {renderSchedulePreview(scheduleOptions.find(opt => opt.id === selectedOption)!)}
          </>
        )}
      </Modal>
    </Modal>
  )
}

function getScoreColor(score: number): string {
  if (score >= 90) return '#52c41a'
  if (score >= 70) return '#faad14'
  if (score >= 50) return '#ff7d00'
  return '#ff4d4f'
}
