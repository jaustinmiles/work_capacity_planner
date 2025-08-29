import { useState } from 'react'
import { TaskType } from '@shared/enums'
import { Modal, Button, Space, Card, Typography, Radio, Spin, Tag, Alert, Grid, Tabs } from '@arco-design/web-react'
import { IconSave, IconEye } from '@arco-design/web-react/icon'
import { Task } from '@shared/types'
import { SequencedTask } from '@shared/sequencing-types'
import { scheduleWithDeadlines, SchedulingContext, SchedulingResult } from '../../utils/deadline-scheduler'
import { generateOptimalSchedule, OptimalScheduleConfig } from '../../utils/optimal-scheduler'
import { ScheduledItem } from '../../utils/flexible-scheduler'
import { DailyWorkPattern } from '@shared/work-blocks-types'
import { getDatabase } from '../../services/database'
import { useTaskStore } from '../../store/useTaskStore'
import { Message } from '../common/Message'
import dayjs from 'dayjs'
import { logger } from '../../utils/logger'


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
  schedule: ScheduledItem[]
  result: SchedulingResult
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
  const { workSettings } = useTaskStore()

  const generateScheduleOptions = async () => {
    setGenerating(true)

    try {
      const options: ScheduleOption[] = []

      // Create base work patterns for the next 30 days with proper work hours
      const baseWorkPatterns: DailyWorkPattern[] = []
      const today = new Date()
      today.setHours(0, 0, 0, 0)

      // Removed check for personal tasks - no longer using hardcoded weekend blocks

      for (let i = 0; i < 30; i++) {
        const date = new Date(today)
        date.setDate(date.getDate() + i)
        const dayOfWeek = date.getDay()
        const dateStr = date.toISOString().split('T')[0]
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6

        // Check if this day has work hours configured
        const dayWorkHours = workSettings?.customWorkHours?.[dayOfWeek] ||
                            (!isWeekend ? workSettings?.defaultWorkHours : null)

        // Create work pattern for each day (even if empty, so weekends are included)
        const blocks: any[] = []

        if (dayWorkHours && dayWorkHours.startTime && dayWorkHours.endTime) {
          // Regular work day
          blocks.push({
            id: `block-${dateStr}-work`,
            startTime: dayWorkHours.startTime,
            endTime: dayWorkHours.endTime,
            type: 'mixed',
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

      // Removed hardcoded weekend work blocks - respect user's work patterns even with deadlines

      // Option 1: Optimal (Mathematical optimization for earliest completion)
      const optimalConfig: OptimalScheduleConfig = {
        sleepStart: '23:00',
        sleepEnd: '07:00',
        meetings: [], // TODO: Get actual meetings from calendar
        preferredBreakInterval: 90,
        preferredBreakDuration: 15,
        maxContinuousWork: 180,
      }

      const optimalResult = generateOptimalSchedule(
        tasks.filter(t => !t.completed),
        sequencedTasks.filter(w => !w.completed),
        new Date(),
        optimalConfig,
      )

      // Convert optimal schedule to ScheduledItem format for compatibility
      const optimalScheduledItems: ScheduledItem[] = optimalResult.schedule.map(item => ({
        id: item.id,
        name: item.name,
        type: item.type === 'workflow-step' ? 'workflow-step' :
              item.type === 'async-wait' ? 'async-wait' : 'task',
        priority: item.priority,
        duration: item.duration,
        startTime: item.startTime,
        endTime: item.endTime,
        color: '#1890ff', // Default color
        deadline: item.deadline,
        originalItem: item.originalItem,
      }))

      options.push({
        id: 'optimal',
        name: 'Optimal (Fastest Completion)',
        description: 'Mathematically optimized for earliest possible completion',
        schedule: optimalScheduledItems,
        result: {
          schedule: optimalScheduledItems,
          warnings: optimalResult.warnings.map(w => ({
            type: 'capacity_warning' as const,
            message: w,
            item: {} as any,
          })),
          failures: [],
          suggestions: optimalResult.suggestions.map(s => ({
            type: 'async_optimization' as const,
            message: s,
            recommendation: s,
          })),
        },
        score: {
          deadlinesMet: optimalResult.metrics.deadlinesMet > 0 ?
            (optimalResult.metrics.deadlinesMet / (optimalResult.metrics.deadlinesMet + optimalResult.metrics.deadlinesMissed)) * 100 : 100,
          capacityUtilization: Math.min(100, (optimalResult.metrics.activeWorkTime / optimalResult.metrics.totalDuration) * 100),
          asyncOptimization: optimalResult.metrics.asyncParallelTime > 0 ? 90 : 50,
          cognitiveMatch: 80,
        },
      })

      // Option 2: Balanced (Balance deadlines with work-life balance)
      const balancedContext: SchedulingContext = {
        currentTime: new Date(),
        tasks: tasks.filter(t => !t.completed),
        workflows: sequencedTasks.filter(w => !w.completed),
        workPatterns: [...baseWorkPatterns], // Fresh copy
        productivityPatterns: [],
        schedulingPreferences: {
          id: 'balanced',
          sessionId: 'default',
          allowWeekendWork: false,
          weekendPenalty: 0.5,
          contextSwitchPenalty: 20,
          asyncParallelizationBonus: 10,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        workSettings: {
          defaultCapacity: {
            maxFocusHours: 4,
            maxAdminHours: 3,
          },
          defaultWorkHours: workSettings?.defaultWorkHours || {
            startTime: '09:00',
            endTime: '18:00',
          },
          customWorkHours: workSettings?.customWorkHours || {},
        } as any,
        lastScheduledItem: null,
      }

      const balancedResult = scheduleWithDeadlines(balancedContext)
      options.push({
        id: 'balanced',
        name: 'Balanced',
        description: 'Balances deadline pressure with sustainable work hours',
        schedule: balancedResult.schedule,
        result: balancedResult,
        score: {
          deadlinesMet: balancedResult.failures.length === 0 ? 100 : 70,
          capacityUtilization: 85,
          asyncOptimization: 75,
          cognitiveMatch: 80,
        },
      })

      // Option 3: Async-Optimized (Maximize parallel work)
      const asyncContext: SchedulingContext = {
        currentTime: new Date(),
        tasks: tasks.filter(t => !t.completed),
        workflows: sequencedTasks.filter(w => !w.completed),
        workPatterns: [...baseWorkPatterns], // Fresh copy
        productivityPatterns: [],
        schedulingPreferences: {
          id: 'async-optimized',
          sessionId: 'default',
          allowWeekendWork: true,
          weekendPenalty: 0.3,
          contextSwitchPenalty: 10,
          asyncParallelizationBonus: 20,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        workSettings: {
          defaultCapacity: {
            maxFocusHours: 4,
            maxAdminHours: 3,
          },
          defaultWorkHours: workSettings?.defaultWorkHours || {
            startTime: '09:00',
            endTime: '18:00',
          },
          customWorkHours: workSettings?.customWorkHours || {},
        } as any,
        lastScheduledItem: null,
      }

      const asyncResult = scheduleWithDeadlines(asyncContext)
      options.push({
        id: 'async-optimized',
        name: 'Async-Optimized',
        description: 'Starts async work early to maximize parallel execution',
        schedule: asyncResult.schedule,
        result: asyncResult,
        score: {
          deadlinesMet: asyncResult.failures.length === 0 ? 100 : 60,
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
    const itemsByDate = new Map<string, ScheduledItem[]>()

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
                    items.sort((a, b) => a.startTime.getTime() - b.startTime.getTime()).map(item => (
                      <div
                        key={item.id}
                        style={{
                          padding: '8px 12px',
                          background: '#f5f5f5',
                          borderRadius: 4,
                          borderLeft: `3px solid ${item.color}`,
                        }}
                      >
                        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                          <div>
                            <Text style={{ fontWeight: 500 }}>{item.name}</Text>
                            {item.type === 'workflow-step' && item.stepIndex !== undefined && (
                              <Text type="secondary" style={{ fontSize: 12, marginLeft: 8 }}>
                                (Step {item.stepIndex + 1})
                              </Text>
                            )}
                          </div>
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            {dayjs(item.startTime).format('h:mm A')} - {item.duration}m
                          </Text>
                        </Space>
                      </div>
                    ))
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
      const itemsByDate = new Map<string, ScheduledItem[]>()

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
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6
        const blocks: any[] = []

        if (items.length > 0) {
          // Find the earliest start and latest end time for all items on this day
          const sortedItems = items.sort((a, b) => a.startTime.getTime() - b.startTime.getTime())
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
            if (item.type === 'task' || item.type === 'workflow-step') {
              const task = item.originalItem as Task
              if (task.type === TaskType.Focused) {
                focusMinutes += item.duration
              } else if (task.type === TaskType.Personal) {
                personalMinutes += item.duration
              } else {
                adminMinutes += item.duration
              }
            }
          }

          // Create a single block for the entire work period
          blocks.push({
            id: `block-${dateStr}-work`,
            startTime: earliestStart,
            endTime: latestEndStr,
            type: personalMinutes > 0 && focusMinutes === 0 && adminMinutes === 0 ? 'personal' : 'mixed',
            capacity: {
              focusMinutes,
              adminMinutes,
              ...(personalMinutes > 0 ? { personalMinutes } : {}),
            },
          })
        }

        // Don't add empty blocks for optimal scheduling - only create blocks when there's work
        const isOptimalSchedule = selected.name.includes('Optimal')
        if (blocks.length === 0 && !isWeekend && !isOptimalSchedule) {
          // For weekdays without scheduled items, create default work blocks
          const dayWorkHours = workSettings?.customWorkHours?.[dayOfWeek] || workSettings?.defaultWorkHours
          if (dayWorkHours && dayWorkHours.startTime && dayWorkHours.endTime) {
            blocks.push({
              startTime: dayWorkHours.startTime,
              endTime: dayWorkHours.endTime,
              type: 'mixed',
              capacity: {
                focusMinutes: 240, // 4 hours default
                adminMinutes: 180, // 3 hours default
              },
            })
          }
        }

        // Save work pattern
        await db.createWorkPattern({
          date: dateStr,
          blocks: blocks.map(b => ({
            startTime: b.startTime,
            endTime: b.endTime,
            type: b.type,
            capacity: b.capacity,
          })),
          meetings: [],
        })
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
                        {option.result.failures.length === 0 && (
                          <Tag color="green">All Deadlines Met</Tag>
                        )}
                        {option.result.warnings.length > 0 && (
                          <Tag color="orange">{option.result.warnings.length} Warnings</Tag>
                        )}
                        {option.result.failures.length > 0 && (
                          <Tag color="red">{option.result.failures.length} Conflicts</Tag>
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

                      {option.result.suggestions.length > 0 && (
                        <div style={{ marginTop: 8 }}>
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            💡 {option.result.suggestions[0].message}
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
