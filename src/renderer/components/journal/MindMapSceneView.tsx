/**
 * MindMapSceneView — the infinite-zoom artistic canvas (ReactFlow) for the mind map.
 *
 * Mirrors DeepWorkCanvas's store↔ReactFlow sync: store nodes/edges are projected to
 * ReactFlow, drags persist node positions (pinning them so re-sync won't move them),
 * and the viewport (zoom/pan) persists. Concept nodes are colorful + symbol-forward;
 * relationship edges are colored + labeled by their codified type. Manual connections
 * default to the always-legal "relates to" so they can never be rejected.
 */

import { useCallback, useEffect, useMemo } from 'react'
import ReactFlow, {
  Controls,
  Background,
  MiniMap,
  Panel,
  MarkerType,
  useNodesState,
  useEdgesState,
  BackgroundVariant,
} from 'reactflow'
import type { Node, Edge, Connection, NodeDragHandler, ReactFlowInstance } from 'reactflow'
import { Empty, Typography } from '@arco-design/web-react'
import { GraphNodeType, GraphEdgeType, MindMapRelationshipType } from '@shared/enums'
import { parseEnum } from '@shared/enum-utils'
import { MIND_MAP_RELATIONSHIP_CONFIG } from '@shared/mindmap-types'
import { useJournalStore } from '../../store/useJournalStore'
import { MindMapConceptNode, type MindMapConceptNodeData } from './nodes/MindMapConceptNode'
import { logger } from '@/logger'

import 'reactflow/dist/style.css'

export function MindMapSceneView() {
  const scene = useJournalStore((s) => s.scene)
  const storeNodes = useJournalStore((s) => s.nodes)
  const storeEdges = useJournalStore((s) => s.edges)
  const loadScene = useJournalStore((s) => s.loadScene)
  const moveNode = useJournalStore((s) => s.moveNode)
  const deleteNode = useJournalStore((s) => s.deleteNode)
  const deleteEdge = useJournalStore((s) => s.deleteEdge)
  const createEdge = useJournalStore((s) => s.createEdge)
  const saveViewport = useJournalStore((s) => s.saveViewport)

  useEffect(() => {
    void loadScene()
  }, [loadScene])

  const nodeTypes = useMemo(() => ({ [GraphNodeType.MindMapConcept]: MindMapConceptNode }), [])

  const rfNodes: Node<MindMapConceptNodeData>[] = useMemo(
    () =>
      storeNodes.map((node) => ({
        id: node.id,
        type: GraphNodeType.MindMapConcept,
        position: { x: node.positionX, y: node.positionY },
        data: { node },
      })),
    [storeNodes],
  )

  const rfEdges: Edge[] = useMemo(
    () =>
      storeEdges.map((edge) => {
        const type = parseEnum(
          MindMapRelationshipType,
          edge.relationshipType,
          MindMapRelationshipType.RelatesTo,
        )
        const config = MIND_MAP_RELATIONSHIP_CONFIG[type]
        return {
          id: edge.id,
          source: edge.sourceNodeId,
          target: edge.targetNodeId,
          type: GraphEdgeType.SmoothStep,
          label: edge.label ?? config.label,
          labelStyle: { fill: config.color, fontWeight: 600, fontSize: 11 },
          labelBgStyle: { fill: 'var(--color-bg-1)', fillOpacity: 0.85 },
          labelBgPadding: [4, 2] as [number, number],
          labelBgBorderRadius: 4,
          style: { stroke: config.color, strokeWidth: 2 },
          markerEnd: { type: MarkerType.ArrowClosed, color: config.color, width: 18, height: 18 },
        }
      }),
    [storeEdges],
  )

  const [nodes, setNodes, onNodesChange] = useNodesState(rfNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(rfEdges)

  useEffect(() => {
    setNodes(rfNodes)
  }, [rfNodes, setNodes])

  useEffect(() => {
    setEdges(rfEdges)
  }, [rfEdges, setEdges])

  const handleNodeDragStop: NodeDragHandler = useCallback(
    (_event, node) => {
      void moveNode(node.id, node.position.x, node.position.y)
    },
    [moveNode],
  )

  const handleMoveEnd = useCallback(
    (_event: MouseEvent | TouchEvent, viewport: { x: number; y: number; zoom: number }) => {
      void saveViewport(viewport.zoom, viewport.x, viewport.y)
    },
    [saveViewport],
  )

  const handleNodesDelete = useCallback(
    (deleted: Node[]) => {
      for (const node of deleted) {
        void deleteNode(node.id)
      }
    },
    [deleteNode],
  )

  const handleEdgesDelete = useCallback(
    (deleted: Edge[]) => {
      for (const edge of deleted) {
        void deleteEdge(edge.id)
      }
    },
    [deleteEdge],
  )

  // Manual connections default to "relates to" (always legal any→any).
  const handleConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return
      void createEdge({
        sourceNodeId: connection.source,
        targetNodeId: connection.target,
        relationshipType: MindMapRelationshipType.RelatesTo,
      }).catch((error: unknown) => {
        logger.ui.error('Failed to create mind map edge', {
          error: error instanceof Error ? error.message : String(error),
        }, 'journal-edge-create-error')
      })
    },
    [createEdge],
  )

  const defaultViewport = useMemo(() => {
    if (!scene) return { x: 0, y: 0, zoom: 1 }
    return { x: scene.panX, y: scene.panY, zoom: scene.zoom }
  }, [scene])

  const handleInit = useCallback((_instance: ReactFlowInstance) => {
    logger.ui.info('Mind map canvas initialized', { nodes: storeNodes.length }, 'journal-scene-init')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDragStop={handleNodeDragStop}
        onNodesDelete={handleNodesDelete}
        onEdgesDelete={handleEdgesDelete}
        onConnect={handleConnect}
        onMoveEnd={handleMoveEnd}
        onInit={handleInit}
        nodeTypes={nodeTypes}
        defaultViewport={defaultViewport}
        fitView={storeNodes.length > 0}
        deleteKeyCode={['Delete', 'Backspace']}
        minZoom={0.1}
        maxZoom={4}
        panOnScroll
        proOptions={{ hideAttribution: true }}
      >
        <Controls position="bottom-left" showInteractive={false} />
        <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="var(--color-fill-3)" />
        <MiniMap
          nodeStrokeWidth={3}
          nodeColor={(node) => (node.data as MindMapConceptNodeData | undefined)?.node.color ?? '#86909C'}
          style={{ borderRadius: 8 }}
        />
        <Panel position="top-right">
          <RelationshipLegend />
        </Panel>
      </ReactFlow>

      {storeNodes.length === 0 && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
          }}
        >
          <Empty
            description={
              <Typography.Text type="secondary">
                Your mind map is empty. Write a journal entry, then “Process into mind map” to grow it.
              </Typography.Text>
            }
          />
        </div>
      )}
    </div>
  )
}

/** A compact legend of the codified relationship colors. */
function RelationshipLegend() {
  return (
    <div
      style={{
        background: 'var(--color-bg-2)',
        border: '1px solid var(--color-border-2)',
        borderRadius: 8,
        padding: '8px 10px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
      }}
    >
      <Typography.Text style={{ fontSize: 11, fontWeight: 700, opacity: 0.7 }}>
        RELATIONSHIPS
      </Typography.Text>
      <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {Object.values(MindMapRelationshipType).map((type) => {
          const config = MIND_MAP_RELATIONSHIP_CONFIG[type]
          return (
            <div key={type} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span
                style={{
                  width: 16,
                  height: 3,
                  borderRadius: 2,
                  background: config.color,
                  display: 'inline-block',
                }}
              />
              <span style={{ fontSize: 11 }}>{config.label}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
