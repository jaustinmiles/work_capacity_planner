/**
 * ToolStatusIndicator Component
 *
 * Displays inline indicators for read tool execution in the chat.
 * Shows a subtle animated label like "[Checking your tasks...]"
 * while the agent queries data.
 */

import React from 'react'
import { Spin } from '@arco-design/web-react'

interface ToolStatusIndicatorProps {
  statuses: Array<{ toolName: string; label: string; toolCallId: string }>
}

export function ToolStatusIndicator({ statuses }: ToolStatusIndicatorProps): React.ReactElement | null {
  if (statuses.length === 0) return null

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 8,
        padding: '6px 0',
      }}
    >
      {statuses.map(({ toolCallId, label }) => (
        <div
          key={toolCallId}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '3px 10px',
            borderRadius: 12,
            background: 'var(--color-fill-2)',
            color: 'var(--color-text-3)',
            fontSize: 12,
          }}
        >
          <Spin size={10} />
          <span>{label}</span>
        </div>
      ))}
    </div>
  )
}
