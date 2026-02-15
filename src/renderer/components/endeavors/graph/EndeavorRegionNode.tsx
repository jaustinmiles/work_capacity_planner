/**
 * EndeavorRegionNode - Custom ReactFlow group node for endeavor regions
 *
 * Renders as a large rounded rectangle with the endeavor's color,
 * showing name, status badge, and progress percentage in the header.
 * Child step nodes are positioned inside this region.
 */

import React from 'react'
import { Tag, Progress, Typography, Space } from '@arco-design/web-react'
import type { NodeProps } from 'reactflow'
import { EndeavorStatus } from '@shared/enums'
import type { EndeavorProgress } from '@shared/types'
import { hexToRgba } from './graph-layout-utils'

const { Text } = Typography

const STATUS_COLORS: Record<EndeavorStatus, string> = {
  [EndeavorStatus.Active]: 'arcoblue',
  [EndeavorStatus.Paused]: 'orange',
  [EndeavorStatus.Completed]: 'green',
  [EndeavorStatus.Archived]: 'gray',
}

const STATUS_LABELS: Record<EndeavorStatus, string> = {
  [EndeavorStatus.Active]: 'Active',
  [EndeavorStatus.Paused]: 'Paused',
  [EndeavorStatus.Completed]: 'Completed',
  [EndeavorStatus.Archived]: 'Archived',
}

interface EndeavorRegionData {
  label: string
  status: EndeavorStatus
  color: string
  progress: EndeavorProgress
  description?: string
  endeavorId: string
}

export const EndeavorRegionNode = React.memo(({ data }: NodeProps<EndeavorRegionData>) => {
  const bgColor = hexToRgba(data.color, 0.06)
  const borderColor = hexToRgba(data.color, 0.4)

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        background: bgColor,
        border: `2px solid ${borderColor}`,
        borderRadius: 12,
        overflow: 'visible',
      }}
    >
      {/* Header bar */}
      <div
        style={{
          padding: '8px 14px',
          borderBottom: `1px solid ${hexToRgba(data.color, 0.15)}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: hexToRgba(data.color, 0.08),
          borderRadius: '10px 10px 0 0',
        }}
      >
        <Space size={8}>
          <Text style={{ fontWeight: 600, fontSize: 14, color: '#1D2129' }}>
            {data.label}
          </Text>
          <Tag color={STATUS_COLORS[data.status]} size="small">
            {STATUS_LABELS[data.status]}
          </Tag>
        </Space>

        <Space size={8}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {data.progress.completedTasks}/{data.progress.totalTasks}
          </Text>
          <Progress
            percent={data.progress.percentComplete}
            size="mini"
            style={{ width: 60 }}
            color={data.progress.percentComplete === 100 ? 'green' : data.color}
          />
        </Space>
      </div>
    </div>
  )
})

EndeavorRegionNode.displayName = 'EndeavorRegionNode'
