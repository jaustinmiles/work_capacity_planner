/**
 * Quick Chat Service
 *
 * Backs the one-shot quick-command surfaces (deep work board). Finds or
 * creates the session's dedicated "Quick Chat" conversation and sends
 * commands to the agent in AgentChatMode.Quick — fast model, auto-applied
 * writes, no clarification back-and-forth.
 */

import { getDatabase } from './database'
import { sendAgentMessage, AgentStreamCallbacks } from './agent-stream-handler'
import { AgentChatMode } from '@shared/enums'

/** Title of the per-session conversation that accumulates quick commands. */
export const QUICK_CHAT_CONVERSATION_TITLE = 'Quick Chat'

interface ConversationRecord {
  id: string
  title: string
  isArchived?: boolean
}

/**
 * Resolve the session's quick-chat conversation, creating it on first use.
 * Quick commands share one conversation so short follow-ups ("now make it
 * depend on the other one") have context, without polluting the user's
 * named brainstorm conversations.
 */
export async function ensureQuickChatConversation(): Promise<string> {
  const db = getDatabase()
  const conversations = await db.getConversations() as ConversationRecord[]
  const existing = conversations.find(
    conversation => conversation.title === QUICK_CHAT_CONVERSATION_TITLE && !conversation.isArchived,
  )
  if (existing) return existing.id

  const created = await db.createConversation({ title: QUICK_CHAT_CONVERSATION_TITLE }) as ConversationRecord
  return created.id
}

/**
 * Send a one-shot quick command to the agent.
 * Returns the AbortController for the underlying SSE request.
 */
export function sendQuickCommand(
  userMessage: string,
  conversationId: string,
  callbacks: AgentStreamCallbacks,
): AbortController {
  return sendAgentMessage(userMessage, conversationId, callbacks, AgentChatMode.Quick)
}
