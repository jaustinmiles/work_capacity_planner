/**
 * Chat Message Utilities
 *
 * Pure functions for chat message handling.
 * Extracted from ChatView component for testability.
 */

import { ChatMessageRecord } from '@shared/conversation-types'
import { ChatMessageRole } from '@shared/enums'

/**
 * Simple message structure for AI API calls.
 */
export interface ConversationMessage {
  role: ChatMessageRole
  content: string
}

/**
 * Build conversation history from chat message records.
 * Extracts only role and content for API consumption.
 */
export function buildConversationHistory(
  messages: ChatMessageRecord[],
): ConversationMessage[] {
  if (!messages || !Array.isArray(messages)) {
    return []
  }

  return messages.map((msg) => ({
    role: msg.role,
    content: msg.content,
  }))
}

/**
 * Validate user input before sending.
 * Returns true if input is valid (non-empty after trimming).
 */
export function isValidUserInput(content: string | null | undefined): boolean {
  if (content === null || content === undefined) {
    return false
  }

  return content.trim().length > 0
}

/**
 * Check if a keyboard event should trigger message send.
 * Enter key without Shift modifier sends the message.
 */
export function shouldSendOnKeyDown(e: KeyboardEvent | React.KeyboardEvent): boolean {
  return e.key === 'Enter' && !e.shiftKey
}

/**
 * Format a timestamp for display in chat bubbles.
 * Returns time in HH:MM format (12-hour with AM/PM).
 */
export function formatMessageTime(date: Date | string): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date

  if (isNaN(dateObj.getTime())) {
    return ''
  }

  return dateObj.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * Check if a message is from the user.
 */
export function isUserMessage(message: ChatMessageRecord): boolean {
  return message.role === ChatMessageRole.User
}

/**
 * Check if a message is from the assistant.
 */
export function isAssistantMessage(message: ChatMessageRecord): boolean {
  return message.role === ChatMessageRole.Assistant
}

/**
 * Check if a message has amendments.
 */
export function messageHasAmendments(message: ChatMessageRecord): boolean {
  return message.amendments !== null && message.amendments.length > 0
}

/**
 * Count pending amendments in a message.
 */
export function countPendingAmendments(message: ChatMessageRecord): number {
  if (!message.amendments) {
    return 0
  }

  return message.amendments.filter((a) => a.status === 'pending').length
}

/**
 * Check if all amendments in a message have been processed (applied or skipped).
 */
export function allAmendmentsProcessed(message: ChatMessageRecord): boolean {
  if (!message.amendments || message.amendments.length === 0) {
    return true
  }

  return message.amendments.every((a) => a.status !== 'pending')
}
