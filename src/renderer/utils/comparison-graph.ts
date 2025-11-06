import { Task } from '@shared/types'

// Type alias for task/workflow IDs
export type ItemId = Task['id']

// Comparison result structure
export interface ComparisonResult {
  itemA: ItemId
  itemB: ItemId
  higherPriority: ItemId | null | 'equal'  // null = not answered, 'equal' = equal, ItemId = winner
  higherUrgency: ItemId | null | 'equal'
  timestamp: number
}

// Graph structure for tracking wins/losses and equality
export interface ComparisonGraph {
  priorityWins: Map<ItemId, Set<ItemId>>  // task -> tasks it beats in priority
  urgencyWins: Map<ItemId, Set<ItemId>>   // task -> tasks it beats in urgency
  priorityEquals: Map<ItemId, Set<ItemId>>  // task -> tasks equal in priority
  urgencyEquals: Map<ItemId, Set<ItemId>>   // task -> tasks equal in urgency
}

/**
 * Build adjacency list graph from comparison results
 */
export function buildComparisonGraph(comparisons: ComparisonResult[]): ComparisonGraph {
  const priorityWins = new Map<ItemId, Set<ItemId>>()
  const urgencyWins = new Map<ItemId, Set<ItemId>>()
  const priorityEquals = new Map<ItemId, Set<ItemId>>()
  const urgencyEquals = new Map<ItemId, Set<ItemId>>()

  comparisons.forEach(comp => {
    // Build priority graph
    if (comp.higherPriority === 'equal') {
      // Add bidirectional equality relationship
      if (!priorityEquals.has(comp.itemA)) {
        priorityEquals.set(comp.itemA, new Set())
      }
      if (!priorityEquals.has(comp.itemB)) {
        priorityEquals.set(comp.itemB, new Set())
      }
      priorityEquals.get(comp.itemA)!.add(comp.itemB)
      priorityEquals.get(comp.itemB)!.add(comp.itemA)
    } else if (comp.higherPriority && comp.higherPriority !== 'equal') {
      if (!priorityWins.has(comp.higherPriority)) {
        priorityWins.set(comp.higherPriority, new Set())
      }
      const loser = comp.higherPriority === comp.itemA ? comp.itemB : comp.itemA
      priorityWins.get(comp.higherPriority)!.add(loser)
    }

    // Build urgency graph
    if (comp.higherUrgency === 'equal') {
      // Add bidirectional equality relationship
      if (!urgencyEquals.has(comp.itemA)) {
        urgencyEquals.set(comp.itemA, new Set())
      }
      if (!urgencyEquals.has(comp.itemB)) {
        urgencyEquals.set(comp.itemB, new Set())
      }
      urgencyEquals.get(comp.itemA)!.add(comp.itemB)
      urgencyEquals.get(comp.itemB)!.add(comp.itemA)
    } else if (comp.higherUrgency && comp.higherUrgency !== 'equal') {
      if (!urgencyWins.has(comp.higherUrgency)) {
        urgencyWins.set(comp.higherUrgency, new Set())
      }
      const loser = comp.higherUrgency === comp.itemA ? comp.itemB : comp.itemA
      urgencyWins.get(comp.higherUrgency)!.add(loser)
    }
  })

  return { priorityWins, urgencyWins, priorityEquals, urgencyEquals }
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
 * Including equality relationships (if A=B and B>C, then A>C)
 * @param winsGraph - The wins graph
 * @param equalsGraph - The equality graph
 * @param itemA - First item
 * @param itemB - Second item
 * @returns 'A_wins', 'B_wins', 'equal', or 'unknown'
 */
export function hasTransitiveRelationship(
  winsGraph: Map<ItemId, Set<ItemId>>,
  equalsGraph: Map<ItemId, Set<ItemId>>,
  itemA: ItemId,
  itemB: ItemId,
): 'A_wins' | 'B_wins' | 'equal' | 'unknown' {
  // First check if they're equal (direct or transitive)
  if (areTransitivelyEqual(equalsGraph, itemA, itemB)) {
    return 'equal'
  }

  // Get all items equivalent to A and B
  const aEquivalents = getEquivalenceClass(equalsGraph, itemA)
  const bEquivalents = getEquivalenceClass(equalsGraph, itemB)

  // Check if any item in A's equivalence class beats any item in B's
  for (const aEquiv of aEquivalents) {
    for (const bEquiv of bEquivalents) {
      if (hasPath(winsGraph, aEquiv, bEquiv)) {
        return 'A_wins'
      }
      if (hasPath(winsGraph, bEquiv, aEquiv)) {
        return 'B_wins'
      }
    }
  }

  return 'unknown'
}

/**
 * Get all items transitively equal to the given item
 */
function getEquivalenceClass(
  equalsGraph: Map<ItemId, Set<ItemId>>,
  item: ItemId,
): Set<ItemId> {
  const equivalents = new Set<ItemId>([item])
  const stack = [item]

  while (stack.length > 0) {
    const current = stack.pop()!
    const equals = equalsGraph.get(current)
    if (equals) {
      equals.forEach(equal => {
        if (!equivalents.has(equal)) {
          equivalents.add(equal)
          stack.push(equal)
        }
      })
    }
  }

  return equivalents
}

/**
 * Check if two items are transitively equal
 */
function areTransitivelyEqual(
  equalsGraph: Map<ItemId, Set<ItemId>>,
  itemA: ItemId,
  itemB: ItemId,
): boolean {
  const aClass = getEquivalenceClass(equalsGraph, itemA)
  return aClass.has(itemB)
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

      // Skip self-comparisons (shouldn't happen with j = i+1, but safety check)
      if (itemA === itemB) {
        continue
      }

      // Check if we know the priority relationship (including equality)
      const priorityRel = hasTransitiveRelationship(
        graph.priorityWins,
        graph.priorityEquals || new Map(),
        itemA!,
        itemB!,
      )
      // Check if we know the urgency relationship (including equality)
      const urgencyRel = hasTransitiveRelationship(
        graph.urgencyWins,
        graph.urgencyEquals || new Map(),
        itemA!,
        itemB!,
      )

      // If either relationship is unknown, we need this comparison
      if (priorityRel === 'unknown' || urgencyRel === 'unknown') {
        missingPairs.push([itemA!, itemB!])
      }
    }
  }

  return missingPairs
}

/**
 * Rankings for items with 1-10 scores
 */
export interface ItemRanking {
  id: ItemId
  rank: number  // Position in sorted order (1st, 2nd, etc.)
  score: number // 1-10 mapped score
}

/**
 * Perform topological sort on comparison graph using Kahn's algorithm
 * Returns items sorted from highest to lowest (most wins to least wins)
 */
export function topologicalSort(
  items: ItemId[],
  winsGraph: Map<ItemId, Set<ItemId>>,
): ItemId[] {
  // Calculate in-degrees (how many items beat each item)
  const inDegree = new Map<ItemId, number>()
  items.forEach(item => inDegree.set(item, 0))

  // Count incoming edges for each node
  winsGraph.forEach(losers => {
    losers.forEach(loser => {
      const current = inDegree.get(loser) || 0
      inDegree.set(loser, current + 1)
    })
  })

  // Find all nodes with 0 in-degree (winners that aren't beaten by anyone)
  const queue: ItemId[] = []
  items.forEach(item => {
    if (inDegree.get(item) === 0) {
      queue.push(item)
    }
  })

  // Process the graph using Kahn's algorithm
  const sorted: ItemId[] = []

  while (queue.length > 0) {
    // Sort the current level by original order for stability
    queue.sort((a, b) => items.indexOf(a) - items.indexOf(b))
    const current = queue.shift()!
    sorted.push(current)

    // Reduce in-degree for items beaten by current
    const beaten = winsGraph.get(current)
    if (beaten) {
      beaten.forEach(loser => {
        const newDegree = (inDegree.get(loser) || 1) - 1
        inDegree.set(loser, newDegree)

        if (newDegree === 0) {
          queue.push(loser)
        }
      })
    }
  }

  // Handle any remaining items (in case of disconnected components)
  items.forEach(item => {
    if (!sorted.includes(item)) {
      sorted.push(item)
    }
  })

  return sorted
}

/**
 * Convert sorted items to 1-10 rankings with linear mapping
 */
export function mapToRankings(sortedItems: ItemId[]): ItemRanking[] {
  if (sortedItems.length === 0) return []
  if (sortedItems.length === 1) {
    return [{ id: sortedItems[0], rank: 1, score: 10 }]
  }

  const rankings: ItemRanking[] = []
  const maxScore = 10
  const minScore = 1
  const scoreRange = maxScore - minScore

  sortedItems.forEach((id, index) => {
    // Linear mapping from position to score
    // First item gets 10, last item gets 1
    const position = index / (sortedItems.length - 1)
    const score = Math.round(maxScore - (position * scoreRange))

    rankings.push({
      id,
      rank: index + 1,
      score: Math.max(minScore, Math.min(maxScore, score)),
    })
  })

  return rankings
}
