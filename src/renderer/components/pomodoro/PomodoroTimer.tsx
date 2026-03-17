/**
 * PomodoroTimer — Circular countdown timer widget with idle start state
 *
 * States:
 * 1. **Idle** — No active cycle. Shows a "Start Pomodoro" button.
 * 2. **Active (ticking)** — Cycle running. Timer counts down.
 * 3. **Stuck (expired, modal dismissed)** — Phase ended but user dismissed prompt.
 *    Shows a recovery button to re-trigger the appropriate next action.
 *
 * Reads reactive state from usePomodoroTimer() — re-renders every second
 * via the store's tick engine (no local setInterval needed).
 */

import { useState } from 'react'
import { Space, Button, Tag, Typography, Progress } from '@arco-design/web-react'
import { IconPause, IconPlayArrow, IconSkipNext, IconClose } from '@arco-design/web-react/icon'
import { PomodoroPhase, PomodoroPromptType } from '@shared/enums'
import { formatPomodoroTime } from '@shared/pomodoro-types'
import { usePomodoroStore, usePomodoroTimer, usePomodoroSettings } from '../../store/usePomodoroStore'
import { logger } from '@/logger'

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

const IDLE_STYLE: PhaseStyle = { label: 'Pomodoro', color: '#e8453c', bgColor: '#fff2f0', borderColor: '#ffccc7' }

export function PomodoroTimer() {
  const timerState = usePomodoroTimer()
  const settings = usePomodoroSettings()
  const startPomodoro = usePomodoroStore((s) => s.startPomodoro)
  const pauseCycle = usePomodoroStore((s) => s.pauseCycle)
  const resumeCycle = usePomodoroStore((s) => s.resumeCycle)
  const endCycle = usePomodoroStore((s) => s.endCycle)
  const dismissPrompt = usePomodoroStore((s) => s.dismissPrompt)
  const [isStarting, setIsStarting] = useState(false)

  // ── Idle state: no active cycle ──
  if (!timerState.currentCycleId) {
    const handleStart = async (): Promise<void> => {
      try {
        setIsStarting(true)
        await startPomodoro()
      } catch (error) {
        logger.ui.error('Failed to start Pomodoro', {
          error: error instanceof Error ? error.message : String(error),
        })
      } finally {
        setIsStarting(false)
      }
    }

    return (
      <div
        style={{
          background: IDLE_STYLE.bgColor,
          border: `1px solid ${IDLE_STYLE.borderColor}`,
          borderRadius: 8,
          padding: '12px 16px',
        }}
      >
        <Button
          long
          type="primary"
          style={{ background: IDLE_STYLE.color, borderColor: IDLE_STYLE.color }}
          loading={isStarting}
          onClick={handleStart}
        >
          🍅 Start Pomodoro
        </Button>
      </div>
    )
  }

  // ── Active state ──
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
    dismissPrompt()
    usePomodoroStore.getState()._onTimerExpired()
  }

  // Recovery: user dismissed the modal — give them a way to re-trigger
  const handleStartBreak = async (): Promise<void> => {
    await usePomodoroStore.getState().transitionToBreak()
  }

  const handleReshowNextTask = (): void => {
    usePomodoroStore.setState({ pendingPrompt: PomodoroPromptType.NextTask })
  }

  const hasTask = !!timerState.currentTaskName
  const isWorkPhase = timerState.currentPhase === PomodoroPhase.Work
  const isBreakPhase = timerState.currentPhase === PomodoroPhase.ShortBreak || timerState.currentPhase === PomodoroPhase.LongBreak
  const isStuck = !timerState.isActive && timerState.remainingSeconds === 0 && timerState.currentPhase !== PomodoroPhase.Paused

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
            <Tag color={phase.color} style={{ fontWeight: 600 }}>🍅 {phase.label}</Tag>
            <Text type="secondary" style={{ fontSize: 12 }}>
              Cycle {timerState.cycleNumber} of {settings.cyclesBeforeLongBreak}
            </Text>
          </Space>
          {hasTask && (
            <Text style={{ fontSize: 13, fontWeight: 500 }} ellipsis>
              {timerState.currentTaskName}
            </Text>
          )}
        </Space>

        {/* Hint when work phase active but no task started yet */}
        {isWorkPhase && !hasTask && !isStuck && (
          <Text type="secondary" style={{ fontSize: 12, fontStyle: 'italic' }}>
            Start any task to link it to this cycle
          </Text>
        )}

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
            {/* Recovery buttons when timer expired but modal was dismissed */}
            {isStuck && isWorkPhase && (
              <Button size="small" type="primary" onClick={handleStartBreak}>
                Start Break →
              </Button>
            )}
            {isStuck && isBreakPhase && (
              <Button size="small" type="primary" onClick={handleReshowNextTask}>
                Next Task →
              </Button>
            )}

            {/* Normal controls */}
            {!isStuck && (timerState.isActive || timerState.currentPhase === PomodoroPhase.Paused) && (
              <Button
                shape="circle"
                size="small"
                icon={timerState.currentPhase === PomodoroPhase.Paused ? <IconPlayArrow /> : <IconPause />}
                onClick={handlePauseResume}
              />
            )}
            {!isStuck && timerState.isActive && (
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
