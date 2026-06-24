import { describe, it, expect } from 'vitest'
import { ComparisonType } from '@/shared/constants'
import { EntityType, StepStatus } from '@shared/enums'
import {
  selectTournamentItems,
  seedRound1Pairs,
  computeItemDepths,
  computeRankingScores,
  getDimensionScore,
  getItemLabel,
  UnrankedItemsError,
  type TournamentItem,
} from '../tournament-utils'
import { buildComparisonGraph, type ComparisonResult } from '../../../utils/comparison-graph'

function mkItem(id: string, importance = 5, urgency = 5): TournamentItem {
  return {
    id,
    type: EntityType.Task,
    data: {
      id, name: id,
      duration: 60, importance, urgency,
      type: 'focused', category: 'work', asyncWaitTime: 0,
      dependencies: '[]', completed: false, actualDuration: null,
      notes: null, projectId: null,
      createdAt: new Date(), updatedAt: new Date(), sessionId: null,
      deadline: null, deadlineType: null, cognitiveComplexity: null,
      isLocked: false, lockedStartTime: null, hasSteps: false,
      currentStepId: null, overallStatus: 'not_started',
      criticalPathDuration: 60, worstCaseDuration: 60,
      archived: false, inActiveSprint: false,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
  }
}

function mkStep(
  id: string,
  opts: { importance?: number; urgency?: number; name?: string; label?: string } = {},
): TournamentItem {
  return {
    id,
    type: EntityType.Step,
    data: {
      id,
      name: opts.name ?? id,
      duration: 30,
      type: 'focused',
      taskId: 'wf1',
      dependsOn: [],
      asyncWaitTime: 0,
      status: StepStatus.Pending,
      stepIndex: 0,
      percentComplete: 0,
      importance: opts.importance,
      urgency: opts.urgency,
    },
    label: opts.label,
  }
}

function priorityCmp(winner: string, loser: string): ComparisonResult {
  return {
    itemA: winner, itemB: loser,
    higherPriority: winner, higherUrgency: null,
    timestamp: 0,
  }
}

describe('getDimensionScore', () => {
  it('reads importance/urgency from a Task item', () => {
    const item = mkItem('t', 8, 3)
    expect(getDimensionScore(item, ComparisonType.Priority)).toBe(8)
    expect(getDimensionScore(item, ComparisonType.Urgency)).toBe(3)
  })

  it('reads per-step overrides from a Step item', () => {
    const step = mkStep('s', { importance: 9, urgency: 2 })
    expect(getDimensionScore(step, ComparisonType.Priority)).toBe(9)
    expect(getDimensionScore(step, ComparisonType.Urgency)).toBe(2)
  })

  it('falls back to 5 when a step has no override', () => {
    const step = mkStep('s')
    expect(getDimensionScore(step, ComparisonType.Priority)).toBe(5)
    expect(getDimensionScore(step, ComparisonType.Urgency)).toBe(5)
  })

  it('lets steps seed alongside tasks by score', () => {
    // A high-importance step should sort ahead of a low-importance task.
    const items = [mkItem('task', 2), mkStep('step', { importance: 9, label: 'WF › Step' })]
    expect(seedRound1Pairs(items, ComparisonType.Priority)).toEqual([['step', 'task']])
  })
})

describe('getItemLabel', () => {
  it('prefers an explicit label over the entity name', () => {
    expect(getItemLabel(mkStep('s', { name: 'Write tests', label: 'Backend › Write tests' })))
      .toBe('Backend › Write tests')
  })

  it('falls back to the entity name when no label is set', () => {
    expect(getItemLabel(mkItem('a'))).toBe('a')
    expect(getItemLabel(mkStep('s', { name: 'Deploy' }))).toBe('Deploy')
  })
})

describe('selectTournamentItems', () => {
  it('returns empty when sampleSize is 0 or items is empty', () => {
    expect(selectTournamentItems([], [], ComparisonType.Priority, 4)).toEqual([])
    expect(selectTournamentItems([mkItem('a')], [], ComparisonType.Priority, 0)).toEqual([])
  })

  it('returns all items when sampleSize exceeds count', () => {
    const items = [mkItem('a'), mkItem('b')]
    const out = selectTournamentItems(items, [], ComparisonType.Priority, 8)
    expect(out).toHaveLength(2)
  })

  it('with no prior comparisons, sorts by id (all tied on unknowns)', () => {
    const items = [mkItem('c'), mkItem('a'), mkItem('b')]
    const out = selectTournamentItems(items, [], ComparisonType.Priority, 3)
    expect(out.map(i => i.id)).toEqual(['a', 'b', 'c'])
  })

  it('prioritizes items with more unknown relationships', () => {
    // a, b, c already compared with each other (3 pairs known).
    // d is uncompared (3 unknowns).
    const items = [mkItem('a'), mkItem('b'), mkItem('c'), mkItem('d')]
    const comparisons = [
      priorityCmp('a', 'b'),
      priorityCmp('a', 'c'),
      priorityCmp('b', 'c'),
    ]
    const out = selectTournamentItems(items, comparisons, ComparisonType.Priority, 2)
    // d has the most unknowns → comes first.
    expect(out[0]!.id).toBe('d')
  })

  it('tiebreaks on fewer total comparisons (cover new ground)', () => {
    // a has 2 comparisons, b has 1, c has 0. Same unknown count? No — b and c have more unknowns.
    // Construct: a > b, a > c, b > d, b > e (a has 2 wins, b has 2 wins + 1 loss).
    // a known to b, c. b known to a, d, e. c known only to a. d, e known only to b.
    // For 5-item universe {a,b,c,d,e}:
    //   a unknown: d, e → 2
    //   b unknown: c → 1
    //   c unknown: b, d, e → 3
    //   d unknown: a, c, e → 3
    //   e unknown: a, c, d → 3
    // c, d, e tied on unknowns. Tiebreak by total: c has 1 comparison, d has 1, e has 1. All same.
    // Final tiebreak: lex id → c, d, e.
    const items = ['a', 'b', 'c', 'd', 'e'].map(id => mkItem(id))
    const comparisons = [
      priorityCmp('a', 'b'),
      priorityCmp('a', 'c'),
      priorityCmp('b', 'd'),
      priorityCmp('b', 'e'),
    ]
    const out = selectTournamentItems(items, comparisons, ComparisonType.Priority, 3)
    expect(out.map(i => i.id)).toEqual(['c', 'd', 'e'])
  })
})

describe('seedRound1Pairs', () => {
  it('returns empty when fewer than 2 items', () => {
    expect(seedRound1Pairs([], ComparisonType.Priority)).toEqual([])
    expect(seedRound1Pairs([mkItem('a')], ComparisonType.Priority)).toEqual([])
  })

  it('sorts by current score desc and pairs adjacent', () => {
    const items = [mkItem('a', 3), mkItem('b', 8), mkItem('c', 5), mkItem('d', 1)]
    const pairs = seedRound1Pairs(items, ComparisonType.Priority)
    // sorted desc by importance: b(8), c(5), a(3), d(1) → pairs (b,c), (a,d)
    expect(pairs).toEqual([['b', 'c'], ['a', 'd']])
  })

  it('uses urgency when dimension is Urgency', () => {
    const items = [
      mkItem('a', /*imp*/ 1, /*urg*/ 9),
      mkItem('b', /*imp*/ 10, /*urg*/ 2),
    ]
    expect(seedRound1Pairs(items, ComparisonType.Priority)).toEqual([['b', 'a']])
    expect(seedRound1Pairs(items, ComparisonType.Urgency)).toEqual([['a', 'b']])
  })

  it('drops the odd item out (no byes)', () => {
    const items = [mkItem('a', 3), mkItem('b', 5), mkItem('c', 1)]
    const pairs = seedRound1Pairs(items, ComparisonType.Priority)
    // sorted: b(5), a(3), c(1). Pair (b,a). c falls off.
    expect(pairs).toEqual([['b', 'a']])
  })
})

describe('computeItemDepths', () => {
  it('returns undefined for items not in the graph', () => {
    const graph = buildComparisonGraph([])
    const depths = computeItemDepths(['a', 'b'], graph.priorityWins)
    expect(depths.get('a')).toBeUndefined()
    expect(depths.get('b')).toBeUndefined()
  })

  it('returns 0 for graph sources (unbeaten items)', () => {
    const graph = buildComparisonGraph([priorityCmp('a', 'b')])
    const depths = computeItemDepths(['a', 'b'], graph.priorityWins)
    expect(depths.get('a')).toBe(0)
    expect(depths.get('b')).toBe(1)
  })

  it('uses the longest path when multiple paths exist', () => {
    // a > b, b > c, a > c. depth(c) = max(via b, direct) = max(2, 1) = 2.
    const graph = buildComparisonGraph([
      priorityCmp('a', 'b'),
      priorityCmp('b', 'c'),
      priorityCmp('a', 'c'),
    ])
    const depths = computeItemDepths(['a', 'b', 'c'], graph.priorityWins)
    expect(depths.get('a')).toBe(0)
    expect(depths.get('b')).toBe(1)
    expect(depths.get('c')).toBe(2)
  })

  it('produces consistent depths across disjoint subgraphs', () => {
    // Subgraph 1: a > b > c. Subgraph 2: x > y > z. Both produce depths [0,1,2].
    const graph = buildComparisonGraph([
      priorityCmp('a', 'b'),
      priorityCmp('b', 'c'),
      priorityCmp('x', 'y'),
      priorityCmp('y', 'z'),
    ])
    const depths = computeItemDepths(['a', 'b', 'c', 'x', 'y', 'z'], graph.priorityWins)
    expect(depths.get('a')).toBe(0)
    expect(depths.get('x')).toBe(0)
    expect(depths.get('c')).toBe(2)
    expect(depths.get('z')).toBe(2)
  })
})

describe('computeRankingScores', () => {
  it('throws UnrankedItemsError when any item has no comparisons', () => {
    expect(() => computeRankingScores(['a', 'b'], [], ComparisonType.Priority)).toThrow(UnrankedItemsError)
    try {
      computeRankingScores(['a', 'b'], [], ComparisonType.Priority)
    } catch (e) {
      const err = e as UnrankedItemsError
      expect(err.unrankedIds).toEqual(expect.arrayContaining(['a', 'b']))
    }
  })

  it('source gets 10, sink gets 1 in a chain', () => {
    const c = [
      priorityCmp('a', 'b'),
      priorityCmp('b', 'c'),
      priorityCmp('c', 'd'),
    ]
    const scores = computeRankingScores(['a', 'b', 'c', 'd'], c, ComparisonType.Priority)
    expect(scores.get('a')).toBe(10)
    expect(scores.get('d')).toBe(1)
  })

  it('two disjoint 3-chains both get [10, 5, 1]', () => {
    const c = [
      priorityCmp('a', 'b'),
      priorityCmp('b', 'c'),
      priorityCmp('x', 'y'),
      priorityCmp('y', 'z'),
    ]
    const scores = computeRankingScores(['a', 'b', 'c', 'x', 'y', 'z'], c, ComparisonType.Priority)
    // depths: a=0, b=1, c=2; x=0, y=1, z=2. maxDepth=2.
    // raw: 10, 5.5→6, 1.
    expect(scores.get('a')).toBe(10)
    expect(scores.get('b')).toBe(6)
    expect(scores.get('c')).toBe(1)
    expect(scores.get('x')).toBe(10)
    expect(scores.get('y')).toBe(6)
    expect(scores.get('z')).toBe(1)
  })

  it('returns all 10s when no edges (maxDepth=0)', () => {
    // All items are sources. But this requires every item to be IN the graph.
    // Use an equality so every item has a comparison.
    const c: ComparisonResult[] = [{
      itemA: 'a', itemB: 'b',
      higherPriority: 'equal', higherUrgency: null, timestamp: 0,
    }]
    const scores = computeRankingScores(['a', 'b'], c, ComparisonType.Priority)
    expect(scores.get('a')).toBe(10)
    expect(scores.get('b')).toBe(10)
  })
})
