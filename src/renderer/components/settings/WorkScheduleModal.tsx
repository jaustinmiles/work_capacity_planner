import { useState, useEffect } from 'react'
import { Modal, Button, Space } from '@arco-design/web-react'
import { IconFileAudio } from '@arco-design/web-react/icon'
import { WorkBlocksEditor } from './WorkBlocksEditor'
import { VoiceScheduleModal } from './VoiceScheduleModal'
import { WorkBlock, WorkMeeting } from '@shared/work-blocks-types'
import { getDatabase } from '../../services/database'
import { Message } from '../common/Message'
import dayjs from 'dayjs'

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
  const [accumulated, setAccumulated] = useState({ focused: 0, admin: 0 })
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
        focused: accumulatedData.focused || 0,
        admin: accumulatedData.admin || 0
      })
    } catch (error) {
      console.error('Failed to load work pattern:', error)
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
      console.error('Failed to save work pattern:', error)
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
      title={
        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
          <span>Work Schedule - {dayjs(date).format('MMMM D, YYYY')}</span>
          <Button
            icon={<IconFileAudio />}
            onClick={() => setShowVoiceModal(true)}
            size="small"
          >
            Voice Input
          </Button>
        </Space>
      }
      visible={visible}
      onCancel={onClose}
      footer={null}
      style={{ width: '90%', maxWidth: 1200 }}
      maskClosable={false}
    >
      {!loading && (
        <WorkBlocksEditor
          date={date}
          pattern={pattern}
          accumulated={accumulated}
          onSave={handleSave}
          onClose={onClose}
        />
      )}
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
