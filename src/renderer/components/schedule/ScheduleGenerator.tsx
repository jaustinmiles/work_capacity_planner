import { useState } from 'react'
import { Modal, Button, Space, Card, Typography, Radio, Spin, Tag, Alert, Grid, Tabs } from '@arco-design/web-react'
import { IconSave, IconEye } from '@arco-design/web-react/icon'
import { Task } from '@shared/types'
import { SequencedTask } from '@shared/sequencing-types'
import { useUnifiedScheduler, ScheduleResult, UnifiedScheduleItem } from '../../hooks/useUnifiedScheduler'
import { OptimizationMode } from '@shared/unified-scheduler'
import { DailyWorkPattern } from '@shared/work-blocks-types'
import { getDatabase } from '../../services/database'
import { useTaskStore } from '../../store/useTaskStore'
import { Message } from '../common/Message'
import dayjs from 'dayjs'
import { logger } from '@/logger'
import { calculateBlockCapacity } from '@shared/capacity-calculator'
import { SystemBlockType, createEmptyAccumulatedTime } from '@shared/user-task-types'


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
  schedule: UnifiedScheduleItem[]
  result: ScheduleResult
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
  const scheduler = useUnifiedScheduler()

  // Helper to call scheduler with proper context/config
  const callScheduler = (tasksToSchedule: Task[], workflowsToSchedule: SequencedTask[], workPatterns: DailyWorkPattern[], config: { allowTaskSplitting: boolean; optimizationMode: OptimizationMode }) => {
    const currentTime = new Date()
    const startDateString = currentTime.toISOString().split('T')[0]

    const context = {
      startDate: startDateString,
      tasks: tasksToSchedule,
      workflows: workflowsToSchedule,
      workPatterns,
      workSettings,
      currentTime,
    }

    const scheduleConfig = {
      startDate: currentTime,
      allowTaskSplitting: config.allowTaskSplitting,
      respectMeetings: true,
      optimizationMode: config.optimizationMode,
      debugMode: true,
    }

    const items = [...tasksToSchedule, ...workflowsToSchedule]
    return scheduler.scheduleForDisplay(items, context, scheduleConfig)
  }

  const generateScheduleOptions = async () => {
    setGenerating(true)
    logger.ui.info('Starting schedule generation', {}, 'schedule-generate-start')

    try {
      const options: ScheduleOption[] = []

      // Fetch all existing meetings (including sleep blocks) for the next 30 days
      const db = await getDatabase()
      const allMeetings: any[] = []
      const today = new Date()
      today.setHours(0, 0, 0, 0)

      logger.ui.debug('Fetching existing meetings and sleep blocks for next 30 days', {}, 'schedule-fetch-meetings')

      for (let i = 0; i < 30; i++) {
        const date = new Date(today)
        date.setDate(date.getDate() + i)
        const dateStr = date.toISOString().split('T')[0]
        const pattern = await db.getWorkPattern(dateStr)
        if (pattern?.meetings) {
          logger.ui.trace('Found meetings for day', {
            day: i,
            date: dateStr,
            meetingCount: pattern.meetings.length,
          }, 'schedule-day-meetings')
          allMeetings.push(...pattern.meetings.map((m: any) => ({
            ...m,
            date: dateStr,
          })))
        }
      }

      logger.ui.info('Found existing meetings/blocks to preserve', {
        totalCount: allMeetings.length,
        meetingTypes: allMeetings.map(m => ({ name: m.name, type: m.type, date: m.date })),
      }, 'schedule-existing-meetings')

      // Create base work patterns for the next 30 days with proper work hours
      const baseWorkPatterns: DailyWorkPattern[] = []

      // Removed check for personal tasks - no longer using hardcoded weekend blocks

      for (let i = 0; i < 30; i++) {
        const date = new Date(today)
        date.setDate(date.getDate() + i)
        const _dayOfWeek = date.getDay()
        const dateStr = date.toISOString().split('T')[0]

        // Check if this day has work hours configured
        // Use custom hours for this day if configured, otherwise use default hours
        const dayWorkHours = workSettings?.customWorkHours?.[_dayOfWeek] || workSettings?.defaultWorkHours

        // Create work pattern for each day (even if empty, so weekends are included)
        const blocks: any[] = []

        if (dayWorkHours && dayWorkHours.startTime && dayWorkHours.endTime) {
          // Regular work day - create system blocked placeholder
          // Users should configure proper task types and patterns in settings
          const typeConfig = { kind: 'system' as const, systemType: SystemBlockType.Blocked }
          blocks.push({
            id: `block-${dateStr}-work`,
            startTime: dayWorkHours.startTime,
            endTime: dayWorkHours.endTime,
            typeConfig,
            capacity: calculateBlockCapacity(typeConfig, dayWorkHours.startTime, dayWorkHours.endTime),
          })
        }
        // Removed hardcoded weekend personal blocks - users should configure their own patterns

        // Always add the pattern, even if blocks are empty (for proper multi-day display)
        baseWorkPatterns.push({
          date: dateStr,
          blocks,
          meetings: [],
          accumulated: createEmptyAccumulatedTime(),
        })
      }

      // Option 1: Optimal (Mathematical optimization for earliest completion)
      const incompleteTasks = tasks.filter(t => !t.completed)
      const incompleteWorkflows = sequencedTasks.filter(w => !w.completed)

      const optimalResult = callScheduler(incompleteTasks, incompleteWorkflows, baseWorkPatterns, {
        allowTaskSplitting: true,
        optimizationMode: OptimizationMode.Optimal,
      })

      logger.ui.debug('Generated optimal schedule', {
        incompleteTasks: incompleteTasks.length,
        incompleteWorkflows: incompleteWorkflows.length,
        scheduledTasks: optimalResult.scheduled.length,
        workPatterns: baseWorkPatterns.length,
        conflicts: optimalResult.conflicts?.length || 0,
      })

      options.push({
        id: 'optimal',
        name: 'Optimal (Fastest Completion)',
        description: 'Mathematically optimized for earliest possible completion',
        schedule: optimalResult.scheduled,
        result: optimalResult,
        score: {
          deadlinesMet: optimalResult.unscheduled.length === 0 ? 100 :
            Math.max(0, 100 - (optimalResult.unscheduled.length * 10)),
          capacityUtilization: optimalResult.scheduled.length > 0 ? 85 : 0,
          asyncOptimization: 90,
          cognitiveMatch: 80,
        },
      })

      // Option 2: Balanced
      const balancedResult = callScheduler(incompleteTasks, incompleteWorkflows, baseWorkPatterns, {
        allowTaskSplitting: false,
        optimizationMode: OptimizationMode.Realistic,
      })

      options.push({
        id: 'balanced',
        name: 'Balanced',
        description: 'Balances deadline pressure with sustainable work hours',
        schedule: balancedResult.scheduled,
        result: balancedResult,
        score: {
          deadlinesMet: (balancedResult.conflicts?.length || 0) === 0 ? 100 : 70,
          capacityUtilization: 85,
          asyncOptimization: 75,
          cognitiveMatch: 80,
        },
      })

      // Option 3: Async-Optimized
      const asyncPrioritizedTasks = [...incompleteTasks].sort((a, b) => {
        const aAsync = a.asyncWaitTime || 0
        const bAsync = b.asyncWaitTime || 0
        return bAsync - aAsync
      })

      const asyncResult = callScheduler(asyncPrioritizedTasks, incompleteWorkflows, baseWorkPatterns, {
        allowTaskSplitting: true,
        optimizationMode: OptimizationMode.Conservative,
      })

      options.push({
        id: 'async',
        name: 'Async-Optimized',
        description: 'Maximizes parallel work with async wait times',
        schedule: asyncResult.scheduled,
        result: asyncResult,
        score: {
          deadlinesMet: (asyncResult.conflicts?.length || 0) === 0 ? 90 : 60,
          capacityUtilization: 80,
          asyncOptimization: 95,
          cognitiveMatch: 75,
        },
      })

      setScheduleOptions(options)
      if (options.length > 0) {
        setSelectedOption(options[0].id)
      }

      logger.ui.info('Schedule generation complete', {
        optionsCount: options.length,
      }, 'schedule-generate-complete')
    } catch (error) {
      logger.ui.error('Failed to generate schedule options', {
        error: error instanceof Error ? error.message : String(error),
      }, 'schedule-generate-error')
      Message.error('Failed to generate schedule options')
    } finally {
      setGenerating(false)
    }
  }

  const renderSchedulePreview = (option: ScheduleOption) => {
    // Group schedule items by date
    const itemsByDate = new Map<string, UnifiedScheduleItem[]>()

    for (const item of option.schedule) {
      if (!item.startTime) continue
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
                    items.sort((a, b) => (a.startTime || new Date()).getTime() - (b.startTime || new Date()).getTime()).map(item => {
                      const isWorkflowStep = item.type === 'workflow-step'
                      const stepIndex = item.stepIndex
                      return (
                        <div
                          key={item.id}
                          style={{
                            padding: '8px 12px',
                            background: '#f5f5f5',
                            borderRadius: 4,
                            borderLeft: '3px solid #1890ff',
                          }}
                        >
                          <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                            <div>
                              <Text style={{ fontWeight: 500 }}>{item.name}</Text>
                              {isWorkflowStep && stepIndex !== undefined && (
                                <Text type="secondary" style={{ fontSize: 12, marginLeft: 8 }}>
                                  (Step {stepIndex + 1})
                                </Text>
                              )}
                            </div>
                            <Text type="secondary" style={{ fontSize: 12 }}>
                              {dayjs(item.startTime).format('h:mm A')} - {item.duration}m
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
      const itemsByDate = new Map<string, UnifiedScheduleItem[]>()

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
        const _dayOfWeek = date.getDay()
        const blocks: any[] = []
        const _isOptimalSchedule = selected.name.includes('Optimal')

        // Fetch existing pattern to preserve meetings (like sleep blocks)
        const existingPattern = await db.getWorkPattern(dateStr)
        const existingMeetings = existingPattern?.meetings || []

        if (items.length > 0) {
          // Find the earliest start and latest end time for all items on this day
          const sortedItems = items
            .filter(item => item.startTime && item.endTime)
            .sort((a, b) => a.startTime!.getTime() - b.startTime!.getTime())

          // Safety check - ensure we have items after sorting
          if (!sortedItems.length || !sortedItems[0]) {
            logger.ui.error('Unexpected empty sortedItems after sorting', {
              dateStr,
              itemsLength: items.length,
            }, 'schedule-sort-error')
            continue
          }

          const earliestStart = dayjs(sortedItems[0].startTime).format('HH:mm')
          const latestEnd = sortedItems.reduce((latest, item) => {
            const itemEnd = item.endTime!
            return itemEnd > latest ? itemEnd : latest
          }, sortedItems[0].endTime!)
          const latestEndStr = dayjs(latestEnd).format('HH:mm')

          // Calculate total capacity used (kept for potential future use)
          let _focus = 0
          const _admin = 0
          const _personal = 0

          for (const item of items) {
            // Note: With user-configurable task types, we no longer have hardcoded type checks
            // Capacity calculation is now handled per user-defined types
            _focus += item.duration
          }

          // For optimal schedules, create blocks with AVAILABLE capacity, not just used capacity
          // The optimal scheduler can schedule ALL DAY (7am-11pm = 16 hours = 960 minutes)
          const _totalMinutes = dayjs(latestEnd).diff(dayjs(sortedItems[0].startTime), 'minute')

          // Create block with system blocked type as placeholder
          // Actual type depends on user-configured task types
          const typeConfig = { kind: 'system' as const, systemType: SystemBlockType.Blocked }
          blocks.push({
            id: `block-${dateStr}-work`,
            startTime: earliestStart,
            endTime: latestEndStr,
            typeConfig,
            capacity: calculateBlockCapacity(typeConfig, earliestStart, latestEndStr),
          })
        }

        // NO DEFAULT BLOCKS! Days without patterns have no work scheduled
        // User must explicitly define work blocks for each day

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
      // Note: Schedule is now managed reactively through the scheduler store
      // Schedule will automatically recompute via reactive subscriptions

      Message.success('Schedule saved successfully!')
      onScheduleAccepted()
      onClose()
    } catch (error) {
      logger.db.error('Error saving schedule', {
        error: error instanceof Error ? error.message : String(error),
      }, 'schedule-save-error')
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
                        {option.result.unscheduled.length === 0 && (option.result.conflicts?.length || 0) === 0 && (
                          <Tag color="green">All Tasks Scheduled</Tag>
                        )}
                        {option.result.unscheduled.length > 0 && (
                          <Tag color="orange">{option.result.unscheduled.length} Unscheduled</Tag>
                        )}
                        {(option.result.conflicts?.length || 0) > 0 && (
                          <Tag color="red">{option.result.conflicts?.length} Conflicts</Tag>
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
