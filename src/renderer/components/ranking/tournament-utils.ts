/**
 * Pure utilities for the bracket-tournament ranking flow.
 *
 * Four functions, all stateless:
 *   - selectTournamentItems: pick the next N items most worth comparing.
 *   - seedRound1Pairs: build first-round pairings from picked items.
 *   - computeItemDepths: longest-path-from-source per item (returns undefined
 *     for items not in the wins graph at all). Shared between the partial-
 *     graph Apply algorithm and the DAG-bracket visualization.
 *   - computeRankingScores: depth-based 1-10 scores; throws if any item is
 *     unranked so the caller can guard the user.
 */

import { ComparisonType } from '@/shared/constants'
import { Task } from '@shared/types'
import { SequencedTask } from '@shared/sequencing-types'
import { EntityType } from '@shared/enums'
import {
  buildComparisonGraph,
  hasTransitiveRelationship,
  type ComparisonResult,
  type ItemId,
} from '../../utils/comparison-graph'

export type TournamentItem = {
  id: ItemId
  type: EntityType.Task | EntityType.Workflow
  data: Task | SequencedTask
}

export function getDimensionScore(item: TournamentItem, dim: ComparisonType): number {
  if (dim === ComparisonType.Priority) return (item.data as Task).importance ?? 5
  return (item.data as Task).urgency ?? 5
}

/**
 * Pick the next `sampleSize` items to put into a fresh tournament.
 * Priority (descending):
 *   1. items with the most unknown relationships (most info-gain potential),
 *   2. items with the fewest total comparisons (cover new ground first),
 *   3. lexicographic id (stable tiebreak for tests).
 * If `sampleSize > items.length`, returns all items.
 */
export function selectTournamentItems(
  items: TournamentItem[],
  comparisons: ComparisonResult[],
  dimension: ComparisonType,
  sampleSize: number,
): TournamentItem[] {
  if (items.length === 0 || sampleSize === 0) return []

  const graph = buildComparisonGraph(comparisons)
  const wins = dimension === ComparisonType.Priority ? graph.priorityWins : graph.urgencyWins
  const equals = dimension === ComparisonType.Priority ? graph.priorityEquals : graph.urgencyEquals

  const scored = items.map(item => {
    let unknown = 0
    let known = 0
    for (const other of items) {
      if (other.id === item.id) continue
      const rel = hasTransitiveRelationship(wins, equals, item.id, other.id)
      if (rel === 'unknown') unknown += 1
      else known += 1
    }
    return { item, unknown, known }
  })

  scored.sort((a, b) => {
    if (b.unknown !== a.unknown) return b.unknown - a.unknown
    const totalA = a.unknown + a.known
    const totalB = b.unknown + b.known
    if (totalA !== totalB) return totalA - totalB // fewer total comparisons first
    return a.item.id < b.item.id ? -1 : 1
  })

  return scored.slice(0, Math.min(sampleSize, items.length)).map(s => s.item)
}

/**
 * Pair the picked items for the first round of the tournament. Sort by
 * current dimension score (desc) and pair adjacent. For N items returns
 * floor(N/2) pairs — odd item gets a bye, the caller decides what to do
 * (in practice we only call this with even N).
 */
export function seedRound1Pairs(
  items: TournamentItem[],
  dimension: ComparisonType,
): Array<[ItemId, ItemId]> {
  if (items.length < 2) return []
  const sorted = [...items].sort((a, b) => getDimensionScore(b, dimension) - getDimensionScore(a, dimension))
  const pairs: Array<[ItemId, ItemId]> = []
  for (let i = 0; i + 1 < sorted.length; i += 2) {
    pairs.push([sorted[i]!.id, sorted[i + 1]!.id])
  }
  return pairs
}

/**
 * For each item, compute the longest path from any source (in-degree 0) to
 * it, walking the wins-direction. Returns undefined for items that aren't
 * present in the graph (no comparisons in or out).
 *
 * The "longest path" is what makes this depth-from-top consistent across
 * disjoint subgraphs: two unrelated 3-chains both produce depths [0, 1, 2].
 */
export function computeItemDepths(
  items: ItemId[],
  winsGraph: Map<ItemId, Set<ItemId>>,
): Map<ItemId, number | undefined> {
  // beatenBy[x] = set of items that directly beat x
  const beatenBy = new Map<ItemId, Set<ItemId>>()
  const seen = new Set<ItemId>()
  for (const id of items) beatenBy.set(id, new Set())
  winsGraph.forEach((losers, winner) => {
    if (beatenBy.has(winner)) seen.add(winner)
    losers.forEach(loser => {
      if (beatenBy.has(loser)) {
        beatenBy.get(loser)!.add(winner)
        seen.add(loser)
      }
    })
  })

  const depth = new Map<ItemId, number | undefined>()
  const inProgress = new Set<ItemId>()

  function depthOf(id: ItemId): number {
    if (depth.has(id)) return depth.get(id) as number
    if (inProgress.has(id)) return 0 // cycle guard
    inProgress.add(id)
    const beaters = beatenBy.get(id)
    let max = 0
    if (beaters && beaters.size > 0) {
      for (const b of beaters) max = Math.max(max, depthOf(b) + 1)
    }
    inProgress.delete(id)
    depth.set(id, max)
    return max
  }

  for (const id of items) {
    if (seen.has(id)) depthOf(id)
    else depth.set(id, undefined)
  }
  return depth
}

/**
 * Compute 1-10 ranking scores from the comparison graph using depth-based
 * leveling. Items at the same depth across disjoint subgraphs get the same
 * score (two 3-chains both produce [10, 5, 1]).
 *
 * Throws if any item is unranked (has no comparisons in this dimension);
 * the caller must guard.
 */
export function computeRankingScores(
  items: ItemId[],
  comparisons: ComparisonResult[],
  dimension: ComparisonType,
): Map<ItemId, number> {
  const graph = buildComparisonGraph(comparisons)
  const wins = dimension === ComparisonType.Priority ? graph.priorityWins : graph.urgencyWins
  const depths = computeItemDepths(items, wins)

  // An item with only equality comparisons isn't in the wins graph (so
  // computeItemDepths returns undefined for it), but it IS ranked — fill it
  // in at depth 0 so it counts as a "source" of its component.
  const seenIds = new Set<ItemId>()
  for (const c of comparisons) {
    const value = dimension === ComparisonType.Priority ? c.higherPriority : c.higherUrgency
    if (value !== null) {
      seenIds.add(c.itemA)
      seenIds.add(c.itemB)
    }
  }
  for (const id of items) {
    if (depths.get(id) === undefined && seenIds.has(id)) {
      depths.set(id, 0)
    }
  }

  const unranked = items.filter(id => depths.get(id) === undefined)
  if (unranked.length > 0) {
    throw new UnrankedItemsError(unranked)
  }

  let maxDepth = 0
  for (const v of depths.values()) {
    if (typeof v === 'number' && v > maxDepth) maxDepth = v
  }

  const scores = new Map<ItemId, number>()
  for (const id of items) {
    const d = depths.get(id) as number
    if (maxDepth === 0) {
      scores.set(id, 10)
    } else {
      const raw = 10 - (9 * d / maxDepth)
      scores.set(id, Math.max(1, Math.min(10, Math.round(raw))))
    }
  }
  return scores
}

/**
 * Thrown by computeRankingScores when one or more items have no
 * comparisons in the active dimension. The unranked ids are attached so
 * the UI can name them in a warning.
 */
export class UnrankedItemsError extends Error {
  constructor(public readonly unrankedIds: ItemId[]) {
    super(`${unrankedIds.length} item(s) have no comparisons yet`)
    this.name = 'UnrankedItemsError'
  }
}
