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
import {
  ApprovalDecision,
  ToolExecutionStatus,
  ActionResultStatus,
} from '../../shared/enums'
import { ALL_TOOLS, READ_TOOL_NAMES, MEMORY_TOOL_NAMES, TOOL_REGISTRY } from './tool-definitions'
import { createToolExecutor } from './tool-executors'
import { buildAgentSystemPrompt, AgentSessionInfo } from './agent-context'
import { generateActionPreview, PreviewEntityContext, EntityNameMap } from './action-previews'
import { prisma } from '../prisma'
import { generateUniqueId } from '../../shared/step-id-utils'
import { getCurrentTime } from '../../shared/time-provider'
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
  resolve: (decision: ApprovalDecision.Approved | ApprovalDecision.Rejected) => void
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

  // Load core memories (Layer 1) for injection into system prompt
  const coreMemories = await prisma.agentMemory.findMany({
    where: { sessionId: sessionInfo.sessionId },
    orderBy: [{ pinned: 'desc' }, { lastAccessedAt: 'desc' }],
    take: 30,
  })

  // Mark memories as accessed
  if (coreMemories.length > 0) {
    await prisma.agentMemory.updateMany({
      where: { id: { in: coreMemories.map(m => m.id) } },
      data: { lastAccessedAt: getCurrentTime() },
    })
  }

  const systemPrompt = buildAgentSystemPrompt(
    sessionInfo,
    coreMemories.map(m => ({
      ...m,
      category: m.category as import('../../shared/enums').MemoryCategory,
      source: m.source as import('../../shared/enums').MemorySource,
    })),
  )

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

        if (READ_TOOL_NAMES.has(toolName) || MEMORY_TOOL_NAMES.has(toolName)) {
          // Read tool or memory tool — execute immediately (no approval needed)
          onEvent({
            type: 'tool_status',
            toolName,
            toolCallId,
            status: ToolExecutionStatus.Executing,
            label: registration?.statusLabel ?? `Running ${toolName}...`,
          })

          const startTime = Date.now()
          const result = await toolExecutor.execute(toolName, toolInput)
          const durationMs = Date.now() - startTime

          onEvent({
            type: 'tool_status',
            toolName,
            toolCallId,
            status: result.success ? ToolExecutionStatus.Completed : ToolExecutionStatus.Error,
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
          const entityContext = await buildEntityContext(toolInput)
          const preview = generateActionPreview(toolName, toolInput, entityContext)

          onEvent({
            type: 'proposed_action',
            proposalId,
            toolName,
            toolInput,
            preview,
          })

          // Wait for user decision
          const decision = await waitForApproval(proposalId, toolName, toolInput)

          if (decision === ApprovalDecision.Approved) {
            // Execute the write tool
            const result = await toolExecutor.execute(toolName, toolInput)

            onEvent({
              type: 'action_result',
              proposalId,
              status: result.success ? ActionResultStatus.Applied : ActionResultStatus.Error,
              result: result.success ? result.data : undefined,
              error: result.error,
            })

            storedToolCalls.push({
              toolCallId,
              toolName,
              toolInput,
              category: 'write',
              approvalStatus: ApprovalDecision.Approved,
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
            const resultStatus = decision === ApprovalDecision.Rejected
              ? ActionResultStatus.Rejected
              : ActionResultStatus.Timeout
            onEvent({
              type: 'action_result',
              proposalId,
              status: resultStatus,
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
                reason: decision === ApprovalDecision.Rejected
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

/** Known input field names that reference task/workflow IDs */
const TASK_ID_FIELDS = new Set(['id', 'taskId', 'workflowId'])

/** Known input field names that reference endeavor IDs */
const ENDEAVOR_ID_FIELDS = new Set(['endeavorId'])

/**
 * Build entity context for preview generation by looking up
 * names for any IDs referenced in the tool input.
 *
 * Extracts entity IDs from known fields, batch-queries the DB,
 * and returns typed maps from ID → display name.
 */
async function buildEntityContext(
  toolInput: Record<string, unknown>,
): Promise<PreviewEntityContext> {
  const taskNames: EntityNameMap = new Map()
  const endeavorNames: EntityNameMap = new Map()
  const typeNames: EntityNameMap = new Map()

  // Collect IDs that need resolution from known field names
  const taskIds: string[] = []
  const endeavorIds: string[] = []

  for (const [key, value] of Object.entries(toolInput)) {
    if (typeof value !== 'string') continue
    if (TASK_ID_FIELDS.has(key)) taskIds.push(value)
    if (ENDEAVOR_ID_FIELDS.has(key)) endeavorIds.push(value)
  }

  // Batch lookup tasks
  if (taskIds.length > 0) {
    const tasks = await prisma.task.findMany({
      where: { id: { in: taskIds } },
      select: { id: true, name: true },
    })
    for (const t of tasks) {
      taskNames.set(t.id, t.name)
    }
  }

  // Batch lookup endeavors
  if (endeavorIds.length > 0) {
    const endeavors = await prisma.endeavor.findMany({
      where: { id: { in: endeavorIds } },
      select: { id: true, name: true },
    })
    for (const e of endeavors) {
      endeavorNames.set(e.id, e.name)
    }
  }

  // Lookup task types (small table, load all for broad coverage)
  const types = await prisma.userTaskType.findMany({
    select: { id: true, name: true },
  })
  for (const t of types) {
    typeNames.set(t.id, t.name)
  }

  return { taskNames, endeavorNames, typeNames }
}

/**
 * Wait for a user approval decision on a write tool proposal.
 */
function waitForApproval(
  proposalId: string,
  toolName: string,
  toolInput: Record<string, unknown>,
): Promise<ApprovalDecision> {
  return new Promise<ApprovalDecision>((resolve) => {
    // Register the pending approval
    pendingApprovals.set(proposalId, {
      resolve: (decision) => resolve(decision),
      toolName,
      toolInput,
      createdAt: Date.now(),
    })

    // Set timeout
    setTimeout(() => {
      if (pendingApprovals.has(proposalId)) {
        pendingApprovals.delete(proposalId)
        resolve(ApprovalDecision.Timeout)
      }
    }, APPROVAL_TIMEOUT_MS)
  })
}

/**
 * Resolve a pending approval — called by the agent router when
 * the user clicks Apply or Skip on a ProposedActionCard.
 */
export function resolveApproval(
  proposalId: string,
  decision: ApprovalDecision.Approved | ApprovalDecision.Rejected,
): boolean {
  const pending = pendingApprovals.get(proposalId)
  if (pending) {
    pending.resolve(decision)
    pendingApprovals.delete(proposalId)
    return true
  }
  return false
}
