/**
 * TimeSinkLogger Component
 *
 * UI for logging time against time sinks (start/stop tracking).
 * Shows quick-start buttons for each sink and active timer display.
 */

import React, { useState, useEffect } from 'react'
import {
  Card,
  Space,
  Typography,
  Button,
  Input,
  Message,
  Tag,
  Empty,
} from '@arco-design/web-react'
import { IconPlayArrow, IconPause, IconSettings } from '@arco-design/web-react/icon'
import {
  useTimeSinkStore,
  useSortedTimeSinks,
  useActiveSinkSession,
} from '../../store/useTimeSinkStore'
import { formatMinutes } from '@shared/time-utils'

const { Title, Text } = Typography
const { TextArea } = Input

// ============================================================================
// Types
// ============================================================================

interface TimeSinkLoggerProps {
  onOpenSettings?: () => void
}

// ============================================================================
// Sub-Components
// ============================================================================

interface ActiveSessionDisplayProps {
  sinkName: string
  sinkEmoji: string
  sinkColor: string
  elapsedMinutes: number
  onStop: (notes?: string) => Promise<void>
}

function ActiveSessionDisplay({
  sinkName,
  sinkEmoji,
  sinkColor,
  elapsedMinutes,
  onStop,
}: ActiveSessionDisplayProps): React.ReactElement {
  const [notes, setNotes] = useState('')
  const [isStopping, setIsStopping] = useState(false)

  const handleStop = async (): Promise<void> => {
    setIsStopping(true)
    try {
      await onStop(notes || undefined)
      setNotes('')
    } finally {
      setIsStopping(false)
    }
  }

  return (
    <div
      style={{
        background: `linear-gradient(135deg, ${sinkColor}20, ${sinkColor}10)`,
        border: `2px solid ${sinkColor}`,
        borderRadius: 8,
        padding: 16,
      }}
    >
      <Space direction="vertical" style={{ width: '100%' }}>
        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
          <Space>
            <span style={{ fontSize: 24 }}>{sinkEmoji}</span>
            <div>
              <Text bold>{sinkName}</Text>
              <br />
              <Text type="secondary" style={{ fontSize: '12px' }}>
                In progress...
              </Text>
            </div>
          </Space>
          <Tag color="orange" style={{ fontSize: 16, padding: '4px 12px' }}>
            {formatMinutes(elapsedMinutes)}
          </Tag>
        </Space>

        <TextArea
          placeholder="Add notes (optional)..."
          value={notes}
          onChange={setNotes}
          autoSize={{ minRows: 1, maxRows: 3 }}
          style={{ marginTop: 8 }}
        />

        <Button
          type="primary"
          status="warning"
          icon={<IconPause />}
          onClick={handleStop}
          loading={isStopping}
          style={{ width: '100%', marginTop: 8 }}
        >
          Stop ({formatMinutes(elapsedMinutes)})
        </Button>
      </Space>
    </div>
  )
}

// ============================================================================
// Main Component
// ============================================================================

export function TimeSinkLogger({ onOpenSettings }: TimeSinkLoggerProps): React.ReactElement {
  const sinks = useSortedTimeSinks()
  const activeSinkSession = useActiveSinkSession()
  const startSession = useTimeSinkStore((state) => state.startSession)
  const stopSession = useTimeSinkStore((state) => state.stopSession)
  const getById = useTimeSinkStore((state) => state.getById)
  const getActiveSessionDuration = useTimeSinkStore((state) => state.getActiveSessionDuration)

  const [elapsedMinutes, setElapsedMinutes] = useState(0)
  const [startingId, setStartingId] = useState<string | null>(null)

  // Update elapsed time every 10 seconds when session is active
  useEffect(() => {
    if (!activeSinkSession) {
      setElapsedMinutes(0)
      return
    }

    // Initial calculation
    setElapsedMinutes(getActiveSessionDuration())

    const interval = setInterval(() => {
      setElapsedMinutes(getActiveSessionDuration())
    }, 10000) // Every 10 seconds

    return (): void => clearInterval(interval)
  }, [activeSinkSession, getActiveSessionDuration])

  const handleStart = async (sinkId: string): Promise<void> => {
    setStartingId(sinkId)
    try {
      await startSession(sinkId)
      Message.success('Started time sink session')
    } catch {
      Message.error('Failed to start session')
    } finally {
      setStartingId(null)
    }
  }

  const handleStop = async (notes?: string): Promise<void> => {
    try {
      const session = await stopSession(notes)
      if (session) {
        Message.success(`Logged ${formatMinutes(session.actualMinutes || 0)}`)
      }
    } catch {
      Message.error('Failed to stop session')
    }
  }

  // Get active sink details
  const activeSink = activeSinkSession ? getById(activeSinkSession.timeSinkId) : null

  return (
    <Card>
      <Space direction="vertical" style={{ width: '100%' }}>
        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
          <Title heading={6} style={{ margin: 0 }}>
            ⏱️ Time Sinks
          </Title>
          {onOpenSettings && (
            <Button
              type="text"
              icon={<IconSettings />}
              onClick={onOpenSettings}
              size="small"
            />
          )}
        </Space>

        {/* Active Session */}
        {activeSinkSession && activeSink && (
          <ActiveSessionDisplay
            sinkName={activeSink.name}
            sinkEmoji={activeSink.emoji}
            sinkColor={activeSink.color}
            elapsedMinutes={elapsedMinutes}
            onStop={handleStop}
          />
        )}

        {/* Quick Start Buttons */}
        {!activeSinkSession && (
          <>
            {sinks.length === 0 ? (
              <Space direction="vertical" align="center" style={{ width: '100%' }}>
                <Empty description="No time sinks defined" />
                {onOpenSettings && (
                  <Button
                    type="outline"
                    onClick={onOpenSettings}
                  >
                    Add Time Sinks
                  </Button>
                )}
              </Space>
            ) : (
              <Space direction="vertical" style={{ width: '100%' }}>
                <Text type="secondary" style={{ fontSize: '12px' }}>
                  Quick start:
                </Text>
                <Space wrap>
                  {sinks.map((sink) => (
                    <Button
                      key={sink.id}
                      icon={<IconPlayArrow />}
                      onClick={() => handleStart(sink.id)}
                      loading={startingId === sink.id}
                      style={{
                        borderColor: sink.color,
                        color: sink.color,
                      }}
                    >
                      {sink.emoji} {sink.name}
                    </Button>
                  ))}
                </Space>
              </Space>
            )}
          </>
        )}

        {/* Switch to different sink while one is active */}
        {activeSinkSession && sinks.length > 1 && (
          <div style={{ marginTop: 8 }}>
            <Text type="secondary" style={{ fontSize: '12px' }}>
              Switch to:
            </Text>
            <Space wrap style={{ marginTop: 4 }}>
              {sinks
                .filter((s) => s.id !== activeSinkSession.timeSinkId)
                .map((sink) => (
                  <Button
                    key={sink.id}
                    size="mini"
                    onClick={() => handleStart(sink.id)}
                    loading={startingId === sink.id}
                  >
                    {sink.emoji} {sink.name}
                  </Button>
                ))}
            </Space>
          </div>
        )}
      </Space>
    </Card>
  )
}
