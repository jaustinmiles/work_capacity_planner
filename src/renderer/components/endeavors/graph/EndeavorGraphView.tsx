/**
 * EndeavorGraphView - Zoomable ReactFlow canvas for visualizing endeavors
 *
 * Renders endeavors as colored region nodes containing their workflow steps
 * as child nodes. Supports pan/zoom, minimap, and a toolbar to return to list view.
 */

import { useState, useMemo, useEffect, useCallback } from 'react'
import ReactFlow, {
  Controls,
  Background,
  MiniMap,
  useNodesState,
  useEdgesState,
} from 'reactflow'
import type { Connection, Edge } from 'reactflow'
import { Button, Space, Typography, Empty, Switch, Tag } from '@arco-design/web-react'
import { IconList } from '@arco-design/web-react/icon'
import { useEndeavorStore } from '../../../store/useEndeavorStore'
import { useSortedUserTaskTypes } from '../../../store/useUserTaskTypeStore'
import { EndeavorRegionNode } from './EndeavorRegionNode'
import { TaskStepGraphNode } from './TaskStepGraphNode'
import { GoalNode } from './GoalNode'
import { DependencyEdge } from './DependencyEdge'
import { TimeTypeBreakdown } from './TimeTypeBreakdown'
import { CreateScheduleBlockButton } from './CreateScheduleBlockButton'
import { useGraphDependencies } from './useGraphDependencies'
import { computeGraphLayout, hexToRgba, injectNodeMetadata, mergeAndStyleEdges } from './graph-layout-utils'
import { computeAllCriticalPaths } from '@shared/endeavor-graph-utils'
import { GraphNodePrefix, GraphNodeType, GraphEdgeType } from '@shared/enums'
import { isNodeType, parseNodeId } from '@shared/graph-node-ids'
import { logger } from '@/logger'

import 'reactflow/dist/style.css'

const { Text } = Typography

interface EndeavorGraphViewProps {
  onBackToList: () => void
  onSelectEndeavor?: (endeavorId: string) => void
}

export function EndeavorGraphView({ onBackToList, onSelectEndeavor }: EndeavorGraphViewProps) {
  const [isEditMode, setIsEditMode] = useState(false)
  const [showCriticalPath, setShowCriticalPath] = useState(false)
  const [showTimeBreakdown, setShowTimeBreakdown] = useState(true)
  const [activeStepNodeId, setActiveStepNodeId] = useState<string | null>(null)
  const { endeavors, loadEndeavors, status, dependencies } = useEndeavorStore()
  const userTypes = useSortedUserTaskTypes()

  // Stable references to prevent ReactFlow from re-registering renderers
  const nodeTypes = useMemo(() => ({
    [GraphNodeType.EndeavorRegion]: EndeavorRegionNode,
    [GraphNodeType.TaskStep]: TaskStepGraphNode,
    [GraphNodeType.Goal]: GoalNode,
  }), [])

  const edgeTypes = useMemo(() => ({
    [GraphEdgeType.Dependency]: DependencyEdge,
  }), [])

  useEffect(() => {
    if (endeavors.length === 0) {
      loadEndeavors()
    }
  }, [endeavors.length, loadEndeavors])

  // Log on mount
  useEffect(() => {
    logger.ui.info('EndeavorGraphView mounted', { endeavorCount: endeavors.length }, 'graph-view')
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const { nodes: layoutNodes, edges: layoutEdges } = useMemo(() => {
    const result = computeGraphLayout(endeavors, userTypes)
    logger.ui.info('Graph layout computed', {
      endeavorCount: endeavors.length,
      nodeCount: result.nodes.length,
      edgeCount: result.edges.length,
    }, 'graph-layout')
    return result
  }, [endeavors, userTypes])

  // Compute critical path across all endeavors
  const criticalPathData = useMemo(() => {
    if (!showCriticalPath) return { nodeIds: new Set<string>(), edgeIds: new Set<string>() }
    const result = computeAllCriticalPaths(endeavors, dependencies)
    logger.ui.info('Critical path computed', {
      nodeCount: result.nodeIds.size,
      edgeCount: result.edgeIds.size,
    }, 'graph-critical-path')
    return result
  }, [showCriticalPath, endeavors, dependencies])

  // Inject isEditable, critical path, and active work data into node data
  const initialNodes = useMemo(
    () => injectNodeMetadata(layoutNodes, {
      isEditMode,
      criticalNodeIds: criticalPathData.nodeIds,
      showCriticalPath,
      activeStepNodeId,
    }),
    [layoutNodes, isEditMode, criticalPathData, showCriticalPath, activeStepNodeId],
  )

  // Merge layout edges with cross-endeavor dependency edges, apply critical path styling
  const { dependencyEdges, onConnect: handleConnect, onDeleteDependency } = useGraphDependencies(endeavors, isEditMode)
  const initialEdges = useMemo(
    () => mergeAndStyleEdges(layoutEdges, dependencyEdges, criticalPathData.edgeIds),
    [layoutEdges, dependencyEdges, criticalPathData],
  )

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)

  // Sync when data changes
  useEffect(() => {
    setNodes(initialNodes)
  }, [initialNodes, setNodes])

  useEffect(() => {
    setEdges(initialEdges)
  }, [initialEdges, setEdges])

  // Handle new connections
  const onConnect = useCallback(
    (connection: Connection) => { handleConnect(connection) },
    [handleConnect],
  )

  // Handle edge double-click to delete dependency edges
  const onEdgeDoubleClick = useCallback(
    (_: React.MouseEvent, edge: Edge) => {
      if (!isEditMode) return
      if (edge.type === GraphEdgeType.Dependency && edge.data?.dependencyId) {
        onDeleteDependency(edge.data.dependencyId)
      }
    },
    [isEditMode, onDeleteDependency],
  )

  // Double-click on region node to navigate to detail (view mode only)
  const onNodeDoubleClick = useCallback(
    (_: React.MouseEvent, node: { id: string }) => {
      if (isEditMode) return
      if (isNodeType(node.id, GraphNodePrefix.Endeavor)) {
        const parsed = parseNodeId(node.id)
        if (parsed) onSelectEndeavor?.(parsed.id)
      }
    },
    [isEditMode, onSelectEndeavor],
  )

  // MiniMap color based on node type
  const miniMapNodeColor = useCallback((node: { type?: string; data?: { color?: string } }) => {
    if (node.type === GraphNodeType.EndeavorRegion && node.data?.color) {
      return hexToRgba(node.data.color, 0.4)
    }
    return '#e2e2e2'
  }, [])

  if (endeavors.length === 0 && status !== 'loading') {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <Empty description="No endeavors to display. Create endeavors first, then switch to graph view." />
        <Button
          type="primary"
          onClick={onBackToList}
          style={{ marginTop: 16 }}
        >
          Back to List
        </Button>
      </div>
    )
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Toolbar */}
      <div
        style={{
          padding: '8px 16px',
          background: '#fff',
          borderBottom: '1px solid #e5e6eb',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <Space>
          <Button
            type="secondary"
            icon={<IconList />}
            onClick={onBackToList}
            size="small"
          >
            Back to List
          </Button>
          <Space size={4}>
            <Text type="secondary" style={{ fontSize: 12 }}>Edit Mode</Text>
            <Switch
              checked={isEditMode}
              onChange={setIsEditMode}
              size="small"
            />
          </Space>
          {isEditMode && (
            <Tag color="orange" size="small">
              Drag handles to connect steps
            </Tag>
          )}
          <Space size={4}>
            <Text type="secondary" style={{ fontSize: 12 }}>Critical Path</Text>
            <Switch
              checked={showCriticalPath}
              onChange={setShowCriticalPath}
              size="small"
            />
          </Space>
          <Space size={4}>
            <Text type="secondary" style={{ fontSize: 12 }}>Time Breakdown</Text>
            <Switch
              checked={showTimeBreakdown}
              onChange={setShowTimeBreakdown}
              size="small"
            />
          </Space>
        </Space>
        <Text type="secondary" style={{ fontSize: 12 }}>
          {isEditMode
            ? 'Drag from right handle → left handle to add dependency. Double-click edge to delete.'
            : 'Double-click an endeavor to view details. Scroll to zoom. Drag to pan.'}
        </Text>
      </div>

      {/* ReactFlow Canvas */}
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onEdgeDoubleClick={onEdgeDoubleClick}
          onNodeDoubleClick={onNodeDoubleClick}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
          fitViewOptions={{
            padding: 0.3,
            includeHiddenNodes: false,
            minZoom: 0.1,
            maxZoom: 1.5,
          }}
          minZoom={0.05}
          maxZoom={2}
          nodesDraggable={true}
          nodesConnectable={isEditMode}
          elementsSelectable={true}
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={'dots' as any} gap={16} size={1} color="#ddd" />
          <MiniMap
            nodeColor={miniMapNodeColor}
            maskColor="rgba(0, 0, 0, 0.08)"
            style={{ border: '1px solid #e5e6eb' }}
          />
          <Controls />
        </ReactFlow>
        {showTimeBreakdown && (
          <TimeTypeBreakdown endeavors={endeavors} userTypes={userTypes} />
        )}
        <CreateScheduleBlockButton
          endeavors={endeavors}
          dependencies={dependencies}
          activeStepNodeId={activeStepNodeId}
          onStepStarted={setActiveStepNodeId}
        />
      </div>
    </div>
  )
}
