/**
 * Decision Store
 *
 * Manages Socratic decision session state. Calls tRPC procedures
 * and updates reactive state for the DecisionView components.
 */

import { create } from 'zustand'
import type { DecisionState, ConnectivityScore } from '@shared/decision-types'
import { emptyDecisionState } from '@shared/decision-types'
import { getDatabase } from '../services/database'
import { logger } from '@/logger'

interface DecisionStoreState {
  // Session state
  activeSessionId: string | null
  decisionState: DecisionState
  connectivity: ConnectivityScore | null
  conversationHistory: Array<{ role: 'user' | 'assistant'; text: string }>
  isDecisionMode: boolean
  isProcessing: boolean
  error: string | null

  // Session list
  sessions: Array<{
    id: string
    topic: string | null
    connectivity: number
    isActive: boolean
    createdAt: Date
  }>

  // Actions
  startSession: () => Promise<void>
  endSession: () => Promise<void>
  sendMessage: (text: string) => Promise<string | null>
  requestSummary: () => Promise<string | null>
  setDecisionMode: (active: boolean) => void
  loadSessions: () => Promise<void>
  resumeSession: (sessionId: string) => Promise<void>
  reset: () => void
}

export const useDecisionStore = create<DecisionStoreState>((set, get) => ({
  activeSessionId: null,
  decisionState: emptyDecisionState(),
  connectivity: null,
  conversationHistory: [],
  isDecisionMode: false,
  isProcessing: false,
  error: null,
  sessions: [],

  startSession: async (): Promise<void> => {
    try {
      set({ isProcessing: true, error: null })
      const db = getDatabase()
      const result = await db.startDecisionSession()

      set({
        activeSessionId: result.id as string,
        decisionState: result.decisionState as DecisionState,
        connectivity: result.connectivity as ConnectivityScore,
        conversationHistory: [],
        isDecisionMode: true,
        isProcessing: false,
      })

      logger.ui.info('Decision session started', { sessionId: result.id }, 'decision-start')
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to start session',
        isProcessing: false,
      })
    }
  },

  endSession: async (): Promise<void> => {
    const { activeSessionId } = get()
    if (!activeSessionId) return

    try {
      set({ isProcessing: true })
      const db = getDatabase()
      await db.endDecisionSession(activeSessionId)

      set({
        activeSessionId: null,
        decisionState: emptyDecisionState(),
        connectivity: null,
        conversationHistory: [],
        isDecisionMode: false,
        isProcessing: false,
      })

      logger.ui.info('Decision session ended', { sessionId: activeSessionId }, 'decision-end')
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to end session',
        isProcessing: false,
      })
    }
  },

  sendMessage: async (text): Promise<string | null> => {
    const { activeSessionId } = get()
    if (!activeSessionId) return null

    try {
      set({ isProcessing: true, error: null })
      const db = getDatabase()
      const result = await db.reflectDecision(activeSessionId, text)

      const question = result.question as string
      const decisionState = result.decisionState as DecisionState
      const connectivity = result.connectivity as ConnectivityScore

      set(state => ({
        decisionState,
        connectivity,
        conversationHistory: [
          ...state.conversationHistory,
          { role: 'user' as const, text },
          { role: 'assistant' as const, text: question },
        ],
        isProcessing: false,
      }))

      return question
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to reflect',
        isProcessing: false,
      })
      return null
    }
  },

  requestSummary: async (): Promise<string | null> => {
    const { activeSessionId } = get()
    if (!activeSessionId) return null

    try {
      set({ isProcessing: true })
      const db = getDatabase()
      const result = await db.summarizeDecision(activeSessionId)
      set({ isProcessing: false })
      return result.summary as string
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to summarize',
        isProcessing: false,
      })
      return null
    }
  },

  setDecisionMode: (active): void => {
    set({ isDecisionMode: active })
    if (!active) {
      // Clear session when exiting decision mode
      set({
        activeSessionId: null,
        decisionState: emptyDecisionState(),
        connectivity: null,
        conversationHistory: [],
      })
    }
  },

  loadSessions: async (): Promise<void> => {
    try {
      const db = getDatabase()
      const sessions = await db.getDecisionSessions()
      set({
        sessions: sessions.map((s: Record<string, unknown>) => ({
          id: s.id as string,
          topic: s.topic as string | null,
          connectivity: s.connectivity as number,
          isActive: s.isActive as boolean,
          createdAt: new Date(s.createdAt as string | Date),
        })),
      })
    } catch (error) {
      logger.system.error('Failed to load decision sessions', {
        error: error instanceof Error ? error.message : String(error),
      }, 'decision-sessions-error')
    }
  },

  resumeSession: async (sessionId): Promise<void> => {
    try {
      set({ isProcessing: true, error: null })
      const db = getDatabase()
      const result = await db.getDecisionState(sessionId)
      if (!result) {
        set({ error: 'Session not found', isProcessing: false })
        return
      }

      set({
        activeSessionId: result.id as string,
        decisionState: result.decisionState as DecisionState,
        connectivity: result.connectivity as ConnectivityScore,
        isDecisionMode: true,
        isProcessing: false,
      })
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to resume session',
        isProcessing: false,
      })
    }
  },

  reset: (): void => {
    set({
      activeSessionId: null,
      decisionState: emptyDecisionState(),
      connectivity: null,
      conversationHistory: [],
      isDecisionMode: false,
      isProcessing: false,
      error: null,
    })
  },
}))
