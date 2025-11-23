/**
 * Brainstorm Chat Store
 * Manages chat state, messages, and pending amendments
 */

import { create } from 'zustand'
import { Amendment } from '@shared/amendment-types'
import { JobContextData } from '../services/chat-context-provider'
import { ChatMessageRole } from '@shared/enums'
import { getCurrentTime } from '@shared/time-provider'

export enum ChatStatus {
  Idle = 'idle',
  Processing = 'processing',
  GeneratingAmendments = 'generating_amendments',
  AwaitingReview = 'awaiting_review',
  ApplyingAmendments = 'applying_amendments',
}

export interface ChatMessage {
  id: string
  role: ChatMessageRole
  content: string
  timestamp: Date
  amendments?: Amendment[]  // For assistant messages that include amendments
}

interface BrainstormChatState {
  // Chat state
  messages: ChatMessage[]
  status: ChatStatus
  currentJobContext: JobContextData | null
  pendingAmendments: Amendment[]
  errorMessage: string | null

  // Actions
  addMessage: (role: ChatMessageRole, content: string, amendments?: Amendment[]) => void
  clearMessages: () => void
  setStatus: (status: ChatStatus) => void
  setJobContext: (context: JobContextData | null) => void
  setPendingAmendments: (amendments: Amendment[]) => void
  clearPendingAmendments: () => void
  setError: (error: string | null) => void
  loadMessagesFromStorage: () => void
  saveMessagesToStorage: () => void
}

const STORAGE_KEY = 'brainstorm_chat_messages'

/**
 * Generate unique message ID
 */
function generateMessageId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
}

/**
 * Load messages from sessionStorage
 */
function loadMessages(): ChatMessage[] {
  try {
    const stored = window.sessionStorage.getItem(STORAGE_KEY)
    if (!stored) {
      return []
    }

    const messages = JSON.parse(stored) as ChatMessage[]
    // Convert date strings back to Date objects
    return messages.map(msg => ({
      ...msg,
      timestamp: new Date(msg.timestamp),
    }))
  } catch (error) {
    console.error('Failed to load chat messages:', error)
    return []
  }
}

/**
 * Save messages to sessionStorage
 */
function saveMessages(messages: ChatMessage[]): void {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages))
  } catch (error) {
    console.error('Failed to save chat messages:', error)
  }
}

export const useBrainstormChatStore = create<BrainstormChatState>((set, get) => ({
  messages: [],
  status: ChatStatus.Idle,
  currentJobContext: null,
  pendingAmendments: [],
  errorMessage: null,

  addMessage: (role, content, amendments) => {
    const message: ChatMessage = {
      id: generateMessageId(),
      role,
      content,
      timestamp: getCurrentTime(),
    }

    if (amendments) {
      message.amendments = amendments
    }

    set(state => ({
      messages: [...state.messages, message],
    }))

    // Auto-save to storage
    get().saveMessagesToStorage()
  },

  clearMessages: () => {
    set({ messages: [] })
    window.sessionStorage.removeItem(STORAGE_KEY)
  },

  setStatus: (status) => {
    set({ status })
  },

  setJobContext: (context) => {
    set({ currentJobContext: context })
  },

  setPendingAmendments: (amendments) => {
    set({
      pendingAmendments: amendments,
      status: ChatStatus.AwaitingReview,
    })
  },

  clearPendingAmendments: () => {
    set({
      pendingAmendments: [],
      status: ChatStatus.Idle,
    })
  },

  setError: (error) => {
    set({
      errorMessage: error,
      status: ChatStatus.Idle,
    })
  },

  loadMessagesFromStorage: () => {
    const messages = loadMessages()
    set({ messages })
  },

  saveMessagesToStorage: () => {
    const { messages } = get()
    saveMessages(messages)
  },
}))
