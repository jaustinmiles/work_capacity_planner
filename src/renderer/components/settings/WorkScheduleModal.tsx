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
import { logger } from '../../utils/logger'


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
  const [accumulated, setAccumulated] = useState({ focusMinutes: 0, adminMinutes: 0 })
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
      setAccumulated({
        focusMinutes: (accumulatedData as any).focusMinutes || (accumulatedData as any).focused || 0,
        adminMinutes: (accumulatedData as any).adminMinutes || (accumulatedData as any).admin || 0,
      })
    } catch (error) {
      logger.error('Failed to load work pattern:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async (blocks: WorkBlock[], meetings: WorkMeeting[]) => {
    try {
      const db = getDatabase()

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
      logger.error('Failed to save work pattern:', error)
      Message.error('Failed to save work schedule')
    }
  }

  const handleVoiceSchedule = (schedule: { blocks: WorkBlock[], meetings: WorkMeeting[] }) => {
    // Pass the extracted schedule to the editor
    setPattern({
      ...pattern,
      blocks: schedule.blocks,
      meetings: schedule.meetings,
    })
    setShowVoiceModal(false)
    Message.success('Voice schedule imported successfully')
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
