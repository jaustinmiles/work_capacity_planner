import { useMemo } from 'react'
import { TaskType } from '@shared/enums'
import { Card, Typography, Tag, Space } from '@arco-design/web-react'
import { SequencedTask } from '@shared/sequencing-types'
import { useTaskStore } from '../../store/useTaskStore'

const { Title, Text } = Typography

interface WorkflowGraphProps {
  task: SequencedTask
}

interface GraphNode {
  id: string
  label: string
  duration: number
  asyncWaitTime: number
  type: TaskType
  x: number
  y: number
  dependencies: string[]
}

export function WorkflowGraph({ task }: WorkflowGraphProps) {
  const { sequencedTasks } = useTaskStore()

  // Always use the latest task data from store
  const currentTask = sequencedTasks.find(t => t.id === task.id) || task
  const { nodes, maxX, maxY } = useMemo(() => {
    const nodeMap = new Map<string, GraphNode>()
    const levels = new Map<string, number>()

    // First pass: create nodes and calculate levels
    currentTask.steps.forEach((step, index) => {
      const nodeId = step.id || `step-${index}`
      const node: GraphNode = {
        id: nodeId,
        label: step.name,
        duration: step.duration,
        asyncWaitTime: step.asyncWaitTime,
        type: step.type,
        x: 0,
        y: 0,
        dependencies: step.dependsOn,
      }
      nodeMap.set(nodeId, node)

      // Calculate level based on dependencies
      let level = 0
      step.dependsOn.forEach(depId => {
        const depLevel = levels.get(depId) || 0
        level = Math.max(level, depLevel + 1)
      })
      levels.set(nodeId, level)
    })

    // Group nodes by level
    const levelGroups = new Map<number, GraphNode[]>()
    nodeMap.forEach((node, id) => {
      const level = levels.get(id) || 0
      const group = levelGroups.get(level) || []
      group.push(node)
      levelGroups.set(level, group)
    })

    // Position nodes with better spacing
    const nodeWidth = 200
    const nodeHeight = 80
    const horizontalGap = 80
    const verticalGap = 120

    let maxX = 0
    let maxY = 0

    levelGroups.forEach((nodes, level) => {
      nodes.forEach((node, index) => {
        node.x = level * (nodeWidth + horizontalGap) + 20
        node.y = index * (nodeHeight + verticalGap) + 20
        maxX = Math.max(maxX, node.x + nodeWidth)
        maxY = Math.max(maxY, node.y + nodeHeight)
      })
    })

    return { nodes: Array.from(nodeMap.values()), maxX: maxX + 20, maxY: maxY + 20 }
  }, [currentTask])

  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    if (hours > 0) {
      return `${hours}h ${mins > 0 ? `${mins}m` : ''}`
    }
    return `${mins}m`
  }

  const drawConnection = (fromNode: GraphNode, toNode: GraphNode) => {
    const fromX = fromNode.x + 200
    const fromY = fromNode.y + 40
    const toX = toNode.x
    const toY = toNode.y + 40

    // Simple bezier curve
    const controlX1 = fromX + (toX - fromX) / 2
    const controlY1 = fromY
    const controlX2 = fromX + (toX - fromX) / 2
    const controlY2 = toY

    return `M ${fromX} ${fromY} C ${controlX1} ${controlY1}, ${controlX2} ${controlY2}, ${toX} ${toY}`
  }

  return (
    <Card title={<Title heading={5}>Workflow Graph</Title>}>
      <div style={{ width: '100%', overflowX: 'auto', overflowY: 'auto', maxHeight: 600 }}>
        <svg width={maxX} height={maxY} style={{ minWidth: '100%' }}>
          {/* Draw connections */}
          {nodes.flatMap((node: any) =>
            node.dependencies.map((depId: any) => {
              const fromNode = nodes.find((n: any) => n.id === depId)
              if (fromNode) {
                return (
                  <g key={`${depId}-${node.id}`}>
                    <path
                      d={drawConnection(fromNode, node)}
                      fill="none"
                      stroke="#86909C"
                      strokeWidth="2"
                      strokeDasharray="5,5"
                    />
                    {/* Arrowhead */}
                    <polygon
                      points={`${node.x - 5},${node.y + 35} ${node.x - 5},${node.y + 45} ${node.x},${node.y + 40}`}
                      fill="#86909C"
                    />
                  </g>
                )
              }
              return null
            }).filter(Boolean),
          )}

          {/* Draw nodes */}
          {nodes.map((node: any, index: number) => (
            <g key={node.id}>
              {/* Node background */}
              <rect
                x={node.x}
                y={node.y}
                width="200"
                height="80"
                rx="8"
                fill={node.type === TaskType.Focused ? '#E6F7FF' : '#E8F5E9'}
                stroke={node.type === TaskType.Focused ? '#165DFF' : '#00B42A'}
                strokeWidth="2"
              />

              {/* Step number */}
              <circle
                cx={node.x + 20}
                cy={node.y + 20}
                r="15"
                fill={node.type === TaskType.Focused ? '#165DFF' : '#00B42A'}
              />
              <text
                x={node.x + 20}
                y={node.y + 25}
                textAnchor="middle"
                fill="white"
                fontSize="12"
                fontWeight="bold"
              >
                {index + 1}
              </text>

              {/* Node label */}
              <text
                x={node.x + 100}
                y={node.y + 25}
                textAnchor="middle"
                fontSize="14"
                fontWeight="500"
              >
                {node.label.length > 20 ? node.label.substring(0, 20) + '...' : node.label}
              </text>

              {/* Duration */}
              <text
                x={node.x + 100}
                y={node.y + 50}
                textAnchor="middle"
                fontSize="12"
                fill="#86909C"
              >
                {formatDuration(node.duration)}
                {node.asyncWaitTime > 0 && ` + ${formatDuration(node.asyncWaitTime)} wait`}
              </text>

              {/* Type tag */}
              <rect
                x={node.x + 150}
                y={node.y + 55}
                width="40"
                height="20"
                rx="10"
                fill={node.type === TaskType.Focused ? '#165DFF' : '#00B42A'}
              />
              <text
                x={node.x + 170}
                y={node.y + 68}
                textAnchor="middle"
                fill="white"
                fontSize="10"
              >
                {node.type === TaskType.Focused ? 'Focus' : 'Admin'}
              </text>
            </g>
          ))}
        </svg>
      </div>

      <div style={{ marginTop: 16 }}>
        <Space>
          <Tag color="blue">Focused Work</Tag>
          <Tag color="green">Admin Task</Tag>
          <Text type="secondary">Dashed lines show dependencies</Text>
        </Space>
      </div>
    </Card>
  )
}
