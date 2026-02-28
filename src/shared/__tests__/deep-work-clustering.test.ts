import { describe, it, expect } from 'vitest'
import {
  computeClusters,
  wouldCreateCycle,
  findActionableNodeIds,
  validateEdgeCreation,
  buildBoardDependencyGraph,
  deriveNodeStatus,
} from '../deep-work-clustering'
import type { DeepWorkNodeWithData, DeepWorkEdge } from '../deep-work-board-types'
import { DeepWorkEdgeType, DeepWorkNodeStatus } from '../deep-work-board-types'
import { StepStatus } from '../enums'

// =============================================================================
// Test Helpers
// =============================================================================

/** Create a minimal standalone task node for testing */
function makeTaskNode(
  id: string,
  overrides: Partial<DeepWorkNodeWithData> = {},
): DeepWorkNodeWithData {
  return {
    id,
    boardId: 'board-1',
    taskId: `task-${id}`,
    stepId: null,
    positionX: 0,
    positionY: 0,
    width: 220,
    height: 90,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
    task: {
      id: `task-${id}`,
      name: `Task ${id}`,
      duration: 30,
      importance: 5,
      urgency: 5,
      type: 'focused',
      asyncWaitTime: 0,
      dependencies: [],
      completed: false,
      hasSteps: false,
      overallStatus: 'not_started' as any,
      criticalPathDuration: 0,
      worstCaseDuration: 0,
      archived: false,
      inActiveSprint: false,
      sessionId: 'session-1',
      createdAt: new Date('2024-01-01T00:00:00Z'),
      updatedAt: new Date('2024-01-01T00:00:00Z'),
    },
    step: null,
    parentTask: null,
    ...overrides,
  }
}

/** Create a step node for testing */
function makeStepNode(
  id: string,
  stepId: string,
  taskId: string,
  dependsOn: string[] = [],
  status: StepStatus = StepStatus.Pending,
): DeepWorkNodeWithData {
  return {
    id,
    boardId: 'board-1',
    taskId: null,
    stepId,
    positionX: 0,
    positionY: 0,
    width: 220,
    height: 90,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
    task: null,
    step: {
      id: stepId,
      name: `Step ${stepId}`,
      duration: 15,
      type: 'focused',
      taskId,
      dependsOn,
      asyncWaitTime: 0,
      status,
      stepIndex: 0,
      percentComplete: 0,
      isAsyncTrigger: false,
    },
    parentTask: {
      id: taskId,
      name: `Workflow ${taskId}`,
      duration: 60,
      importance: 5,
      urgency: 5,
      type: 'focused',
      asyncWaitTime: 0,
      dependencies: [],
      completed: false,
      hasSteps: true,
      overallStatus: 'not_started' as any,
      criticalPathDuration: 60,
      worstCaseDuration: 60,
      archived: false,
      inActiveSprint: false,
      sessionId: 'session-1',
      createdAt: new Date('2024-01-01T00:00:00Z'),
      updatedAt: new Date('2024-01-01T00:00:00Z'),
    },
  }
}

/** Create an edge for testing */
function makeEdge(
  sourceNodeId: string,
  targetNodeId: string,
  edgeType: DeepWorkEdgeType = DeepWorkEdgeType.IntraWorkflow,
): DeepWorkEdge {
  return {
    id: `edge-${sourceNodeId}-${targetNodeId}`,
    sourceNodeId,
    targetNodeId,
    edgeType,
  }
}

// =============================================================================
// Tests: computeClusters
// =============================================================================

describe('computeClusters', () => {
  it('should return empty array for no nodes', () => {
    const result = computeClusters(new Map(), [])
    expect(result).toEqual([])
  })

  it('should create one cluster per isolated node', () => {
    const nodes = new Map<string, DeepWorkNodeWithData>()
    nodes.set('A', makeTaskNode('A'))
    nodes.set('B', makeTaskNode('B'))
    nodes.set('C', makeTaskNode('C'))

    const result = computeClusters(nodes, [])

    expect(result).toHaveLength(3)
    // Each cluster has exactly one node
    for (const cluster of result) {
      expect(cluster.nodeIds.size).toBe(1)
    }
  })

  it('should group connected nodes into one cluster', () => {
    const nodes = new Map<string, DeepWorkNodeWithData>()
    nodes.set('A', makeTaskNode('A'))
    nodes.set('B', makeTaskNode('B'))
    nodes.set('C', makeTaskNode('C'))

    const edges: DeepWorkEdge[] = [
      makeEdge('A', 'B'),
      makeEdge('B', 'C'),
    ]

    const result = computeClusters(nodes, edges)

    expect(result).toHaveLength(1)
    expect(result[0]!.nodeIds.size).toBe(3)
    expect(result[0]!.nodeIds.has('A')).toBe(true)
    expect(result[0]!.nodeIds.has('B')).toBe(true)
    expect(result[0]!.nodeIds.has('C')).toBe(true)
  })

  it('should form two clusters from disconnected groups', () => {
    const nodes = new Map<string, DeepWorkNodeWithData>()
    nodes.set('A', makeTaskNode('A'))
    nodes.set('B', makeTaskNode('B'))
    nodes.set('C', makeTaskNode('C'))
    nodes.set('D', makeTaskNode('D'))

    const edges: DeepWorkEdge[] = [
      makeEdge('A', 'B'),
      makeEdge('C', 'D'),
    ]

    const result = computeClusters(nodes, edges)

    expect(result).toHaveLength(2)
    const clusterSizes = result.map((c) => c.nodeIds.size).sort()
    expect(clusterSizes).toEqual([2, 2])
  })

  it('should identify root nodes (no incoming edges)', () => {
    const nodes = new Map<string, DeepWorkNodeWithData>()
    nodes.set('A', makeTaskNode('A'))
    nodes.set('B', makeTaskNode('B'))
    nodes.set('C', makeTaskNode('C'))

    const edges: DeepWorkEdge[] = [
      makeEdge('A', 'B'),
      makeEdge('A', 'C'),
    ]

    const result = computeClusters(nodes, edges)

    expect(result).toHaveLength(1)
    expect(result[0]!.rootNodeIds).toEqual(['A'])
  })

  it('should identify terminal nodes (no outgoing edges)', () => {
    const nodes = new Map<string, DeepWorkNodeWithData>()
    nodes.set('A', makeTaskNode('A'))
    nodes.set('B', makeTaskNode('B'))
    nodes.set('C', makeTaskNode('C'))

    const edges: DeepWorkEdge[] = [
      makeEdge('A', 'B'),
      makeEdge('A', 'C'),
    ]

    const result = computeClusters(nodes, edges)

    expect(result).toHaveLength(1)
    const terminalIds = result[0]!.terminalNodeIds.sort()
    expect(terminalIds).toEqual(['B', 'C'])
  })

  it('should use oldest node ID as cluster ID', () => {
    const nodes = new Map<string, DeepWorkNodeWithData>()
    nodes.set('A', makeTaskNode('A', { createdAt: new Date('2024-01-03') }))
    nodes.set('B', makeTaskNode('B', { createdAt: new Date('2024-01-01') }))
    nodes.set('C', makeTaskNode('C', { createdAt: new Date('2024-01-02') }))

    const edges: DeepWorkEdge[] = [makeEdge('A', 'B'), makeEdge('B', 'C')]

    const result = computeClusters(nodes, edges)

    expect(result).toHaveLength(1)
    expect(result[0]!.id).toBe('B') // Oldest
  })

  it('should ignore edges referencing nodes not on the board', () => {
    const nodes = new Map<string, DeepWorkNodeWithData>()
    nodes.set('A', makeTaskNode('A'))
    nodes.set('B', makeTaskNode('B'))

    const edges: DeepWorkEdge[] = [
      makeEdge('A', 'Z'), // Z doesn't exist on the board
    ]

    const result = computeClusters(nodes, edges)

    // A and B should be separate clusters since the edge to Z is invalid
    expect(result).toHaveLength(2)
  })
})

// =============================================================================
// Tests: wouldCreateCycle
// =============================================================================

describe('wouldCreateCycle', () => {
  it('should return false for simple linear chain', () => {
    const edges: DeepWorkEdge[] = [
      makeEdge('A', 'B'),
    ]

    expect(wouldCreateCycle(edges, 'B', 'C')).toBe(false)
  })

  it('should return true for direct cycle', () => {
    const edges: DeepWorkEdge[] = [
      makeEdge('A', 'B'),
    ]

    // B → A would create A → B → A cycle
    expect(wouldCreateCycle(edges, 'B', 'A')).toBe(true)
  })

  it('should return true for indirect cycle', () => {
    const edges: DeepWorkEdge[] = [
      makeEdge('A', 'B'),
      makeEdge('B', 'C'),
    ]

    // C → A would create A → B → C → A cycle
    expect(wouldCreateCycle(edges, 'C', 'A')).toBe(true)
  })

  it('should return false when no existing edges', () => {
    expect(wouldCreateCycle([], 'A', 'B')).toBe(false)
  })

  it('should handle diamond-shaped dependencies without false positive', () => {
    const edges: DeepWorkEdge[] = [
      makeEdge('A', 'B'),
      makeEdge('A', 'C'),
      makeEdge('B', 'D'),
    ]

    // C → D should NOT create a cycle (it's a diamond: A→B→D, A→C→D)
    expect(wouldCreateCycle(edges, 'C', 'D')).toBe(false)
  })
})

// =============================================================================
// Tests: findActionableNodeIds
// =============================================================================

describe('findActionableNodeIds', () => {
  it('should mark all nodes as actionable when no edges exist', () => {
    const nodes = new Map<string, DeepWorkNodeWithData>()
    nodes.set('A', makeTaskNode('A'))
    nodes.set('B', makeTaskNode('B'))

    const result = findActionableNodeIds(nodes, [])

    expect(result.size).toBe(2)
    expect(result.has('A')).toBe(true)
    expect(result.has('B')).toBe(true)
  })

  it('should not mark completed nodes as actionable', () => {
    const nodes = new Map<string, DeepWorkNodeWithData>()
    const completedNode = makeTaskNode('A')
    completedNode.task!.completed = true
    nodes.set('A', completedNode)
    nodes.set('B', makeTaskNode('B'))

    const result = findActionableNodeIds(nodes, [])

    expect(result.size).toBe(1)
    expect(result.has('B')).toBe(true)
    expect(result.has('A')).toBe(false)
  })

  it('should block nodes whose dependencies are incomplete', () => {
    const nodes = new Map<string, DeepWorkNodeWithData>()
    nodes.set('A', makeTaskNode('A'))
    nodes.set('B', makeTaskNode('B'))

    const edges: DeepWorkEdge[] = [makeEdge('A', 'B')]

    const result = findActionableNodeIds(nodes, edges)

    expect(result.has('A')).toBe(true) // No deps, actionable
    expect(result.has('B')).toBe(false) // Blocked by A
  })

  it('should unblock nodes when all dependencies are completed', () => {
    const nodes = new Map<string, DeepWorkNodeWithData>()
    const completedA = makeTaskNode('A')
    completedA.task!.completed = true
    nodes.set('A', completedA)
    nodes.set('B', makeTaskNode('B'))

    const edges: DeepWorkEdge[] = [makeEdge('A', 'B')]

    const result = findActionableNodeIds(nodes, edges)

    // A is completed (not in actionable), B is now unblocked
    expect(result.has('A')).toBe(false)
    expect(result.has('B')).toBe(true)
  })

  it('should handle step nodes with completed status', () => {
    const nodes = new Map<string, DeepWorkNodeWithData>()
    nodes.set('A', makeStepNode('A', 'step-a', 'wf-1', [], StepStatus.Completed))
    nodes.set('B', makeStepNode('B', 'step-b', 'wf-1', ['step-a']))

    const edges: DeepWorkEdge[] = [makeEdge('A', 'B')]

    const result = findActionableNodeIds(nodes, edges)

    expect(result.has('A')).toBe(false) // Completed
    expect(result.has('B')).toBe(true) // Dependency completed, now actionable
  })

  it('should handle multiple dependencies — all must be complete', () => {
    const nodes = new Map<string, DeepWorkNodeWithData>()
    const completedA = makeTaskNode('A')
    completedA.task!.completed = true
    nodes.set('A', completedA)
    nodes.set('B', makeTaskNode('B')) // Not completed
    nodes.set('C', makeTaskNode('C'))

    const edges: DeepWorkEdge[] = [makeEdge('A', 'C'), makeEdge('B', 'C')]

    const result = findActionableNodeIds(nodes, edges)

    // C requires both A and B; B is not completed, so C is blocked
    expect(result.has('C')).toBe(false)
    expect(result.has('B')).toBe(true) // B has no deps
  })
})

// =============================================================================
// Tests: validateEdgeCreation
// =============================================================================

describe('validateEdgeCreation', () => {
  it('should reject self-loops', () => {
    const nodes = new Map<string, DeepWorkNodeWithData>()
    nodes.set('A', makeTaskNode('A'))

    const result = validateEdgeCreation('A', 'A', nodes, [])
    expect(result).toContain('itself')
  })

  it('should reject when source node is missing', () => {
    const nodes = new Map<string, DeepWorkNodeWithData>()
    nodes.set('B', makeTaskNode('B'))

    const result = validateEdgeCreation('A', 'B', nodes, [])
    expect(result).toContain('not found')
  })

  it('should reject duplicate edges', () => {
    const nodes = new Map<string, DeepWorkNodeWithData>()
    nodes.set('A', makeTaskNode('A'))
    nodes.set('B', makeTaskNode('B'))

    const edges: DeepWorkEdge[] = [makeEdge('A', 'B')]

    const result = validateEdgeCreation('A', 'B', nodes, edges)
    expect(result).toContain('already exists')
  })

  it('should reject reverse edges', () => {
    const nodes = new Map<string, DeepWorkNodeWithData>()
    nodes.set('A', makeTaskNode('A'))
    nodes.set('B', makeTaskNode('B'))

    const edges: DeepWorkEdge[] = [makeEdge('A', 'B')]

    const result = validateEdgeCreation('B', 'A', nodes, edges)
    expect(result).toContain('reverse')
  })

  it('should reject edges that would create cycles', () => {
    const nodes = new Map<string, DeepWorkNodeWithData>()
    nodes.set('A', makeTaskNode('A'))
    nodes.set('B', makeTaskNode('B'))
    nodes.set('C', makeTaskNode('C'))

    const edges: DeepWorkEdge[] = [makeEdge('A', 'B'), makeEdge('B', 'C')]

    const result = validateEdgeCreation('C', 'A', nodes, edges)
    expect(result).toContain('circular')
  })

  it('should allow valid edges', () => {
    const nodes = new Map<string, DeepWorkNodeWithData>()
    nodes.set('A', makeTaskNode('A'))
    nodes.set('B', makeTaskNode('B'))

    const result = validateEdgeCreation('A', 'B', nodes, [])
    expect(result).toBeNull()
  })
})

// =============================================================================
// Tests: buildBoardDependencyGraph
// =============================================================================

describe('buildBoardDependencyGraph', () => {
  it('should build a graph compatible with graph-utils', () => {
    const nodes = new Map<string, DeepWorkNodeWithData>()
    nodes.set('A', makeTaskNode('A'))
    nodes.set('B', makeTaskNode('B'))

    const edges: DeepWorkEdge[] = [makeEdge('A', 'B')]

    const graph = buildBoardDependencyGraph(nodes, edges)

    expect(graph.get('A')).toEqual([])
    expect(graph.get('B')).toEqual(['A'])
  })

  it('should handle nodes with no edges', () => {
    const nodes = new Map<string, DeepWorkNodeWithData>()
    nodes.set('A', makeTaskNode('A'))

    const graph = buildBoardDependencyGraph(nodes, [])

    expect(graph.get('A')).toEqual([])
  })
})

// =============================================================================
// Tests: deriveNodeStatus
// =============================================================================

describe('deriveNodeStatus', () => {
  it('should return Pending for an actionable standalone task', () => {
    const node = makeTaskNode('A')
    expect(deriveNodeStatus(node, true)).toBe(DeepWorkNodeStatus.Pending)
  })

  it('should return Completed for a completed standalone task', () => {
    const node = makeTaskNode('A')
    node.task!.completed = true
    expect(deriveNodeStatus(node, true)).toBe(DeepWorkNodeStatus.Completed)
    // Completed takes priority even if isActionable is false
    expect(deriveNodeStatus(node, false)).toBe(DeepWorkNodeStatus.Completed)
  })

  it('should return Blocked for a non-actionable standalone task', () => {
    const node = makeTaskNode('A')
    expect(deriveNodeStatus(node, false)).toBe(DeepWorkNodeStatus.Blocked)
  })

  it('should return Completed for a completed step', () => {
    const node = makeStepNode('A', 'step-a', 'wf-1', [], StepStatus.Completed)
    expect(deriveNodeStatus(node, false)).toBe(DeepWorkNodeStatus.Completed)
  })

  it('should return Completed for a skipped step', () => {
    const node = makeStepNode('A', 'step-a', 'wf-1', [], StepStatus.Skipped)
    expect(deriveNodeStatus(node, false)).toBe(DeepWorkNodeStatus.Completed)
  })

  it('should return Active for an in-progress step', () => {
    const node = makeStepNode('A', 'step-a', 'wf-1', [], StepStatus.InProgress)
    expect(deriveNodeStatus(node, true)).toBe(DeepWorkNodeStatus.Active)
  })

  it('should return Waiting for a waiting step', () => {
    const node = makeStepNode('A', 'step-a', 'wf-1', [], StepStatus.Waiting)
    expect(deriveNodeStatus(node, true)).toBe(DeepWorkNodeStatus.Waiting)
  })

  it('should return Pending for an actionable pending step', () => {
    const node = makeStepNode('A', 'step-a', 'wf-1', [], StepStatus.Pending)
    expect(deriveNodeStatus(node, true)).toBe(DeepWorkNodeStatus.Pending)
  })

  it('should return Blocked for a non-actionable pending step', () => {
    const node = makeStepNode('A', 'step-a', 'wf-1', [], StepStatus.Pending)
    expect(deriveNodeStatus(node, false)).toBe(DeepWorkNodeStatus.Blocked)
  })

  it('should return Pending for a node with no task or step data', () => {
    const node = makeTaskNode('A')
    node.task = null
    expect(deriveNodeStatus(node, true)).toBe(DeepWorkNodeStatus.Pending)
  })
})

// =============================================================================
// Edge Cases: Clustering with workflow step nodes
// =============================================================================

describe('computeClusters — workflow detection', () => {
  it('should identify workflow task ID when all steps share a parent', () => {
    const nodes = new Map<string, DeepWorkNodeWithData>()
    nodes.set('A', makeStepNode('A', 'step-a', 'wf-1'))
    nodes.set('B', makeStepNode('B', 'step-b', 'wf-1', ['step-a']))

    const edges: DeepWorkEdge[] = [makeEdge('A', 'B')]

    const result = computeClusters(nodes, edges)

    expect(result).toHaveLength(1)
    expect(result[0]!.workflowTaskId).toBe('wf-1')
    expect(result[0]!.displayName).toBe('Workflow wf-1')
  })

  it('should set null workflowTaskId when steps have different parents', () => {
    const nodes = new Map<string, DeepWorkNodeWithData>()
    nodes.set('A', makeStepNode('A', 'step-a', 'wf-1'))
    nodes.set('B', makeStepNode('B', 'step-b', 'wf-2'))

    const edges: DeepWorkEdge[] = [makeEdge('A', 'B', DeepWorkEdgeType.CrossWorkflow)]

    const result = computeClusters(nodes, edges)

    expect(result).toHaveLength(1)
    expect(result[0]!.workflowTaskId).toBeNull()
  })

  it('should use root node name as displayName when no workflow', () => {
    const nodes = new Map<string, DeepWorkNodeWithData>()
    nodes.set('A', makeTaskNode('A'))
    nodes.set('B', makeTaskNode('B'))

    const edges: DeepWorkEdge[] = [makeEdge('A', 'B')]

    const result = computeClusters(nodes, edges)

    expect(result).toHaveLength(1)
    expect(result[0]!.displayName).toBe('Task A')
  })
})

// =============================================================================
// Edge Cases: findActionableNodeIds with step status checks
// =============================================================================

describe('findActionableNodeIds — step status edge cases', () => {
  it('should treat skipped steps as completed for dependency resolution', () => {
    const nodes = new Map<string, DeepWorkNodeWithData>()
    nodes.set('A', makeStepNode('A', 'step-a', 'wf-1', [], StepStatus.Skipped))
    nodes.set('B', makeStepNode('B', 'step-b', 'wf-1', ['step-a']))

    const edges: DeepWorkEdge[] = [makeEdge('A', 'B')]

    const result = findActionableNodeIds(nodes, edges)

    expect(result.has('A')).toBe(false) // Skipped
    expect(result.has('B')).toBe(true)  // Dependency satisfied
  })

  it('should return false for dep with no task and no step', () => {
    const nodeA = makeTaskNode('A')
    nodeA.task = null
    const nodeB = makeTaskNode('B')

    const nodes = new Map<string, DeepWorkNodeWithData>()
    nodes.set('A', nodeA)
    nodes.set('B', nodeB)

    const edges: DeepWorkEdge[] = [makeEdge('A', 'B')]

    const result = findActionableNodeIds(nodes, edges)
    // A has no task/step → treated as not completed → B is blocked
    expect(result.has('B')).toBe(false)
  })
})

// =============================================================================
// Edge Cases: validateEdgeCreation
// =============================================================================

describe('validateEdgeCreation — target not found', () => {
  it('should reject when target node is missing', () => {
    const nodes = new Map<string, DeepWorkNodeWithData>()
    nodes.set('A', makeTaskNode('A'))

    const result = validateEdgeCreation('A', 'B', nodes, [])
    expect(result).toContain('not found')
  })
})
