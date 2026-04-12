/**
 * Agent Memory Types
 *
 * Two-layer memory system:
 * Layer 1: Core memories (structured facts, always in agent context)
 * Layer 2: Conversation summaries (searchable on demand)
 */

import { MemoryCategory, MemorySource } from './enums'

// ============================================================================
// Core Memory (Layer 1)
// ============================================================================

/**
 * A structured fact the agent has learned about the user.
 * Persisted in the database, injected into agent system prompt.
 */
export interface AgentMemory {
  id: string
  sessionId: string
  category: MemoryCategory
  key: string
  value: string
  confidence: number
  source: MemorySource
  pinned: boolean
  createdAt: Date
  updatedAt: Date
  lastAccessedAt: Date
}

/** Max core memories injected into system prompt per turn */
export const MAX_CORE_MEMORIES = 30

// ============================================================================
// Conversation Summary (Layer 2)
// ============================================================================

/**
 * Auto-generated summary of a past conversation.
 * Searchable by the agent via search_memory tool.
 */
export interface ConversationSummary {
  id: string
  sessionId: string
  conversationId: string
  summary: string
  keyDecisions: string[]
  memoriesExtracted: string[]
  messageCount: number
  createdAt: Date
}

/** Min messages before a conversation gets summarized */
export const MIN_MESSAGES_FOR_SUMMARY = 10

// ============================================================================
// Input Types
// ============================================================================

export interface SaveMemoryInput {
  category: MemoryCategory
  key: string
  value: string
  confidence?: number
  source?: MemorySource
}

export interface UpdateMemoryInput {
  memoryId: string
  value?: string
  confidence?: number
  pinned?: boolean
}

export interface SearchMemoryInput {
  query: string
  startDate?: string
  endDate?: string
  limit?: number
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Format core memories for injection into the agent system prompt.
 * Groups by category for readability.
 */
export function formatMemoriesForPrompt(memories: AgentMemory[]): string {
  if (memories.length === 0) return ''

  const grouped = new Map<MemoryCategory, AgentMemory[]>()
  for (const mem of memories) {
    const list = grouped.get(mem.category) ?? []
    list.push(mem)
    grouped.set(mem.category, list)
  }

  const categoryLabels: Record<MemoryCategory, string> = {
    [MemoryCategory.Preference]: 'User Preferences',
    [MemoryCategory.Correction]: 'Past Corrections',
    [MemoryCategory.Pattern]: 'Observed Patterns',
    [MemoryCategory.Fact]: 'Known Facts',
  }

  const sections: string[] = []
  for (const [category, mems] of grouped) {
    const label = categoryLabels[category] ?? category
    const entries = mems.map(m => `- ${m.value}`).join('\n')
    sections.push(`### ${label}\n${entries}`)
  }

  return `## Your Memory\nThese are things you've learned about this user from past interactions.\n\n${sections.join('\n\n')}`
}

/**
 * Convert a raw database record to a typed AgentMemory.
 */
export function fromDatabaseMemory(raw: Record<string, unknown>): AgentMemory {
  return {
    id: raw.id as string,
    sessionId: raw.sessionId as string,
    category: raw.category as MemoryCategory,
    key: raw.key as string,
    value: raw.value as string,
    confidence: raw.confidence as number,
    source: raw.source as MemorySource,
    pinned: raw.pinned as boolean,
    createdAt: new Date(raw.createdAt as string | Date),
    updatedAt: new Date(raw.updatedAt as string | Date),
    lastAccessedAt: new Date(raw.lastAccessedAt as string | Date),
  }
}

/**
 * Convert a raw database record to a typed ConversationSummary.
 */
export function fromDatabaseSummary(raw: Record<string, unknown>): ConversationSummary {
  return {
    id: raw.id as string,
    sessionId: raw.sessionId as string,
    conversationId: raw.conversationId as string,
    summary: raw.summary as string,
    keyDecisions: JSON.parse((raw.keyDecisions as string) || '[]'),
    memoriesExtracted: JSON.parse((raw.memoriesExtracted as string) || '[]'),
    messageCount: raw.messageCount as number,
    createdAt: new Date(raw.createdAt as string | Date),
  }
}
