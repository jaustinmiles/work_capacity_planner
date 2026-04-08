/**
 * Agent Loop
 *
 * Core agentic engine that orchestrates the multi-turn conversation
 * between Claude, the tool executors, and the client. Handles:
 *
 * - Streaming text to the client via SSE
 * - Auto-executing read tools and feeding results to Claude
 * - Pausing for user approval on write tools
 * - Feeding tool results (success, rejection, timeout) back to Claude
 * - Looping until Claude returns end_turn or max iterations reached
 */

import Anthropic from '@anthropic-ai/sdk'
import type { Context } from '../trpc'
import { getAIService } from '../../shared/ai-service'
import type { AgentSSEEvent, StoredToolCall } from '../../shared/agent-types'
import { ALL_TOOLS, READ_TOOL_NAMES, TOOL_REGISTRY } from './tool-definitions'
import { createToolExecutor } from './tool-executors'
import { buildAgentSystemPrompt, AgentSessionInfo } from './agent-context'
import { generateActionPreview } from './action-previews'
import { generateUniqueId } from '../../shared/step-id-utils'
import { logger } from '../../logger'

/** Maximum number of API round-trips in a single agent turn */
const MAX_LOOP_ITERATIONS = 15

/** Timeout for waiting on user approval of write tools (ms) */
const APPROVAL_TIMEOUT_MS = 5 * 60 * 1000 // 5 minutes

/**
 * Pending approval state — write tools wait here for user decision.
 * Keyed by proposalId. The agent loop awaits the Promise; the router
 * resolves it when the user approves or rejects.
 */
export interface PendingApproval {
  resolve: (decision: 'approved' | 'rejected') => void
  toolName: string
  toolInput: Record<string, unknown>
  createdAt: number
}

/** Global map of pending approvals. Shared with the agent router. */
export const pendingApprovals = new Map<string, PendingApproval>()

export interface AgentLoopOptions {
  userMessage: string
  conversationHistory: Anthropic.MessageParam[]
  sessionInfo: AgentSessionInfo
  ctx: Context
  onEvent: (event: AgentSSEEvent) => void
}

export interface AgentLoopResult {
  /** The full text response from the agent */
  responseText: string
  /** Tool calls made during this turn */
  toolCalls: StoredToolCall[]
  /** Number of API round-trips */
  loopIterations: number
}

/**
 * Run the agent loop for a single user turn.
 *
 * This is an async function that streams events to the client via
 * the onEvent callback while orchestrating multi-turn tool use
 * with Claude.
 */
export async function runAgentLoop(options: AgentLoopOptions): Promise<AgentLoopResult> {
  const { userMessage, conversationHistory, sessionInfo, ctx, onEvent } = options

  const aiService = getAIService()
  const toolExecutor = createToolExecutor(ctx)
  const systemPrompt = buildAgentSystemPrompt(sessionInfo)

  // Build the messages array: history + new user message
  const messages: Anthropic.MessageParam[] = [
    ...conversationHistory,
    { role: 'user', content: userMessage },
  ]

  let responseText = ''
  const storedToolCalls: StoredToolCall[] = []
  let loopIterations = 0

  // Agentic loop — keep calling Claude until it stops requesting tools
  while (loopIterations < MAX_LOOP_ITERATIONS) {
    loopIterations++

    logger.system.info('Agent loop iteration', {
      iteration: loopIterations,
      messageCount: messages.length,
    }, 'agent-loop')

    // Stream the response from Claude
    const stream = aiService.createAgentStream({
      systemPrompt,
      messages,
      tools: ALL_TOOLS,
      maxTokens: 8000,
    })

    // Collect the response content blocks for the messages array
    const assistantContent: Anthropic.ContentBlock[] = []
    const toolResultMessages: Anthropic.ToolResultBlockParam[] = []
    let currentText = ''

    // Process streaming events
    const finalMessage = await stream.finalMessage()

    // Process each content block in the response
    for (const block of finalMessage.content) {
      assistantContent.push(block)

      if (block.type === 'text') {
        currentText += block.text
        // Emit text in chunks for progressive rendering
        // Since we're using finalMessage(), emit the full text at once
        // (Streaming word-by-word requires event-based processing — see below)
        onEvent({
          type: 'text_delta',
          content: block.text,
        })
      } else if (block.type === 'tool_use') {
        const toolName = block.name
        const toolInput = block.input as Record<string, unknown>
        const toolCallId = block.id
        const registration = TOOL_REGISTRY[toolName]

        if (READ_TOOL_NAMES.has(toolName)) {
          // Read tool — execute immediately
          onEvent({
            type: 'tool_status',
            toolName,
            toolCallId,
            status: 'executing',
            label: registration?.statusLabel ?? `Running ${toolName}...`,
          })

          const startTime = Date.now()
          const result = await toolExecutor.execute(toolName, toolInput)
          const durationMs = Date.now() - startTime

          onEvent({
            type: 'tool_status',
            toolName,
            toolCallId,
            status: result.success ? 'completed' : 'error',
            label: registration?.statusLabel ?? toolName,
            durationMs,
          })

          // Store for conversation persistence
          storedToolCalls.push({
            toolCallId,
            toolName,
            toolInput,
            category: 'read',
            result: result.success ? result.data : undefined,
            error: result.error,
          })

          // Feed result back to Claude
          toolResultMessages.push({
            type: 'tool_result',
            tool_use_id: toolCallId,
            content: result.success
              ? JSON.stringify(result.data)
              : JSON.stringify({ error: result.error }),
            is_error: !result.success,
          })
        } else {
          // Write tool — pause for user approval
          const proposalId = generateUniqueId('proposal')
          const preview = generateActionPreview(toolName, toolInput)

          onEvent({
            type: 'proposed_action',
            proposalId,
            toolName,
            toolInput,
            preview,
          })

          // Wait for user decision
          const decision = await waitForApproval(proposalId, toolName, toolInput)

          if (decision === 'approved') {
            // Execute the write tool
            const result = await toolExecutor.execute(toolName, toolInput)

            onEvent({
              type: 'action_result',
              proposalId,
              status: result.success ? 'applied' : 'error',
              result: result.success ? result.data : undefined,
              error: result.error,
            })

            storedToolCalls.push({
              toolCallId,
              toolName,
              toolInput,
              category: 'write',
              approvalStatus: 'approved',
              result: result.success ? result.data : undefined,
              error: result.error,
            })

            toolResultMessages.push({
              type: 'tool_result',
              tool_use_id: toolCallId,
              content: result.success
                ? JSON.stringify(result.data)
                : JSON.stringify({ error: result.error }),
              is_error: !result.success,
            })
          } else {
            // User rejected or timeout
            onEvent({
              type: 'action_result',
              proposalId,
              status: decision === 'rejected' ? 'rejected' : 'timeout',
            })

            storedToolCalls.push({
              toolCallId,
              toolName,
              toolInput,
              category: 'write',
              approvalStatus: decision,
            })

            toolResultMessages.push({
              type: 'tool_result',
              tool_use_id: toolCallId,
              content: JSON.stringify({
                skipped: true,
                reason: decision === 'rejected'
                  ? 'User chose to skip this action.'
                  : 'User did not respond in time.',
              }),
              is_error: false, // Not an error — just user choice
            })
          }
        }
      }
    }

    // Accumulate text
    responseText += currentText

    // Add assistant message to history
    messages.push({
      role: 'assistant',
      content: assistantContent,
    })

    // Check if we should continue the loop
    if (finalMessage.stop_reason === 'end_turn') {
      // Claude is done — no more tool calls
      break
    }

    if (finalMessage.stop_reason === 'tool_use' && toolResultMessages.length > 0) {
      // Claude wants to continue after tool results — feed them back
      messages.push({
        role: 'user',
        content: toolResultMessages,
      })
      // Continue loop for next iteration
    } else {
      // Unexpected stop reason — break
      logger.system.warn('Unexpected agent stop reason', {
        stopReason: finalMessage.stop_reason,
      }, 'agent-loop')
      break
    }
  }

  if (loopIterations >= MAX_LOOP_ITERATIONS) {
    logger.system.warn('Agent loop hit max iterations', {
      maxIterations: MAX_LOOP_ITERATIONS,
    }, 'agent-loop')
    onEvent({
      type: 'error',
      message: 'Agent reached maximum number of tool calls for this turn.',
      code: 'MAX_ITERATIONS',
    })
  }

  onEvent({
    type: 'done',
    toolCallCount: storedToolCalls.length,
    loopIterations,
  })

  return {
    responseText,
    toolCalls: storedToolCalls,
    loopIterations,
  }
}

/**
 * Wait for a user approval decision on a write tool proposal.
 * Returns 'approved', 'rejected', or 'timeout'.
 */
function waitForApproval(
  proposalId: string,
  toolName: string,
  toolInput: Record<string, unknown>,
): Promise<'approved' | 'rejected' | 'timeout'> {
  return new Promise<'approved' | 'rejected' | 'timeout'>((resolve) => {
    // Register the pending approval
    pendingApprovals.set(proposalId, {
      resolve: (decision: 'approved' | 'rejected') => resolve(decision),
      toolName,
      toolInput,
      createdAt: Date.now(),
    })

    // Set timeout
    setTimeout(() => {
      if (pendingApprovals.has(proposalId)) {
        pendingApprovals.delete(proposalId)
        resolve('timeout')
      }
    }, APPROVAL_TIMEOUT_MS)
  })
}

/**
 * Resolve a pending approval — called by the agent router when
 * the user clicks Apply or Skip on a ProposedActionCard.
 */
export function resolveApproval(proposalId: string, decision: 'approved' | 'rejected'): boolean {
  const pending = pendingApprovals.get(proposalId)
  if (pending) {
    pending.resolve(decision)
    pendingApprovals.delete(proposalId)
    return true
  }
  return false
}
