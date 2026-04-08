/**
 * Agent Stream Handler
 *
 * SSE client that connects to the /api/agent/chat endpoint,
 * parses streaming events, and updates the conversation store.
 *
 * This is the renderer-side counterpart of the server's agent-chat-handler.
 */

import type {
  AgentSSEEvent,
  AgentProposedActionEvent,
} from '@shared/agent-types'
import { logger } from '@/logger'

export interface AgentStreamCallbacks {
  /** Progressive text content from the agent */
  onTextDelta: (content: string) => void
  /** Read tool execution status */
  onToolStatus: (event: AgentSSEEvent & { type: 'tool_status' }) => void
  /** Write tool proposal requiring user approval */
  onProposedAction: (event: AgentProposedActionEvent) => void
  /** Result of an approved/rejected action */
  onActionResult: (event: AgentSSEEvent & { type: 'action_result' }) => void
  /** Agent has finished responding */
  onDone: (toolCallCount: number, loopIterations: number) => void
  /** Error from the agent */
  onError: (message: string) => void
}

/**
 * Send a message to the AI agent via SSE and handle streaming events.
 *
 * Returns an AbortController that can be used to cancel the request.
 */
export function sendAgentMessage(
  userMessage: string,
  conversationId: string,
  callbacks: AgentStreamCallbacks,
): AbortController {
  const controller = new AbortController()
  const { serverUrl, apiKey } = window.appConfig
  const sessionId = window.localStorage.getItem('lastUsedSessionId')

  // Run the async SSE connection
  connectToAgentSSE(
    serverUrl,
    apiKey,
    sessionId,
    userMessage,
    conversationId,
    callbacks,
    controller.signal,
  ).catch((error) => {
    if (error instanceof Error && error.name === 'AbortError') return
    callbacks.onError(error instanceof Error ? error.message : String(error))
  })

  return controller
}

/**
 * Internal: establish SSE connection and process events.
 */
async function connectToAgentSSE(
  serverUrl: string,
  apiKey: string,
  sessionId: string | null,
  userMessage: string,
  conversationId: string,
  callbacks: AgentStreamCallbacks,
  signal: AbortSignal,
): Promise<void> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (apiKey) headers['x-api-key'] = apiKey
  if (sessionId) headers['x-session-id'] = sessionId

  const response = await fetch(`${serverUrl}/api/agent/chat`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ userMessage, conversationId }),
    signal,
  })

  if (!response.ok) {
    const errorBody = await response.text()
    throw new Error(`Agent request failed (${response.status}): ${errorBody}`)
  }

  if (!response.body) {
    throw new Error('No response body from agent endpoint')
  }

  // Read the SSE stream
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })

    // Process complete SSE events (separated by double newlines)
    const events = buffer.split('\n\n')
    // Keep the last incomplete chunk in the buffer
    buffer = events.pop() ?? ''

    for (const eventStr of events) {
      const trimmed = eventStr.trim()
      if (!trimmed) continue

      // Parse "data: {...}" format
      if (trimmed.startsWith('data: ')) {
        const jsonStr = trimmed.slice(6)
        try {
          const event = JSON.parse(jsonStr) as AgentSSEEvent
          dispatchEvent(event, callbacks)
        } catch (_parseError) {
          logger.ui.warn('Failed to parse SSE event', {
            raw: jsonStr.substring(0, 200),
          }, 'agent-sse-parse')
        }
      }
    }
  }
}

/**
 * Dispatch a parsed SSE event to the appropriate callback.
 */
function dispatchEvent(
  event: AgentSSEEvent,
  callbacks: AgentStreamCallbacks,
): void {
  switch (event.type) {
    case 'text_delta':
      callbacks.onTextDelta(event.content)
      break
    case 'tool_status':
      callbacks.onToolStatus(event)
      break
    case 'proposed_action':
      callbacks.onProposedAction(event)
      break
    case 'action_result':
      callbacks.onActionResult(event)
      break
    case 'done':
      callbacks.onDone(event.toolCallCount, event.loopIterations)
      break
    case 'error':
      callbacks.onError(event.message)
      break
  }
}

/**
 * Approve a pending write tool proposal via tRPC.
 */
export async function approveAgentAction(proposalId: string): Promise<void> {
  const { serverUrl, apiKey } = window.appConfig
  const sessionId = window.localStorage.getItem('lastUsedSessionId')

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (apiKey) headers['x-api-key'] = apiKey
  if (sessionId) headers['x-session-id'] = sessionId

  // Call the tRPC mutation directly via HTTP (simpler than setting up a separate tRPC client)
  // tRPC batch format: POST /trpc/agent.approveAction with input in query
  const response = await fetch(
    `${serverUrl}/trpc/agent.approveAction`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({ json: { proposalId } }),
    },
  )

  if (!response.ok) {
    throw new Error(`Failed to approve action: ${response.status}`)
  }
}

/**
 * Reject a pending write tool proposal via tRPC.
 */
export async function rejectAgentAction(proposalId: string): Promise<void> {
  const { serverUrl, apiKey } = window.appConfig
  const sessionId = window.localStorage.getItem('lastUsedSessionId')

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (apiKey) headers['x-api-key'] = apiKey
  if (sessionId) headers['x-session-id'] = sessionId

  const response = await fetch(
    `${serverUrl}/trpc/agent.rejectAction`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({ json: { proposalId } }),
    },
  )

  if (!response.ok) {
    throw new Error(`Failed to reject action: ${response.status}`)
  }
}
