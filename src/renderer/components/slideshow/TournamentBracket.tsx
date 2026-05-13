/**
 * TournamentBracket — ReactFlow visualization of pairwise-ranking progress.
 *
 * Layout: hierarchical DAG (left → right) by "depth from the top". An item's
 * depth = longest path from an unbeaten item (depth 0) to this item. So the
 * highest-ranked items sit on the left; items further right have lost at
 * least one chain of comparisons.
 *
 * Edges: direct wins only (transitive edges would clutter). Arrowheads point
 * from winner → loser so it reads left-to-right.
 *
 * Visual cues:
 *   - Active matchup: thick orange outline.
 *   - Placed items (final position fully determined): green outline + rank.
 *   - Everything else: neutral grey.
 *
 * Pan, zoom (scroll + pinch + buttons), and a minimap are all enabled so
 * the user can navigate larger tournaments.
 */

import { useMemo } from 'react'
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  MarkerType,
  type Node,
  type Edge,
} from 'reactflow'
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
  /** If set, this node renders with a blue selection halo (click-to-challenge UI). */
  selectedItem?: ItemId | null
  /** Click handler for individual items. Receives the clicked item's ID. */
  onItemClick?: (id: ItemId) => void
  width?: number | string
  height?: number | string
}

const COLUMN_SPACING = 240
const ROW_SPACING = 90
const NODE_WIDTH = 200
const TITLE_MAX_LEN = 26

function truncate(s: string): string {
  return s.length <= TITLE_MAX_LEN ? s : s.slice(0, TITLE_MAX_LEN - 1) + '…'
}

/**
 * For each item, compute its "depth from top": the longest path from an
 * unbeaten item (depth 0) to this item, walking the wins-direction.
 * Items with no beaters → depth 0. Items beaten by depth-k items → depth k+1.
 *
 * Memoized DFS. Cycles (which shouldn't exist but might transiently) are
 * handled by leaving the node at depth 0.
 */
function computeDepths(
  items: ItemId[],
  winsGraph: Map<ItemId, Set<ItemId>>,
): Map<ItemId, number> {
  // For each item, who directly beats it?
  const beatenBy = new Map<ItemId, Set<ItemId>>()
  for (const id of items) beatenBy.set(id, new Set())
  winsGraph.forEach((losers, winner) => {
    losers.forEach(loser => {
      const set = beatenBy.get(loser)
      if (set && items.includes(winner)) set.add(winner)
    })
  })

  const depth = new Map<ItemId, number>()
  const inProgress = new Set<ItemId>()

  function depthOf(id: ItemId): number {
    if (depth.has(id)) return depth.get(id)!
    if (inProgress.has(id)) return 0 // cycle guard — shouldn't happen
    inProgress.add(id)
    const beaters = beatenBy.get(id)
    let max = 0
    if (beaters && beaters.size > 0) {
      for (const beater of beaters) {
        max = Math.max(max, depthOf(beater) + 1)
      }
    }
    inProgress.delete(id)
    depth.set(id, max)
    return max
  }

  for (const id of items) depthOf(id)
  return depth
}

export function TournamentBracket({
  items,
  winsGraph,
  equalsGraph,
  currentPair,
  selectedItem,
  onItemClick,
  width = 800,
  height = 400,
}: TournamentBracketProps) {
  const { nodes, edges } = useMemo(() => {
    const itemIds = items.map(i => i.id)
    const state = getTournamentState(itemIds, winsGraph, equalsGraph)
    const titleById = new Map(items.map(i => [i.id, i.title]))
    const depthById = computeDepths(itemIds, winsGraph)

    // For rank labels on placed items.
    const sorted = topologicalSort(itemIds, winsGraph)
    const rankById = new Map<ItemId, number>(sorted.map((id, idx) => [id, idx + 1]))

    // Group by depth column.
    const byColumn = new Map<number, ItemId[]>()
    for (const id of itemIds) {
      const col = depthById.get(id) ?? 0
      if (!byColumn.has(col)) byColumn.set(col, [])
      byColumn.get(col)!.push(id)
    }

    const columns = Array.from(byColumn.keys()).sort((a, b) => a - b)
    const newNodes: Node[] = []

    columns.forEach(col => {
      const colItems = byColumn.get(col)!
      // Sort within column: more wins first.
      colItems.sort((a, b) => (state.winCount.get(b) ?? 0) - (state.winCount.get(a) ?? 0))

      colItems.forEach((id, rowIdx) => {
        const isPlaced = state.placed.has(id)
        const isActive = !!currentPair && (currentPair[0] === id || currentPair[1] === id)
        const isSelected = selectedItem === id
        const wins = state.winCount.get(id) ?? 0
        const losses = state.lossCount.get(id) ?? 0
        const rank = isPlaced ? rankById.get(id) : undefined

        // Priority: selected (blue) > active (orange) > placed (green) > neutral (grey).
        const borderColor = isSelected ? '#3491FA' : isActive ? '#FF7D00' : isPlaced ? '#00B42A' : '#C9CDD4'
        const bg = isSelected ? '#E8F3FF' : isActive ? '#FFF7E6' : isPlaced ? '#F6FFED' : '#FFFFFF'
        const borderWidth = isSelected ? 3 : isActive ? 3 : isPlaced ? 2 : 1

        newNodes.push({
          id,
          position: { x: col * COLUMN_SPACING, y: rowIdx * ROW_SPACING },
          data: {
            label: (
              <div style={{ textAlign: 'left', lineHeight: 1.35, padding: 2 }}>
                <div style={{ fontWeight: 600, fontSize: 12 }}>
                  {rank !== undefined && <span style={{ color: '#00B42A', marginRight: 4 }}>#{rank}</span>}
                  {truncate(titleById.get(id) ?? id)}
                </div>
                <div style={{ fontSize: 10, color: '#86909C', marginTop: 2 }}>
                  {wins}W · {losses}L{isActive ? ' · current' : ''}
                </div>
              </div>
            ),
          },
          style: {
            border: `${borderWidth}px solid ${borderColor}`,
            borderRadius: 6,
            padding: 6,
            background: bg,
            width: NODE_WIDTH,
            cursor: onItemClick ? 'pointer' : 'default',
            boxShadow: isSelected ? '0 0 0 4px rgba(52, 145, 250, 0.15)' : undefined,
          },
          draggable: false,
          selectable: false,
        })
      })
    })

    // Direct wins as arrowed edges.
    const newEdges: Edge[] = []
    const itemSet = new Set(itemIds)
    winsGraph.forEach((losers, winner) => {
      if (!itemSet.has(winner)) return
      losers.forEach(loser => {
        if (!itemSet.has(loser)) return
        const isOnActiveMatch = !!currentPair &&
          ((currentPair[0] === winner && currentPair[1] === loser) ||
           (currentPair[0] === loser && currentPair[1] === winner))
        newEdges.push({
          id: `${winner}->${loser}`,
          source: winner,
          target: loser,
          type: 'default',
          animated: isOnActiveMatch,
          style: {
            stroke: isOnActiveMatch ? '#FF7D00' : '#86909C',
            strokeWidth: isOnActiveMatch ? 2 : 1.2,
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: isOnActiveMatch ? '#FF7D00' : '#86909C',
            width: 14,
            height: 14,
          },
        })
      })
    })

    return { nodes: newNodes, edges: newEdges }
  }, [items, winsGraph, equalsGraph, currentPair, selectedItem, onItemClick])

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
    <div style={{ width, height, border: '1px solid #E5E6EB', borderRadius: 4, position: 'relative' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        minZoom={0.3}
        maxZoom={2.5}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        onNodeClick={onItemClick ? (_, node) => onItemClick(node.id) : undefined}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={16} size={1} />
        <Controls showInteractive={false} />
        <MiniMap
          pannable
          zoomable
          nodeStrokeWidth={2}
          nodeColor={(node) => {
            const isActive = !!currentPair && (currentPair[0] === node.id || currentPair[1] === node.id)
            return isActive ? '#FF7D00' : '#C9CDD4'
          }}
          style={{ width: 140, height: 80 }}
        />
      </ReactFlow>
    </div>
  )
}
