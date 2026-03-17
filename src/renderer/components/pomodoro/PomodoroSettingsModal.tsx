/**
 * PomodoroSettingsModal — Configure Pomodoro timer durations and behavior
 *
 * Follows the WorkSettingsModal pattern: Arco Modal + Form in vertical layout.
 */

import { useEffect } from 'react'
import { Modal, Form, InputNumber, Checkbox, Space, Typography, Divider } from '@arco-design/web-react'
import { usePomodoroStore, usePomodoroSettings } from '../../store/usePomodoroStore'
import { POMODORO_DEFAULTS } from '@shared/constants'

const { Text } = Typography

interface PomodoroSettingsModalProps {
  visible: boolean
  onClose: () => void
}

export function PomodoroSettingsModal({ visible, onClose }: PomodoroSettingsModalProps) {
  const settings = usePomodoroSettings()
  const { updateSettings } = usePomodoroStore()
  const [form] = Form.useForm()

  useEffect(() => {
    if (visible) {
      form.setFieldsValue({
        workDurationMinutes: settings.workDurationMinutes,
        shortBreakMinutes: settings.shortBreakMinutes,
        longBreakMinutes: settings.longBreakMinutes,
        cyclesBeforeLongBreak: settings.cyclesBeforeLongBreak,
        autoStartBreak: settings.autoStartBreak,
        autoStartWork: settings.autoStartWork,
        soundEnabled: settings.soundEnabled,
      })
    }
  }, [visible, settings, form])

  const handleSave = async (): Promise<void> => {
    const values = form.getFieldsValue()
    await updateSettings({
      workDurationMinutes: values.workDurationMinutes as number,
      shortBreakMinutes: values.shortBreakMinutes as number,
      longBreakMinutes: values.longBreakMinutes as number,
      cyclesBeforeLongBreak: values.cyclesBeforeLongBreak as number,
      autoStartBreak: values.autoStartBreak as boolean,
      autoStartWork: values.autoStartWork as boolean,
      soundEnabled: values.soundEnabled as boolean,
    })
    onClose()
  }

  return (
    <Modal
      title="Pomodoro Settings"
      visible={visible}
      onOk={handleSave}
      onCancel={onClose}
      okText="Save Settings"
      style={{ width: 480 }}
    >
      <Form form={form} layout="vertical">
        <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
          Configure your Pomodoro cycle durations and behavior.
        </Text>

        <Form.Item label="Work Duration (minutes)" field="workDurationMinutes">
          <InputNumber
            min={1}
            max={120}
            step={5}
            placeholder={String(POMODORO_DEFAULTS.WORK_DURATION_MINUTES)}
            style={{ width: '100%' }}
          />
        </Form.Item>

        <Space size="large" style={{ width: '100%' }}>
          <Form.Item label="Short Break (minutes)" field="shortBreakMinutes" style={{ flex: 1 }}>
            <InputNumber
              min={1}
              max={30}
              step={1}
              placeholder={String(POMODORO_DEFAULTS.SHORT_BREAK_MINUTES)}
            />
          </Form.Item>
          <Form.Item label="Long Break (minutes)" field="longBreakMinutes" style={{ flex: 1 }}>
            <InputNumber
              min={1}
              max={60}
              step={5}
              placeholder={String(POMODORO_DEFAULTS.LONG_BREAK_MINUTES)}
            />
          </Form.Item>
        </Space>

        <Form.Item label="Cycles Before Long Break" field="cyclesBeforeLongBreak">
          <InputNumber
            min={2}
            max={10}
            step={1}
            placeholder={String(POMODORO_DEFAULTS.CYCLES_BEFORE_LONG_BREAK)}
            style={{ width: '100%' }}
          />
        </Form.Item>

        <Divider />

        <Form.Item field="autoStartBreak" triggerPropName="checked">
          <Checkbox>Auto-start break when work phase ends</Checkbox>
        </Form.Item>

        <Form.Item field="autoStartWork" triggerPropName="checked">
          <Checkbox>Auto-start work when break ends</Checkbox>
        </Form.Item>

        <Form.Item field="soundEnabled" triggerPropName="checked">
          <Checkbox>Sound notifications</Checkbox>
        </Form.Item>
      </Form>
    </Modal>
  )
}
