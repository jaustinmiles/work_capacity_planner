/**
 * DecisionView — Container/layout for the Decision Mode feature.
 *
 * Two-column grid: left = DecisionGraph (full height),
 * right = TradeoffMatrix (top) + ThinkingTimeline (bottom).
 * Bottom: DecisionControls (chat input).
 * Header: ConnectivityMeter + session controls.
 */

import React, { useEffect } from 'react'
import { Button, Typography, Space, Empty } from '@arco-design/web-react'
import { IconPlus } from '@arco-design/web-react/icon'
import { useDecisionStore } from '../../store/useDecisionStore'
import { DecisionGraph } from './DecisionGraph'
import { TradeoffMatrix } from './TradeoffMatrix'
import { ThinkingTimeline } from './ThinkingTimeline'
import { ConnectivityMeter } from './ConnectivityMeter'
import { DecisionControls } from './DecisionControls'

const { Title, Text } = Typography

export function DecisionView(): React.ReactElement {
  const {
    activeSessionId,
    decisionState,
    connectivity,
    isProcessing,
    startSession,
    loadSessions,
    sessions,
    resumeSession,
  } = useDecisionStore()

  useEffect(() => {
    loadSessions()
  }, [loadSessions])

  // No active session — show start screen
  if (!activeSessionId) {
    return (
      <div style={{ padding: 24, maxWidth: 600, margin: '0 auto' }}>
        <Title heading={4}>Decision Mode</Title>
        <Text type="secondary" style={{ display: 'block', marginBottom: 24 }}>
          Think through decisions with a Socratic AI that asks purely reflective questions — zero opinions, zero advice.
          It builds a visual decision graph from everything you say.
        </Text>

        <Button
          type="primary"
          icon={<IconPlus />}
          size="large"
          onClick={startSession}
          loading={isProcessing}
          style={{ marginBottom: 24 }}
        >
          Start New Decision Session
        </Button>

        {/* Past sessions */}
        {sessions.length > 0 && (
          <div>
            <Text bold style={{ display: 'block', marginBottom: 8 }}>Past Sessions</Text>
            <Space direction="vertical" size={4} style={{ width: '100%' }}>
              {sessions.map(s => (
                <div
                  key={s.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '8px 12px',
                    background: 'var(--color-fill-1)',
                    borderRadius: 6,
                    cursor: 'pointer',
                  }}
                  onClick={() => resumeSession(s.id)}
                >
                  <div>
                    <Text>{s.topic || 'Untitled decision'}</Text>
                    <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>
                      {new Date(s.createdAt).toLocaleDateString()} — {Math.round(s.connectivity * 100)}% connected
                    </Text>
                  </div>
                  {s.isActive && (
                    <Text style={{ fontSize: 11, color: 'var(--color-primary-6)' }}>Active</Text>
                  )}
                </div>
              ))}
            </Space>
          </div>
        )}

        {sessions.length === 0 && (
          <Empty description="No past decision sessions" />
        )}
      </div>
    )
  }

  // Active session — show the decision dashboard
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Space>
          <Title heading={6} style={{ margin: 0 }}>Decision Mode</Title>
          {decisionState.topic && (
            <Text type="secondary">— {decisionState.topic}</Text>
          )}
        </Space>
        <ConnectivityMeter connectivity={connectivity} />
      </div>

      {/* Main content — two column grid */}
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, padding: 8, overflow: 'hidden' }}>
        {/* Left: Decision Graph */}
        <DecisionGraph tree={decisionState.tree} topic={decisionState.topic} />

        {/* Right: Matrix + Timeline stacked */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, overflow: 'auto' }}>
          <TradeoffMatrix options={decisionState.options} factors={decisionState.factors} />
          <ThinkingTimeline timeline={decisionState.timeline} />
        </div>
      </div>

      {/* Bottom: Chat controls */}
      <DecisionControls />
    </div>
  )
}
