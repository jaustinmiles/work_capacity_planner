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
 * Check if there's a directed path from source to target in a wins graph.
 * Returns true iff source transitively beats target.
 */
export function hasPath(
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

// ============================================================================
// Tournament algorithm — smart pair selection, incremental insertion, state
// ============================================================================

/**
 * Counts of direct (non-transitive) wins and losses for each item.
 * Plus the transitive-closure stats and a "placed" set for items whose final
 * rank position is fully determined.
 */
export interface TournamentState {
  winCount: Map<ItemId, number>
  lossCount: Map<ItemId, number>
  /** Items whose relationship to every other item is known (direct or transitive). */
  placed: Set<ItemId>
  /** Pairs (i, j) with i < j whose relationship is known. */
  knownPairs: number
  totalPairs: number
  isComplete: boolean
}

/**
 * Compute per-item win/loss counts, fully-placed items, and progress for one
 * dimension. Used to drive the bracket UI and the next-pair heuristic.
 */
export function getTournamentState(
  items: ItemId[],
  winsGraph: Map<ItemId, Set<ItemId>>,
  equalsGraph: Map<ItemId, Set<ItemId>>,
): TournamentState {
  const winCount = new Map<ItemId, number>()
  const lossCount = new Map<ItemId, number>()
  const itemSet = new Set(items)
  items.forEach(id => {
    winCount.set(id, 0)
    lossCount.set(id, 0)
  })

  winsGraph.forEach((losers, winner) => {
    if (!itemSet.has(winner)) return
    let scopedWins = 0
    losers.forEach(loser => {
      if (!itemSet.has(loser)) return
      scopedWins += 1
      lossCount.set(loser, (lossCount.get(loser) ?? 0) + 1)
    })
    winCount.set(winner, (winCount.get(winner) ?? 0) + scopedWins)
  })

  const placed = new Set<ItemId>(items)
  let knownPairs = 0
  const totalPairs = items.length * (items.length - 1) / 2

  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const rel = hasTransitiveRelationship(winsGraph, equalsGraph, items[i]!, items[j]!)
      if (rel === 'unknown') {
        placed.delete(items[i]!)
        placed.delete(items[j]!)
      } else {
        knownPairs += 1
      }
    }
  }

  return {
    winCount,
    lossCount,
    placed,
    knownPairs,
    totalPairs,
    isComplete: knownPairs === totalPairs,
  }
}

/**
 * Options that tune selectNextPair() behavior.
 */
export interface SelectNextPairOptions {
  /**
   * Most-recently-compared items (ordered oldest → newest). Items appearing
   * recently are penalized so the same item doesn't anchor every matchup.
   */
  recentItems?: ItemId[]
}

/**
 * Pick the next pair to compare in a tournament. Returns null when every
 * pair's relationship is already known (directly or transitively).
 *
 * Heuristic (cheap, bracket-natural):
 *   - Only unknown pairs are candidates.
 *   - Prefer items with similar win/loss counts (tight matches → more info per
 *     comparison than top-vs-bottom matchups).
 *   - Prefer items with fewer total comparisons (need attention).
 *   - Penalize items that appeared in `recentItems` (anti-anchor): heaviest
 *     penalty for the most-recent, decaying for older entries.
 *   - Deterministic tiebreak by item ID for test stability.
 */
export function selectNextPair(
  items: ItemId[],
  winsGraph: Map<ItemId, Set<ItemId>>,
  equalsGraph: Map<ItemId, Set<ItemId>>,
  options: SelectNextPairOptions = {},
): [ItemId, ItemId] | null {
  if (items.length < 2) return null

  const state = getTournamentState(items, winsGraph, equalsGraph)
  if (state.isComplete) return null

  const recent = options.recentItems ?? []

  // Anti-anchor penalty: most recent = highest penalty (linear decay).
  // recent[recent.length-1] gets penalty=recent.length, recent[0] gets penalty=1.
  function anchorPenalty(id: ItemId): number {
    const idx = recent.lastIndexOf(id)
    if (idx === -1) return 0
    return idx + 1
  }

  let bestScore = -Infinity
  let bestPair: [ItemId, ItemId] | null = null

  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i]!
      const b = items[j]!
      const rel = hasTransitiveRelationship(winsGraph, equalsGraph, a, b)
      if (rel !== 'unknown') continue

      const winsA = state.winCount.get(a) ?? 0
      const winsB = state.winCount.get(b) ?? 0
      const lossesA = state.lossCount.get(a) ?? 0
      const lossesB = state.lossCount.get(b) ?? 0
      const totalA = winsA + lossesA
      const totalB = winsB + lossesB

      // Higher is better.
      const balance = -(Math.abs(winsA - winsB) + Math.abs(lossesA - lossesB))
      const underComparedBonus = -Math.min(totalA, totalB)
      const anchor = -(anchorPenalty(a) + anchorPenalty(b)) * 2

      const score = balance + underComparedBonus + anchor

      if (
        score > bestScore ||
        (score === bestScore && bestPair !== null && (
          a < bestPair[0] ||
          (a === bestPair[0] && b < bestPair[1])
        ))
      ) {
        bestScore = score
        bestPair = [a, b]
      }
    }
  }

  return bestPair
}

/**
 * Pick the next comparison that places `newItemId` into the existing ranking
 * via binary-search-style probing. Assumes `sortedItems` is a topological
 * sort (highest → lowest) of the current ranked items.
 *
 * Returns null when newItemId's position is fully bracketed (no probe needed).
 */
export function insertNewItem(
  newItemId: ItemId,
  sortedItems: ItemId[],
  winsGraph: Map<ItemId, Set<ItemId>>,
): [ItemId, ItemId] | null {
  const list = sortedItems.filter(id => id !== newItemId)
  if (list.length === 0) return null

  // lo: largest index i such that list[i] transitively beats newItemId
  //     (newItemId must rank strictly after lo)
  // hi: smallest index i such that newItemId transitively beats list[i]
  //     (newItemId must rank strictly before hi)
  let lo = -1
  let hi = list.length
  for (let i = 0; i < list.length; i++) {
    const item = list[i]!
    if (hasPath(winsGraph, item, newItemId)) {
      if (i > lo) lo = i
    }
    if (hasPath(winsGraph, newItemId, item)) {
      if (i < hi) hi = i
    }
  }

  // Position is locked when the open interval (lo, hi) is empty.
  if (lo + 1 >= hi) return null

  const mid = Math.floor((lo + hi) / 2)
  return [newItemId, list[mid]!]
}

/**
 * Convert sorted items to 1-10 rankings with linear mapping
 */
export function mapToRankings(sortedItems: ItemId[]): ItemRanking[] {
  if (sortedItems.length === 0) return []
  const firstItem = sortedItems[0]
  if (sortedItems.length === 1 && firstItem !== undefined) {
    return [{ id: firstItem, rank: 1, score: 10 }]
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
