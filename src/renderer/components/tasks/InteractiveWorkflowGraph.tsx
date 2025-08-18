import React, { useCallback, useMemo, useEffect, useState } from 'react'
import { TaskType } from '@shared/enums'
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
import { Tag, Space, Typography, Switch, Button } from '@arco-design/web-react'
import { IconFullscreen, IconFullscreenExit } from '@arco-design/web-react/icon'
import { SequencedTask, TaskStep } from '@shared/sequencing-types'
import { logger } from '../../utils/logger'

import 'reactflow/dist/style.css'

const { Text } = Typography

interface InteractiveWorkflowGraphProps {
  task: SequencedTask
  isEditable?: boolean
  onUpdateDependencies?: (__stepId: string, dependencies: string[]) => void
}

// Custom node component - memoized to prevent re-renders
const WorkflowNode = React.memo(({ data }: { data: any }) => {
  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    if (hours > 0) {
      return `${hours}h ${mins > 0 ? `${mins}m` : ''}`
    }
    return `${mins}m`
  }

  // Completed steps have a more muted appearance
  const isCompleted = data.status === 'completed'
  const bgColor = isCompleted
    ? '#F5F5F5'
    : data.type === TaskType.Focused ? '#E6F7FF' : '#E8F5E9'
  const borderColor = isCompleted
    ? '#BFBFBF'
    : data.type === TaskType.Focused ? '#165DFF' : '#00B42A'

  return (
    <div
      style={{
        background: bgColor,
        border: `2px solid ${borderColor}`,
        opacity: isCompleted ? 0.7 : 1,
        borderRadius: 8,
        padding: 16,
        minWidth: 200,
        position: 'relative',
      }}
    >
      <Handle
        type="target"
        position={Position.Left}
        style={{
          background: '#86909c',
          width: 10,
          height: 10,
          visibility: data.isEditable ? 'visible' : 'hidden',
          pointerEvents: data.isEditable ? 'auto' : 'none',
        }}
      />

      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
        <div
          style={{
            background: isCompleted ? '#8C8C8C' : data.type === TaskType.Focused ? '#165DFF' : '#00B42A',
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
        <Tag size="small" color={data.type === TaskType.Focused ? 'blue' : 'green'}>
          {data.type === TaskType.Focused ? 'Focused' : 'Admin'}
        </Tag>
      </Space>

      <Handle
        type="source"
        position={Position.Right}
        style={{
          background: '#86909c',
          width: 10,
          height: 10,
          visibility: data.isEditable ? 'visible' : 'hidden',
          pointerEvents: data.isEditable ? 'auto' : 'none',
        }}
      />
    </div>
  )
})

export function InteractiveWorkflowGraph({
  task,
  isEditable = false,
  onUpdateDependencies,
}: InteractiveWorkflowGraphProps) {
  const [hideCompleted, setHideCompleted] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  // Define node types outside component to prevent re-renders
  const nodeTypes = useMemo(() => ({
    workflow: WorkflowNode,
  }), [])

  // Convert task steps to React Flow nodes
  const initialNodes = useMemo(() => {
    const nodes: Node[] = []
    
    // Filter steps based on hideCompleted setting
    const visibleSteps = hideCompleted
      ? task.steps.filter(step => step.status !== 'completed')
      : task.steps

    // Perform topological sort with level calculation
    const levelMap = new Map<string, number>()
    const visited = new Set<string>()
    const visiting = new Set<string>()
    
    // Build adjacency map for easier traversal
    const stepMap = new Map<string, TaskStep>()
    visibleSteps.forEach(step => stepMap.set(step.id, step))
    
    // DFS to calculate levels
    const calculateLevel = (stepId: string): number => {
      if (levelMap.has(stepId)) {
        return levelMap.get(stepId)!
      }
      
      if (visiting.has(stepId)) {
        // Circular dependency detected, break it
        return 0
      }
      
      visiting.add(stepId)
      
      const step = stepMap.get(stepId)
      if (!step) {
        visiting.delete(stepId)
        return 0
      }
      
      let maxDepLevel = -1
      step.dependsOn.forEach(depId => {
        const depStep = stepMap.get(depId)
        if (depStep) {
          const depLevel = calculateLevel(depId)
          maxDepLevel = Math.max(maxDepLevel, depLevel)
        }
      })
      
      const level = maxDepLevel + 1
      levelMap.set(stepId, level)
      visiting.delete(stepId)
      visited.add(stepId)
      
      return level
    }
    
    // Calculate levels for all steps
    visibleSteps.forEach(step => {
      if (!visited.has(step.id)) {
        calculateLevel(step.id)
      }
    })

    // Group steps by level
    const levelGroups = new Map<number, TaskStep[]>()
    visibleSteps.forEach(step => {
      const level = levelMap.get(step.id) || 0
      const group = levelGroups.get(level) || []
      group.push(step)
      levelGroups.set(level, group)
    })
    
    // Sort steps within each level by their original order for stability
    levelGroups.forEach((steps, level) => {
      steps.sort((a, b) => {
        const aIndex = task.steps.findIndex(s => s.id === a.id)
        const bIndex = task.steps.findIndex(s => s.id === b.id)
        return aIndex - bIndex
      })
    })

    // Create nodes with positions
    levelGroups.forEach((steps, level) => {
      steps.forEach((step, index) => {
        const stepIndex = task.steps.findIndex(s => s.id === step.id)
        nodes.push({
          id: step.id,
          type: 'workflow',
          position: {
            x: level * 400 + 50,  // Increased spacing and added offset
            y: index * 200 + 50,   // Increased vertical spacing
          },
          data: {
            label: step.name,
            duration: step.duration,
            asyncWaitTime: step.asyncWaitTime,
            type: step.type,
            stepNumber: stepIndex + 1,
            status: step.status,
            isEditable,
          },
        })
      })
    })

    return nodes
  }, [task, isEditable, hideCompleted])

  // Convert dependencies to React Flow edges
  const initialEdges = useMemo(() => {
    const edges: Edge[] = []

    // Filter steps based on hideCompleted setting
    const visibleSteps = hideCompleted
      ? task.steps.filter(step => step.status !== 'completed')
      : task.steps

    // Create a map of step names to IDs for quick lookup
    const stepNameToId = new Map<string, string>()
    task.steps.forEach(step => {
      stepNameToId.set(step.name, step.id)
    })

    visibleSteps.forEach((step) => {
      step.dependsOn.forEach((dep) => {
        // dep could be either a step ID or a step name
        let sourceId = dep

        // If it's not a valid step ID, try to find it by name
        if (!task.steps.some(s => s.id === dep)) {
          sourceId = stepNameToId.get(dep) || dep
        }

        // Ensure both source and target steps exist and are visible
        const sourceExists = visibleSteps.some(s => s.id === sourceId)
        const targetExists = visibleSteps.some(s => s.id === step.id)

        if (sourceExists && targetExists) {
          edges.push({
            id: `${sourceId}-${step.id}`,
            source: sourceId,
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
  }, [task, hideCompleted])

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)

  // Update nodes when task changes
  useEffect(() => {
    setNodes(initialNodes)
  }, [initialNodes, setNodes])

  // Update edges when task changes
  useEffect(() => {
    setEdges(initialEdges)
  }, [initialEdges, setEdges])

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
        logger.ui.error('Invalid connection: Would create a circular dependency')
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
          // Convert existing name-based dependencies to IDs
          const currentDeps = targetStep.dependsOn.map(dep => {
            // If it's already an ID, keep it
            if (task.steps.some(s => s.id === dep)) {
              return dep
            }
            // Otherwise try to find the ID by name
            const stepByName = task.steps.find(s => s.name === dep)
            return stepByName ? stepByName.id : dep
          })

          // Check if dependency already exists to avoid duplicates
          if (!currentDeps.includes(params.source)) {
            const newDependencies = [...currentDeps, params.source]
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
            // Convert name-based dependencies to IDs for comparison
            const newDependencies = targetStep.dependsOn.filter(dep => {
              // If dep is an ID, compare directly
              if (task.steps.some(s => s.id === dep)) {
                return dep !== edge.source
              }
              // If dep is a name, convert to ID and compare
              const stepByName = task.steps.find(s => s.name === dep)
              return stepByName ? stepByName.id !== edge.source : true
            })
            onUpdateDependencies(edge.target, newDependencies)
          }
        })
      }
    },
    [setEdges, onUpdateDependencies, task.steps],
  )

  // Handle fullscreen toggle
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      const graphContainer = document.getElementById('workflow-graph-container')
      if (graphContainer) {
        graphContainer.requestFullscreen().then(() => {
          setIsFullscreen(true)
        }).catch((err) => {
          console.error('Error entering fullscreen:', err)
        })
      }
    } else {
      document.exitFullscreen().then(() => {
        setIsFullscreen(false)
      }).catch((err) => {
        console.error('Error exiting fullscreen:', err)
      })
    }
  }

  // Listen for fullscreen changes (e.g., ESC key)
  React.useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement)
    }
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [])

  return (
    <div
      id="workflow-graph-container"
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: isFullscreen ? '#fff' : 'transparent',
      }}
    >
      <div style={{
        padding: '8px 16px',
        background: '#fff',
        borderBottom: '1px solid #e5e6eb',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <div>
          {isEditable ? (
            <Tag color="orange">
              Drag from right handle to left handle to create dependencies
            </Tag>
          ) : (
            <Text style={{ fontWeight: 'bold' }}>{task.name}</Text>
          )}
        </div>
        <Space>
          <Text type="secondary">Hide Completed</Text>
          <Switch
            checked={hideCompleted}
            onChange={setHideCompleted}
            size="small"
          />
          <Button
            type="text"
            icon={isFullscreen ? <IconFullscreenExit /> : <IconFullscreen />}
            onClick={toggleFullscreen}
            title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
          />
        </Space>
      </div>

      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onEdgeDoubleClick={(_, edge) => isEditable && onEdgeDelete([edge])}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{
            padding: 0.2,
            includeHiddenNodes: false,
            minZoom: 0.5,
            maxZoom: 1,
          }}
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
        <div style={{ padding: 16, borderTop: '1px solid #e5e6eb', background: '#fff' }}>
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
    </div>
  )
}
