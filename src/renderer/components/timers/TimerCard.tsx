/**
 * TimerCard Component
 *
 * Displays a single timer with countdown, progress ring, and action buttons.
 * Follows the visual patterns of PomodoroTimer but adapted for standalone timers.
 */

import React, { useState } from 'react'
import { Card, Button, Progress, Typography, Space, Tag, InputNumber, Popover } from '@arco-design/web-react'
import {
  IconPause,
  IconPlayArrow,
  IconClose,
  IconClockCircle,
  IconPlus,
} from '@arco-design/web-react/icon'
import { TimerStatus } from '@shared/enums'
import { formatTimerDisplay, formatTimerDuration } from '@shared/timer-types'
import type { TimerDisplayState } from '@shared/timer-types'
import { TIMER_DEFAULTS } from '@shared/constants'
import { useTimerStore } from '../../store/useTimerStore'

const { Text, Title } = Typography

interface TimerCardProps {
  timer: TimerDisplayState
}

function getStatusColor(status: TimerStatus, remainingSeconds: number): string {
  if (status === TimerStatus.Expired) return 'var(--color-danger-6)'
  if (status === TimerStatus.Paused) return 'var(--color-warning-6)'
  if (remainingSeconds <= TIMER_DEFAULTS.EXPIRING_SOON_MINUTES * 60) return 'var(--color-orangered-6)'
  return 'var(--color-primary-6)'
}

function getStatusTag(status: TimerStatus): React.ReactNode {
  switch (status) {
    case TimerStatus.Active:
      return <Tag color="arcoblue" size="small">Active</Tag>
    case TimerStatus.Paused:
      return <Tag color="gold" size="small">Paused</Tag>
    case TimerStatus.Expired:
      return <Tag color="red" size="small">Expired</Tag>
    default:
      return null
  }
}

export function TimerCard({ timer }: TimerCardProps): React.ReactElement {
  const { extendTimer, pauseTimer, resumeTimer, dismissTimer, cancelTimer } = useTimerStore()
  const [extendMinutes, setExtendMinutes] = useState(15)
  const [isExtendOpen, setIsExtendOpen] = useState(false)

  const color = getStatusColor(timer.status, timer.remainingSeconds)
  const isActive = timer.status === TimerStatus.Active
  const isPaused = timer.status === TimerStatus.Paused
  const isExpired = timer.status === TimerStatus.Expired

  const handleExtend = async (): Promise<void> => {
    await extendTimer(timer.id, extendMinutes)
    setIsExtendOpen(false)
  }

  return (
    <Card
      size="small"
      style={{
        borderRadius: 12,
        borderLeft: `4px solid ${color}`,
        background: isExpired ? 'var(--color-danger-light-1)' : 'var(--color-bg-1)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        {/* Progress ring */}
        <div style={{ flexShrink: 0 }}>
          <Progress
            type="circle"
            percent={timer.progress}
            size="small"
            style={{ width: 56, height: 56 }}
            color={color}
            formatText={() => ''}
          />
        </div>

        {/* Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <Title heading={6} style={{ margin: 0, fontSize: 14 }} ellipsis>
              {timer.name}
            </Title>
            {getStatusTag(timer.status)}
          </div>

          {/* Countdown */}
          <Text
            style={{
              fontSize: isExpired ? 16 : 20,
              fontWeight: 600,
              fontFamily: 'monospace',
              color,
            }}
          >
            {isExpired ? 'Expired' : formatTimerDisplay(timer.remainingSeconds)}
          </Text>

          {/* Meta */}
          <div style={{ marginTop: 4 }}>
            <Text type="secondary" style={{ fontSize: 11 }}>
              <IconClockCircle style={{ marginRight: 4 }} />
              {formatTimerDuration(timer.originalDurationMinutes)}
              {timer.extendedByMinutes > 0 && ` (+${formatTimerDuration(timer.extendedByMinutes)})`}
            </Text>
          </div>
        </div>

        {/* Actions */}
        <Space direction="vertical" size={4} style={{ flexShrink: 0 }}>
          {isActive && (
            <Button
              size="mini"
              icon={<IconPause />}
              onClick={() => pauseTimer(timer.id)}
            />
          )}
          {isPaused && (
            <Button
              size="mini"
              type="primary"
              icon={<IconPlayArrow />}
              onClick={() => resumeTimer(timer.id)}
            />
          )}
          {(isActive || isPaused) && (
            <Popover
              trigger="click"
              popupVisible={isExtendOpen}
              onVisibleChange={setIsExtendOpen}
              content={
                <Space>
                  <InputNumber
                    size="small"
                    value={extendMinutes}
                    onChange={(val) => setExtendMinutes(val ?? 15)}
                    min={1}
                    max={10080}
                    suffix="min"
                    style={{ width: 100 }}
                  />
                  <Button size="small" type="primary" onClick={handleExtend}>
                    Extend
                  </Button>
                </Space>
              }
            >
              <Button size="mini" icon={<IconPlus />} />
            </Popover>
          )}
          {isExpired && (
            <Button
              size="mini"
              onClick={() => dismissTimer(timer.id)}
            >
              Dismiss
            </Button>
          )}
          {(isActive || isPaused) && (
            <Button
              size="mini"
              status="danger"
              icon={<IconClose />}
              onClick={() => cancelTimer(timer.id)}
            />
          )}
        </Space>
      </div>
    </Card>
  )
}
