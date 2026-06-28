/**
 * Journal / Mind Map Types
 *
 * Type definitions for the journal feature — rich-text monologue entries tied to
 * calendar days, feeding an AI-processed, artistic mind map.
 *
 * Architecture: MindMapNode is a "projection" (like DeepWorkNode/SpatialEntity) —
 * it stores canvas placement (position/size/pin) separately from the extracted
 * meaning (label + kind). Re-processing a revisited day merges by normalized label
 * and never moves a pinned node, so the layout is persistent across re-syncs.
 *
 * The "AI cannot hallucinate outside codified relationships" requirement is enforced
 * by the pure sanitizer in mindmap-extraction.ts, which validates AI output against
 * MindMapNodeKind, MindMapRelationshipType, and the relationship matrix defined here.
 */

import { MindMapNodeKind, MindMapRelationshipType } from './enums'

// =============================================================================
// Core persisted shapes (mirror the Prisma models)
// =============================================================================

/** A rich-text journal entry. Days can hold multiple entries (keyed by entryDate). */
export interface JournalEntry {
  id: string
  sessionId: string
  entryDate: Date
  title: string
  content: string // rich-text HTML (editor-serialized)
  plainText: string // derived plain text for AI processing + search
  processedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

/** One persistent mind-map workspace per session — holds the viewport. */
export interface MindMapScene {
  id: string
  sessionId: string
  zoom: number
  panX: number
  panY: number
  createdAt: Date
  updatedAt: Date
}

/** An AI-extracted concept placed on the scene (placement projection). */
export interface MindMapNode {
  id: string
  sceneId: string
  kind: MindMapNodeKind
  label: string
  normalizedLabel: string
  summary: string | null
  emoji: string
  color: string
  refId: string | null // kind=todo may link to a canonical Task.id
  sourceEntryId: string | null
  positionX: number
  positionY: number
  width: number
  height: number
  pinned: boolean
  createdAt: Date
  updatedAt: Date
}

/** A stored, codified relationship between two nodes. */
export interface MindMapEdge {
  id: string
  sceneId: string
  sourceNodeId: string
  targetNodeId: string
  relationshipType: MindMapRelationshipType
  label: string | null
  sourceEntryId: string | null
  createdAt: Date
  updatedAt: Date
}

/** The full scene as the client consumes it. */
export interface MindMapSceneGraph {
  scene: MindMapScene
  nodes: MindMapNode[]
  edges: MindMapEdge[]
}

// =============================================================================
// AI extraction shapes (raw, UNTRUSTED — must pass through the sanitizer)
// =============================================================================

/** A node as proposed by the AI (before validation). */
export interface RawExtractedNode {
  label: string
  kind: string // validated against MindMapNodeKind
  emoji?: string // validated against the per-kind allow-list
  summary?: string
}

/** An edge as proposed by the AI (endpoints are LABELS, before validation). */
export interface RawExtractedEdge {
  source: string // label of an existing or newly-extracted node
  target: string
  relationshipType: string // validated against MindMapRelationshipType
  label?: string
}

/** The raw object the AI returns from extractMindMapFromJournal. */
export interface RawMindMapExtraction {
  summary: string
  nodes: RawExtractedNode[]
  edges: RawExtractedEdge[]
}

/** A node that survived sanitization, ready to merge into the scene. */
export interface SanitizedNode {
  label: string
  normalizedLabel: string
  kind: MindMapNodeKind
  emoji: string
  color: string
  summary: string | null
}

/** An edge that survived sanitization. Endpoints are normalized labels. */
export interface SanitizedEdge {
  sourceNormalizedLabel: string
  targetNormalizedLabel: string
  relationshipType: MindMapRelationshipType
  label: string | null
}

/** Result of sanitizing a raw extraction, with counts of what was rejected. */
export interface SanitizedExtraction {
  nodes: SanitizedNode[]
  edges: SanitizedEdge[]
  rejected: {
    nodes: number // dropped for invalid/missing kind or empty label
    edges: number // dropped for invalid type, unresolved endpoint, or matrix violation
  }
}

// =============================================================================
// Codified node-kind config — color + symbol palette (artistic, but BOUNDED)
// =============================================================================

export interface MindMapNodeKindConfig {
  /** Human label for the kind. */
  label: string
  /** Hex color all nodes of this kind render in (derived, never AI-chosen). */
  color: string
  /** Default symbol when the AI proposes no emoji or a disallowed one. */
  defaultEmoji: string
  /** Curated emoji the AI may pick from for this kind (variety, but bounded). */
  allowedEmojis: string[]
}

/**
 * Per-kind visual config. Color is fixed per kind so the palette stays coherent;
 * the AI may only choose an emoji from allowedEmojis (else defaultEmoji is used).
 */
export const MIND_MAP_NODE_KIND_CONFIG: Record<MindMapNodeKind, MindMapNodeKindConfig> = {
  [MindMapNodeKind.Theme]: {
    label: 'Theme',
    color: '#7C5CFC', // violet
    defaultEmoji: '🌌',
    allowedEmojis: ['🌌', '🧵', '🔮', '🌀', '🗺️', '🏔️'],
  },
  [MindMapNodeKind.Concept]: {
    label: 'Concept',
    color: '#1FB6A8', // teal
    defaultEmoji: '💡',
    allowedEmojis: ['💡', '🧩', '🔭', '✨', '🪄', '📐'],
  },
  [MindMapNodeKind.Todo]: {
    label: 'To-do',
    color: '#F77234', // orange
    defaultEmoji: '✅',
    allowedEmojis: ['✅', '📝', '🎯', '🛠️', '📌', '⚡'],
  },
  [MindMapNodeKind.Question]: {
    label: 'Question',
    color: '#3491FA', // blue
    defaultEmoji: '❓',
    allowedEmojis: ['❓', '🤔', '🧭', '🔍', '💭'],
  },
  [MindMapNodeKind.Feeling]: {
    label: 'Feeling',
    color: '#F754A2', // pink
    defaultEmoji: '💗',
    allowedEmojis: ['💗', '🌊', '🔥', '🌧️', '☀️', '🌙', '😌', '😰'],
  },
  [MindMapNodeKind.Person]: {
    label: 'Person',
    color: '#FADC19', // gold
    defaultEmoji: '🧑',
    allowedEmojis: ['🧑', '👥', '🤝', '💬', '🫂'],
  },
}

/** The closed set of node kinds (used by the sanitizer + prompt). */
export const ALLOWED_MIND_MAP_NODE_KINDS: MindMapNodeKind[] = Object.values(MindMapNodeKind)

// =============================================================================
// Codified relationship matrix — which (source → target) kinds each type allows
// =============================================================================

export interface MindMapRelationshipConfig {
  /** Human label for the relationship. */
  label: string
  /** Short description injected into the AI prompt. */
  description: string
  /** Allowed source kinds (null = any kind). */
  sourceKinds: MindMapNodeKind[] | null
  /** Allowed target kinds (null = any kind). */
  targetKinds: MindMapNodeKind[] | null
}

const IDEA_KINDS = [
  MindMapNodeKind.Theme,
  MindMapNodeKind.Concept,
  MindMapNodeKind.Question,
  MindMapNodeKind.Feeling,
]

/**
 * The relationship matrix — the literal codification of "what may connect to what."
 * isRelationshipAllowed() enforces it; edges violating it are dropped server-side.
 */
export const MIND_MAP_RELATIONSHIP_CONFIG: Record<
  MindMapRelationshipType,
  MindMapRelationshipConfig
> = {
  [MindMapRelationshipType.RelatesTo]: {
    label: 'relates to',
    description: 'a general association between two ideas',
    sourceKinds: null,
    targetKinds: null,
  },
  [MindMapRelationshipType.LeadsTo]: {
    label: 'leads to',
    description: 'one thing causes or temporally precedes another',
    sourceKinds: null,
    targetKinds: null,
  },
  [MindMapRelationshipType.PartOf]: {
    label: 'part of',
    description: 'the source is a component of the larger target',
    sourceKinds: null,
    targetKinds: [MindMapNodeKind.Theme, MindMapNodeKind.Concept],
  },
  [MindMapRelationshipType.Blocks]: {
    label: 'blocks',
    description: 'an actionable item that must be done before another (todo → todo only)',
    sourceKinds: [MindMapNodeKind.Todo],
    targetKinds: [MindMapNodeKind.Todo],
  },
  [MindMapRelationshipType.Contradicts]: {
    label: 'contradicts',
    description: 'a tension or conflict between two ideas or feelings',
    sourceKinds: IDEA_KINDS,
    targetKinds: IDEA_KINDS,
  },
  [MindMapRelationshipType.Elaborates]: {
    label: 'elaborates',
    description: 'the source expands on or details the target',
    sourceKinds: [MindMapNodeKind.Theme, MindMapNodeKind.Concept, MindMapNodeKind.Question],
    targetKinds: [MindMapNodeKind.Theme, MindMapNodeKind.Concept],
  },
}

/** The closed set of relationship types (used by the sanitizer + prompt). */
export const ALLOWED_MIND_MAP_RELATIONSHIP_TYPES: MindMapRelationshipType[] =
  Object.values(MindMapRelationshipType)

// =============================================================================
// Defaults
// =============================================================================

export const MIND_MAP_NODE_DEFAULTS = {
  WIDTH: 180,
  HEIGHT: 80,
} as const
