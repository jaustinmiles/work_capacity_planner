import { useState, useEffect } from 'react'
import {
  Card,
  Space,
  Button,
  Typography,
  Grid,
  DatePicker,
  Tabs,
  Badge,
  Spin,
  Tag,
  Tooltip,
  Divider,
  Popconfirm,
} from '@arco-design/web-react'
import {
  IconCalendar,
  IconCopy,
  IconPaste,
  IconFileAudio,
  IconDelete,
} from '@arco-design/web-react/icon'
import { WorkBlock, WorkMeeting, DailyWorkPattern } from '@shared/work-blocks-types'
import { calculateDuration } from '@shared/time-utils'
import { getDatabase } from '../../services/database'
import { WorkBlocksEditor } from './WorkBlocksEditor'
import { VoiceScheduleModal } from './VoiceScheduleModal'
import { Message } from '../common/Message'
import dayjs from 'dayjs'
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore'
import { logger } from '../../utils/logger'


dayjs.extend(isSameOrBefore)

const { Title, Text } = Typography
const { Row, Col } = Grid
const { RangePicker } = DatePicker

interface MultiDayScheduleEditorProps {
  visible: boolean
  onClose: () => void
  onSave?: () => void
}

export function MultiDayScheduleEditor({ visible, onClose, onSave }: MultiDayScheduleEditorProps) {
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([
    dayjs(),
    dayjs().add(6, 'day'),
  ])
  const [selectedDate, setSelectedDate] = useState<string>(dayjs().format('YYYY-MM-DD'))
  const [patterns, setPatterns] = useState<Map<string, DailyWorkPattern>>(new Map())
  const [loading, setLoading] = useState(false)
  const [copiedPattern, setCopiedPattern] = useState<{
    blocks: WorkBlock[]
    meetings: WorkMeeting[]
  } | null>(null)
  const [showVoiceModal, setShowVoiceModal] = useState(false)

  // Load patterns for date range
  useEffect(() => {
    if (visible) {
      loadPatterns()
    }
  }, [visible, dateRange])

  const loadPatterns = async () => {
    setLoading(true)
    try {
      const db = getDatabase()
      const patternsMap = new Map<string, DailyWorkPattern>()

      const startDate = dateRange[0]
      const endDate = dateRange[1]
      let currentDate = startDate

      while (currentDate.isSameOrBefore(endDate, 'day')) {
        const dateStr = currentDate.format('YYYY-MM-DD')
        const pattern = await db.getWorkPattern(dateStr)

        if (pattern) {
          patternsMap.set(dateStr, {
            date: dateStr,
            blocks: pattern.blocks || [],
            meetings: pattern.meetings || [],
            accumulated: { focusMinutes: 0, adminMinutes: 0 },
          })
        }

        currentDate = currentDate.add(1, 'day')
      }

      setPatterns(patternsMap)
    } catch (error) {
      logger.ui.error('Failed to load patterns:', error)
      Message.error('Failed to load schedules')
    } finally {
      setLoading(false)
    }
  }

  const handleSavePattern = async (date: string, blocks: WorkBlock[], meetings: WorkMeeting[]) => {
    try {
      const db = getDatabase()
      const existingPattern = patterns.get(date)

      if (existingPattern && 'id' in existingPattern) {
        await db.updateWorkPattern((existingPattern as any).id, {
          blocks,
          meetings,
        })
      } else {
        await db.createWorkPattern({
          date,
          blocks,
          meetings,
        })
      }

      Message.success(`Schedule saved for ${dayjs(date).format('MMM D, YYYY')}`)

      // Reload patterns
      await loadPatterns()
      onSave?.()
    } catch (error) {
      logger.ui.error('Failed to save pattern:', error)
      Message.error('Failed to save schedule')
    }
  }

  const handleCopyPattern = (date: string) => {
    const pattern = patterns.get(date)
    if (pattern) {
      setCopiedPattern({
        blocks: pattern.blocks,
        meetings: pattern.meetings,
      })
      Message.success('Schedule copied to clipboard')
    }
  }

  const handlePastePattern = async (date: string) => {
    if (!copiedPattern) {
      Message.warning('No schedule in clipboard')
      return
    }

    // Create new IDs for pasted items
    const newBlocks = copiedPattern.blocks.map((b, index) => ({
      ...b,
      id: `block-${Date.now()}-${index}`,
    }))

    const newMeetings = copiedPattern.meetings.map((m, index) => ({
      ...m,
      id: `meeting-${Date.now()}-${index}-${Math.random().toString(36).substr(2, 9)}`,
    }))

    await handleSavePattern(date, newBlocks, newMeetings)
  }

  const handleApplyToWeekdays = async () => {
    const currentPattern = patterns.get(selectedDate)
    if (!currentPattern) {
      Message.warning('No schedule to apply')
      return
    }

    const startDate = dateRange[0]
    const endDate = dateRange[1]
    let currentDate = startDate
    let appliedCount = 0

    while (currentDate.isSameOrBefore(endDate, 'day')) {
      const dateStr = currentDate.format('YYYY-MM-DD')
      const dayOfWeek = currentDate.day()

      // Skip only the current date and weekends (unless you want to apply to weekends too)
      // For now, skip weekends (0 = Sunday, 6 = Saturday)
      if (dateStr !== selectedDate && dayOfWeek !== 0 && dayOfWeek !== 6) {
        const newBlocks = currentPattern.blocks.map((b, index) => ({
          ...b,
          id: `block-${Date.now()}-${dateStr}-${index}`,
        }))

        const newMeetings = currentPattern.meetings.map((m, index) => ({
          ...m,
          id: `meeting-${Date.now()}-${dateStr}-${index}-${Math.random().toString(36).substr(2, 9)}`,
        }))

        await handleSavePattern(dateStr, newBlocks, newMeetings)
        appliedCount++
      }

      currentDate = currentDate.add(1, 'day')
    }

    if (appliedCount > 0) {
      Message.success(`Applied schedule to ${appliedCount} weekdays`)
    }
  }

  const handleClearAllSchedules = async () => {
    setLoading(true)
    try {
      const db = getDatabase()
      // Get all future dates
      const today = dayjs().format('YYYY-MM-DD')
      const patterns = await db.getWorkPatterns()

      let clearedCount = 0
      for (const pattern of patterns) {
        if (pattern.date >= today) {
          await db.deleteWorkPattern(pattern.id)
          clearedCount++
        }
      }

      Message.success(`Cleared ${clearedCount} schedules`)
      await loadPatterns()
      onSave?.()
    } catch (error) {
      logger.ui.error('Failed to clear schedules:', error)
      Message.error('Failed to clear schedules')
    } finally {
      setLoading(false)
    }
  }

  const getDayStatus = (date: string) => {
    const pattern = patterns.get(date)
    if (!pattern || pattern.blocks.length === 0) return 'empty'

    const totalMinutes = pattern.blocks.reduce((acc, block) => {
      return acc + calculateDuration(block.startTime, block.endTime)
    }, 0)

    if (totalMinutes >= 480) return 'full' // 8+ hours
    if (totalMinutes >= 240) return 'partial' // 4+ hours
    return 'light' // Less than 4 hours
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'full': return 'green'
      case 'partial': return 'blue'
      case 'light': return 'orange'
      default: return 'gray'
    }
  }

  const generateDateTabs = () => {
    const tabs: React.ReactElement[] = []
    const startDate = dayjs(dateRange[0])
    const endDate = dayjs(dateRange[1])
    let currentDate = startDate

    while (currentDate.isSameOrBefore(endDate, 'day')) {
      const dateStr = currentDate.format('YYYY-MM-DD')
      const dayName = currentDate.format('ddd')
      const dayNum = currentDate.format('D')
      const isWeekend = currentDate.day() === 0 || currentDate.day() === 6
      const status = getDayStatus(dateStr)

      tabs.push(
        <Tabs.TabPane
          key={dateStr}
          title={
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontWeight: isWeekend ? 'normal' : 'bold' }}>
                {dayName}
              </div>
              <Badge
                color={getStatusColor(status)}
                text={dayNum}
                style={{ marginTop: 4 }}
              />
            </div>
          }
        />,
      )

      currentDate = currentDate.add(1, 'day')
    }

    return tabs
  }

  if (!visible) return null

  return (
    <Card
      style={{
        position: 'fixed',
        top: 20,
        right: 20,
        bottom: 20,
        left: 20,
        zIndex: 1000,
        overflow: 'auto',
      }}
      title={
        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
          <Space>
            <IconCalendar style={{ fontSize: 24 }} />
            <Title heading={4} style={{ margin: 0 }}>Multi-Day Schedule Editor</Title>
          </Space>
          <Space>
            <Button icon={<IconFileAudio />} onClick={() => setShowVoiceModal(true)}>
              Voice Input
            </Button>
            <Button onClick={onClose}>Close</Button>
          </Space>
        </Space>
      }
    >
      <Space direction="vertical" style={{ width: '100%' }} size="large">
        {/* Date Range Selector */}
        <Card>
          <Row gutter={16} align="center">
            <Col span={12}>
              <RangePicker
                value={dateRange}
                onChange={(dates: any) => {
                  if (dates && dates[0] && dates[1]) {
                    setDateRange([dates[0], dates[1]])
                  }
                }}
                shortcuts={[
                  {
                    text: 'This Week',
                    value: () => [dayjs().startOf('week'), dayjs().endOf('week')],
                  },
                  {
                    text: 'Next Week',
                    value: () => [
                      dayjs().add(1, 'week').startOf('week'),
                      dayjs().add(1, 'week').endOf('week'),
                    ],
                  },
                  {
                    text: 'Next 2 Weeks',
                    value: () => [dayjs(), dayjs().add(13, 'day')],
                  },
                ]}
                style={{ width: '100%' }}
              />
            </Col>
          </Row>

          {/* Button Groups - Better organized */}
          <Divider style={{ margin: '16px 0' }} />

          <Row gutter={16}>
            <Col span={8}>
              <Space direction="vertical" style={{ width: '100%' }}>
                <Text type="secondary">Copy/Paste</Text>
                <Space>
                  <Tooltip content="Copy current day's schedule">
                    <Button
                      icon={<IconCopy />}
                      onClick={() => handleCopyPattern(selectedDate)}
                      disabled={!patterns.get(selectedDate)?.blocks.length}
                    >
                      Copy Day
                    </Button>
                  </Tooltip>
                  <Tooltip content="Paste schedule to current day">
                    <Button
                      icon={<IconPaste />}
                      onClick={() => handlePastePattern(selectedDate)}
                      disabled={!copiedPattern}
                    >
                      Paste
                    </Button>
                  </Tooltip>
                </Space>
              </Space>
            </Col>

            <Col span={8}>
              <Space direction="vertical" style={{ width: '100%' }}>
                <Text type="secondary">Apply to Multiple Days</Text>
                <Space>
                  <Button
                    type="primary"
                    onClick={handleApplyToWeekdays}
                    disabled={!patterns.get(selectedDate)?.blocks.length}
                  >
                    Apply to Weekdays
                  </Button>
                  <Button
                    onClick={async () => {
                      const currentPattern = patterns.get(selectedDate)
                      if (!currentPattern) {
                        Message.warning('No schedule to apply')
                        return
                      }

                      const startDate = dateRange[0]
                      const endDate = dateRange[1]
                      let currentDate = startDate
                      let appliedCount = 0

                      while (currentDate.isSameOrBefore(endDate, 'day')) {
                        const dateStr = currentDate.format('YYYY-MM-DD')

                        // Skip only the current date
                        if (dateStr !== selectedDate) {
                          const newBlocks = currentPattern.blocks.map((b, index) => ({
                            ...b,
                            id: `block-${Date.now()}-${dateStr}-${index}`,
                          }))

                          const newMeetings = currentPattern.meetings.map((m, index) => ({
                            ...m,
                            id: `meeting-${Date.now()}-${dateStr}-${index}-${Math.random().toString(36).substr(2, 9)}`,
                          }))

                          await handleSavePattern(dateStr, newBlocks, newMeetings)
                          appliedCount++
                        }

                        currentDate = currentDate.add(1, 'day')
                      }

                      if (appliedCount > 0) {
                        Message.success(`Applied schedule to ${appliedCount} days`)
                      }
                    }}
                    disabled={!patterns.get(selectedDate)?.blocks.length}
                  >
                    Apply to ALL
                  </Button>
                </Space>
              </Space>
            </Col>

            <Col span={8}>
              <Space direction="vertical" style={{ width: '100%' }}>
                <Text type="secondary">Clear Schedules</Text>
                <Popconfirm
                  title="Clear All Future Schedules?"
                  content="This will delete ALL schedules for all future days. This cannot be undone."
                  okText="Clear All"
                  cancelText="Cancel"
                  okButtonProps={{ status: 'danger' }}
                  onOk={handleClearAllSchedules}
                >
                  <Tooltip content="Delete ALL schedules for all future days">
                    <Button
                      status="danger"
                      icon={<IconDelete />}
                    >
                      Clear All Future Schedules
                    </Button>
                  </Tooltip>
                </Popconfirm>
              </Space>
            </Col>
          </Row>
        </Card>

        {/* Day Tabs */}
        {loading ? (
          <Card style={{ textAlign: 'center', padding: 40 }}>
            <Spin size={40} />
            <div style={{ marginTop: 16 }}>Loading schedules...</div>
          </Card>
        ) : (
          <Tabs
            activeTab={selectedDate}
            onChange={setSelectedDate}
            type="card-gutter"
            size="large"
          >
            {generateDateTabs()}
          </Tabs>
        )}

        {/* Schedule Editor for Selected Day */}
        {selectedDate && !loading && (
          <WorkBlocksEditor
            date={selectedDate}
            pattern={{
              blocks: patterns.get(selectedDate)?.blocks || [],
              meetings: patterns.get(selectedDate)?.meetings || [],
            }}
            accumulated={{ focusMinutes: 0, adminMinutes: 0 }}
            onSave={(blocks, meetings) => handleSavePattern(selectedDate, blocks, meetings)}
          />
        )}

        {/* Legend */}
        <Card size="small">
          <Space>
            <Text type="secondary">Schedule Status:</Text>
            <Tag color="green">Full Day (8+ hours)</Tag>
            <Tag color="blue">Partial Day (4-8 hours)</Tag>
            <Tag color="orange">Light Day (&lt;4 hours)</Tag>
            <Tag color="gray">No Schedule</Tag>
          </Space>
        </Card>
      </Space>

      {/* Voice Input Modal */}
      <VoiceScheduleModal
        visible={showVoiceModal}
        onClose={() => setShowVoiceModal(false)}
        onScheduleExtracted={(schedules) => {
          // Handle both single schedule (legacy) and multi-day schedules
          const schedulesToApply = Array.isArray(schedules) ? schedules : [schedules]

          // Apply extracted schedules to their respective days
          const newPatterns = new Map(patterns)

          for (const schedule of schedulesToApply) {
            const date = schedule.date

            // Replace the pattern for this day with the extracted schedule
            newPatterns.set(date, {
              date,
              blocks: schedule.blocks || [],
              meetings: schedule.meetings || [],
              accumulated: {
                focusMinutes: 0,
                adminMinutes: 0,
                personalMinutes: 0,
              },
            })
          }

          setPatterns(newPatterns)

          // If multiple days were extracted, show a success message
          if (schedulesToApply.length > 1) {
            Message.success(`Applied schedule to ${schedulesToApply.length} days`)
          }

          setShowVoiceModal(false)
          Message.success('Voice schedule imported')
        }}
        targetDate={selectedDate}
      />
    </Card>
  )
}
