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
import { DependencyEdge } from './DependencyEdge'
import { useGraphDependencies } from './useGraphDependencies'
import { computeGraphLayout, hexToRgba } from './graph-layout-utils'

import 'reactflow/dist/style.css'

const { Text } = Typography

const nodeTypes = {
  endeavorRegion: EndeavorRegionNode,
  taskStep: TaskStepGraphNode,
}

const edgeTypes = {
  dependency: DependencyEdge,
}

interface EndeavorGraphViewProps {
  onBackToList: () => void
  onSelectEndeavor?: (endeavorId: string) => void
}

export function EndeavorGraphView({ onBackToList, onSelectEndeavor }: EndeavorGraphViewProps) {
  const [isEditMode, setIsEditMode] = useState(false)
  const { endeavors, loadEndeavors, status } = useEndeavorStore()
  const userTypes = useSortedUserTaskTypes()

  useEffect(() => {
    if (endeavors.length === 0) {
      loadEndeavors()
    }
  }, [endeavors.length, loadEndeavors])

  const { nodes: layoutNodes, edges: layoutEdges } = useMemo(
    () => computeGraphLayout(endeavors, userTypes),
    [endeavors, userTypes],
  )

  // Inject isEditable into node data based on edit mode
  const initialNodes = useMemo(
    () => layoutNodes.map(node =>
      node.type === 'taskStep'
        ? { ...node, data: { ...node.data, isEditable: isEditMode } }
        : node,
    ),
    [layoutNodes, isEditMode],
  )

  // Merge layout edges with cross-endeavor dependency edges
  const { dependencyEdges, onConnect: handleConnect, onDeleteDependency } = useGraphDependencies(endeavors, isEditMode)
  const initialEdges = useMemo(
    () => [...layoutEdges, ...dependencyEdges],
    [layoutEdges, dependencyEdges],
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
      if (edge.id.startsWith('dep-') && edge.data?.dependencyId) {
        onDeleteDependency(edge.data.dependencyId)
      }
    },
    [isEditMode, onDeleteDependency],
  )

  // Double-click on region node to navigate to detail
  const onNodeDoubleClick = useCallback(
    (_: React.MouseEvent, node: { id: string }) => {
      if (node.id.startsWith('endeavor-')) {
        const endeavorId = node.id.replace('endeavor-', '')
        onSelectEndeavor?.(endeavorId)
      }
    },
    [onSelectEndeavor],
  )

  // MiniMap color based on node type
  const miniMapNodeColor = useCallback((node: { type?: string; data?: { color?: string } }) => {
    if (node.type === 'endeavorRegion' && node.data?.color) {
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
        </Space>
        <Text type="secondary" style={{ fontSize: 12 }}>
          {isEditMode
            ? 'Drag from right handle → left handle to add dependency. Double-click edge to delete.'
            : 'Double-click an endeavor to view details. Scroll to zoom. Drag to pan.'}
        </Text>
      </div>

      {/* ReactFlow Canvas */}
      <div style={{ flex: 1, minHeight: 0 }}>
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
      </div>
    </div>
  )
}
