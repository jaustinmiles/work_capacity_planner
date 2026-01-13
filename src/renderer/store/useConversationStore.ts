/**
 * Conversation Store
 *
 * Manages chat sidebar state, conversations, and messages with database persistence.
 * Replaces the sessionStorage-based useBrainstormChatStore with a full database-backed
 * implementation supporting multiple conversations and inline amendment cards.
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { ChatMessageRole } from '@shared/enums'
import {
  Conversation,
  ChatMessageRecord,
  AmendmentCard,
  CreateConversationInput,
} from '@shared/conversation-types'
import { ConversationId, ChatMessageId, toConversationId, toChatMessageId } from '@shared/id-types'
import { getDatabase } from '../services/database'
import { JobContextData } from '../services/chat-context-provider'

// =============================================================================
// Types
// =============================================================================

/**
 * Status of the chat interface.
 */
export enum ConversationStatus {
  /** Ready for user input */
  Idle = 'idle',
  /** Loading data from database */
  Loading = 'loading',
  /** Waiting for AI response */
  Sending = 'sending',
  /** AI is generating amendments */
  GeneratingAmendments = 'generating_amendments',
  /** Applying an amendment with visual feedback */
  ApplyingAmendment = 'applying_amendment',
}

/**
 * State for the conversation store.
 */
interface ConversationState {
  // =========================================================================
  // Sidebar UI State (persisted to localStorage)
  // =========================================================================

  /** Whether the chat sidebar is open */
  sidebarOpen: boolean

  /** Width of the sidebar in pixels */
  sidebarWidth: number

  // =========================================================================
  // Conversation Data (loaded from database)
  // =========================================================================

  /** All conversations for the current session */
  conversations: Conversation[]

  /** Currently selected conversation ID (null = showing list) */
  activeConversationId: ConversationId | null

  /** Messages for the active conversation */
  messages: ChatMessageRecord[]

  /** Current job context for AI scoping */
  currentJobContext: JobContextData | null

  // =========================================================================
  // UI State
  // =========================================================================

  /** Current status of the chat interface */
  status: ConversationStatus

  /** Error message to display (null = no error) */
  errorMessage: string | null

  // =========================================================================
  // Streaming State
  // =========================================================================

  /** Text being streamed from AI (for progressive reveal) */
  streamingContent: string

  /** Whether we're currently streaming a response */
  isStreaming: boolean

  // =========================================================================
  // Amendment State
  // =========================================================================

  /** ID of item currently being highlighted after amendment application */
  highlightedItemId: string | null

  // =========================================================================
  // Actions
  // =========================================================================

  // Sidebar actions
  setSidebarOpen: (open: boolean) => void
  toggleSidebar: () => void
  setSidebarWidth: (width: number) => void

  // Conversation actions
  loadConversations: () => Promise<void>
  createConversation: (input?: CreateConversationInput) => Promise<Conversation>
  selectConversation: (id: ConversationId | null) => Promise<void>
  updateConversationTitle: (id: ConversationId, title: string) => Promise<void>
  deleteConversation: (id: ConversationId) => Promise<void>
  archiveConversation: (id: ConversationId) => Promise<void>

  // Message actions
  addUserMessage: (content: string) => Promise<ChatMessageRecord>
  addAssistantMessage: (content: string, amendments?: AmendmentCard[]) => Promise<ChatMessageRecord>
  clearMessages: () => void

  // Amendment actions
  updateAmendmentStatus: (
    messageId: ChatMessageId,
    cardId: string,
    status: 'pending' | 'applied' | 'skipped'
  ) => Promise<void>
  setHighlightedItemId: (id: string | null) => void

  // Streaming actions
  setStreamingContent: (content: string) => void
  appendStreamingContent: (chunk: string) => void
  finalizeStreaming: (amendments?: AmendmentCard[]) => Promise<void>

  // Status actions
  setStatus: (status: ConversationStatus) => void
  setError: (error: string | null) => void
  setJobContext: (context: JobContextData | null) => void
}

// =============================================================================
// Store
// =============================================================================

export const useConversationStore = create<ConversationState>()(
  persist(
    (set, get) => ({
      // =====================================================================
      // Initial State
      // =====================================================================

      // Sidebar state
      sidebarOpen: false,
      sidebarWidth: 400,

      // Conversation data
      conversations: [],
      activeConversationId: null,
      messages: [],
      currentJobContext: null,

      // UI state
      status: ConversationStatus.Idle,
      errorMessage: null,

      // Streaming state
      streamingContent: '',
      isStreaming: false,

      // Amendment state
      highlightedItemId: null,

      // =====================================================================
      // Sidebar Actions
      // =====================================================================

      setSidebarOpen: (open) => {
        set({ sidebarOpen: open })

        // Load conversations when opening sidebar
        if (open && get().conversations.length === 0) {
          get().loadConversations()
        }
      },

      toggleSidebar: () => {
        const { sidebarOpen } = get()
        get().setSidebarOpen(!sidebarOpen)
      },

      setSidebarWidth: (width) => {
        // Clamp width between min and max
        const clampedWidth = Math.max(300, Math.min(800, width))
        set({ sidebarWidth: clampedWidth })
      },

      // =====================================================================
      // Conversation Actions
      // =====================================================================

      loadConversations: async () => {
        set({ status: ConversationStatus.Loading })

        try {
          const db = getDatabase()
          const rawConversations = await db.getConversations()

          // Convert raw database records to typed Conversations
          const conversations: Conversation[] = rawConversations.map((raw: any) => ({
            id: toConversationId(raw.id),
            sessionId: raw.sessionId,
            jobContextId: raw.jobContextId,
            title: raw.title,
            createdAt: new Date(raw.createdAt),
            updatedAt: new Date(raw.updatedAt),
            isArchived: raw.isArchived,
            messageCount: raw.messageCount,
          }))

          set({ conversations, status: ConversationStatus.Idle })
        } catch (error) {
          console.error('Failed to load conversations:', error)
          set({
            errorMessage: 'Failed to load conversations',
            status: ConversationStatus.Idle,
          })
        }
      },

      createConversation: async (input) => {
        const db = getDatabase()

        const rawConversation = await db.createConversation({
          title: input?.title,
          jobContextId: input?.jobContextId,
        })

        const conversation: Conversation = {
          id: toConversationId(rawConversation.id),
          sessionId: rawConversation.sessionId,
          jobContextId: rawConversation.jobContextId,
          title: rawConversation.title,
          createdAt: new Date(rawConversation.createdAt),
          updatedAt: new Date(rawConversation.updatedAt),
          isArchived: rawConversation.isArchived,
          messageCount: 0,
        }

        set((state) => ({
          conversations: [conversation, ...state.conversations],
          activeConversationId: conversation.id,
          messages: [],
        }))

        return conversation
      },

      selectConversation: async (id) => {
        if (id === null) {
          set({ activeConversationId: null, messages: [] })
          return
        }

        set({ status: ConversationStatus.Loading, activeConversationId: id })

        try {
          const db = getDatabase()
          const rawMessages = await db.getChatMessages(id as string)

          // Convert raw database records to typed ChatMessageRecords
          const messages: ChatMessageRecord[] = rawMessages.map((raw: any) => ({
            id: toChatMessageId(raw.id),
            conversationId: toConversationId(raw.conversationId),
            role: raw.role as ChatMessageRole,
            content: raw.content,
            amendments: raw.amendments,
            createdAt: new Date(raw.createdAt),
          }))

          set({ messages, status: ConversationStatus.Idle })
        } catch (error) {
          console.error('Failed to load messages:', error)
          set({
            errorMessage: 'Failed to load messages',
            status: ConversationStatus.Idle,
          })
        }
      },

      updateConversationTitle: async (id, title) => {
        const db = getDatabase()
        await db.updateConversation(id as string, { title })

        set((state) => ({
          conversations: state.conversations.map((conv) =>
            conv.id === id ? { ...conv, title } : conv,
          ),
        }))
      },

      deleteConversation: async (id) => {
        const db = getDatabase()
        await db.deleteConversation(id as string)

        const { activeConversationId } = get()

        set((state) => ({
          conversations: state.conversations.filter((conv) => conv.id !== id),
          // Clear active conversation if it was deleted
          activeConversationId: activeConversationId === id ? null : activeConversationId,
          messages: activeConversationId === id ? [] : state.messages,
        }))
      },

      archiveConversation: async (id) => {
        const db = getDatabase()
        await db.updateConversation(id as string, { isArchived: true })

        set((state) => ({
          conversations: state.conversations.filter((conv) => conv.id !== id),
        }))
      },

      // =====================================================================
      // Message Actions
      // =====================================================================

      addUserMessage: async (content) => {
        const { activeConversationId } = get()

        if (!activeConversationId) {
          throw new Error('No active conversation')
        }

        const db = getDatabase()
        const rawMessage = await db.createChatMessage({
          conversationId: activeConversationId as string,
          role: ChatMessageRole.User,
          content,
        })

        const message: ChatMessageRecord = {
          id: toChatMessageId(rawMessage.id),
          conversationId: toConversationId(rawMessage.conversationId),
          role: ChatMessageRole.User,
          content: rawMessage.content,
          amendments: null,
          createdAt: new Date(rawMessage.createdAt),
        }

        set((state) => ({
          messages: [...state.messages, message],
        }))

        return message
      },

      addAssistantMessage: async (content, amendments) => {
        const { activeConversationId } = get()

        if (!activeConversationId) {
          throw new Error('No active conversation')
        }

        const db = getDatabase()
        const rawMessage = await db.createChatMessage({
          conversationId: activeConversationId as string,
          role: ChatMessageRole.Assistant,
          content,
          amendments,
        })

        const message: ChatMessageRecord = {
          id: toChatMessageId(rawMessage.id),
          conversationId: toConversationId(rawMessage.conversationId),
          role: ChatMessageRole.Assistant,
          content: rawMessage.content,
          amendments: rawMessage.amendments,
          createdAt: new Date(rawMessage.createdAt),
        }

        set((state) => ({
          messages: [...state.messages, message],
          streamingContent: '',
          isStreaming: false,
        }))

        return message
      },

      clearMessages: () => {
        set({ messages: [] })
      },

      // =====================================================================
      // Amendment Actions
      // =====================================================================

      updateAmendmentStatus: async (messageId, cardId, status) => {
        const db = getDatabase()
        await db.updateMessageAmendmentStatus(messageId as string, cardId, status)

        // Update local state
        set((state) => ({
          messages: state.messages.map((msg) => {
            if (msg.id !== messageId || !msg.amendments) return msg

            return {
              ...msg,
              amendments: msg.amendments.map((card) =>
                card.id === cardId ? { ...card, status } : card,
              ),
            }
          }),
        }))
      },

      setHighlightedItemId: (id) => {
        set({ highlightedItemId: id })

        // Auto-clear highlight after animation
        if (id) {
          setTimeout(() => {
            set({ highlightedItemId: null })
          }, 2000)
        }
      },

      // =====================================================================
      // Streaming Actions
      // =====================================================================

      setStreamingContent: (content) => {
        set({ streamingContent: content, isStreaming: true })
      },

      appendStreamingContent: (chunk) => {
        set((state) => ({
          streamingContent: state.streamingContent + chunk,
          isStreaming: true,
        }))
      },

      finalizeStreaming: async (amendments) => {
        const { streamingContent, activeConversationId } = get()

        if (!activeConversationId || !streamingContent) {
          set({ streamingContent: '', isStreaming: false })
          return
        }

        // Save the streamed content as an assistant message
        await get().addAssistantMessage(streamingContent, amendments)
      },

      // =====================================================================
      // Status Actions
      // =====================================================================

      setStatus: (status) => {
        set({ status })
      },

      setError: (error) => {
        set({
          errorMessage: error,
          status: ConversationStatus.Idle,
        })
      },

      setJobContext: (context) => {
        set({ currentJobContext: context })
      },
    }),
    {
      name: 'conversation-sidebar',
      // Only persist UI state, not data (data comes from database)
      partialize: (state) => ({
        sidebarOpen: state.sidebarOpen,
        sidebarWidth: state.sidebarWidth,
      }),
    },
  ),
)
