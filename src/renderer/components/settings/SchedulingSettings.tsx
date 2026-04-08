import { useState, useEffect } from 'react'
import {
  Space,
  Typography,
  Divider,
  Select,
  InputNumber,
  Switch,
  Alert,
  Spin,
} from '@arco-design/web-react'
import { getDatabase } from '../../services/database'
import { useSchedulerStore } from '../../store/useSchedulerStore'
import { Message } from '../common/Message'
import { logger } from '@/logger'

const { Text, Title } = Typography

export function SchedulingSettings() {
  const [bedtimeHour, setBedtimeHour] = useState(22)
  const [wakeTimeHour, setWakeTimeHour] = useState(6)
  const [taskSplittingEnabled, setTaskSplittingEnabled] = useState(true)
  const [minimumSplitMinutes, setMinimumSplitMinutes] = useState(30)
  const [loading, setLoading] = useState(true)

  const setInputs = useSchedulerStore(s => s.setInputs)

  useEffect(() => {
    loadPreferences()
  }, [])

  const loadPreferences = async () => {
    try {
      const db = getDatabase()
      const session = await db.getCurrentSession()
      if (session) {
        const prefs = await db.getSchedulingPreferences(session.id)
        if (prefs) {
          setBedtimeHour(prefs.bedtimeHour)
          setWakeTimeHour(prefs.wakeHour)
          setTaskSplittingEnabled(prefs.taskSplittingEnabled)
          setMinimumSplitMinutes(prefs.minimumSplitMinutes)
        }
      }
    } catch (error) {
      logger.ui.error('Failed to load scheduling preferences', {
        error: error instanceof Error ? error.message : String(error),
      }, 'scheduling-prefs-load-error')
    } finally {
      setLoading(false)
    }
  }

  const savePreferences = async (updates: Record<string, unknown>) => {
    try {
      const db = getDatabase()
      const session = await db.getCurrentSession()
      if (session) {
        await db.updateSchedulingPreferences(session.id, updates)
        Message.success('Settings saved')
      }
    } catch (error) {
      logger.ui.error('Failed to save scheduling preferences', {
        error: error instanceof Error ? error.message : String(error),
      }, 'scheduling-prefs-save-error')
      Message.error('Failed to save settings')
    }
  }

  const handleBedtimeChange = (value: number) => {
    setBedtimeHour(value)
    savePreferences({ bedtimeHour: value })
  }

  const handleWakeTimeChange = (value: number) => {
    setWakeTimeHour(value)
    savePreferences({ wakeHour: value })
  }

  const handleSplittingToggle = (enabled: boolean) => {
    setTaskSplittingEnabled(enabled)
    savePreferences({ taskSplittingEnabled: enabled })
    setInputs({ schedulingPreferences: { taskSplittingEnabled: enabled, minimumSplitMinutes } })
  }

  const handleMinSplitChange = (value: number) => {
    setMinimumSplitMinutes(value)
    savePreferences({ minimumSplitMinutes: value })
    setInputs({ schedulingPreferences: { taskSplittingEnabled, minimumSplitMinutes: value } })
  }

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
  }

  const formatHour = (h: number) => {
    const label = h === 0 ? 'Midnight' : h < 12 ? `${h} AM` : h === 12 ? 'Noon' : `${h - 12} PM`
    return `${h.toString().padStart(2, '0')}:00 - ${label}`
  }

  return (
    <Space direction="vertical" style={{ width: '100%' }}>
      <Title heading={6}>Task Splitting</Title>
      <Text type="secondary">
        When a task is longer than the available time in a work block, it can be split into parts.
      </Text>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
        <Switch
          checked={taskSplittingEnabled}
          onChange={handleSplittingToggle}
        />
        <Text>{taskSplittingEnabled ? 'Split tasks across blocks' : 'Truncate tasks to fit block'}</Text>
      </div>

      {taskSplittingEnabled && (
        <div style={{ marginTop: 12 }}>
          <Text>Minimum split duration</Text>
          <InputNumber
            value={minimumSplitMinutes}
            onChange={(value) => handleMinSplitChange(value as number)}
            min={5}
            max={120}
            step={5}
            suffix="minutes"
            style={{ width: 200, marginTop: 4 }}
          />
          <div style={{ marginTop: 4 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              Parts shorter than this will be skipped in favor of the next available block.
            </Text>
          </div>
        </div>
      )}

      {!taskSplittingEnabled && (
        <Alert
          type="info"
          style={{ marginTop: 8 }}
          content="Tasks will be scheduled up to the end of each block without being split into parts."
        />
      )}

      <Divider />

      <Title heading={6}>Circadian Rhythm</Title>
      <Text type="secondary">
        Your sleep schedule helps the scheduler place demanding tasks during peak energy hours.
      </Text>

      <div style={{ marginTop: 8 }}>
        <Text>Bedtime</Text>
        <Select
          value={bedtimeHour}
          onChange={handleBedtimeChange}
          style={{ width: '100%', marginTop: 4 }}
        >
          {Array.from({ length: 24 }, (_, i) => (
            <Select.Option key={i} value={i}>
              {formatHour(i)}
            </Select.Option>
          ))}
        </Select>
      </div>

      <div style={{ marginTop: 8 }}>
        <Text>Wake Time</Text>
        <Select
          value={wakeTimeHour}
          onChange={handleWakeTimeChange}
          style={{ width: '100%', marginTop: 4 }}
        >
          {Array.from({ length: 24 }, (_, i) => (
            <Select.Option key={i} value={i}>
              {formatHour(i)}
            </Select.Option>
          ))}
        </Select>
      </div>

      <Alert
        type="info"
        style={{ marginTop: 12 }}
        content={
          <div>
            <div><strong>Your Circadian Rhythm:</strong></div>
            <div>Morning Peak: ~{formatHour((wakeTimeHour + 4) % 24)} (High energy)</div>
            <div>Afternoon Dip: ~{formatHour((wakeTimeHour + 8) % 24)} (Low energy)</div>
            <div>Evening Peak: ~{formatHour((bedtimeHour - 4 + 24) % 24)} (Second wind)</div>
          </div>
        }
      />
    </Space>
  )
}
