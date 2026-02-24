/**
 * Deep Work Board — Smart Clustering Algorithm
 *
 * Uses Union-Find (Disjoint Set Union) to partition canvas nodes into connected
 * components (clusters). Connected nodes auto-form workflows; disconnected
 * clusters remain separate task groups.
 *
 * Performance: O(n * α(n)) ≈ O(n) for n nodes — safe for 100+ nodes synchronously.
 *
 * Key operations:
 * - computeClusters: Full computation from nodes + edges
 * - wouldCreateCycle: Pre-flight check before edge creation
 * - findActionableNodeIds: Determine which nodes are ready to work on
 */

import { buildDependencyGraph, detectDependencyCycles } from './graph-utils'
import type { DeepWorkNodeWithData, DeepWorkEdge, DeepWorkCluster } from './deep-work-board-types'
import { DeepWorkNodeStatus } from './deep-work-board-types'
import { StepStatus } from './enums'

// =============================================================================
// Union-Find Data Structure
// =============================================================================

/**
 * Union-Find with path compression and union by rank.
 * Internal data structure — not exported; consumers use the high-level functions.
 */
class UnionFind {
  private parent: Map<string, string>
  private rank: Map<string, number>

  constructor(nodeIds: string[]) {
    this.parent = new Map()
    this.rank = new Map()
    for (const id of nodeIds) {
      this.parent.set(id, id)
      this.rank.set(id, 0)
    }
  }

  /** Find the root representative of a node's cluster, with path compression. */
  find(id: string): string {
    const parentId = this.parent.get(id)
    if (parentId === undefined) return id
    if (parentId !== id) {
      const root = this.find(parentId)
      this.parent.set(id, root) // Path compression
      return root
    }
    return id
  }

  /** Merge the clusters containing two nodes. Returns true if they were separate. */
  union(a: string, b: string): boolean {
    const rootA = this.find(a)
    const rootB = this.find(b)
    if (rootA === rootB) return false // Already in the same cluster

    // Union by rank: attach smaller tree under larger
    const rankA = this.rank.get(rootA) ?? 0
    const rankB = this.rank.get(rootB) ?? 0
    if (rankA < rankB) {
      this.parent.set(rootA, rootB)
    } else if (rankA > rankB) {
      this.parent.set(rootB, rootA)
    } else {
      this.parent.set(rootB, rootA)
      this.rank.set(rootA, rankA + 1)
    }
    return true
  }

  /** Check whether two nodes are in the same cluster. */
  connected(a: string, b: string): boolean {
    return this.find(a) === this.find(b)
  }

  /** Get all clusters as a map from root ID → Set of member IDs. */
  getClusters(): Map<string, Set<string>> {
    const clusters = new Map<string, Set<string>>()
    for (const id of this.parent.keys()) {
      const root = this.find(id)
      const existing = clusters.get(root)
      if (existing) {
        existing.add(id)
      } else {
        clusters.set(root, new Set([id]))
      }
    }
    return clusters
  }
}

// =============================================================================
// Cluster Computation
// =============================================================================

/**
 * Compute clusters from a set of nodes and edges.
 *
 * Each connected component of the edge graph becomes a cluster.
 * Isolated nodes (no edges) each form their own single-node cluster.
 */
export function computeClusters(
  nodes: Map<string, DeepWorkNodeWithData>,
  edges: DeepWorkEdge[],
): DeepWorkCluster[] {
  const nodeIds = Array.from(nodes.keys())
  if (nodeIds.length === 0) return []

  // Build Union-Find from edges
  const uf = new UnionFind(nodeIds)
  for (const edge of edges) {
    // Only union if both nodes exist on the board
    if (nodes.has(edge.sourceNodeId) && nodes.has(edge.targetNodeId)) {
      uf.union(edge.sourceNodeId, edge.targetNodeId)
    }
  }

  // Build adjacency sets for root/terminal detection
  const incomingEdges = new Map<string, Set<string>>()
  const outgoingEdges = new Map<string, Set<string>>()
  for (const id of nodeIds) {
    incomingEdges.set(id, new Set())
    outgoingEdges.set(id, new Set())
  }
  for (const edge of edges) {
    if (!nodes.has(edge.sourceNodeId) || !nodes.has(edge.targetNodeId)) continue
    outgoingEdges.get(edge.sourceNodeId)?.add(edge.targetNodeId)
    incomingEdges.get(edge.targetNodeId)?.add(edge.sourceNodeId)
  }

  // Group by cluster root
  const rawClusters = uf.getClusters()
  const result: DeepWorkCluster[] = []

  for (const [, memberIds] of rawClusters) {
    // Determine stable cluster ID: the oldest node (earliest createdAt)
    let oldestId: string | null = null
    let oldestTime = Infinity
    for (const id of memberIds) {
      const node = nodes.get(id)
      if (node) {
        const time = node.createdAt.getTime()
        if (time < oldestTime) {
          oldestTime = time
          oldestId = id
        }
      }
    }

    // Root nodes: no incoming edges from within this cluster
    const rootNodeIds: string[] = []
    // Terminal nodes: no outgoing edges within this cluster
    const terminalNodeIds: string[] = []

    for (const id of memberIds) {
      const incoming = incomingEdges.get(id)
      const outgoing = outgoingEdges.get(id)

      const hasIntraClusterIncoming = incoming
        ? Array.from(incoming).some((srcId) => memberIds.has(srcId))
        : false
      const hasIntraClusterOutgoing = outgoing
        ? Array.from(outgoing).some((tgtId) => memberIds.has(tgtId))
        : false

      if (!hasIntraClusterIncoming) rootNodeIds.push(id)
      if (!hasIntraClusterOutgoing) terminalNodeIds.push(id)
    }

    // Determine workflow task ID: if all step nodes share a parent, use that
    let workflowTaskId: string | null = null
    const parentTaskIds = new Set<string>()
    for (const id of memberIds) {
      const node = nodes.get(id)
      if (node?.parentTask) {
        parentTaskIds.add(node.parentTask.id)
      }
    }
    if (parentTaskIds.size === 1) {
      workflowTaskId = Array.from(parentTaskIds)[0] ?? null
    }

    // Display name: workflow name if available, else first root node's name
    let displayName = 'Cluster'
    if (workflowTaskId) {
      // Find the parent task name from any step in this cluster
      for (const id of memberIds) {
        const node = nodes.get(id)
        if (node?.parentTask?.name) {
          displayName = node.parentTask.name
          break
        }
      }
    } else {
      // Use the first root node's task/step name
      const firstRootId = rootNodeIds[0]
      if (firstRootId) {
        const node = nodes.get(firstRootId)
        displayName = node?.task?.name ?? node?.step?.name ?? 'Cluster'
      }
    }

    result.push({
      id: oldestId ?? Array.from(memberIds)[0] ?? '',
      nodeIds: memberIds,
      rootNodeIds,
      terminalNodeIds,
      workflowTaskId,
      displayName,
    })
  }

  return result
}

// =============================================================================
// Cycle Detection
// =============================================================================

/**
 * Check whether adding an edge from source → target would create a cycle.
 * Uses the existing detectDependencyCycles utility from graph-utils.
 *
 * @returns true if the new edge would introduce a cycle
 */
export function wouldCreateCycle(
  edges: DeepWorkEdge[],
  sourceNodeId: string,
  targetNodeId: string,
): boolean {
  // Build a dependency graph: each node maps to its dependencies (incoming edges)
  // In our edge model: sourceNodeId completes first, targetNodeId depends on it
  // So targetNodeId depends on sourceNodeId
  const graph = new Map<string, string[]>()

  // Collect all node IDs
  const allNodeIds = new Set<string>()
  for (const edge of edges) {
    allNodeIds.add(edge.sourceNodeId)
    allNodeIds.add(edge.targetNodeId)
  }
  allNodeIds.add(sourceNodeId)
  allNodeIds.add(targetNodeId)

  // Initialize empty dependency lists
  for (const id of allNodeIds) {
    graph.set(id, [])
  }

  // Populate existing edges
  for (const edge of edges) {
    const deps = graph.get(edge.targetNodeId)
    if (deps) {
      deps.push(edge.sourceNodeId)
    }
  }

  // Add the proposed new edge
  const targetDeps = graph.get(targetNodeId)
  if (targetDeps) {
    targetDeps.push(sourceNodeId)
  }

  const result = detectDependencyCycles(graph)
  return result.hasCycle
}

// =============================================================================
// Actionable Node Detection
// =============================================================================

/**
 * Derive the visual status of a single node based on its task/step data
 * and whether all its dependencies are satisfied.
 */
export function deriveNodeStatus(
  node: DeepWorkNodeWithData,
  isActionable: boolean,
): DeepWorkNodeStatus {
  if (node.task && !node.task.hasSteps) {
    // Standalone task
    if (node.task.completed) return DeepWorkNodeStatus.Completed
    if (!isActionable) return DeepWorkNodeStatus.Blocked
    return DeepWorkNodeStatus.Pending
  }

  if (node.step) {
    switch (node.step.status) {
      case StepStatus.Completed:
      case StepStatus.Skipped:
        return DeepWorkNodeStatus.Completed
      case StepStatus.InProgress:
        return DeepWorkNodeStatus.Active
      case StepStatus.Waiting:
        return DeepWorkNodeStatus.Waiting
      case StepStatus.Pending:
      default:
        return isActionable ? DeepWorkNodeStatus.Pending : DeepWorkNodeStatus.Blocked
    }
  }

  return DeepWorkNodeStatus.Pending
}

/**
 * Find all node IDs that are currently actionable (can be started).
 *
 * A node is actionable when:
 * 1. It is not completed or skipped
 * 2. All its intra-cluster dependencies (edges pointing to it) are completed/skipped
 * 3. No hard-block cross-workflow dependency has an incomplete blocking step
 */
export function findActionableNodeIds(
  nodes: Map<string, DeepWorkNodeWithData>,
  edges: DeepWorkEdge[],
): Set<string> {
  const actionable = new Set<string>()

  // Build a map of nodeId → set of dependency nodeIds (source nodes of edges targeting this node)
  const dependencyMap = new Map<string, Set<string>>()
  for (const id of nodes.keys()) {
    dependencyMap.set(id, new Set())
  }
  for (const edge of edges) {
    dependencyMap.get(edge.targetNodeId)?.add(edge.sourceNodeId)
  }

  for (const [nodeId, node] of nodes) {
    // Skip completed/skipped nodes
    if (node.task && !node.task.hasSteps && node.task.completed) continue
    if (node.step?.status === StepStatus.Completed) continue
    if (node.step?.status === StepStatus.Skipped) continue

    // Check if all dependencies are satisfied
    const deps = dependencyMap.get(nodeId)
    if (!deps || deps.size === 0) {
      // No dependencies — actionable
      actionable.add(nodeId)
      continue
    }

    const allDepsSatisfied = Array.from(deps).every((depNodeId) => {
      const depNode = nodes.get(depNodeId)
      if (!depNode) return true // Missing dependency node — treat as satisfied

      // Check if the dependency is completed
      if (depNode.task && !depNode.task.hasSteps) {
        return depNode.task.completed
      }
      if (depNode.step) {
        return depNode.step.status === StepStatus.Completed
          || depNode.step.status === StepStatus.Skipped
      }
      return false
    })

    if (allDepsSatisfied) {
      actionable.add(nodeId)
    }
  }

  return actionable
}

// =============================================================================
// Edge Validation Helpers
// =============================================================================

/**
 * Validate whether an edge can be created between two nodes.
 *
 * Returns an error message if the edge is invalid, or null if it's okay.
 */
export function validateEdgeCreation(
  sourceNodeId: string,
  targetNodeId: string,
  nodes: Map<string, DeepWorkNodeWithData>,
  edges: DeepWorkEdge[],
): string | null {
  // Self-loop check
  if (sourceNodeId === targetNodeId) {
    return 'Cannot create a dependency from a node to itself'
  }

  // Both nodes must exist
  if (!nodes.has(sourceNodeId)) {
    return `Source node ${sourceNodeId} not found on the board`
  }
  if (!nodes.has(targetNodeId)) {
    return `Target node ${targetNodeId} not found on the board`
  }

  // Duplicate edge check
  const duplicateExists = edges.some(
    (e) => e.sourceNodeId === sourceNodeId && e.targetNodeId === targetNodeId,
  )
  if (duplicateExists) {
    return 'This dependency already exists'
  }

  // Reverse edge check (A→B and B→A)
  const reverseExists = edges.some(
    (e) => e.sourceNodeId === targetNodeId && e.targetNodeId === sourceNodeId,
  )
  if (reverseExists) {
    return 'A reverse dependency already exists between these nodes'
  }

  // Cycle check
  if (wouldCreateCycle(edges, sourceNodeId, targetNodeId)) {
    return 'This dependency would create a circular dependency'
  }

  return null
}

/**
 * Build a dependency graph compatible with graph-utils from the board's edges.
 * Useful for topological sorting or critical path analysis on the full board.
 */
export function buildBoardDependencyGraph(
  nodes: Map<string, DeepWorkNodeWithData>,
  edges: DeepWorkEdge[],
): Map<string, string[]> {
  const nodeItems = Array.from(nodes.values()).map((node) => ({
    id: node.id,
    dependencies: [] as string[],
    duration: node.task?.duration ?? node.step?.duration ?? 0,
  }))

  // Populate dependencies from edges
  const depMap = new Map<string, string[]>()
  for (const item of nodeItems) {
    depMap.set(item.id, [])
  }
  for (const edge of edges) {
    const deps = depMap.get(edge.targetNodeId)
    if (deps) {
      deps.push(edge.sourceNodeId)
    }
  }

  // Merge into graph-utils format
  for (const item of nodeItems) {
    item.dependencies = depMap.get(item.id) ?? []
  }

  return buildDependencyGraph(nodeItems)
}
