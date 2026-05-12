/**
 * TimerTab Component
 *
 * Full-page tab for managing countdown timers.
 * Shows active, expired, and create-new timer sections.
 */

import React, { useState } from 'react'
import { Button, Input, InputNumber, Typography, Space, Empty, Divider } from '@arco-design/web-react'
import { IconPlus, IconClockCircle } from '@arco-design/web-react/icon'
import { useTimerStore, useActiveTimers, useExpiredTimers } from '../../store/useTimerStore'
import { TimerCard } from './TimerCard'
import { TIMER_DEFAULTS } from '@shared/constants'
import { TimerStatus } from '@shared/enums'

const { Title, Text } = Typography

export function TimerTab(): React.ReactElement {
  const { createTimer, isInitialized } = useTimerStore()
  const activeTimers = useActiveTimers()
  const expiredTimers = useExpiredTimers()

  const [isCreating, setIsCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDuration, setNewDuration] = useState(30)

  const expiringSoon = activeTimers.filter(
    (t) => t.status === TimerStatus.Active && t.remainingSeconds <= TIMER_DEFAULTS.EXPIRING_SOON_MINUTES * 60,
  )
  const normalActive = activeTimers.filter(
    (t) => !(t.status === TimerStatus.Active && t.remainingSeconds <= TIMER_DEFAULTS.EXPIRING_SOON_MINUTES * 60),
  )

  const handleCreate = async (): Promise<void> => {
    if (!newName.trim() || newDuration <= 0) return
    await createTimer(newName.trim(), newDuration)
    setNewName('')
    setNewDuration(30)
    setIsCreating(false)
  }

  if (!isInitialized) {
    return (
      <div style={{ padding: 24, textAlign: 'center' }}>
        <Text type="secondary">Loading timers...</Text>
      </div>
    )
  }

  const hasAnyTimers = activeTimers.length > 0 || expiredTimers.length > 0

  return (
    <div style={{ padding: 24, maxWidth: 640, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <Title heading={4} style={{ margin: 0 }}>
          <IconClockCircle style={{ marginRight: 8 }} />
          Timers
        </Title>
        <Button
          type="primary"
          icon={<IconPlus />}
          onClick={() => setIsCreating(true)}
        >
          New Timer
        </Button>
      </div>

      {/* Create form */}
      {isCreating && (
        <div
          style={{
            padding: 16,
            marginBottom: 16,
            background: 'var(--color-bg-2)',
            borderRadius: 8,
            border: '1px solid var(--color-border)',
          }}
        >
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <Input
              placeholder="Timer name (e.g., Laundry, Wait for response)"
              value={newName}
              onChange={setNewName}
              onPressEnter={handleCreate}
              autoFocus
            />
            <Space>
              <InputNumber
                value={newDuration}
                onChange={(val) => setNewDuration(val ?? 30)}
                min={1}
                max={10080}
                suffix="minutes"
                style={{ width: 160 }}
              />
              <Text type="secondary" style={{ fontSize: 12 }}>
                {newDuration >= 1440
                  ? `${Math.floor(newDuration / 1440)}d ${Math.floor((newDuration % 1440) / 60)}h`
                  : newDuration >= 60
                  ? `${Math.floor(newDuration / 60)}h ${newDuration % 60}m`
                  : `${newDuration}m`}
              </Text>
            </Space>
            <Space>
              <Button type="primary" onClick={handleCreate} disabled={!newName.trim()}>
                Start Timer
              </Button>
              <Button onClick={() => setIsCreating(false)}>Cancel</Button>
            </Space>
          </Space>
        </div>
      )}

      {/* Empty state */}
      {!hasAnyTimers && !isCreating && (
        <Empty
          description="No active timers"
          style={{ marginTop: 80 }}
        />
      )}

      {/* Expired timers (needs attention) */}
      {expiredTimers.length > 0 && (
        <>
          <Title heading={6} style={{ color: 'var(--color-danger-6)', marginBottom: 8 }}>
            Expired ({expiredTimers.length})
          </Title>
          <Space direction="vertical" size={8} style={{ width: '100%', marginBottom: 16 }}>
            {expiredTimers.map((timer) => (
              <TimerCard key={timer.id} timer={timer} />
            ))}
          </Space>
        </>
      )}

      {/* Expiring soon */}
      {expiringSoon.length > 0 && (
        <>
          <Title heading={6} style={{ color: 'var(--color-orangered-6)', marginBottom: 8 }}>
            Expiring Soon ({expiringSoon.length})
          </Title>
          <Space direction="vertical" size={8} style={{ width: '100%', marginBottom: 16 }}>
            {expiringSoon.map((timer) => (
              <TimerCard key={timer.id} timer={timer} />
            ))}
          </Space>
        </>
      )}

      {/* Active timers */}
      {normalActive.length > 0 && (
        <>
          {(expiringSoon.length > 0 || expiredTimers.length > 0) && (
            <Divider style={{ margin: '8px 0' }} />
          )}
          <Title heading={6} style={{ color: 'var(--color-text-2)', marginBottom: 8 }}>
            Active ({normalActive.length})
          </Title>
          <Space direction="vertical" size={8} style={{ width: '100%' }}>
            {normalActive.map((timer) => (
              <TimerCard key={timer.id} timer={timer} />
            ))}
          </Space>
        </>
      )}
    </div>
  )
}
