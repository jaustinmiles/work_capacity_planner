import React, { useState, useEffect } from 'react'
import { Modal } from '@arco-design/web-react'
import { WorkBlocksEditor } from './WorkBlocksEditor'
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
  onSave
}: WorkScheduleModalProps) {
  const [pattern, setPattern] = useState<any>(null)
  const [accumulated, setAccumulated] = useState({ focusMinutes: 0, adminMinutes: 0 })
  const [loading, setLoading] = useState(false)

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
      setAccumulated(accumulatedData)
    } catch (error) {
      console.error('Failed to load work pattern:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async (blocks: WorkBlock[], meetings: WorkMeeting[]) => {
    try {
      const db = getDatabase()
      
      if (pattern) {
        // Update existing pattern
        await db.updateWorkPattern(pattern.id, {
          blocks,
          meetings,
        })
      } else {
        // Create new pattern
        await db.createWorkPattern({
          date,
          blocks,
          meetings,
        })
      }
      
      Message.success('Work schedule saved successfully')
      onSave?.()
      onClose()
    } catch (error) {
      console.error('Failed to save work pattern:', error)
      Message.error('Failed to save work schedule')
    }
  }

  return (
    <Modal
      title={`Work Schedule - ${dayjs(date).format('MMMM D, YYYY')}`}
      visible={visible}
      onCancel={onClose}
      footer={null}
      width="90%"
      style={{ maxWidth: 1200 }}
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
  )
}