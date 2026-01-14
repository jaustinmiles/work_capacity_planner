/**
 * Conversation Utilities
 *
 * Pure functions for conversation and sidebar management.
 * Extracted from useConversationStore for testability.
 */

import { ChatMessageRecord, AmendmentCardStatus } from '@shared/conversation-types'
import { ChatMessageId } from '@shared/id-types'

// =============================================================================
// Sidebar Width Constants
// =============================================================================

/** Minimum sidebar width in pixels */
export const SIDEBAR_MIN_WIDTH = 300

/** Maximum sidebar width in pixels */
export const SIDEBAR_MAX_WIDTH = 800

/** Default sidebar width in pixels */
export const SIDEBAR_DEFAULT_WIDTH = 400

/** LocalStorage key for sidebar width */
export const SIDEBAR_WIDTH_STORAGE_KEY = 'chat-sidebar-width'

// =============================================================================
// Sidebar Width Functions
// =============================================================================

/**
 * Clamp sidebar width to valid range.
 */
export function clampSidebarWidth(
  width: number,
  min: number = SIDEBAR_MIN_WIDTH,
  max: number = SIDEBAR_MAX_WIDTH,
): number {
  if (isNaN(width) || !isFinite(width)) {
    return SIDEBAR_DEFAULT_WIDTH
  }
  return Math.max(min, Math.min(max, width))
}

/**
 * Load sidebar width from localStorage.
 * Returns default if not found or invalid.
 */
export function loadSidebarWidth(): number {
  if (typeof window === 'undefined' || !window.localStorage) {
    return SIDEBAR_DEFAULT_WIDTH
  }

  const stored = window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY)
  if (!stored) {
    return SIDEBAR_DEFAULT_WIDTH
  }

  const parsed = parseInt(stored, 10)
  if (isNaN(parsed)) {
    return SIDEBAR_DEFAULT_WIDTH
  }

  return clampSidebarWidth(parsed)
}

/**
 * Save sidebar width to localStorage.
 */
export function saveSidebarWidth(width: number): void {
  if (typeof window === 'undefined' || !window.localStorage) {
    return
  }

  const clamped = clampSidebarWidth(width)
  window.localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(clamped))
}

// =============================================================================
// Amendment Status Update Functions
// =============================================================================

/**
 * Update the status of a single amendment in a message.
 * Returns a new message with the updated amendment (immutable).
 */
export function updateAmendmentInMessage(
  message: ChatMessageRecord,
  cardId: string,
  newStatus: AmendmentCardStatus,
): ChatMessageRecord {
  if (!message.amendments) {
    return message
  }

  const amendmentIndex = message.amendments.findIndex((a) => a.id === cardId)
  if (amendmentIndex === -1) {
    return message
  }

  // Create new amendments array with updated status
  const newAmendments = [...message.amendments]
  const existingAmendment = newAmendments[amendmentIndex]!
  newAmendments[amendmentIndex] = {
    ...existingAmendment,
    status: newStatus,
  }

  return {
    ...message,
    amendments: newAmendments,
  }
}

/**
 * Update amendment status across all messages.
 * Returns a new messages array (immutable).
 */
export function updateAmendmentStatusInMessages(
  messages: ChatMessageRecord[],
  messageId: ChatMessageId,
  cardId: string,
  newStatus: AmendmentCardStatus,
): ChatMessageRecord[] {
  return messages.map((msg) => {
    if (msg.id !== messageId) {
      return msg
    }
    return updateAmendmentInMessage(msg, cardId, newStatus)
  })
}

/**
 * Find a message by ID.
 */
export function findMessageById(
  messages: ChatMessageRecord[],
  messageId: ChatMessageId,
): ChatMessageRecord | undefined {
  return messages.find((msg) => msg.id === messageId)
}

/**
 * Check if a message contains a specific amendment.
 */
export function messageContainsAmendment(
  message: ChatMessageRecord,
  cardId: string,
): boolean {
  if (!message.amendments) {
    return false
  }
  return message.amendments.some((a) => a.id === cardId)
}

// =============================================================================
// Conversation Title Generation
// =============================================================================

/** Maximum length for auto-generated conversation titles */
export const MAX_TITLE_LENGTH = 50

/**
 * Generate a default title from the first user message.
 * Truncates if too long and adds ellipsis.
 */
export function generateConversationTitle(
  firstMessage: string,
  maxLength: number = MAX_TITLE_LENGTH,
): string {
  if (!firstMessage || typeof firstMessage !== 'string') {
    return 'New Conversation'
  }

  const trimmed = firstMessage.trim()
  if (trimmed.length === 0) {
    return 'New Conversation'
  }

  if (trimmed.length <= maxLength) {
    return trimmed
  }

  // Truncate at word boundary if possible
  const truncated = trimmed.substring(0, maxLength)
  const lastSpace = truncated.lastIndexOf(' ')

  if (lastSpace > maxLength * 0.5) {
    // Cut at word boundary if it's not too far back
    return truncated.substring(0, lastSpace) + '...'
  }

  return truncated + '...'
}
