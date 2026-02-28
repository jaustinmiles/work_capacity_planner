/**
 * DeepWorkConnectionLine — Custom ReactFlow edge for dependency arrows.
 *
 * Renders an animated arrow showing flow direction.
 * Color-coded by edge type:
 *   - Gray: intra-workflow dependency
 *   - Orange: cross-workflow dependency
 */

import { memo } from 'react'
import { BaseEdge, getSmoothStepPath } from 'reactflow'
import type { EdgeProps } from 'reactflow'
import { DeepWorkEdgeType } from '@shared/deep-work-board-types'

export interface DeepWorkConnectionLineData {
  edgeType: DeepWorkEdgeType
}

const EDGE_COLORS: Record<DeepWorkEdgeType, string> = {
  [DeepWorkEdgeType.IntraWorkflow]: '#86909c',
  [DeepWorkEdgeType.CrossWorkflow]: '#ff7d00',
}

function DeepWorkConnectionLineInner({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
}: EdgeProps<DeepWorkConnectionLineData>) {
  const edgeType = data?.edgeType ?? DeepWorkEdgeType.IntraWorkflow
  const color = selected ? '#165DFF' : EDGE_COLORS[edgeType]

  const [edgePath] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    borderRadius: 12,
  })

  return (
    <BaseEdge
      path={edgePath}
      style={{
        stroke: color,
        strokeWidth: selected ? 2.5 : 2,
        transition: 'stroke 0.2s',
      }}
      markerEnd={`url(#arrow-${edgeType}${selected ? '-selected' : ''})`}
    />
  )
}

/**
 * SVG marker definitions for arrow heads.
 * Must be rendered once in the canvas SVG defs.
 */
export function DeepWorkEdgeMarkers() {
  return (
    <svg style={{ position: 'absolute', width: 0, height: 0 }}>
      <defs>
        <marker
          id={`arrow-${DeepWorkEdgeType.IntraWorkflow}`}
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="8"
          markerHeight="8"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 Z" fill="#86909c" />
        </marker>
        <marker
          id={`arrow-${DeepWorkEdgeType.CrossWorkflow}`}
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="8"
          markerHeight="8"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 Z" fill="#ff7d00" />
        </marker>
        <marker
          id={`arrow-${DeepWorkEdgeType.IntraWorkflow}-selected`}
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="8"
          markerHeight="8"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 Z" fill="#165DFF" />
        </marker>
        <marker
          id={`arrow-${DeepWorkEdgeType.CrossWorkflow}-selected`}
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="8"
          markerHeight="8"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 Z" fill="#165DFF" />
        </marker>
      </defs>
    </svg>
  )
}

export const DeepWorkConnectionLine = memo(DeepWorkConnectionLineInner)
