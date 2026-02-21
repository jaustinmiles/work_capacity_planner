/**
 * GoalNode - Custom ReactFlow node representing "all workflows complete"
 *
 * Renders as a circle/diamond with a flag icon in the endeavor's color.
 * Target handle only (left side) — terminal steps connect to this.
 */

import React from 'react'
import { Handle, Position } from 'reactflow'
import type { NodeProps } from 'reactflow'
import { hexToRgba } from './graph-layout-utils'

interface GoalNodeData {
  label: string
  color: string
  endeavorId: string
  isOnCriticalPath?: boolean
}

export const GoalNode = React.memo(({ data }: NodeProps<GoalNodeData>) => {
  const isHighlighted = data.isOnCriticalPath

  return (
    <div
      style={{
        width: 52,
        height: 52,
        borderRadius: '50%',
        background: isHighlighted
          ? hexToRgba(data.color, 0.3)
          : hexToRgba(data.color, 0.15),
        border: `3px solid ${data.color}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: isHighlighted
          ? `0 0 12px ${hexToRgba(data.color, 0.5)}`
          : 'none',
        transition: 'box-shadow 0.3s, background 0.3s',
      }}
    >
      <Handle
        type="target"
        position={Position.Left}
        style={{
          background: data.color,
          width: 8,
          height: 8,
        }}
      />

      <span style={{ fontSize: 20 }} role="img" aria-label="goal">
        🏁
      </span>
    </div>
  )
})

GoalNode.displayName = 'GoalNode'
