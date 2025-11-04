import React, { useMemo } from 'react'
import { ComparisonGraph, ItemId, getTransitiveClosure } from '../../utils/comparison-graph'
import { ComparisonType } from '@/shared/constants'

interface ComparisonGraphMinimapProps {
  graph: ComparisonGraph
  items: Array<{ id: ItemId; title: string }>
  currentComparison?: [ItemId, ItemId] | undefined
  currentQuestion?: ComparisonType | undefined
  width?: number | undefined
  height?: number | undefined
}

interface NodePosition {
  id: ItemId
  x: number
  y: number
  title: string
  score: number
}

export function ComparisonGraphMinimap({
  graph,
  items,
  currentComparison,
  currentQuestion,
  width = 320,
  height = 200,
}: ComparisonGraphMinimapProps) {
  // Calculate node positions using a simple hierarchical layout
  const nodePositions = useMemo(() => {
    const positions: NodePosition[] = []

    // Calculate dominance scores (how many items each node beats)
    const scores = new Map<ItemId, number>()
    items.forEach(item => {
      // Use whichever graph has data (priority or urgency)
      const priorityClosure = getTransitiveClosure(graph.priorityWins, item.id)
      const urgencyClosure = getTransitiveClosure(graph.urgencyWins, item.id)
      // Use the graph that has more data
      const score = priorityClosure.size > 0 ? priorityClosure.size :
                   urgencyClosure.size > 0 ? urgencyClosure.size : 0
      scores.set(item.id, score)
    })

    // Sort items by score (most dominant first)
    const sortedItems = [...items].sort((a, b) => {
      const scoreA = scores.get(a.id) || 0
      const scoreB = scores.get(b.id) || 0
      return scoreB - scoreA
    })

    // Group items by score level
    const levels = new Map<number, typeof items>()
    sortedItems.forEach(item => {
      const score = scores.get(item.id) || 0
      if (!levels.has(score)) {
        levels.set(score, [])
      }
      levels.get(score)!.push(item)
    })

    // Position nodes in a hierarchical layout
    const padding = 20
    const availableWidth = width - (padding * 2)
    const availableHeight = height - (padding * 2)

    const uniqueScores = Array.from(levels.keys()).sort((a, b) => b - a)
    const levelHeight = uniqueScores.length > 1
      ? availableHeight / (uniqueScores.length - 1)
      : availableHeight / 2

    uniqueScores.forEach((score, levelIndex) => {
      const levelItems = levels.get(score) || []
      const levelWidth = levelItems.length > 1
        ? availableWidth / (levelItems.length - 1)
        : availableWidth / 2

      levelItems.forEach((item, itemIndex) => {
        const x = padding + (levelItems.length === 1
          ? availableWidth / 2
          : itemIndex * levelWidth)
        const y = padding + levelIndex * levelHeight

        positions.push({
          id: item.id,
          x,
          y,
          title: item.title,
          score,
        })
      })
    })

    return positions
  }, [graph, items, width, height])

  // Get edges to draw
  const edges = useMemo(() => {
    const edgeList: Array<{ from: ItemId; to: ItemId; type: 'priority' | 'urgency' }> = []

    // Add priority edges
    graph.priorityWins.forEach((losers, winner) => {
      losers.forEach(loser => {
        edgeList.push({ from: winner, to: loser, type: 'priority' })
      })
    })

    // Add urgency edges
    graph.urgencyWins.forEach((losers, winner) => {
      losers.forEach(loser => {
        // Only add if not already added as priority edge
        if (!edgeList.some(e => e.from === winner && e.to === loser)) {
          edgeList.push({ from: winner, to: loser, type: 'urgency' })
        }
      })
    })

    return edgeList
  }, [graph])

  if (items.length === 0) {
    return (
      <div style={{
        width,
        height,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#86909c',
        fontSize: 12,
        border: '1px solid #e5e6eb',
        borderRadius: 4,
        background: '#f7f8fa',
      }}>
        No items to compare
      </div>
    )
  }

  const nodeRadius = 8
  const arrowSize = 4

  return (
    <div style={{
      border: '1px solid #e5e6eb',
      borderRadius: 4,
      background: '#f7f8fa',
      padding: 4,
    }}>
      <svg width={width} height={height} style={{ overflow: 'visible' }}>
        <defs>
          {/* Arrow marker for priority (blue) */}
          <marker
            id="arrow-priority"
            viewBox={`0 0 ${arrowSize * 2} ${arrowSize * 2}`}
            refX={arrowSize}
            refY={arrowSize}
            markerWidth={arrowSize}
            markerHeight={arrowSize}
            orient="auto"
          >
            <path
              d={`M 0 0 L ${arrowSize * 2} ${arrowSize} L 0 ${arrowSize * 2} z`}
              fill="#165DFF"
              opacity="0.6"
            />
          </marker>

          {/* Arrow marker for urgency (orange) */}
          <marker
            id="arrow-urgency"
            viewBox={`0 0 ${arrowSize * 2} ${arrowSize * 2}`}
            refX={arrowSize}
            refY={arrowSize}
            markerWidth={arrowSize}
            markerHeight={arrowSize}
            orient="auto"
          >
            <path
              d={`M 0 0 L ${arrowSize * 2} ${arrowSize} L 0 ${arrowSize * 2} z`}
              fill="#FF7D00"
              opacity="0.6"
            />
          </marker>
        </defs>

        {/* Draw edges */}
        {edges.map(edge => {
          const fromNode = nodePositions.find(n => n.id === edge.from)
          const toNode = nodePositions.find(n => n.id === edge.to)
          if (!fromNode || !toNode) return null

          // Calculate edge path with offset for node radius
          const dx = toNode.x - fromNode.x
          const dy = toNode.y - fromNode.y
          const distance = Math.sqrt(dx * dx + dy * dy)
          const unitX = dx / distance
          const unitY = dy / distance

          const startX = fromNode.x + unitX * nodeRadius
          const startY = fromNode.y + unitY * nodeRadius
          const endX = toNode.x - unitX * (nodeRadius + arrowSize)
          const endY = toNode.y - unitY * (nodeRadius + arrowSize)

          const isCurrentEdge = currentComparison &&
            ((edge.from === currentComparison[0] && edge.to === currentComparison[1]) ||
             (edge.from === currentComparison[1] && edge.to === currentComparison[0]))

          return (
            <line
              key={`${edge.from}-${edge.to}-${edge.type}`}
              x1={startX}
              y1={startY}
              x2={endX}
              y2={endY}
              stroke={edge.type === 'priority' ? '#165DFF' : '#FF7D00'}
              strokeWidth={isCurrentEdge ? 2 : 1}
              opacity={isCurrentEdge ? 1 : 0.4}
              markerEnd={`url(#arrow-${edge.type})`}
              strokeDasharray={edge.type === 'urgency' ? '3,2' : undefined}
            />
          )
        })}

        {/* Draw nodes */}
        {nodePositions.map(node => {
          const isCurrent = currentComparison &&
            (node.id === currentComparison[0] || node.id === currentComparison[1])

          return (
            <g key={node.id}>
              <circle
                cx={node.x}
                cy={node.y}
                r={nodeRadius}
                fill={isCurrent ?
                  (currentQuestion === ComparisonType.Priority ? '#165DFF' : '#FF7D00') :
                  '#fff'}
                stroke={isCurrent ?
                  (currentQuestion === ComparisonType.Priority ? '#165DFF' : '#FF7D00') :
                  '#86909c'}
                strokeWidth={isCurrent ? 2 : 1}
              />

              {/* Node label */}
              <text
                x={node.x}
                y={node.y - nodeRadius - 3}
                textAnchor="middle"
                fontSize="10"
                fill="#4e5969"
              >
                {node.title.length > 10 ? node.title.substring(0, 10) + '...' : node.title}
              </text>

              {/* Score indicator */}
              {node.score > 0 && (
                <text
                  x={node.x}
                  y={node.y + 1}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize="8"
                  fill="#86909c"
                  fontWeight="bold"
                >
                  {node.score}
                </text>
              )}

              {/* Pulse animation for current nodes */}
              {isCurrent && (
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={nodeRadius + 3}
                  fill="none"
                  stroke={currentQuestion === ComparisonType.Priority ? '#165DFF' : '#FF7D00'}
                  strokeWidth="1"
                  opacity="0.3"
                >
                  <animate
                    attributeName="r"
                    values={`${nodeRadius + 3};${nodeRadius + 6};${nodeRadius + 3}`}
                    dur="2s"
                    repeatCount="indefinite"
                  />
                  <animate
                    attributeName="opacity"
                    values="0.3;0.1;0.3"
                    dur="2s"
                    repeatCount="indefinite"
                  />
                </circle>
              )}
            </g>
          )
        })}

        {/* Legend */}
        <g transform={`translate(10, ${height - 25})`}>
          <line x1="0" y1="0" x2="20" y2="0" stroke="#165DFF" strokeWidth="1" markerEnd="url(#arrow-priority)" />
          <text x="25" y="3" fontSize="9" fill="#86909c">Priority</text>

          <line x1="70" y1="0" x2="90" y2="0" stroke="#FF7D00" strokeWidth="1" strokeDasharray="3,2" markerEnd="url(#arrow-urgency)" />
          <text x="95" y="3" fontSize="9" fill="#86909c">Urgency</text>
        </g>
      </svg>
    </div>
  )
}
