/**
 * ThinkingTimeline — Sentiment timeline showing thinking evolution.
 * Ported from Decision Helper's Timeline.jsx.
 */

import React from 'react'
import { Typography } from '@arco-design/web-react'
import type { TimelineEvent } from '@shared/decision-types'
import { ThinkingSentiment } from '@shared/enums'

const { Text } = Typography

const SENTIMENT_COLORS: Record<string, string> = {
  [ThinkingSentiment.Exploring]: '#6366f1',
  [ThinkingSentiment.Uncertain]: '#f59e0b',
  [ThinkingSentiment.Energized]: '#10b981',
  [ThinkingSentiment.Conflicted]: '#ef4444',
  [ThinkingSentiment.Clarifying]: '#8b5cf6',
}

const SENTIMENT_EMOJI: Record<string, string> = {
  [ThinkingSentiment.Exploring]: '🔍',
  [ThinkingSentiment.Uncertain]: '🤔',
  [ThinkingSentiment.Energized]: '⚡',
  [ThinkingSentiment.Conflicted]: '⚔️',
  [ThinkingSentiment.Clarifying]: '💡',
}

interface ThinkingTimelineProps {
  timeline: TimelineEvent[]
}

export function ThinkingTimeline({ timeline }: ThinkingTimelineProps): React.ReactElement {
  const empty = timeline.length === 0

  return (
    <div style={{ background: 'var(--color-bg-1)', borderRadius: 8, border: '1px solid var(--color-border)', overflow: 'hidden' }}>
      <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 14 }}>→</span>
        <Text bold>Thinking Evolution</Text>
      </div>

      {empty ? (
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--color-text-3)', fontSize: 13 }}>
          Your thinking journey will be traced here over time
        </div>
      ) : (
        <div style={{ padding: '8px 12px', maxHeight: 200, overflowY: 'auto' }}>
          {timeline.map((event, i) => {
            const color = SENTIMENT_COLORS[event.sentiment] ?? '#6b7280'
            const emoji = SENTIMENT_EMOJI[event.sentiment] ?? ''
            const time = event.timestamp
              ? new Date(event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              : ''

            return (
              <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                {/* Dot + connector */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 12 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
                  {i < timeline.length - 1 && (
                    <div style={{ width: 1, flex: 1, background: 'var(--color-border)', marginTop: 2 }} />
                  )}
                </div>

                {/* Content */}
                <div style={{ flex: 1, paddingBottom: 4 }}>
                  <Text style={{ fontSize: 12 }}>{event.label}</Text>
                  <div style={{ display: 'flex', gap: 8, marginTop: 2, fontSize: 11 }}>
                    <span style={{ color }}>{emoji} {event.sentiment}</span>
                    {time && <span style={{ color: 'var(--color-text-4)' }}>{time}</span>}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
