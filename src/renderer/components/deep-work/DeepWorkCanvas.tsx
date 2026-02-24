/**
 * DeepWorkCanvas — ReactFlow canvas wrapper for the Deep Work Board.
 *
 * Handles:
 * - Custom node/edge type registration
 * - Double-click to create nodes (inline text input)
 * - Connection handling (drag from handles)
 * - Viewport persistence (zoom/pan saved on change)
 * - Node drag → position persistence (debounced)
 */

import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import ReactFlow, {
  Controls,
  Background,
  MiniMap,
  useNodesState,
  useEdgesState,
  BackgroundVariant,
} from 'reactflow'
import type { Node, Edge, Connection, NodeDragHandler, ReactFlowInstance } from 'reactflow'
import { GraphNodeType, GraphEdgeType } from '@shared/enums'
import { useDeepWorkBoardStore } from '../../store/useDeepWorkBoardStore'
import { DeepWorkTaskNode } from './nodes/DeepWorkTaskNode'
import type { DeepWorkTaskNodeData } from './nodes/DeepWorkTaskNode'
import { DeepWorkConnectionLine, DeepWorkEdgeMarkers } from './edges/DeepWorkConnectionLine'
import type { DeepWorkConnectionLineData } from './edges/DeepWorkConnectionLine'
import { NodeQuickCreate } from './NodeQuickCreate'
import { logger } from '@/logger'

import 'reactflow/dist/style.css'

// =============================================================================
// Component
// =============================================================================

interface DeepWorkCanvasProps {
  /** Callback when a connection is drawn between two nodes */
  onConnect?: (sourceNodeId: string, targetNodeId: string) => void
  /** Callback when edges are deleted (via Delete key or backspace) */
  onDisconnect?: (sourceNodeId: string, targetNodeId: string) => void
}

export function DeepWorkCanvas({ onConnect, onDisconnect }: DeepWorkCanvasProps) {
  const activeBoard = useDeepWorkBoardStore((s) => s.activeBoard)
  const storeNodes = useDeepWorkBoardStore((s) => s.nodes)
  const storeEdges = useDeepWorkBoardStore((s) => s.edges)
  const moveNode = useDeepWorkBoardStore((s) => s.moveNode)
  const moveNodes = useDeepWorkBoardStore((s) => s.moveNodes)
  const addNode = useDeepWorkBoardStore((s) => s.addNode)
  const saveViewport = useDeepWorkBoardStore((s) => s.saveViewport)

  const [quickCreatePos, setQuickCreatePos] = useState<{ x: number; y: number } | null>(null)
  const reactFlowInstanceRef = useRef<ReactFlowInstance | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Node/edge types — memoized for stable references (matches EndeavorGraphView pattern)
  const nodeTypes = useMemo(() => ({
    [GraphNodeType.DeepWorkTask]: DeepWorkTaskNode,
    [GraphNodeType.DeepWorkStep]: DeepWorkTaskNode,
  }), [])

  const edgeTypes = useMemo(() => ({
    [GraphEdgeType.DeepWorkDependency]: DeepWorkConnectionLine,
  }), [])

  // Debug: log mount/unmount and container dimensions
  useEffect(() => {
    const container = containerRef.current
    if (container) {
      const rect = container.getBoundingClientRect()
      logger.ui.info('DeepWorkCanvas mounted', {
        containerWidth: rect.width,
        containerHeight: rect.height,
        activeBoardId: activeBoard?.id ?? null,
      }, 'dwb-canvas-mount')
    } else {
      logger.ui.info('DeepWorkCanvas mounted (no container ref)', {}, 'dwb-canvas-mount')
    }
    return () => {
      logger.ui.info('DeepWorkCanvas unmounting', {}, 'dwb-canvas-unmount')
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Convert store nodes to ReactFlow nodes
  const rfNodes: Node<DeepWorkTaskNodeData>[] = useMemo(() => {
    return Array.from(storeNodes.values()).map((node) => ({
      id: node.id,
      type: node.stepId ? GraphNodeType.DeepWorkStep : GraphNodeType.DeepWorkTask,
      position: { x: node.positionX, y: node.positionY },
      data: { nodeWithData: node },
    }))
  }, [storeNodes])

  // Convert store edges to ReactFlow edges
  const rfEdges: Edge<DeepWorkConnectionLineData>[] = useMemo(() => {
    return storeEdges.map((edge) => ({
      id: edge.id,
      source: edge.sourceNodeId,
      target: edge.targetNodeId,
      type: GraphEdgeType.DeepWorkDependency,
      data: { edgeType: edge.edgeType },
    }))
  }, [storeEdges])

  // ReactFlow state hooks (kept in sync with store)
  const [nodes, setNodes, onNodesChange] = useNodesState(rfNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(rfEdges)

  // Sync store → ReactFlow state via useEffect (NOT useMemo — setNodes is a side effect)
  useEffect(() => {
    setNodes(rfNodes)
    logger.ui.info('DeepWorkCanvas synced nodes', { count: rfNodes.length }, 'dwb-canvas-sync-nodes')
  }, [rfNodes, setNodes])

  useEffect(() => {
    setEdges(rfEdges)
    logger.ui.info('DeepWorkCanvas synced edges', { count: rfEdges.length }, 'dwb-canvas-sync-edges')
  }, [rfEdges, setEdges])

  // Handle node drag stop → persist position
  const handleNodeDragStop: NodeDragHandler = useCallback((_event, node, draggedNodes) => {
    if (draggedNodes.length > 1) {
      // Multi-node drag
      moveNodes(draggedNodes.map((n) => ({
        nodeId: n.id,
        position: { x: n.position.x, y: n.position.y },
      })))
    } else {
      moveNode(node.id, { x: node.position.x, y: node.position.y })
    }
  }, [moveNode, moveNodes])

  // Handle viewport change → persist zoom/pan
  const handleMoveEnd = useCallback((_event: MouseEvent | TouchEvent, viewport: { x: number; y: number; zoom: number }) => {
    saveViewport(viewport.zoom, viewport.x, viewport.y)
  }, [saveViewport])

  // Handle double-click on canvas → show quick create input
  const handlePaneDoubleClick = useCallback((event: React.MouseEvent) => {
    const target = event.target as HTMLElement
    // Only trigger on the ReactFlow pane background, not on nodes
    const isPane = target.classList.contains('react-flow__pane') ||
      target.classList.contains('react-flow__background')
    if (!isPane) return

    const rfInstance = reactFlowInstanceRef.current
    if (!rfInstance) return

    // Convert screen coordinates to flow coordinates
    const position = rfInstance.screenToFlowPosition({
      x: event.clientX,
      y: event.clientY,
    })

    setQuickCreatePos(position)
  }, [])

  // Handle quick-create confirm → create node
  const handleQuickCreateConfirm = useCallback(async (name: string) => {
    if (!quickCreatePos) return
    try {
      await addNode(quickCreatePos, name)
    } finally {
      setQuickCreatePos(null)
    }
  }, [quickCreatePos, addNode])

  // Handle quick-create cancel
  const handleQuickCreateCancel = useCallback(() => {
    setQuickCreatePos(null)
  }, [])

  // Handle edge connection
  const handleConnect = useCallback((connection: Connection) => {
    if (connection.source && connection.target && onConnect) {
      onConnect(connection.source, connection.target)
    }
  }, [onConnect])

  // Handle edge deletion (Delete key on selected edge)
  const handleEdgesDelete = useCallback((deletedEdges: Edge[]) => {
    if (!onDisconnect) return
    for (const edge of deletedEdges) {
      onDisconnect(edge.source, edge.target)
    }
  }, [onDisconnect])

  // Default viewport from saved board state
  const defaultViewport = useMemo(() => {
    if (!activeBoard) return { x: 0, y: 0, zoom: 1 }
    return { x: activeBoard.panX, y: activeBoard.panY, zoom: activeBoard.zoom }
  }, [activeBoard])

  // ReactFlow init handler — log when canvas is ready
  const handleInit = useCallback((instance: ReactFlowInstance) => {
    reactFlowInstanceRef.current = instance
    const container = containerRef.current
    const rect = container?.getBoundingClientRect()
    logger.ui.info('ReactFlow initialized', {
      containerWidth: rect?.width ?? 0,
      containerHeight: rect?.height ?? 0,
      nodeCount: nodes.length,
      edgeCount: edges.length,
    }, 'dwb-reactflow-init')
  }, [nodes.length, edges.length])

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%' }} onDoubleClick={handlePaneDoubleClick}>
      <DeepWorkEdgeMarkers />
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDragStop={handleNodeDragStop}
        onConnect={handleConnect}
        onEdgesDelete={handleEdgesDelete}
        onMoveEnd={handleMoveEnd}
        onPaneClick={() => setQuickCreatePos(null)}
        onInit={handleInit}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        defaultViewport={defaultViewport}
        fitView
        deleteKeyCode={['Delete', 'Backspace']}
        multiSelectionKeyCode="Shift"
        selectionOnDrag
        panOnScroll
        snapToGrid
        snapGrid={[15, 15]}
        zoomOnDoubleClick={false}
        minZoom={0.2}
        maxZoom={4}
        proOptions={{ hideAttribution: true }}
      >
        <Controls position="bottom-left" showInteractive={false} />
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#e5e6eb" />
        <MiniMap
          nodeStrokeWidth={3}
          nodeColor={(node) => {
            const data = node.data as DeepWorkTaskNodeData | undefined
            if (data?.nodeWithData?.task?.completed || data?.nodeWithData?.step?.status === 'completed') {
              return '#c9cdd4'
            }
            return '#165DFF'
          }}
          style={{ borderRadius: 8 }}
        />
      </ReactFlow>

      {/* Quick-create overlay (screen-space, positioned via ReactFlow's screenToFlowPosition inverse) */}
      {quickCreatePos && reactFlowInstanceRef.current && (
        <NodeQuickCreate
          position={reactFlowInstanceRef.current.flowToScreenPosition(quickCreatePos)}
          onConfirm={handleQuickCreateConfirm}
          onCancel={handleQuickCreateCancel}
        />
      )}
    </div>
  )
}
