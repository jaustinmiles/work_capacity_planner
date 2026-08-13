/**
 * MindMapConceptNode — the artistic ReactFlow node for a mind-map concept.
 *
 * Renders the extracted concept as a colorful, symbol-forward card: a large emoji,
 * the label, and a small kind chip. Color + emoji come from the persisted node
 * (derived server-side from the codified kind), so the canvas stays coherent and
 * cannot show a hallucinated color. Handles on all four sides let the user draw
 * relationships.
 */

import { memo } from 'react'
import { Handle, Position, type NodeProps } from 'reactflow'
import { Typography } from '@arco-design/web-react'
import { MindMapNodeKind } from '@shared/enums'
import { parseEnum } from '@shared/enum-utils'
import { MIND_MAP_NODE_KIND_CONFIG } from '@shared/mindmap-types'
import type { MindMapNodeRow } from '../../../store/useJournalStore'

export interface MindMapConceptNodeData {
  node: MindMapNodeRow
  isNew?: boolean
}

const handleStyle: React.CSSProperties = {
  width: 8,
  height: 8,
  background: 'var(--color-bg-1)',
  border: '2px solid var(--color-text-3)',
}

function MindMapConceptNodeInner({ data, selected }: NodeProps<MindMapConceptNodeData>) {
  const { node } = data
  const kind = parseEnum(MindMapNodeKind, node.kind, MindMapNodeKind.Concept)
  const kindLabel = MIND_MAP_NODE_KIND_CONFIG[kind].label
  const color = node.color

  return (
    <div
      style={{
        position: 'relative',
        width: node.width,
        minHeight: node.height,
        padding: '12px 14px',
        borderRadius: 16,
        // Color wash from the node's kind color, with a solid colored border.
        background: `linear-gradient(135deg, ${color}26, ${color}0D)`,
        border: `2px solid ${color}`,
        boxShadow: selected
          ? `0 0 0 3px ${color}55, 0 6px 18px ${color}33`
          : `0 4px 14px ${color}22`,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        gap: 4,
        cursor: 'grab',
        animation: data.isNew ? 'journal-node-pop 320ms ease-out' : undefined,
      }}
    >
      <Handle type="target" position={Position.Top} style={handleStyle} />
      <Handle type="target" position={Position.Left} style={handleStyle} />

      <span style={{ fontSize: 30, lineHeight: 1 }} aria-hidden>
        {node.emoji}
      </span>
      <Typography.Text bold style={{ fontSize: 14, lineHeight: 1.25 }}>
        {node.label}
      </Typography.Text>
      <span
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: 0.4,
          textTransform: 'uppercase',
          color,
          opacity: 0.85,
        }}
      >
        {kindLabel}
      </span>

      <Handle type="source" position={Position.Bottom} style={handleStyle} />
      <Handle type="source" position={Position.Right} style={handleStyle} />
    </div>
  )
}

export const MindMapConceptNode = memo(MindMapConceptNodeInner)
