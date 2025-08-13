import { useCallback, useMemo, useEffect } from 'react'
import ReactFlow, {
  Node,
  Edge,
  Controls,
  Background,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  Handle,
  Position,
  MarkerType,
} from 'reactflow'
import { Card, Tag, Space, Typography } from '@arco-design/web-react'
import { SequencedTask, TaskStep } from '@shared/sequencing-types'
import 'reactflow/dist/style.css'

// Custom styles for React Flow
const customStyles = {
  background: '#f5f5f5',
  width: '100%',
  height: '100%',
}

const { Text } = Typography

interface InteractiveWorkflowGraphProps {
  task: SequencedTask
  isEditable?: boolean
  onUpdateDependencies?: (stepId: string, dependencies: string[]) => void
}

// Custom node component
const WorkflowNode = ({ data }: { data: any }) => {
  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    if (hours > 0) {
      return `${hours}h ${mins > 0 ? `${mins}m` : ''}`
    }
    return `${mins}m`
  }

  return (
    <div
      style={{
        background: data.type === 'focused' ? '#E6F7FF' : '#E8F5E9',
        border: `2px solid ${data.type === 'focused' ? '#165DFF' : '#00B42A'}`,
        borderRadius: 8,
        padding: 16,
        minWidth: 200,
        position: 'relative',
      }}
    >
      {data.isEditable && (
        <Handle
          type="target"
          position={Position.Left}
          style={{
            background: '#86909c',
            width: 10,
            height: 10,
          }}
        />
      )}

      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
        <div
          style={{
            background: data.type === 'focused' ? '#165DFF' : '#00B42A',
            color: 'white',
            borderRadius: '50%',
            width: 30,
            height: 30,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 'bold',
            fontSize: 14,
            marginRight: 12,
          }}
        >
          {data.stepNumber}
        </div>
        <Text style={{ flex: 1, fontWeight: 'bold' }}>{data.label}</Text>
      </div>

      <Space direction="vertical" size={4}>
        <Text type="secondary" style={{ fontSize: 12 }}>
          {formatDuration(data.duration)}
          {data.asyncWaitTime > 0 && ` + ${formatDuration(data.asyncWaitTime)} wait`}
        </Text>
        <Tag size="small" color={data.type === 'focused' ? 'blue' : 'green'}>
          {data.type === 'focused' ? 'Focused' : 'Admin'}
        </Tag>
      </Space>

      {data.isEditable && (
        <Handle
          type="source"
          position={Position.Right}
          style={{
            background: '#86909c',
            width: 10,
            height: 10,
          }}
        />
      )}
    </div>
  )
}

export function InteractiveWorkflowGraph({
  task,
  isEditable = false,
  onUpdateDependencies,
}: InteractiveWorkflowGraphProps) {
  // Define node types outside component to prevent re-renders
  const nodeTypes = useMemo(() => ({
    workflow: WorkflowNode,
  }), [])

  // Convert task steps to React Flow nodes
  const initialNodes = useMemo(() => {
    const nodes: Node[] = []
    const levelMap = new Map<string, number>()

    // Calculate levels based on dependencies
    task.steps.forEach((step) => {
      let level = 0
      step.dependsOn.forEach((depId) => {
        const depLevel = levelMap.get(depId) || 0
        level = Math.max(level, depLevel + 1)
      })
      levelMap.set(step.id, level)
    })

    // Create nodes with positions
    const levelGroups = new Map<number, TaskStep[]>()
    task.steps.forEach((step) => {
      const level = levelMap.get(step.id) || 0
      const group = levelGroups.get(level) || []
      group.push(step)
      levelGroups.set(level, group)
    })

    levelGroups.forEach((steps, level) => {
      steps.forEach((step, index) => {
        const stepIndex = task.steps.findIndex(s => s.id === step.id)
        nodes.push({
          id: step.id,
          type: 'workflow',
          position: { x: level * 300, y: index * 150 },
          data: {
            label: step.name,
            duration: step.duration,
            asyncWaitTime: step.asyncWaitTime,
            type: step.type,
            stepNumber: stepIndex + 1,
            isEditable,
          },
        })
      })
    })

    return nodes
  }, [task, isEditable])

  // Convert dependencies to React Flow edges
  const initialEdges = useMemo(() => {
    const edges: Edge[] = []

    task.steps.forEach((step) => {
      step.dependsOn.forEach((depId) => {
        // Ensure both source and target steps exist
        const sourceExists = task.steps.some(s => s.id === depId)
        const targetExists = task.steps.some(s => s.id === step.id)

        if (sourceExists && targetExists) {
          edges.push({
            id: `${depId}-${step.id}`,
            source: depId,
            target: step.id,
            type: 'smoothstep',
            animated: true,
            markerEnd: {
              type: MarkerType.ArrowClosed,
            },
            style: {
              stroke: '#86909c',
              strokeWidth: 2,
            },
          })
        }
      })
    })

    return edges
  }, [task])

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)

  // Update nodes when task changes
  useEffect(() => {
    setNodes(initialNodes)
  }, [initialNodes, setNodes])

  // Update edges when task changes (but only if not actively editing)
  useEffect(() => {
    if (!isEditable) {
      setEdges(initialEdges)
    }
  }, [initialEdges, isEditable, setEdges])

  // Validate connection to prevent cycles
  const isValidConnection = useCallback((connection: Connection) => {
    if (!connection.source || !connection.target) return false
    if (connection.source === connection.target) return false

    // Check for cycles using DFS
    const wouldCreateCycle = (source: string, target: string): boolean => {
      const visited = new Set<string>()
      const stack = [source]

      while (stack.length > 0) {
        const current = stack.pop()!
        if (current === target) return true

        if (!visited.has(current)) {
          visited.add(current)

          // Add all nodes that depend on current
          edges.forEach(edge => {
            if (edge.source === current && !visited.has(edge.target)) {
              stack.push(edge.target)
            }
          })
        }
      }

      return false
    }

    return !wouldCreateCycle(connection.source, connection.target)
  }, [edges])

  const onConnect = useCallback(
    (params: Connection) => {
      if (!isValidConnection(params)) {
        console.error('Invalid connection: Would create a circular dependency')
        return
      }

      setEdges((eds) => addEdge({
        ...params,
        type: 'smoothstep',
        animated: true,
        markerEnd: {
          type: MarkerType.ArrowClosed,
        },
        style: {
          stroke: '#86909c',
          strokeWidth: 2,
        },
      }, eds))

      // Update the task dependencies
      if (onUpdateDependencies && params.target) {
        const targetStep = task.steps.find(s => s.id === params.target)
        if (targetStep && params.source) {
          // Check if dependency already exists to avoid duplicates
          if (!targetStep.dependsOn.includes(params.source)) {
            const newDependencies = [...targetStep.dependsOn, params.source]
            onUpdateDependencies(params.target, newDependencies)
          }
        }
      }
    },
    [isValidConnection, setEdges, onUpdateDependencies, task.steps],
  )

  const onEdgeDelete = useCallback(
    (edgesToDelete: Edge[]) => {
      setEdges((eds) => eds.filter((e) => !edgesToDelete.find((ed) => ed.id === e.id)))

      // Update dependencies when edge is deleted
      if (onUpdateDependencies) {
        edgesToDelete.forEach(edge => {
          const targetStep = task.steps.find(s => s.id === edge.target)
          if (targetStep) {
            const newDependencies = targetStep.dependsOn.filter(dep => dep !== edge.source)
            onUpdateDependencies(edge.target, newDependencies)
          }
        })
      }
    },
    [setEdges, onUpdateDependencies, task.steps],
  )

  return (
    <Card
      title="Interactive Workflow Graph"
      extra={
        isEditable && (
          <Tag color="orange">
            Drag from right handle to left handle to create dependencies
          </Tag>
        )
      }
      bodyStyle={{ padding: 0 }}
    >
      <div style={{ height: 500, background: '#f5f5f5' }}>
        <ReactFlow
          style={customStyles}
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onEdgeDoubleClick={(_, edge) => isEditable && onEdgeDelete([edge])}
          nodeTypes={nodeTypes}
          fitView
          nodesDraggable={isEditable}
          nodesConnectable={isEditable}
          elementsSelectable={isEditable}
        >
          <Background variant={'dots' as any} gap={12} size={1} color="#ddd" />
          <MiniMap />
          <Controls />
        </ReactFlow>
      </div>

      {isEditable && (
        <div style={{ padding: 16, borderTop: '1px solid #e5e6eb' }}>
          <Space direction="vertical">
            <Text type="secondary">
              • Drag from the right handle of a step to the left handle of another to create a dependency
            </Text>
            <Text type="secondary">
              • Double-click on a connection line to remove it
            </Text>
            <Text type="secondary">
              • Circular dependencies are automatically prevented
            </Text>
          </Space>
        </div>
      )}
    </Card>
  )
}
