import { useState } from 'react'
import { TaskType } from '@shared/enums'
import { Modal, Button, Space, Card, Typography, Radio, Spin, Tag, Alert, Grid, Tabs } from '@arco-design/web-react'
import { IconSave, IconEye } from '@arco-design/web-react/icon'
import { Task } from '@shared/types'
import { SequencedTask } from '@shared/sequencing-types'
import { scheduleWithDeadlines, SchedulingContext, SchedulingResult } from '../../utils/deadline-scheduler'
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
        } else if (isWeekend) {
          // Weekend personal time block (10am-2pm as user requested)
          blocks.push({
            id: `block-${dateStr}-personal`,
            startTime: '10:00',
            endTime: '14:00',
            type: 'personal',
            capacity: {
              personalMinutes: 240, // 4 hours
            },
          })
        }

        // Always add the pattern, even if blocks are empty (for proper multi-day display)
        baseWorkPatterns.push({
          date: dateStr,
          blocks,
          meetings: [],
          accumulated: { focusMinutes: 0, adminMinutes: 0, personalMinutes: 0 },
        })
      }

      // Option 1: Deadline-First (Prioritize meeting all deadlines)
      const deadlineContext: SchedulingContext = {
        currentTime: new Date(),
        tasks: tasks.filter(t => !t.completed),
        workflows: sequencedTasks.filter(w => !w.completed),
        workPatterns: baseWorkPatterns,
        productivityPatterns: [],
        schedulingPreferences: {
          id: 'deadline-first',
          sessionId: 'default',
          allowWeekendWork: workSettings?.customWorkHours?.[6] !== undefined ||
                           workSettings?.customWorkHours?.[0] !== undefined,
          weekendPenalty: 0.8,
          contextSwitchPenalty: 15,
          asyncParallelizationBonus: 5,
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

      const deadlineResult = scheduleWithDeadlines(deadlineContext)
      options.push({
        id: 'deadline-first',
        name: 'Deadline-Focused',
        description: 'Prioritizes meeting all deadlines, may require overtime',
        schedule: deadlineResult.schedule,
        result: deadlineResult,
        score: {
          deadlinesMet: deadlineResult.failures.length === 0 ? 100 : 50,
          capacityUtilization: 75,
          asyncOptimization: 60,
          cognitiveMatch: 70,
        },
      })

      // Option 2: Balanced (Balance deadlines with work-life balance)
      const balancedContext: SchedulingContext = {
        ...deadlineContext,
        workPatterns: [...baseWorkPatterns], // Fresh copy
        schedulingPreferences: {
          ...deadlineContext.schedulingPreferences,
          id: 'balanced',
          weekendPenalty: 0.5,
          contextSwitchPenalty: 20,
          asyncParallelizationBonus: 10,
        },
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
        ...deadlineContext,
        workPatterns: [...baseWorkPatterns], // Fresh copy
        schedulingPreferences: {
          ...deadlineContext.schedulingPreferences,
          id: 'async-optimized',
          weekendPenalty: 0.3,
          contextSwitchPenalty: 10,
          asyncParallelizationBonus: 20,
        },
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

      // Generate all dates for the next 7 days (or more based on schedule)
      for (let i = 0; i < 7; i++) {
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

        // Group items into work blocks
        let currentBlock: any = null

        for (const item of items.sort((a, b) => a.startTime.getTime() - b.startTime.getTime())) {
          const startTime = dayjs(item.startTime).format('HH:mm')
          const endTime = dayjs(item.endTime).format('HH:mm')

          if (!currentBlock || currentBlock.endTime !== startTime) {
            // Start new block
            if (currentBlock) {
              blocks.push(currentBlock)
            }
            currentBlock = {
              id: `block-${blocks.length}`,
              startTime,
              endTime,
              type: 'mixed',
              capacity: {
                focusMinutes: 0,
                adminMinutes: 0,
              },
              tasks: [item],
            }
          } else {
            // Extend current block
            currentBlock.endTime = endTime
            currentBlock.tasks.push(item)
          }

          // Update capacity
          if (item.type === 'task' || item.type === 'workflow-step') {
            const task = item.originalItem as Task
            if (task.type === TaskType.Focused) {
              currentBlock.capacity.focusMinutes += item.duration
            } else {
              currentBlock.capacity.adminMinutes += item.duration
            }
          }
        }

        if (currentBlock) {
          blocks.push(currentBlock)
        }

        // If no blocks created but it's a weekend, add personal time block
        if (blocks.length === 0 && isWeekend) {
          blocks.push({
            startTime: '10:00',
            endTime: '14:00',
            type: 'personal',
            capacity: {
              personalMinutes: 240, // 4 hours
            },
          })
        } else if (blocks.length === 0 && !isWeekend) {
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
