/**
 * DependencyEdge - Custom ReactFlow edge for cross-endeavor dependencies
 *
 * Renders as a dashed line — orange for hard blocks, yellow for soft blocks.
 * Shows a label on hover with dependency notes.
 * Double-click to delete (when in edit mode).
 */

import React, { useState } from 'react'
import { getBezierPath } from 'reactflow'
import type { EdgeProps } from 'reactflow'

interface DependencyEdgeData {
  isHardBlock: boolean
  notes?: string
  dependencyId: string
  isEditable?: boolean
  onDelete?: (dependencyId: string) => void
}

export const DependencyEdge = React.memo(({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  markerEnd,
}: EdgeProps<DependencyEdgeData>) => {
  const [hovered, setHovered] = useState(false)

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  })

  const color = data?.isHardBlock ? '#F77234' : '#F7BA1E'
  const label = data?.isHardBlock ? 'Hard Block' : 'Soft Block'

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (data?.isEditable && data?.onDelete && data?.dependencyId) {
      data.onDelete(data.dependencyId)
    }
  }

  return (
    <g
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onDoubleClick={handleDoubleClick}
      style={{ cursor: data?.isEditable ? 'pointer' : 'default' }}
    >
      <path
        id={id}
        d={edgePath}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeDasharray="8 4"
        markerEnd={markerEnd}
      />
      {/* Wider invisible path for easier hover targeting */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={16}
      />
      {hovered && (
        <foreignObject
          x={labelX - 60}
          y={labelY - 16}
          width={120}
          height={32}
          style={{ overflow: 'visible', pointerEvents: 'none' }}
        >
          <div
            style={{
              background: 'rgba(0, 0, 0, 0.75)',
              color: '#fff',
              padding: '4px 8px',
              borderRadius: 4,
              fontSize: 11,
              textAlign: 'center',
              whiteSpace: 'nowrap',
            }}
          >
            {label}
            {data?.notes && `: ${data.notes}`}
          </div>
        </foreignObject>
      )}
    </g>
  )
})

DependencyEdge.displayName = 'DependencyEdge'
