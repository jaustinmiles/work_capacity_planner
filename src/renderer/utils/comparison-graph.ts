import { Task } from '@shared/types'

// Type alias for task/workflow IDs
export type ItemId = Task['id']

// Comparison result structure
export interface ComparisonResult {
  itemA: ItemId
  itemB: ItemId
  higherPriority: ItemId | null
  higherUrgency: ItemId | null
  timestamp: number
}

// Graph structure for tracking wins/losses
export interface ComparisonGraph {
  priorityWins: Map<ItemId, Set<ItemId>>  // task -> tasks it beats in priority
  urgencyWins: Map<ItemId, Set<ItemId>>   // task -> tasks it beats in urgency
}

/**
 * Build adjacency list graph from comparison results
 */
export function buildComparisonGraph(comparisons: ComparisonResult[]): ComparisonGraph {
  const priorityWins = new Map<ItemId, Set<ItemId>>()
  const urgencyWins = new Map<ItemId, Set<ItemId>>()

  comparisons.forEach(comp => {
    // Build priority graph
    if (comp.higherPriority) {
      if (!priorityWins.has(comp.higherPriority)) {
        priorityWins.set(comp.higherPriority, new Set())
      }
      const loser = comp.higherPriority === comp.itemA ? comp.itemB : comp.itemA
      priorityWins.get(comp.higherPriority)!.add(loser)
    }

    // Build urgency graph
    if (comp.higherUrgency) {
      if (!urgencyWins.has(comp.higherUrgency)) {
        urgencyWins.set(comp.higherUrgency, new Set())
      }
      const loser = comp.higherUrgency === comp.itemA ? comp.itemB : comp.itemA
      urgencyWins.get(comp.higherUrgency)!.add(loser)
    }
  })

  return { priorityWins, urgencyWins }
}

/**
 * Detect if adding a new edge would create a cycle using DFS
 * @param graph - The current graph
 * @param winner - The winning node
 * @param loser - The losing node
 * @returns true if adding winner->loser would create a cycle
 */
export function detectCycle(
  graph: Map<ItemId, Set<ItemId>>,
  winner: ItemId,
  loser: ItemId,
): boolean {
  // Check if adding edge winner->loser creates a cycle
  // This happens if there's already a path from loser to winner
  const visited = new Set<ItemId>()
  const stack: ItemId[] = [loser]

  while (stack.length > 0) {
    const current = stack.pop()!
    if (current === winner) {
      return true // Found cycle!
    }

    if (!visited.has(current)) {
      visited.add(current)
      const neighbors = graph.get(current)
      if (neighbors) {
        stack.push(...Array.from(neighbors))
      }
    }
  }

  return false
}

/**
 * Check if there's a known relationship between two items through transitivity
 * @param graph - The comparison graph
 * @param itemA - First item
 * @param itemB - Second item
 * @returns 'A_wins' if A transitively beats B, 'B_wins' if B beats A, 'unknown' otherwise
 */
export function hasTransitiveRelationship(
  graph: Map<ItemId, Set<ItemId>>,
  itemA: ItemId,
  itemB: ItemId,
): 'A_wins' | 'B_wins' | 'unknown' {
  // Check if there's a path from A to B (A beats B transitively)
  if (hasPath(graph, itemA, itemB)) {
    return 'A_wins'
  }

  // Check if there's a path from B to A (B beats A transitively)
  if (hasPath(graph, itemB, itemA)) {
    return 'B_wins'
  }

  return 'unknown'
}

/**
 * Check if there's a path from source to target using DFS
 */
function hasPath(
  graph: Map<ItemId, Set<ItemId>>,
  source: ItemId,
  target: ItemId,
): boolean {
  const visited = new Set<ItemId>()
  const stack: ItemId[] = [source]

  while (stack.length > 0) {
    const current = stack.pop()!
    if (current === target) {
      return true
    }

    if (!visited.has(current)) {
      visited.add(current)
      const neighbors = graph.get(current)
      if (neighbors) {
        stack.push(...Array.from(neighbors))
      }
    }
  }

  return false
}

/**
 * Find all items reachable from a given item (transitive closure)
 * Returns all items that are transitively beaten by the source item
 */
export function getTransitiveClosure(
  graph: Map<ItemId, Set<ItemId>>,
  source: ItemId,
): Set<ItemId> {
  const visited = new Set<ItemId>()
  const stack: ItemId[] = [source]

  while (stack.length > 0) {
    const current = stack.pop()!

    if (!visited.has(current)) {
      visited.add(current)
      const neighbors = graph.get(current)
      if (neighbors) {
        stack.push(...Array.from(neighbors))
      }
    }
  }

  // Remove the source itself from the result
  visited.delete(source)
  return visited
}

/**
 * Get the minimum spanning tree edges needed to connect all items
 * Returns pairs that still need to be compared to achieve full connectivity
 */
export function getMissingComparisons(
  items: ItemId[],
  graph: ComparisonGraph,
): Array<[ItemId, ItemId]> {
  const missingPairs: Array<[ItemId, ItemId]> = []

  // Check all possible pairs
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const itemA = items[i]
      const itemB = items[j]

      // Check if we know the priority relationship
      const priorityRel = hasTransitiveRelationship(graph.priorityWins, itemA, itemB)
      // Check if we know the urgency relationship
      const urgencyRel = hasTransitiveRelationship(graph.urgencyWins, itemA, itemB)

      // If either relationship is unknown, we need this comparison
      if (priorityRel === 'unknown' || urgencyRel === 'unknown') {
        missingPairs.push([itemA, itemB])
      }
    }
  }

  return missingPairs
}
