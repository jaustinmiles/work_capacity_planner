/**
 * Branded (Nominal) ID Types
 *
 * This module provides type-safe ID types using TypeScript's "branding" pattern.
 * Branded types are structurally compatible with strings at runtime, but TypeScript
 * treats them as distinct types at compile time.
 *
 * Benefits:
 * - Prevents accidentally passing a ConversationId where a ChatMessageId is expected
 * - Self-documenting function signatures
 * - Zero runtime overhead (brands are erased during compilation)
 *
 * Usage:
 *   const convId = generateConversationId()
 *   const msgId = generateChatMessageId()
 *
 *   getMessage(convId)  // ❌ Type error - expected ChatMessageId
 *   getMessage(msgId)   // ✅ Correct
 */

// =============================================================================
// Brand Helper Type
// =============================================================================

/**
 * Creates a branded/nominal type by intersecting with a phantom brand property.
 * The brand property doesn't exist at runtime, only in the type system.
 */
type Brand<K, T> = K & { readonly __brand: T }

// =============================================================================
// Conversation ID Type
// =============================================================================

/**
 * Type-safe identifier for Conversation entities.
 * Format: "conv_{timestamp}_{random}"
 */
export type ConversationId = Brand<string, 'ConversationId'>

/**
 * Factory function to create a ConversationId from a string.
 * Use this when loading IDs from the database or external sources.
 *
 * @throws Error if id is empty or not a string
 */
export function ConversationId(id: string): ConversationId {
  if (!id || typeof id !== 'string') {
    throw new Error('Invalid ConversationId: must be a non-empty string')
  }
  return id as ConversationId
}

/**
 * Type guard to check if a value is a valid ConversationId.
 */
export function isConversationId(id: unknown): id is ConversationId {
  return typeof id === 'string' && id.length > 0
}

/**
 * Generate a new unique ConversationId.
 * Format: conv_{timestamp}_{random7chars}
 */
export function generateConversationId(): ConversationId {
  const timestamp = Date.now()
  const random = Math.random().toString(36).slice(2, 9)
  return ConversationId(`conv_${timestamp}_${random}`)
}

// =============================================================================
// Chat Message ID Type
// =============================================================================

/**
 * Type-safe identifier for ChatMessage entities.
 * Format: "msg_{timestamp}_{random}"
 */
export type ChatMessageId = Brand<string, 'ChatMessageId'>

/**
 * Factory function to create a ChatMessageId from a string.
 * Use this when loading IDs from the database or external sources.
 *
 * @throws Error if id is empty or not a string
 */
export function ChatMessageId(id: string): ChatMessageId {
  if (!id || typeof id !== 'string') {
    throw new Error('Invalid ChatMessageId: must be a non-empty string')
  }
  return id as ChatMessageId
}

/**
 * Type guard to check if a value is a valid ChatMessageId.
 */
export function isChatMessageId(id: unknown): id is ChatMessageId {
  return typeof id === 'string' && id.length > 0
}

/**
 * Generate a new unique ChatMessageId.
 * Format: msg_{timestamp}_{random7chars}
 */
export function generateChatMessageId(): ChatMessageId {
  const timestamp = Date.now()
  const random = Math.random().toString(36).slice(2, 9)
  return ChatMessageId(`msg_${timestamp}_${random}`)
}

// =============================================================================
// Utility Types for Database Serialization
// =============================================================================

/**
 * Extract the raw string value from a branded ID type.
 * Useful when you need to pass to APIs that expect plain strings.
 */
export function unwrapId<T extends string>(id: Brand<string, T>): string {
  return id as string
}

/**
 * Type to represent a raw ID string that needs to be wrapped.
 * Use this in database result types before conversion.
 */
export type RawConversationId = string
export type RawChatMessageId = string
