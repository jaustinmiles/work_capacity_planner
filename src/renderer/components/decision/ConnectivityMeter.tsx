/**
 * ConnectivityMeter — Graph coverage progress bar.
 * Shows how well-connected the decision graph is.
 */

import React from 'react'
import { Progress, Typography } from '@arco-design/web-react'
import type { ConnectivityScore } from '@shared/decision-types'

const { Text } = Typography

interface ConnectivityMeterProps {
  connectivity: ConnectivityScore | null
}

export function ConnectivityMeter({ connectivity }: ConnectivityMeterProps): React.ReactElement {
  if (!connectivity) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Progress percent={0} size="small" style={{ width: 120 }} />
        <Text type="secondary" style={{ fontSize: 11 }}>Start talking to build your decision map</Text>
      </div>
    )
  }

  const percent = Math.min(100, Math.round(connectivity.score * 200))
  const isReady = connectivity.ready
  const color = isReady ? '#f59e0b' : '#6366f1'

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <Progress
        percent={percent}
        size="small"
        style={{ width: 120 }}
        color={color}
        formatText={() => `${percent}%`}
      />
      <Text style={{ fontSize: 11, color }}>
        {isReady ? 'Ready to extract' : `${percent}% connected`}
      </Text>
      <Text type="secondary" style={{ fontSize: 10 }}>
        {connectivity.nodeCount}n / {connectivity.edgeCount}e
      </Text>
    </div>
  )
}
