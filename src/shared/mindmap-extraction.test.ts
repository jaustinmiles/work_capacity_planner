/**
 * Tests for the mind-map extraction trust boundary.
 *
 * These cover the load-bearing guarantee of the journal feature: the AI cannot
 * persist a node kind, relationship type, or connection outside the codified
 * taxonomy + relationship matrix, and re-processing a revisited day merges
 * (by normalized label) instead of duplicating.
 */

import { describe, it, expect } from 'vitest'
import { MindMapNodeKind, MindMapRelationshipType } from './enums'
import type { RawMindMapExtraction } from './mindmap-types'
import { MIND_MAP_NODE_KIND_CONFIG } from './mindmap-types'
import {
  isRelationshipAllowed,
  isValidNodeKind,
  isValidRelationshipType,
  normalizeLabel,
  placeNewNodes,
  resolveNodeColor,
  resolveNodeEmoji,
  sanitizeMindMapExtraction,
  type ExistingNodeRef,
  type Position,
} from './mindmap-extraction'

// Convenience builder so tests read declaratively.
function extraction(partial: Partial<RawMindMapExtraction>): RawMindMapExtraction {
  return { summary: '', nodes: [], edges: [], ...partial }
}

describe('normalizeLabel', () => {
  it('lowercases, trims, and collapses whitespace', () => {
    expect(normalizeLabel('  Deep   Work  ')).toBe('deep work')
    expect(normalizeLabel('Anxiety')).toBe('anxiety')
  })
})

describe('isValidNodeKind / isValidRelationshipType', () => {
  it('accepts codified values and rejects invented ones', () => {
    expect(isValidNodeKind('theme')).toBe(true)
    expect(isValidNodeKind('vibe')).toBe(false)
    expect(isValidRelationshipType('blocks')).toBe(true)
    expect(isValidRelationshipType('summons')).toBe(false)
  })
})

describe('resolveNodeColor / resolveNodeEmoji', () => {
  it('derives color from kind (never AI-chosen)', () => {
    expect(resolveNodeColor(MindMapNodeKind.Todo)).toBe(
      MIND_MAP_NODE_KIND_CONFIG[MindMapNodeKind.Todo].color,
    )
  })

  it('keeps a proposed emoji only when it is in the kind allow-list', () => {
    const allowed = MIND_MAP_NODE_KIND_CONFIG[MindMapNodeKind.Theme].allowedEmojis[0]
    expect(resolveNodeEmoji(MindMapNodeKind.Theme, allowed)).toBe(allowed)
  })

  it('falls back to the default emoji for a disallowed or missing symbol', () => {
    const def = MIND_MAP_NODE_KIND_CONFIG[MindMapNodeKind.Theme].defaultEmoji
    expect(resolveNodeEmoji(MindMapNodeKind.Theme, '🦄')).toBe(def)
    expect(resolveNodeEmoji(MindMapNodeKind.Theme, undefined)).toBe(def)
  })
})

describe('isRelationshipAllowed (the codified matrix)', () => {
  it('allows relates_to / leads_to between any kinds', () => {
    expect(
      isRelationshipAllowed(MindMapRelationshipType.RelatesTo, MindMapNodeKind.Person, MindMapNodeKind.Feeling),
    ).toBe(true)
    expect(
      isRelationshipAllowed(MindMapRelationshipType.LeadsTo, MindMapNodeKind.Feeling, MindMapNodeKind.Todo),
    ).toBe(true)
  })

  it('restricts blocks to todo → todo', () => {
    expect(
      isRelationshipAllowed(MindMapRelationshipType.Blocks, MindMapNodeKind.Todo, MindMapNodeKind.Todo),
    ).toBe(true)
    expect(
      isRelationshipAllowed(MindMapRelationshipType.Blocks, MindMapNodeKind.Theme, MindMapNodeKind.Todo),
    ).toBe(false)
    expect(
      isRelationshipAllowed(MindMapRelationshipType.Blocks, MindMapNodeKind.Todo, MindMapNodeKind.Concept),
    ).toBe(false)
  })

  it('restricts part_of targets to theme/concept', () => {
    expect(
      isRelationshipAllowed(MindMapRelationshipType.PartOf, MindMapNodeKind.Todo, MindMapNodeKind.Theme),
    ).toBe(true)
    expect(
      isRelationshipAllowed(MindMapRelationshipType.PartOf, MindMapNodeKind.Todo, MindMapNodeKind.Person),
    ).toBe(false)
  })

  it('restricts elaborates sources and targets', () => {
    expect(
      isRelationshipAllowed(MindMapRelationshipType.Elaborates, MindMapNodeKind.Concept, MindMapNodeKind.Theme),
    ).toBe(true)
    expect(
      isRelationshipAllowed(MindMapRelationshipType.Elaborates, MindMapNodeKind.Todo, MindMapNodeKind.Theme),
    ).toBe(false)
  })
})

describe('sanitizeMindMapExtraction — nodes', () => {
  it('keeps valid nodes and derives their color + bounded emoji', () => {
    const result = sanitizeMindMapExtraction(
      extraction({
        nodes: [{ label: 'Ship the feature', kind: 'todo', emoji: '🦄', summary: 'do it' }],
      }),
      [],
    )
    expect(result.nodes).toHaveLength(1)
    expect(result.nodes[0]).toMatchObject({
      label: 'Ship the feature',
      normalizedLabel: 'ship the feature',
      kind: MindMapNodeKind.Todo,
      color: MIND_MAP_NODE_KIND_CONFIG[MindMapNodeKind.Todo].color,
      // disallowed unicorn emoji falls back to the todo default
      emoji: MIND_MAP_NODE_KIND_CONFIG[MindMapNodeKind.Todo].defaultEmoji,
      summary: 'do it',
    })
    expect(result.rejected.nodes).toBe(0)
  })

  it('drops nodes with an invalid kind or empty label', () => {
    const result = sanitizeMindMapExtraction(
      extraction({
        nodes: [
          { label: 'Real', kind: 'concept' },
          { label: 'Bogus kind', kind: 'vibe' },
          { label: '   ', kind: 'theme' },
        ],
      }),
      [],
    )
    expect(result.nodes.map((n) => n.label)).toEqual(['Real'])
    expect(result.rejected.nodes).toBe(2)
  })

  it('de-dupes nodes by normalized label within a batch (first wins)', () => {
    const result = sanitizeMindMapExtraction(
      extraction({
        nodes: [
          { label: 'Burnout', kind: 'feeling' },
          { label: '  burnout ', kind: 'theme' },
        ],
      }),
      [],
    )
    expect(result.nodes).toHaveLength(1)
    expect(result.nodes[0].kind).toBe(MindMapNodeKind.Feeling)
    expect(result.rejected.nodes).toBe(1)
  })
})

describe('sanitizeMindMapExtraction — edges (the anti-hallucination core)', () => {
  const twoTodos = (): RawMindMapExtraction =>
    extraction({
      nodes: [
        { label: 'Write tests', kind: 'todo' },
        { label: 'Open PR', kind: 'todo' },
      ],
    })

  it('keeps a legal edge between two new nodes', () => {
    const raw = twoTodos()
    raw.edges = [{ source: 'Write tests', target: 'Open PR', relationshipType: 'blocks' }]
    const result = sanitizeMindMapExtraction(raw, [])
    expect(result.edges).toHaveLength(1)
    expect(result.edges[0]).toMatchObject({
      sourceNormalizedLabel: 'write tests',
      targetNormalizedLabel: 'open pr',
      relationshipType: MindMapRelationshipType.Blocks,
    })
    expect(result.rejected.edges).toBe(0)
  })

  it('drops an edge with an invalid relationship type', () => {
    const raw = twoTodos()
    raw.edges = [{ source: 'Write tests', target: 'Open PR', relationshipType: 'summons' }]
    const result = sanitizeMindMapExtraction(raw, [])
    expect(result.edges).toHaveLength(0)
    expect(result.rejected.edges).toBe(1)
  })

  it('drops an edge whose endpoint does not resolve to a real node', () => {
    const raw = twoTodos()
    raw.edges = [{ source: 'Write tests', target: 'Ghost concept', relationshipType: 'relates_to' }]
    const result = sanitizeMindMapExtraction(raw, [])
    expect(result.edges).toHaveLength(0)
    expect(result.rejected.edges).toBe(1)
  })

  it('drops an edge that violates the relationship matrix (blocks between non-todos)', () => {
    const raw = extraction({
      nodes: [
        { label: 'Identity', kind: 'theme' },
        { label: 'Open PR', kind: 'todo' },
      ],
      edges: [{ source: 'Identity', target: 'Open PR', relationshipType: 'blocks' }],
    })
    const result = sanitizeMindMapExtraction(raw, [])
    expect(result.edges).toHaveLength(0)
    expect(result.rejected.edges).toBe(1)
  })

  it('rejects self-loops and duplicate edges', () => {
    const raw = twoTodos()
    raw.edges = [
      { source: 'Write tests', target: 'Write tests', relationshipType: 'relates_to' },
      { source: 'Write tests', target: 'Open PR', relationshipType: 'blocks' },
      { source: 'write tests', target: 'open pr', relationshipType: 'blocks' }, // dup (normalized)
    ]
    const result = sanitizeMindMapExtraction(raw, [])
    expect(result.edges).toHaveLength(1)
    expect(result.rejected.edges).toBe(2)
  })

  it('can connect a NEW node to an EXISTING scene node (re-sync)', () => {
    const existing: ExistingNodeRef[] = [
      { normalizedLabel: 'morning routine', kind: MindMapNodeKind.Theme },
    ]
    const raw = extraction({
      nodes: [{ label: 'Meditate daily', kind: 'todo' }],
      edges: [{ source: 'Meditate daily', target: 'Morning routine', relationshipType: 'part_of' }],
    })
    const result = sanitizeMindMapExtraction(raw, existing)
    expect(result.nodes).toHaveLength(1)
    expect(result.edges).toHaveLength(1)
    expect(result.edges[0].targetNormalizedLabel).toBe('morning routine')
  })

  it('handles malformed input without throwing', () => {
    // Simulate a junk AI payload.
    const result = sanitizeMindMapExtraction(
      { summary: '', nodes: undefined, edges: undefined } as unknown as RawMindMapExtraction,
      [],
    )
    expect(result.nodes).toEqual([])
    expect(result.edges).toEqual([])
  })
})

describe('placeNewNodes', () => {
  it('returns the requested count and nothing for zero/negative', () => {
    expect(placeNewNodes([], 0)).toEqual([])
    expect(placeNewNodes([], -3)).toEqual([])
    expect(placeNewNodes([], 5)).toHaveLength(5)
  })

  it('is deterministic (stable across re-processing)', () => {
    const a = placeNewNodes([{ x: 0, y: 0 }], 6)
    const b = placeNewNodes([{ x: 0, y: 0 }], 6)
    expect(a).toEqual(b)
  })

  it('keeps every placed node clear of existing nodes and of each other', () => {
    // Pre-existing nodes may themselves overlap (not the algorithm's concern);
    // the guarantee is that each PLACED node clears every other node.
    const existing: Position[] = [
      { x: 0, y: 0 },
      { x: 100, y: 40 },
    ]
    const placed = placeNewNodes(existing, 8, 220)
    const others = [...existing, ...placed]
    const minAllowedSq = (220 * 0.85) ** 2
    for (const p of placed) {
      for (const o of others) {
        if (o === p) continue
        const dx = p.x - o.x
        const dy = p.y - o.y
        expect(dx * dx + dy * dy).toBeGreaterThanOrEqual(minAllowedSq)
      }
    }
  })
})
