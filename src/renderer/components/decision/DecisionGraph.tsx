/**
 * DecisionGraph — D3 force-directed decision map.
 *
 * Ported from Decision Helper's DecisionTree.jsx.
 * Force constants preserved exactly: charge -300, link distance 120, collision radius 40.
 */

import React, { useRef, useEffect } from 'react'
import * as d3 from 'd3'
import type { TreeNode, TreeEdge } from '@shared/decision-types'
import { TreeNodeType } from '@shared/enums'
import { Typography } from '@arco-design/web-react'

const { Text } = Typography

interface DecisionGraphProps {
  tree: { nodes: TreeNode[]; edges: TreeEdge[] }
  topic: string | null
}

// Color scheme by node type — preserved from Decision Helper
const COLOR_MAP: Record<string, string> = {
  [TreeNodeType.Option]: '#6366f1',   // indigo
  [TreeNodeType.Factor]: '#f59e0b',   // amber
  [TreeNodeType.Question]: '#10b981', // emerald
  [TreeNodeType.Insight]: '#ec4899',  // pink
  [TreeNodeType.Risk]: '#ef4444',     // red
  [TreeNodeType.Milestone]: '#8b5cf6', // violet
}

const TYPE_ICONS: Record<string, string> = {
  [TreeNodeType.Option]: '?',
  [TreeNodeType.Factor]: '!',
  [TreeNodeType.Question]: 'Q',
  [TreeNodeType.Insight]: '*',
  [TreeNodeType.Risk]: '⚠',
  [TreeNodeType.Milestone]: '◆',
}

interface SimNode extends d3.SimulationNodeDatum {
  id: string
  label: string
  type: string
}

interface SimEdge extends d3.SimulationLinkDatum<SimNode> {
  label?: string
}

export function DecisionGraph({ tree, topic }: DecisionGraphProps): React.ReactElement {
  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect((): (() => void) | void => {
    if (!svgRef.current || !containerRef.current || tree.nodes.length === 0) return

    const svg = d3.select(svgRef.current)
    const width = containerRef.current.clientWidth
    const height = containerRef.current.clientHeight

    svg.selectAll('*').remove()

    const defs = svg.append('defs')

    // Glow filter
    const filter = defs.append('filter').attr('id', 'glow')
    filter.append('feGaussianBlur').attr('stdDeviation', '3').attr('result', 'coloredBlur')
    const merge = filter.append('feMerge')
    merge.append('feMergeNode').attr('in', 'coloredBlur')
    merge.append('feMergeNode').attr('in', 'SourceGraphic')

    // Arrow marker
    defs.append('marker')
      .attr('id', 'arrowhead')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 25)
      .attr('refY', 0)
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-5L10,0L0,5')
      .attr('fill', '#4a5568')

    const g = svg.append('g')

    // Zoom
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 3])
      .on('zoom', (event) => g.attr('transform', event.transform))
    svg.call(zoom)

    // Prepare data
    const nodes: SimNode[] = tree.nodes.map(n => ({ ...n }))
    const nodeIds = new Set(nodes.map(n => n.id))
    const edges: SimEdge[] = tree.edges
      .filter(e => nodeIds.has(e.source) && nodeIds.has(e.target))
      .map(e => ({ ...e }))

    // Force simulation — constants preserved exactly
    const simulation = d3.forceSimulation(nodes)
      .force('link', d3.forceLink<SimNode, SimEdge>(edges).id(d => d.id).distance(120))
      .force('charge', d3.forceManyBody().strength(-300))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(40))

    // Edges
    const link = g.selectAll<SVGGElement, SimEdge>('.link')
      .data(edges)
      .join('g')
      .attr('class', 'link')

    link.append('line')
      .attr('stroke', '#4a5568')
      .attr('stroke-width', 1.5)
      .attr('stroke-opacity', 0.6)
      .attr('marker-end', 'url(#arrowhead)')

    link.append('text')
      .text(d => d.label || '')
      .attr('font-size', '10px')
      .attr('fill', '#9ca3af')
      .attr('text-anchor', 'middle')

    // Nodes
    const node = g.selectAll<SVGGElement, SimNode>('.node')
      .data(nodes)
      .join('g')
      .attr('class', 'node')
      .style('cursor', 'pointer')
      .call(d3.drag<SVGGElement, SimNode>()
        .on('start', (event, d) => {
          if (!event.active) simulation.alphaTarget(0.3).restart()
          d.fx = d.x
          d.fy = d.y
        })
        .on('drag', (event, d) => {
          d.fx = event.x
          d.fy = event.y
        })
        .on('end', (event, d) => {
          if (!event.active) simulation.alphaTarget(0)
          d.fx = null
          d.fy = null
        }),
      )

    node.append('circle')
      .attr('r', d => d.type === TreeNodeType.Option ? 20 : 14)
      .attr('fill', d => (COLOR_MAP[d.type] ?? '#6b7280') + '33')
      .attr('stroke', d => COLOR_MAP[d.type] ?? '#6b7280')
      .attr('stroke-width', 2)
      .attr('filter', 'url(#glow)')

    node.append('text')
      .text(d => d.label)
      .attr('dy', d => d.type === TreeNodeType.Option ? 32 : 26)
      .attr('text-anchor', 'middle')
      .attr('font-size', '11px')
      .attr('fill', 'var(--color-text-2)')
      .attr('font-weight', d => d.type === TreeNodeType.Option ? '600' : '400')

    // Type icon inside circle
    node.append('text')
      .text(d => TYPE_ICONS[d.type] ?? '')
      .attr('text-anchor', 'middle')
      .attr('dy', '4px')
      .attr('font-size', '12px')
      .attr('font-weight', 'bold')
      .attr('fill', d => COLOR_MAP[d.type] ?? '#6b7280')

    // Tick
    simulation.on('tick', () => {
      link.select('line')
        .attr('x1', d => (d.source as SimNode).x ?? 0)
        .attr('y1', d => (d.source as SimNode).y ?? 0)
        .attr('x2', d => (d.target as SimNode).x ?? 0)
        .attr('y2', d => (d.target as SimNode).y ?? 0)

      link.select('text')
        .attr('x', d => ((d.source as SimNode).x ?? 0 + ((d.target as SimNode).x ?? 0)) / 2)
        .attr('y', d => ((d.source as SimNode).y ?? 0 + ((d.target as SimNode).y ?? 0)) / 2)

      node.attr('transform', d => `translate(${d.x ?? 0},${d.y ?? 0})`)
    })

    return () => simulation.stop()
  }, [tree])

  const empty = tree.nodes.length === 0

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        minHeight: 400,
        background: 'var(--color-bg-1)',
        borderRadius: 8,
        border: '1px solid var(--color-border)',
        position: 'relative',
      }}
    >
      {/* Header */}
      <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 16 }}>★</span>
        <Text bold>Decision Map</Text>
        {topic && <Text type="secondary" style={{ fontSize: 12 }}>{topic}</Text>}
      </div>

      {empty ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-text-3)' }}>
          Start talking — your decision space will map itself here
        </div>
      ) : (
        <svg ref={svgRef} width="100%" height="100%" style={{ display: 'block' }} />
      )}

      {/* Legend */}
      {!empty && (
        <div style={{ position: 'absolute', bottom: 8, left: 12, display: 'flex', gap: 12, fontSize: 11 }}>
          {Object.entries(COLOR_MAP).slice(0, 4).map(([type, color]) => (
            <span key={type} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, display: 'inline-block' }} />
              <span style={{ color: 'var(--color-text-3)', textTransform: 'capitalize' }}>{type}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
