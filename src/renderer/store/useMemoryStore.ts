/**
 * Memory Store
 *
 * Manages the agent memory panel UI state.
 * Loads memories and conversation summaries from the server.
 */

import { create } from 'zustand'
import { fromDatabaseMemory, fromDatabaseSummary } from '@shared/memory-types'
import type { AgentMemory, ConversationSummary } from '@shared/memory-types'
import { getDatabase } from '../services/database'
import { logger } from '@/logger'

interface MemoryStoreState {
  memories: AgentMemory[]
  summaries: ConversationSummary[]
  isLoading: boolean

  loadMemories: () => Promise<void>
  loadSummaries: () => Promise<void>
  updateMemory: (memoryId: string, updates: { value?: string; pinned?: boolean }) => Promise<void>
  deleteMemory: (memoryId: string) => Promise<void>
}

export const useMemoryStore = create<MemoryStoreState>((set, get) => ({
  memories: [],
  summaries: [],
  isLoading: false,

  loadMemories: async (): Promise<void> => {
    set({ isLoading: true })
    try {
      const db = getDatabase()
      const rawMemories = await db.getMemories()
      const memories = rawMemories.map(r => fromDatabaseMemory(r))
      set({ memories, isLoading: false })
    } catch (error) {
      logger.system.error('Failed to load memories', {
        error: error instanceof Error ? error.message : String(error),
      }, 'memory-load-error')
      set({ isLoading: false })
    }
  },

  loadSummaries: async (): Promise<void> => {
    try {
      const db = getDatabase()
      const rawSummaries = await db.getConversationSummaries()
      const summaries = rawSummaries.map(r => fromDatabaseSummary(r))
      set({ summaries })
    } catch (error) {
      logger.system.error('Failed to load summaries', {
        error: error instanceof Error ? error.message : String(error),
      }, 'summary-load-error')
    }
  },

  updateMemory: async (memoryId, updates): Promise<void> => {
    const db = getDatabase()
    await db.updateMemory(memoryId, updates)
    // Reload to get fresh state
    await get().loadMemories()
  },

  deleteMemory: async (memoryId): Promise<void> => {
    const db = getDatabase()
    await db.deleteMemory(memoryId)
    set(state => ({
      memories: state.memories.filter(m => m.id !== memoryId),
    }))
  },
}))
