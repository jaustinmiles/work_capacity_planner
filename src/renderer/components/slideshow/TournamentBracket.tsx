/**
 * TournamentBracket — ReactFlow visualization of pairwise-ranking progress.
 *
 * Layout: items are placed in columns by loss count (winners' bracket on the
 * left, items with N losses on the Nth column). Within a column, items are
 * sorted by win count. Direct (non-transitive) wins are shown as edges.
 *
 * Visual cues:
 *   - The current matchup is outlined in orange.
 *   - "Placed" items (final position fully determined) get a green outline
 *     and their rank label.
 *   - Everything else is neutral grey.
 *
 * This is a read-only bracket: pan/zoom/drag are disabled to keep the
 * inside-a-modal experience clean.
 */

import { useMemo } from 'react'
import ReactFlow, { Background, type Node, type Edge } from 'reactflow'
import 'reactflow/dist/style.css'
import {
  getTournamentState,
  topologicalSort,
  type ItemId,
} from '../../utils/comparison-graph'

export interface BracketItem {
  id: ItemId
  title: string
}

interface TournamentBracketProps {
  items: BracketItem[]
  winsGraph: Map<ItemId, Set<ItemId>>
  equalsGraph: Map<ItemId, Set<ItemId>>
  currentPair?: [ItemId, ItemId] | null
  width?: number
  height?: number
}

const TIER_X_SPACING = 220
const NODE_Y_SPACING = 70
const TIER_X_OFFSET = 30
const NODE_Y_OFFSET = 20
const TITLE_MAX_LEN = 24

function truncate(s: string): string {
  return s.length <= TITLE_MAX_LEN ? s : s.slice(0, TITLE_MAX_LEN - 1) + '…'
}

export function TournamentBracket({
  items,
  winsGraph,
  equalsGraph,
  currentPair,
  width = 800,
  height = 360,
}: TournamentBracketProps) {
  const { nodes, edges } = useMemo(() => {
    const itemIds = items.map(i => i.id)
    const state = getTournamentState(itemIds, winsGraph, equalsGraph)
    const titleById = new Map(items.map(i => [i.id, i.title]))

    // For rank labels on placed items: derive the topological order once.
    const sorted = topologicalSort(itemIds, winsGraph)
    const rankById = new Map<ItemId, number>(sorted.map((id, idx) => [id, idx + 1]))

    // Group items by loss count into bracket tiers.
    const byTier = new Map<number, ItemId[]>()
    for (const id of itemIds) {
      const losses = state.lossCount.get(id) ?? 0
      if (!byTier.has(losses)) byTier.set(losses, [])
      byTier.get(losses)!.push(id)
    }

    const tiers = Array.from(byTier.keys()).sort((a, b) => a - b)
    const newNodes: Node[] = []

    tiers.forEach((tier, tierIdx) => {
      const tierItems = byTier.get(tier)!
      // Sort within tier: more wins first (climbing the bracket)
      tierItems.sort((a, b) => (state.winCount.get(b) ?? 0) - (state.winCount.get(a) ?? 0))

      tierItems.forEach((id, idx) => {
        const isPlaced = state.placed.has(id)
        const isActive = !!currentPair && (currentPair[0] === id || currentPair[1] === id)
        const wins = state.winCount.get(id) ?? 0
        const losses = state.lossCount.get(id) ?? 0
        const rank = isPlaced ? rankById.get(id) : undefined

        const borderColor = isActive ? '#FF7D00' : isPlaced ? '#00B42A' : '#C9CDD4'
        const bg = isActive ? '#FFF7E6' : isPlaced ? '#F6FFED' : '#FFFFFF'

        newNodes.push({
          id,
          position: {
            x: TIER_X_OFFSET + tierIdx * TIER_X_SPACING,
            y: NODE_Y_OFFSET + idx * NODE_Y_SPACING,
          },
          data: {
            label: (
              <div style={{ textAlign: 'left', lineHeight: 1.35 }}>
                <div style={{ fontWeight: 600, fontSize: 12 }}>
                  {rank !== undefined && <span style={{ color: '#00B42A', marginRight: 4 }}>#{rank}</span>}
                  {truncate(titleById.get(id) ?? id)}
                </div>
                <div style={{ fontSize: 10, color: '#86909C' }}>
                  {wins}W · {losses}L{isActive ? ' · current' : ''}
                </div>
              </div>
            ),
          },
          style: {
            border: `${isActive ? 3 : isPlaced ? 2 : 1}px solid ${borderColor}`,
            borderRadius: 6,
            padding: 8,
            background: bg,
            minWidth: 170,
          },
          draggable: false,
          selectable: false,
        })
      })
    })

    // Edges: direct wins only (transitive edges would clutter the canvas).
    const newEdges: Edge[] = []
    const itemSet = new Set(itemIds)
    winsGraph.forEach((losers, winner) => {
      if (!itemSet.has(winner)) return
      losers.forEach(loser => {
        if (!itemSet.has(loser)) return
        newEdges.push({
          id: `${winner}->${loser}`,
          source: winner,
          target: loser,
          type: 'default',
          style: { stroke: '#C9CDD4' },
        })
      })
    })

    return { nodes: newNodes, edges: newEdges }
  }, [items, winsGraph, equalsGraph, currentPair])

  if (items.length === 0) {
    return (
      <div
        style={{
          width,
          height,
          border: '1px dashed #E5E6EB',
          borderRadius: 4,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#86909C',
          fontSize: 12,
        }}
      >
        No items to rank
      </div>
    )
  }

  return (
    <div style={{ width, height, border: '1px solid #E5E6EB', borderRadius: 4 }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        fitView
        fitViewOptions={{ padding: 0.1 }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        zoomOnScroll={false}
        zoomOnPinch={false}
        zoomOnDoubleClick={false}
        panOnDrag={false}
        panOnScroll={false}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={16} size={1} />
      </ReactFlow>
    </div>
  )
}
