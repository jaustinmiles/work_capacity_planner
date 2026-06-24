import type Anthropic from '@anthropic-ai/sdk'

/**
 * Roles for the Anthropic Messages API. Deliberately separate from the
 * DB-persistence `ChatMessageRole` enum (which also carries `System`): the
 * Messages API only accepts user/assistant turns, so these are typed to that
 * exact wire union and can be assigned directly to `Anthropic.MessageParam`.
 */
export const MessageRole = {
  User: 'user',
  Assistant: 'assistant',
} as const satisfies Record<string, Anthropic.MessageParam['role']>

/** True when a turn is an assistant turn (replaces scattered `=== 'assistant'`). */
export function isAssistantRole(role: string | undefined): boolean {
  return role === MessageRole.Assistant
}
