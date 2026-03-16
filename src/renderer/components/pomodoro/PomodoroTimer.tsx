/**
 * PomodoroTimer — Circular countdown timer widget
 *
 * Displays the current Pomodoro phase, remaining time, cycle progress,
 * and provides pause/resume/skip/end controls.
 *
 * Reads reactive state from usePomodoroTimer() — re-renders every second
 * via the store's tick engine (no local setInterval needed).
 */

import { Space, Button, Tag, Typography, Progress } from '@arco-design/web-react'
import { IconPause, IconPlayArrow, IconSkipNext, IconClose } from '@arco-design/web-react/icon'
import { PomodoroPhase } from '@shared/enums'
import { formatPomodoroTime } from '@shared/pomodoro-types'
import { usePomodoroStore, usePomodoroTimer, usePomodoroSettings } from '../../store/usePomodoroStore'

const { Text } = Typography

interface PhaseStyle {
  label: string
  color: string
  bgColor: string
  borderColor: string
}

const DEFAULT_PHASE_STYLE: PhaseStyle = { label: 'Work', color: '#1890ff', bgColor: '#e6f7ff', borderColor: '#91d5ff' }

const PHASE_CONFIG: Record<string, PhaseStyle> = {
  [PomodoroPhase.Work]: DEFAULT_PHASE_STYLE,
  [PomodoroPhase.ShortBreak]: { label: 'Short Break', color: '#52c41a', bgColor: '#f6ffed', borderColor: '#b7eb8f' },
  [PomodoroPhase.LongBreak]: { label: 'Long Break', color: '#722ed1', bgColor: '#f9f0ff', borderColor: '#d3adf7' },
  [PomodoroPhase.Paused]: { label: 'Paused', color: '#faad14', bgColor: '#fffbe6', borderColor: '#ffe58f' },
  [PomodoroPhase.Completed]: { label: 'Completed', color: '#8c8c8c', bgColor: '#f7f8fa', borderColor: '#d9d9d9' },
}

export function PomodoroTimer() {
  const timerState = usePomodoroTimer()
  const settings = usePomodoroSettings()
  const { pauseCycle, resumeCycle, endCycle, dismissPrompt } = usePomodoroStore()

  if (!timerState.currentCycleId) return null

  const phase = PHASE_CONFIG[timerState.currentPhase] ?? DEFAULT_PHASE_STYLE
  const progressPercent = timerState.totalSeconds > 0
    ? Math.round((1 - timerState.remainingSeconds / timerState.totalSeconds) * 100)
    : 0

  const handlePauseResume = async (): Promise<void> => {
    if (timerState.currentPhase === PomodoroPhase.Paused) {
      await resumeCycle()
    } else {
      await pauseCycle()
    }
  }

  const handleSkip = (): void => {
    // Dismiss current prompt and let the store's _onTimerExpired logic trigger
    // by ending the current phase early
    dismissPrompt()
    usePomodoroStore.getState()._onTimerExpired()
  }

  return (
    <div
      style={{
        background: phase.bgColor,
        border: `1px solid ${phase.borderColor}`,
        borderRadius: 8,
        padding: '12px 16px',
      }}
    >
      <Space direction="vertical" style={{ width: '100%' }} size="small">
        {/* Phase label + cycle indicator */}
        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
          <Space>
            <Tag color={phase.color} style={{ fontWeight: 600 }}>{phase.label}</Tag>
            <Text type="secondary" style={{ fontSize: 12 }}>
              Cycle {timerState.cycleNumber} of {settings.cyclesBeforeLongBreak}
            </Text>
          </Space>
          {timerState.currentTaskName && (
            <Text style={{ fontSize: 13, fontWeight: 500 }} ellipsis>
              {timerState.currentTaskName}
            </Text>
          )}
        </Space>

        {/* Timer display + progress */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Progress
            type="circle"
            percent={progressPercent}
            size="small"
            style={{ width: 48, height: 48 }}
            color={phase.color}
            formatText={() => ''}
          />
          <Text style={{ fontSize: 28, fontWeight: 700, fontFamily: 'monospace', color: phase.color }}>
            {formatPomodoroTime(timerState.remainingSeconds)}
          </Text>

          {/* Controls */}
          <Space style={{ marginLeft: 'auto' }}>
            {timerState.isActive || timerState.currentPhase === PomodoroPhase.Paused ? (
              <Button
                shape="circle"
                size="small"
                icon={timerState.currentPhase === PomodoroPhase.Paused ? <IconPlayArrow /> : <IconPause />}
                onClick={handlePauseResume}
              />
            ) : null}
            {timerState.isActive && (
              <Button
                shape="circle"
                size="small"
                icon={<IconSkipNext />}
                onClick={handleSkip}
              />
            )}
            <Button
              shape="circle"
              size="small"
              status="danger"
              icon={<IconClose />}
              onClick={endCycle}
            />
          </Space>
        </div>
      </Space>
    </div>
  )
}
