/**
 * BreakActivityModal — Prompted when work phase ends
 *
 * Lets the user choose a TimeSink activity for their break,
 * skip the break entirely, or customize break duration.
 */

import { Modal, Space, Button, Typography } from '@arco-design/web-react'
import { useSortedTimeSinks } from '../../store/useTimeSinkStore'
import { usePomodoroStore, usePomodoroSettings } from '../../store/usePomodoroStore'

const { Text } = Typography

interface BreakActivityModalProps {
  visible: boolean
  onClose: () => void
}

export function BreakActivityModal({ visible, onClose }: BreakActivityModalProps) {
  const timeSinks = useSortedTimeSinks()
  const settings = usePomodoroSettings()
  const { transitionToBreak, endCycle, dismissPrompt } = usePomodoroStore()

  const handleSelectActivity = async (sinkId: string): Promise<void> => {
    await transitionToBreak(sinkId)
    onClose()
  }

  const handleSkipBreak = async (): Promise<void> => {
    await transitionToBreak()
    onClose()
  }

  const handleEndSession = async (): Promise<void> => {
    await endCycle()
    onClose()
  }

  const handleCancel = (): void => {
    dismissPrompt()
    onClose()
  }

  return (
    <Modal
      title={
        <Space>
          <span>Break Time!</span>
          <Text type="secondary" style={{ fontSize: 13 }}>
            ({settings.shortBreakMinutes} min break)
          </Text>
        </Space>
      }
      visible={visible}
      onCancel={handleCancel}
      footer={
        <Space>
          <Button onClick={handleSkipBreak}>Skip Break</Button>
          <Button status="warning" onClick={handleEndSession}>End Pomodoro</Button>
        </Space>
      }
      style={{ width: 480 }}
    >
      <Space direction="vertical" style={{ width: '100%' }} size="medium">
        <Text>Work phase complete! Choose a break activity:</Text>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
          {timeSinks.map((sink) => (
            <Button
              key={sink.id}
              long
              style={{
                height: 48,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-start',
                gap: 8,
                border: `1px solid ${sink.color}`,
              }}
              onClick={() => handleSelectActivity(sink.id)}
            >
              <span style={{ fontSize: 18 }}>{sink.emoji}</span>
              <span>{sink.name}</span>
            </Button>
          ))}
        </div>

        {timeSinks.length === 0 && (
          <Text type="secondary">
            No time sinks configured. You can add them in the Time Sinks panel.
          </Text>
        )}
      </Space>
    </Modal>
  )
}
