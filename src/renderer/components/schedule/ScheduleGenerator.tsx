import { useState } from 'react'
import { Modal, Button, Space, Card, Typography, Radio, Spin, Tag, Alert, Grid } from '@arco-design/web-react'
import { IconCalendarClock, IconCheckCircle, IconEdit, IconSave } from '@arco-design/web-react/icon'
import { Task } from '@shared/types'
import { SequencedTask } from '@shared/sequencing-types'
import { scheduleWithDeadlines, SchedulingContext, SchedulingResult } from '../../utils/deadline-scheduler'
import { scheduleItemsWithBlocks, ScheduledItem } from '../../utils/flexible-scheduler'
import { DailyWorkPattern } from '@shared/work-blocks-types'
import { getDatabase } from '../../services/database'
import { Message } from '../common/Message'
import dayjs from 'dayjs'

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
  onScheduleAccepted 
}: ScheduleGeneratorProps) {
  const [generating, setGenerating] = useState(false)
  const [scheduleOptions, setScheduleOptions] = useState<ScheduleOption[]>([])
  const [selectedOption, setSelectedOption] = useState<string>('')
  const [saving, setSaving] = useState(false)

  const generateScheduleOptions = async () => {
    setGenerating(true)
    
    try {
      const options: ScheduleOption[] = []
      
      // Option 1: Deadline-First (Prioritize meeting all deadlines)
      const deadlineContext: SchedulingContext = {
        currentTime: new Date(),
        tasks: tasks.filter(t => !t.completed),
        workflows: sequencedTasks.filter(w => !w.completed),
        workPatterns: [],
        productivityPatterns: [],
        schedulingPreferences: {
          id: 'deadline-first',
          sessionId: 'default',
          allowWeekendWork: false,
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
          defaultWorkHours: {
            startTime: '09:00',
            endTime: '18:00',
          },
          customWorkHours: {},
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
        }
      })

      // Option 2: Balanced (Balance deadlines with work-life balance)
      const balancedContext: SchedulingContext = {
        ...deadlineContext,
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
        }
      })

      // Option 3: Async-Optimized (Maximize parallel work)
      const asyncContext: SchedulingContext = {
        ...deadlineContext,
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
        }
      })

      setScheduleOptions(options)
      if (options.length > 0) {
        setSelectedOption(options[0].id)
      }
    } catch (error) {
      console.error('Error generating schedules:', error)
      Message.error('Failed to generate schedule options')
    } finally {
      setGenerating(false)
    }
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

      // Create work patterns for each day
      for (const [dateStr, items] of itemsByDate) {
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
              tasks: [item]
            }
          } else {
            // Extend current block
            currentBlock.endTime = endTime
            currentBlock.tasks.push(item)
          }
          
          // Update capacity
          if (item.type === 'task' || item.type === 'workflow-step') {
            const task = item.originalItem as Task
            if (task.type === 'focused') {
              currentBlock.capacity.focusMinutes += item.duration
            } else {
              currentBlock.capacity.adminMinutes += item.duration
            }
          }
        }
        
        if (currentBlock) {
          blocks.push(currentBlock)
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
      console.error('Error saving schedule:', error)
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
                    border: selectedOption === option.id ? '2px solid #3370ff' : undefined
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
    </Modal>
  )
}

function getScoreColor(score: number): string {
  if (score >= 90) return '#52c41a'
  if (score >= 70) return '#faad14'
  if (score >= 50) return '#ff7d00'
  return '#ff4d4f'
}