/**
 * Conversation and Chat Message Types
 *
 * Types for the persistent chat system with inline amendment cards.
 * These types integrate with the branded ID types for compile-time safety.
 */

import {
  ConversationId,
  ChatMessageId,
  toConversationId,
  toChatMessageId,
} from './id-types'
import { ChatMessageRole, ViewType } from './enums'
import { Amendment } from './amendment-types'

// =============================================================================
// Amendment Card Types
// =============================================================================

/**
 * Status of an amendment card within a chat message.
 * - pending: User hasn't acted on this amendment yet
 * - applied: User clicked Apply and the amendment was successfully applied
 * - skipped: User clicked Skip to decline this amendment
 */
export type AmendmentCardStatus = 'pending' | 'applied' | 'skipped'

/**
 * Preview data for an amendment card.
 * Contains human-readable information about what the amendment will do.
 */
export interface AmendmentPreview {
  /** Short title like "Create Workflow" or "Update Status" */
  title: string

  /** Descriptive text like '"Launch Campaign" with 3 steps' */
  description: string

  /** Which view to navigate to when applying (for visual feedback) */
  targetView?: ViewType

  /** Amendment-type-specific details for rich preview rendering */
  details: Record<string, unknown>
}

/**
 * An amendment card embedded within a chat message.
 * Cards allow individual approval/rejection of AI-proposed changes.
 */
export interface AmendmentCard {
  /** Unique ID within the message (not a branded type since it's message-scoped) */
  id: string

  /** The actual amendment data that will be applied */
  amendment: Amendment

  /** Current status of this card */
  status: AmendmentCardStatus

  /** Rich preview information for display */
  preview: AmendmentPreview
}

// =============================================================================
// Database Record Types
// =============================================================================

/**
 * A conversation (chat session) stored in the database.
 * Conversations can be resumed across app restarts.
 */
export interface Conversation {
  /** Branded conversation ID for type safety */
  id: ConversationId

  /** Session this conversation belongs to */
  sessionId: string

  /** Optional link to a job context for scoped conversations */
  jobContextId: string | null

  /** User-visible title (auto-generated or user-provided) */
  title: string

  /** When the conversation was created */
  createdAt: Date

  /** When the conversation was last updated (new message added) */
  updatedAt: Date

  /** Soft delete flag - archived conversations are hidden but not deleted */
  isArchived: boolean

  /** Computed field: number of messages in this conversation */
  messageCount?: number
}

/**
 * A chat message stored in the database.
 * Messages can contain both text content and embedded amendment cards.
 */
export interface ChatMessageRecord {
  /** Branded message ID for type safety */
  id: ChatMessageId

  /** Parent conversation ID */
  conversationId: ConversationId

  /** Who sent this message */
  role: ChatMessageRole

  /** Text content of the message */
  content: string

  /** Embedded amendment cards (null if no amendments in this message) */
  amendments: AmendmentCard[] | null

  /** When the message was created */
  createdAt: Date
}

// =============================================================================
// Input Types for Database Operations
// =============================================================================

/**
 * Input for creating a new conversation.
 */
export interface CreateConversationInput {
  /** Optional title (will be auto-generated if not provided) */
  title?: string

  /** Optional job context to scope this conversation */
  jobContextId?: string
}

/**
 * Input for updating an existing conversation.
 */
export interface UpdateConversationInput {
  /** New title for the conversation */
  title?: string

  /** New job context (or null to clear) */
  jobContextId?: string | null

  /** Archive/unarchive the conversation */
  isArchived?: boolean
}

/**
 * Input for creating a new chat message.
 */
export interface CreateChatMessageInput {
  /** Parent conversation ID */
  conversationId: ConversationId

  /** Who is sending this message */
  role: ChatMessageRole

  /** Text content */
  content: string

  /** Optional embedded amendment cards */
  amendments?: AmendmentCard[]
}

// =============================================================================
// Raw Types for Database Serialization
// =============================================================================

/**
 * Raw conversation record from database before ID branding.
 * Used internally by the database layer.
 */
export interface RawConversation {
  id: string
  sessionId: string
  jobContextId: string | null
  title: string
  createdAt: Date
  updatedAt: Date
  isArchived: boolean
  _count?: { ChatMessage: number }
}

/**
 * Raw chat message record from database before ID branding.
 * Used internally by the database layer.
 */
export interface RawChatMessage {
  id: string
  conversationId: string
  role: string
  content: string
  amendments: string | null  // JSON string in database
  createdAt: Date
}

// =============================================================================
// Conversion Helpers
// =============================================================================

/**
 * Convert a raw database conversation to a typed Conversation.
 */
export function toConversation(raw: RawConversation): Conversation {
  return {
    id: toConversationId(raw.id),
    sessionId: raw.sessionId,
    jobContextId: raw.jobContextId,
    title: raw.title,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    isArchived: raw.isArchived,
    messageCount: raw._count?.ChatMessage,
  }
}

/**
 * Convert a raw database chat message to a typed ChatMessageRecord.
 */
export function toChatMessageRecord(raw: RawChatMessage): ChatMessageRecord {
  let amendments: AmendmentCard[] | null = null
  if (raw.amendments) {
    try {
      amendments = JSON.parse(raw.amendments)
    } catch {
      console.error('Failed to parse amendments JSON:', raw.amendments)
    }
  }

  return {
    id: toChatMessageId(raw.id),
    conversationId: toConversationId(raw.conversationId),
    role: raw.role as ChatMessageRole,
    content: raw.content,
    amendments,
    createdAt: raw.createdAt,
  }
}
