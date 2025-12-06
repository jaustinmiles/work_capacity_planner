import { describe, it, expect } from 'vitest'
import {
  buildComparisonGraph,
  detectCycle,
  hasTransitiveRelationship,
  getTransitiveClosure,
  getMissingComparisons,
  topologicalSort,
  mapToRankings,
  type ComparisonResult,
  type ItemId,
} from '../comparison-graph'

describe('comparison-graph', () => {
  describe('buildComparisonGraph', () => {
    it('should build empty graph for no comparisons', () => {
      const graph = buildComparisonGraph([])
      expect(graph.priorityWins.size).toBe(0)
      expect(graph.urgencyWins.size).toBe(0)
    })

    it('should build graph from single comparison', () => {
      const comparisons: ComparisonResult[] = [{
        itemA: 'task1',
        itemB: 'task2',
        higherPriority: 'task1',
        higherUrgency: 'task2',
        timestamp: Date.now(),
      }]

      const graph = buildComparisonGraph(comparisons)

      expect(graph.priorityWins.get('task1')).toEqual(new Set(['task2']))
      expect(graph.priorityWins.get('task2')).toBeUndefined()
      expect(graph.urgencyWins.get('task2')).toEqual(new Set(['task1']))
      expect(graph.urgencyWins.get('task1')).toBeUndefined()
    })

    it('should accumulate multiple wins for same winner', () => {
      const comparisons: ComparisonResult[] = [
        {
          itemA: 'task1',
          itemB: 'task2',
          higherPriority: 'task1',
          higherUrgency: 'task1',
          timestamp: Date.now(),
        },
        {
          itemA: 'task1',
          itemB: 'task3',
          higherPriority: 'task1',
          higherUrgency: 'task1',
          timestamp: Date.now(),
        },
      ]

      const graph = buildComparisonGraph(comparisons)

      expect(graph.priorityWins.get('task1')).toEqual(new Set(['task2', 'task3']))
      expect(graph.urgencyWins.get('task1')).toEqual(new Set(['task2', 'task3']))
    })

    it('should handle null comparison results', () => {
      const comparisons: ComparisonResult[] = [{
        itemA: 'task1',
        itemB: 'task2',
        higherPriority: null,
        higherUrgency: null,
        timestamp: Date.now(),
      }]

      const graph = buildComparisonGraph(comparisons)

      expect(graph.priorityWins.size).toBe(0)
      expect(graph.urgencyWins.size).toBe(0)
    })

    it('should handle equal priority relationships', () => {
      const comparisons: ComparisonResult[] = [{
        itemA: 'task1',
        itemB: 'task2',
        higherPriority: 'equal' as any,
        higherUrgency: 'task1',
        timestamp: Date.now(),
      }]

      const graph = buildComparisonGraph(comparisons)

      // Priority is equal, so neither wins
      expect(graph.priorityWins.size).toBe(0)
      // But equality should be tracked
      expect(graph.priorityEquals.get('task1')).toContain('task2')
      expect(graph.priorityEquals.get('task2')).toContain('task1')
      // Urgency still has a winner
      expect(graph.urgencyWins.get('task1')).toContain('task2')
    })

    it('should handle equal urgency relationships', () => {
      const comparisons: ComparisonResult[] = [{
        itemA: 'task1',
        itemB: 'task2',
        higherPriority: 'task1',
        higherUrgency: 'equal' as any,
        timestamp: Date.now(),
      }]

      const graph = buildComparisonGraph(comparisons)

      // Priority has a winner
      expect(graph.priorityWins.get('task1')).toContain('task2')
      // Urgency is equal
      expect(graph.urgencyWins.size).toBe(0)
      expect(graph.urgencyEquals.get('task1')).toContain('task2')
      expect(graph.urgencyEquals.get('task2')).toContain('task1')
    })

    it('should accumulate multiple equal relationships', () => {
      const comparisons: ComparisonResult[] = [
        {
          itemA: 'task1',
          itemB: 'task2',
          higherPriority: 'equal' as any,
          higherUrgency: 'equal' as any,
          timestamp: Date.now(),
        },
        {
          itemA: 'task1',
          itemB: 'task3',
          higherPriority: 'equal' as any,
          higherUrgency: 'equal' as any,
          timestamp: Date.now(),
        },
      ]

      const graph = buildComparisonGraph(comparisons)

      // task1 is equal to both task2 and task3
      expect(graph.priorityEquals.get('task1')).toContain('task2')
      expect(graph.priorityEquals.get('task1')).toContain('task3')
      expect(graph.urgencyEquals.get('task1')).toContain('task2')
      expect(graph.urgencyEquals.get('task1')).toContain('task3')
    })

    it('should handle complex graph with multiple winners and losers', () => {
      const comparisons: ComparisonResult[] = [
        {
          itemA: 'A',
          itemB: 'B',
          higherPriority: 'A',
          higherUrgency: 'A',
          timestamp: Date.now(),
        },
        {
          itemA: 'B',
          itemB: 'C',
          higherPriority: 'B',
          higherUrgency: 'C',
          timestamp: Date.now(),
        },
        {
          itemA: 'A',
          itemB: 'C',
          higherPriority: 'A',
          higherUrgency: 'C',
          timestamp: Date.now(),
        },
      ]

      const graph = buildComparisonGraph(comparisons)

      // Priority: A beats B and C, B beats C
      expect(graph.priorityWins.get('A')).toEqual(new Set(['B', 'C']))
      expect(graph.priorityWins.get('B')).toEqual(new Set(['C']))
      expect(graph.priorityWins.get('C')).toBeUndefined()

      // Urgency: A beats B, C beats B and A
      expect(graph.urgencyWins.get('A')).toEqual(new Set(['B']))
      expect(graph.urgencyWins.get('C')).toEqual(new Set(['B', 'A']))
      expect(graph.urgencyWins.get('B')).toBeUndefined()
    })
  })

  describe('detectCycle', () => {
    it('should detect direct cycle', () => {
      const graph = new Map<ItemId, Set<ItemId>>([
        ['A', new Set(['B'])],
        ['B', new Set(['C'])],
      ])

      // Adding C -> A would create cycle A -> B -> C -> A
      expect(detectCycle(graph, 'C', 'A')).toBe(true)
    })

    it('should detect indirect cycle through multiple nodes', () => {
      const graph = new Map<ItemId, Set<ItemId>>([
        ['A', new Set(['B'])],
        ['B', new Set(['C'])],
        ['C', new Set(['D'])],
        ['D', new Set(['E'])],
      ])

      // Adding E -> A would create cycle
      expect(detectCycle(graph, 'E', 'A')).toBe(true)
    })

    it('should not detect cycle when none exists', () => {
      const graph = new Map<ItemId, Set<ItemId>>([
        ['A', new Set(['B'])],
        ['C', new Set(['D'])],
      ])

      // Adding B -> C doesn't create cycle
      expect(detectCycle(graph, 'B', 'C')).toBe(false)
    })

    it('should not detect self-loop as cycle when adding new edge', () => {
      const graph = new Map<ItemId, Set<ItemId>>([
        ['A', new Set(['B'])],
      ])

      // Adding A -> C doesn't create cycle (even though A already exists)
      expect(detectCycle(graph, 'A', 'C')).toBe(false)
    })

    it('should handle empty graph', () => {
      const graph = new Map<ItemId, Set<ItemId>>()
      expect(detectCycle(graph, 'A', 'B')).toBe(false)
    })

    it('should detect cycle in complex graph', () => {
      const graph = new Map<ItemId, Set<ItemId>>([
        ['A', new Set(['B', 'C'])],
        ['B', new Set(['D'])],
        ['C', new Set(['E'])],
        ['D', new Set(['F'])],
        ['E', new Set(['F'])],
        ['F', new Set(['G'])],
      ])

      // Adding G -> A would create cycle
      expect(detectCycle(graph, 'G', 'A')).toBe(true)
      // Adding G -> H would not create cycle
      expect(detectCycle(graph, 'G', 'H')).toBe(false)
    })
  })

  describe('hasTransitiveRelationship', () => {
    it('should find direct relationship', () => {
      const graph = new Map<ItemId, Set<ItemId>>([
        ['A', new Set(['B'])],
      ])

      expect(hasTransitiveRelationship(graph, new Map(), 'A', 'B')).toBe('A_wins')
      expect(hasTransitiveRelationship(graph, new Map(), 'B', 'A')).toBe('B_wins')
    })

    it('should find transitive relationship through chain', () => {
      const graph = new Map<ItemId, Set<ItemId>>([
        ['A', new Set(['B'])],
        ['B', new Set(['C'])],
        ['C', new Set(['D'])],
      ])

      // A transitively beats D through B and C
      expect(hasTransitiveRelationship(graph, new Map(), 'A', 'D')).toBe('A_wins')
      expect(hasTransitiveRelationship(graph, new Map(), 'D', 'A')).toBe('B_wins')
    })

    it('should return unknown for unconnected nodes', () => {
      const graph = new Map<ItemId, Set<ItemId>>([
        ['A', new Set(['B'])],
        ['C', new Set(['D'])],
      ])

      expect(hasTransitiveRelationship(graph, new Map(), 'A', 'C')).toBe('unknown')
      expect(hasTransitiveRelationship(graph, new Map(), 'B', 'D')).toBe('unknown')
    })

    it('should handle complex graph with multiple paths', () => {
      const graph = new Map<ItemId, Set<ItemId>>([
        ['A', new Set(['B', 'C'])],
        ['B', new Set(['D'])],
        ['C', new Set(['D'])],
      ])

      // A beats D through multiple paths (B and C)
      expect(hasTransitiveRelationship(graph, new Map(), 'A', 'D')).toBe('A_wins')
      expect(hasTransitiveRelationship(graph, new Map(), 'D', 'A')).toBe('B_wins')
    })

    it('should handle empty graph', () => {
      const graph = new Map<ItemId, Set<ItemId>>()
      expect(hasTransitiveRelationship(graph, new Map(), 'A', 'B')).toBe('unknown')
    })
  })

  describe('getTransitiveClosure', () => {
    it('should return empty set for node with no edges', () => {
      const graph = new Map<ItemId, Set<ItemId>>([
        ['A', new Set()],
      ])

      const closure = getTransitiveClosure(graph, 'A')
      expect(closure.size).toBe(0)
    })

    it('should return direct children only', () => {
      const graph = new Map<ItemId, Set<ItemId>>([
        ['A', new Set(['B', 'C'])],
      ])

      const closure = getTransitiveClosure(graph, 'A')
      expect(closure).toEqual(new Set(['B', 'C']))
    })

    it('should return all transitively reachable nodes', () => {
      const graph = new Map<ItemId, Set<ItemId>>([
        ['A', new Set(['B'])],
        ['B', new Set(['C'])],
        ['C', new Set(['D'])],
      ])

      const closure = getTransitiveClosure(graph, 'A')
      expect(closure).toEqual(new Set(['B', 'C', 'D']))
    })

    it('should handle diamond-shaped graph (multiple paths)', () => {
      const graph = new Map<ItemId, Set<ItemId>>([
        ['A', new Set(['B', 'C'])],
        ['B', new Set(['D'])],
        ['C', new Set(['D'])],
        ['D', new Set(['E'])],
      ])

      const closure = getTransitiveClosure(graph, 'A')
      expect(closure).toEqual(new Set(['B', 'C', 'D', 'E']))
    })

    it('should not include the source node itself', () => {
      const graph = new Map<ItemId, Set<ItemId>>([
        ['A', new Set(['B'])],
        ['B', new Set(['A'])], // Creates a cycle
      ])

      const closure = getTransitiveClosure(graph, 'A')
      expect(closure).toEqual(new Set(['B']))
      expect(closure.has('A')).toBe(false)
    })

    it('should handle complex graph with cycles', () => {
      const graph = new Map<ItemId, Set<ItemId>>([
        ['A', new Set(['B', 'C'])],
        ['B', new Set(['D'])],
        ['C', new Set(['E'])],
        ['D', new Set(['F'])],
        ['E', new Set(['F'])],
        ['F', new Set(['B'])], // Creates cycle
      ])

      const closure = getTransitiveClosure(graph, 'A')
      expect(closure).toEqual(new Set(['B', 'C', 'D', 'E', 'F']))
    })

    it('should return empty set for non-existent node', () => {
      const graph = new Map<ItemId, Set<ItemId>>([
        ['A', new Set(['B'])],
      ])

      const closure = getTransitiveClosure(graph, 'Z')
      expect(closure.size).toBe(0)
    })
  })

  describe('getMissingComparisons', () => {
    it('should return all pairs for empty graph', () => {
      const items: ItemId[] = ['A', 'B', 'C']
      const graph = buildComparisonGraph([])

      const missing = getMissingComparisons(items, graph)

      // Should need all 3 pairs: AB, AC, BC
      expect(missing).toHaveLength(3)
      expect(missing).toContainEqual(['A', 'B'])
      expect(missing).toContainEqual(['A', 'C'])
      expect(missing).toContainEqual(['B', 'C'])
    })

    it('should exclude known direct relationships', () => {
      const items: ItemId[] = ['A', 'B', 'C']
      const comparisons: ComparisonResult[] = [
        {
          itemA: 'A',
          itemB: 'B',
          higherPriority: 'A',
          higherUrgency: 'A',
          timestamp: Date.now(),
        },
      ]
      const graph = buildComparisonGraph(comparisons)

      const missing = getMissingComparisons(items, graph)

      // Should need AC and BC (AB is known)
      expect(missing).toHaveLength(2)
      expect(missing).toContainEqual(['A', 'C'])
      expect(missing).toContainEqual(['B', 'C'])
    })

    it('should exclude transitive relationships', () => {
      const items: ItemId[] = ['A', 'B', 'C']
      const comparisons: ComparisonResult[] = [
        {
          itemA: 'A',
          itemB: 'B',
          higherPriority: 'A',
          higherUrgency: 'A',
          timestamp: Date.now(),
        },
        {
          itemA: 'B',
          itemB: 'C',
          higherPriority: 'B',
          higherUrgency: 'B',
          timestamp: Date.now(),
        },
      ]
      const graph = buildComparisonGraph(comparisons)

      const missing = getMissingComparisons(items, graph)

      // Should need no comparisons (AC is known transitively)
      expect(missing).toHaveLength(0)
    })

    it('should require comparison when only one dimension is known', () => {
      const items: ItemId[] = ['A', 'B']
      const comparisons: ComparisonResult[] = [
        {
          itemA: 'A',
          itemB: 'B',
          higherPriority: 'A',
          higherUrgency: null, // Only priority known
          timestamp: Date.now(),
        },
      ]
      const graph = buildComparisonGraph(comparisons)

      const missing = getMissingComparisons(items, graph)

      // Should still need AB comparison for urgency
      expect(missing).toHaveLength(1)
      expect(missing).toContainEqual(['A', 'B'])
    })

    it('should handle complex graph with partial connectivity', () => {
      const items: ItemId[] = ['A', 'B', 'C', 'D', 'E']
      const comparisons: ComparisonResult[] = [
        // A beats B in both dimensions
        {
          itemA: 'A',
          itemB: 'B',
          higherPriority: 'A',
          higherUrgency: 'A',
          timestamp: Date.now(),
        },
        // B beats C in both dimensions
        {
          itemA: 'B',
          itemB: 'C',
          higherPriority: 'B',
          higherUrgency: 'B',
          timestamp: Date.now(),
        },
        // D beats E in priority only
        {
          itemA: 'D',
          itemB: 'E',
          higherPriority: 'D',
          higherUrgency: null,
          timestamp: Date.now(),
        },
      ]
      const graph = buildComparisonGraph(comparisons)

      const missing = getMissingComparisons(items, graph)

      // AC is known transitively
      // Need: AD, AE, BD, BE, CD, CE, and DE (for urgency)
      expect(missing).toHaveLength(7)
    })

    it('should handle empty items array', () => {
      const items: ItemId[] = []
      const graph = buildComparisonGraph([])

      const missing = getMissingComparisons(items, graph)
      expect(missing).toHaveLength(0)
    })

    it('should handle single item', () => {
      const items: ItemId[] = ['A']
      const graph = buildComparisonGraph([])

      const missing = getMissingComparisons(items, graph)
      expect(missing).toHaveLength(0)
    })
  })

  describe('Integration tests', () => {
    it('should handle real-world scenario with multiple comparisons', () => {
      const comparisons: ComparisonResult[] = [
        {
          itemA: 'HighPriority',
          itemB: 'MediumPriority',
          higherPriority: 'HighPriority',
          higherUrgency: 'HighPriority',
          timestamp: Date.now(),
        },
        {
          itemA: 'MediumPriority',
          itemB: 'LowPriority',
          higherPriority: 'MediumPriority',
          higherUrgency: 'LowPriority', // Low is more urgent!
          timestamp: Date.now(),
        },
      ]

      const graph = buildComparisonGraph(comparisons)

      // Check priority chain: High > Medium > Low
      expect(hasTransitiveRelationship(graph.priorityWins, graph.priorityEquals, 'HighPriority', 'LowPriority'))
        .toBe('A_wins')

      // Check urgency: High > Medium, but Low > Medium
      expect(hasTransitiveRelationship(graph.urgencyWins, graph.urgencyEquals, 'HighPriority', 'LowPriority'))
        .toBe('unknown') // No transitive relationship

      // Check transitive closure
      const highPriorityClosure = getTransitiveClosure(graph.priorityWins, 'HighPriority')
      expect(highPriorityClosure).toEqual(new Set(['MediumPriority', 'LowPriority']))
    })

    it('should detect inconsistency when user provides conflicting comparisons', () => {
      const graph = new Map<ItemId, Set<ItemId>>([
        ['Rock', new Set(['Scissors'])],
        ['Scissors', new Set(['Paper'])],
        ['Paper', new Set(['Rock'])],
      ])

      // Any new comparison would create or maintain a cycle
      expect(detectCycle(graph, 'Rock', 'Paper')).toBe(true) // Would create cycle
      expect(detectCycle(graph, 'Paper', 'Scissors')).toBe(true) // Would create cycle
    })
  })

  describe('topologicalSort', () => {
    it('should sort items with no dependencies', () => {
      const items: ItemId[] = ['A', 'B', 'C']
      const graph = new Map<ItemId, Set<ItemId>>()

      const sorted = topologicalSort(items, graph)

      // Should return items in some valid order (all are valid with no deps)
      expect(sorted).toHaveLength(3)
      expect(sorted).toContain('A')
      expect(sorted).toContain('B')
      expect(sorted).toContain('C')
    })

    it('should sort items respecting dependencies', () => {
      const items: ItemId[] = ['A', 'B', 'C']
      const graph = new Map<ItemId, Set<ItemId>>([
        ['A', new Set(['B'])], // A beats B
        ['B', new Set(['C'])], // B beats C
      ])

      const sorted = topologicalSort(items, graph)

      // A should come before B, B should come before C
      expect(sorted.indexOf('A')).toBeLessThan(sorted.indexOf('B'))
      expect(sorted.indexOf('B')).toBeLessThan(sorted.indexOf('C'))
    })

    it('should handle empty items array', () => {
      const items: ItemId[] = []
      const graph = new Map<ItemId, Set<ItemId>>()

      const sorted = topologicalSort(items, graph)
      expect(sorted).toHaveLength(0)
    })

    it('should handle complex dependency graph', () => {
      const items: ItemId[] = ['A', 'B', 'C', 'D', 'E']
      const graph = new Map<ItemId, Set<ItemId>>([
        ['A', new Set(['B', 'C'])], // A beats B and C
        ['B', new Set(['D'])],      // B beats D
        ['C', new Set(['D'])],      // C beats D
        ['D', new Set(['E'])],      // D beats E
      ])

      const sorted = topologicalSort(items, graph)

      // A must come before B, C
      // B, C must come before D
      // D must come before E
      expect(sorted.indexOf('A')).toBeLessThan(sorted.indexOf('B'))
      expect(sorted.indexOf('A')).toBeLessThan(sorted.indexOf('C'))
      expect(sorted.indexOf('B')).toBeLessThan(sorted.indexOf('D'))
      expect(sorted.indexOf('C')).toBeLessThan(sorted.indexOf('D'))
      expect(sorted.indexOf('D')).toBeLessThan(sorted.indexOf('E'))
    })

    it('should handle single item', () => {
      const items: ItemId[] = ['Alone']
      const graph = new Map<ItemId, Set<ItemId>>()

      const sorted = topologicalSort(items, graph)

      expect(sorted).toEqual(['Alone'])
    })

    it('should handle items with self-referential graph entry', () => {
      const items: ItemId[] = ['A', 'B']
      const graph = new Map<ItemId, Set<ItemId>>([
        ['A', new Set(['B'])],
        ['B', new Set()], // B has entry but beats no one
      ])

      const sorted = topologicalSort(items, graph)

      expect(sorted.indexOf('A')).toBeLessThan(sorted.indexOf('B'))
    })

    it('should include items not in graph', () => {
      const items: ItemId[] = ['A', 'B', 'C']
      const graph = new Map<ItemId, Set<ItemId>>([
        ['A', new Set(['B'])],
        // C is not in graph at all
      ])

      const sorted = topologicalSort(items, graph)

      expect(sorted).toContain('A')
      expect(sorted).toContain('B')
      expect(sorted).toContain('C')
      expect(sorted.indexOf('A')).toBeLessThan(sorted.indexOf('B'))
    })
  })

  describe('mapToRankings', () => {
    it('should map sorted items to rankings', () => {
      const sortedItems: ItemId[] = ['A', 'B', 'C']

      const rankings = mapToRankings(sortedItems)

      expect(rankings).toHaveLength(3)
      expect(rankings[0]).toMatchObject({ id: 'A', rank: 1 })
      expect(rankings[1]).toMatchObject({ id: 'B', rank: 2 })
      expect(rankings[2]).toMatchObject({ id: 'C', rank: 3 })
    })

    it('should handle empty array', () => {
      const sortedItems: ItemId[] = []

      const rankings = mapToRankings(sortedItems)

      expect(rankings).toHaveLength(0)
    })

    it('should handle single item', () => {
      const sortedItems: ItemId[] = ['Only']

      const rankings = mapToRankings(sortedItems)

      expect(rankings).toHaveLength(1)
      expect(rankings[0]).toMatchObject({ id: 'Only', rank: 1 })
    })

    it('should include score that decreases with rank', () => {
      const sortedItems: ItemId[] = ['First', 'Second', 'Third']

      const rankings = mapToRankings(sortedItems)

      expect(rankings[0]!.score).toBeGreaterThan(rankings[1]!.score)
      expect(rankings[1]!.score).toBeGreaterThan(rankings[2]!.score)
    })

    it('should assign first item rank 1 with max score', () => {
      const sortedItems: ItemId[] = ['Winner']

      const rankings = mapToRankings(sortedItems)

      expect(rankings[0]!.rank).toBe(1)
      expect(rankings[0]!.score).toBe(10) // Max score
    })

    it('should handle many items', () => {
      const sortedItems: ItemId[] = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J']

      const rankings = mapToRankings(sortedItems)

      expect(rankings).toHaveLength(10)
      expect(rankings[0]!.rank).toBe(1)
      expect(rankings[9]!.rank).toBe(10)
      // Last item should have score of 1 (minimum)
      expect(rankings[9]!.score).toBe(1)
    })
  })
})
