import { useState, useEffect } from 'react'
import { Modal, Button, Space, Tabs } from '@arco-design/web-react'
import { IconFileAudio, IconCalendar, IconEdit } from '@arco-design/web-react/icon'
import { WorkBlocksEditor } from './WorkBlocksEditor'
import { MultiDayScheduleEditor } from './MultiDayScheduleEditor'
import { VoiceScheduleModal } from './VoiceScheduleModal'
import { WorkBlock, WorkMeeting } from '@shared/work-blocks-types'
import { getDatabase } from '../../services/database'
import { Message } from '../common/Message'
import dayjs from 'dayjs'
// LOGGER_REMOVED: import { logger } from '@/shared/logger'


interface WorkScheduleModalProps {
  visible: boolean
  date?: string
  onClose: () => void
  onSave?: () => void
}

export function WorkScheduleModal({
  visible,
  date = dayjs().format('YYYY-MM-DD'),
  onClose,
  onSave,
}: WorkScheduleModalProps) {
  const [pattern, setPattern] = useState<any>(null)
  const [accumulated, setAccumulated] = useState({ focus: 0, admin: 0, personal: 0 })
  const [loading, setLoading] = useState(false)
  const [showVoiceModal, setShowVoiceModal] = useState(false)

  useEffect(() => {
    if (visible) {
      loadPattern()
    }
  }, [visible, date])

  const loadPattern = async () => {
    setLoading(true)
    try {
      const db = getDatabase()
      const [patternData, accumulatedData] = await Promise.all([
        db.getWorkPattern(date),
        db.getTodayAccumulated(date),
      ])

      setPattern(patternData)

      // Type the accumulated data properly
      const typedAccumulated = accumulatedData as { focused: number; admin: number; personal: number; total: number }
      setAccumulated({
        focus: typedAccumulated.focused || 0,
        admin: typedAccumulated.admin || 0,
        personal: typedAccumulated.personal || 0,
      })
    } catch (error) {
      // LOGGER_REMOVED: logger.ui.error('Failed to load work pattern:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async (blocks: WorkBlock[], meetings: WorkMeeting[]) => {
    try {
      const db = getDatabase()

      // If no blocks and no meetings, delete the pattern instead of saving empty one
      if (blocks.length === 0 && meetings.length === 0) {
        if (pattern && pattern.id) {
          await db.deleteWorkPattern(pattern.id)
          setPattern(null)
          Message.success('Work schedule cleared')
        } else {
          Message.info('No schedule to clear')
        }
        onSave?.()
        return
      }

      if (pattern && pattern.id) {
        // Update existing pattern
        await db.updateWorkPattern(pattern.id, {
          blocks,
          meetings,
        })
      } else {
        // Create new pattern
        const newPattern = await db.createWorkPattern({
          date,
          blocks,
          meetings,
        })
        // Update local state with the new pattern
        setPattern(newPattern)
      }

      Message.success('Work schedule saved successfully')
      onSave?.()
      // Reload pattern to ensure we have the latest data
      await loadPattern()
    } catch (error) {
      // LOGGER_REMOVED: logger.ui.error('Failed to save work pattern:', error)
      Message.error('Failed to save work schedule')
    }
  }

  const handleVoiceSchedule = (schedules: any) => {
    // Handle both single and multi-day schedules
    const schedulesToUse = Array.isArray(schedules) ? schedules : [schedules]

    // For single-day modal, just use the first day's schedule
    if (schedulesToUse.length > 0) {
      const schedule = schedulesToUse[0]
      setPattern({
        ...pattern,
        blocks: schedule.blocks,
        meetings: schedule.meetings,
      })
      setShowVoiceModal(false)
      Message.success('Voice schedule imported successfully')
    }
  }

  return (
    <>
    <Modal
      title="Work Schedule Manager"
      visible={visible}
      onCancel={onClose}
      footer={null}
      style={{ width: '95%', maxWidth: 1400, top: 20 }}
      maskClosable={false}
    >
      <Tabs defaultActiveTab="multi-day" style={{ height: '80vh' }}>
        <Tabs.TabPane
          key="multi-day"
          title={
            <Space>
              <IconCalendar />
              <span>Multi-Day Schedule</span>
            </Space>
          }
        >
          <div style={{ padding: '20px', height: 'calc(80vh - 50px)', overflow: 'auto' }}>
            <MultiDayScheduleEditor visible={true} onClose={onClose} />
          </div>
        </Tabs.TabPane>

        <Tabs.TabPane
          key="single-day"
          title={
            <Space>
              <IconEdit />
              <span>Single Day Editor (with Voice)</span>
            </Space>
          }
        >
          <div style={{ padding: '20px' }}>
            <Space style={{ marginBottom: 16 }}>
              <span>Editing: {dayjs(date).format('MMMM D, YYYY')}</span>
              <Button
                icon={<IconFileAudio />}
                onClick={() => setShowVoiceModal(true)}
                size="small"
              >
                Voice Input
              </Button>
            </Space>
            {!loading && (
              <WorkBlocksEditor
                date={date}
                pattern={pattern}
                accumulated={accumulated}
                onSave={handleSave}
                onClose={onClose}
              />
            )}
          </div>
        </Tabs.TabPane>
      </Tabs>
    </Modal>

    <VoiceScheduleModal
      visible={showVoiceModal}
      onClose={() => setShowVoiceModal(false)}
      onScheduleExtracted={handleVoiceSchedule}
      targetDate={date}
    />
    </>
  )
}
