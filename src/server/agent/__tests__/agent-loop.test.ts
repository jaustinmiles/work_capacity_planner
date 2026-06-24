/**
 * Tests for agent loop approval mechanism and hallucination-warning gating
 *
 * Covers:
 * - The pendingApprovals map and resolveApproval function which form the
 *   bridge between the SSE-based agent loop and the tRPC approve/reject
 *   endpoints.
 * - The no-tool-warning gate in runAgentLoop: the hallucination check must
 *   run whenever no write tool was APPLIED (read-only turns included —
 *   regression for the gate that skipped the check on any tool call), and
 *   must not run when a write was approved and succeeded.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

const { mockCreateAgentStream, mockExecute, mockCheckForHallucination } = vi.hoisted(() => ({
  mockCreateAgentStream: vi.fn(),
  mockExecute: vi.fn(),
  mockCheckForHallucination: vi.fn(),
}))

vi.mock('../../../shared/ai-service', () => ({
  getAIService: vi.fn(() => ({ createAgentStream: mockCreateAgentStream })),
}))

vi.mock('../hallucination-check', () => ({
  checkForHallucination: mockCheckForHallucination,
}))

vi.mock('../../prisma', () => ({
  prisma: {
    agentMemory: {
      findMany: vi.fn(async () => []),
      updateMany: vi.fn(async () => ({ count: 0 })),
    },
    task: { findMany: vi.fn(async () => []) },
    endeavor: { findMany: vi.fn(async () => []) },
    userTaskType: { findMany: vi.fn(async () => []) },
  },
}))

vi.mock('../../router', () => ({
  appRouter: { createCaller: vi.fn(() => ({})) },
}))

vi.mock('../reference-validator', () => ({
  validateToolReferences: vi.fn(async () => ({ valid: true })),
}))

vi.mock('../tool-executors', () => ({
  createToolExecutor: vi.fn(() => ({ execute: mockExecute })),
}))

vi.mock('../agent-context', () => ({
  buildAgentSystemPrompt: vi.fn(() => 'test system prompt'),
  buildQuickAgentSystemPrompt: vi.fn(() => 'test quick system prompt'),
}))

vi.mock('../action-previews', () => ({
  generateActionPreview: vi.fn(() => ({
    title: 'Create Task',
    description: 'Test preview',
    details: {},
  })),
}))

vi.mock('../../../logger', () => ({
  logger: {
    system: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
  },
}))

import { runAgentLoop, pendingApprovals, resolveApproval, QUICK_AGENT_MODEL } from '../agent-loop'
import { ApprovalDecision, ActionResultStatus, AgentChatMode } from '../../../shared/enums'
import { validateToolReferences } from '../reference-validator'
import type { AgentSSEEvent } from '../../../shared/agent-types'
import { createMockContext } from '../../router/__tests__/router-test-helpers'

describe('agent loop approval mechanism', () => {
  beforeEach(() => {
    pendingApprovals.clear()
  })

  describe('resolveApproval', () => {
    it('should resolve a pending approval with Approved', () => {
      const mockResolve = vi.fn()
      pendingApprovals.set('proposal-1', {
        resolve: mockResolve,
        toolName: 'create_task',
        toolInput: { name: 'Test' },
        createdAt: Date.now(),
      })

      const result = resolveApproval('proposal-1', ApprovalDecision.Approved)

      expect(result).toBe(true)
      expect(mockResolve).toHaveBeenCalledWith(ApprovalDecision.Approved)
      expect(pendingApprovals.has('proposal-1')).toBe(false)
    })

    it('should resolve a pending approval with Rejected', () => {
      const mockResolve = vi.fn()
      pendingApprovals.set('proposal-2', {
        resolve: mockResolve,
        toolName: 'update_task',
        toolInput: { id: 'task-1' },
        createdAt: Date.now(),
      })

      const result = resolveApproval('proposal-2', ApprovalDecision.Rejected)

      expect(result).toBe(true)
      expect(mockResolve).toHaveBeenCalledWith(ApprovalDecision.Rejected)
      expect(pendingApprovals.has('proposal-2')).toBe(false)
    })

    it('should return false for unknown proposal IDs', () => {
      const result = resolveApproval('nonexistent', ApprovalDecision.Approved)
      expect(result).toBe(false)
    })

    it('should not resolve the same proposal twice', () => {
      const mockResolve = vi.fn()
      pendingApprovals.set('proposal-3', {
        resolve: mockResolve,
        toolName: 'create_task',
        toolInput: {},
        createdAt: Date.now(),
      })

      resolveApproval('proposal-3', ApprovalDecision.Approved)
      const secondResult = resolveApproval('proposal-3', ApprovalDecision.Rejected)

      expect(secondResult).toBe(false)
      expect(mockResolve).toHaveBeenCalledTimes(1)
      expect(mockResolve).toHaveBeenCalledWith(ApprovalDecision.Approved)
    })
  })

  describe('pendingApprovals map', () => {
    it('should track multiple concurrent proposals', () => {
      pendingApprovals.set('p1', {
        resolve: vi.fn(),
        toolName: 'create_task',
        toolInput: { name: 'Task A' },
        createdAt: Date.now(),
      })
      pendingApprovals.set('p2', {
        resolve: vi.fn(),
        toolName: 'update_task',
        toolInput: { id: 'task-1' },
        createdAt: Date.now(),
      })

      expect(pendingApprovals.size).toBe(2)

      resolveApproval('p1', ApprovalDecision.Approved)
      expect(pendingApprovals.size).toBe(1)

      resolveApproval('p2', ApprovalDecision.Rejected)
      expect(pendingApprovals.size).toBe(0)
    })
  })
})

// ============================================================================
// runAgentLoop — no-tool-warning gating
// ============================================================================

interface FakeTextBlock {
  type: 'text'
  text: string
}

interface FakeToolUseBlock {
  type: 'tool_use'
  id: string
  name: string
  input: Record<string, unknown>
}

interface FakeAgentMessage {
  content: Array<FakeTextBlock | FakeToolUseBlock>
  stop_reason: 'end_turn' | 'tool_use'
}

/** Queue fake Claude responses, one per agent-loop iteration */
function queueStreamMessages(...messages: FakeAgentMessage[]): void {
  for (const message of messages) {
    mockCreateAgentStream.mockImplementationOnce(() => ({
      finalMessage: () => Promise.resolve(message),
    }))
  }
}

const CLAIM_TEXT = 'Done! I created the three tasks you asked for and scheduled them all.'

interface RunLoopOutcome {
  result: Awaited<ReturnType<typeof runAgentLoop>>
  events: AgentSSEEvent[]
}

/**
 * Run the agent loop with collected events. When a write tool proposal
 * is emitted, the optional decision is applied on the next macrotask
 * (mirroring the real tRPC approve/reject round-trip).
 */
async function runLoop(
  approvalDecision?: ApprovalDecision.Approved | ApprovalDecision.Rejected,
  mode?: AgentChatMode,
): Promise<RunLoopOutcome> {
  const events: AgentSSEEvent[] = []
  const result = await runAgentLoop({
    userMessage: 'create my tasks',
    conversationHistory: [],
    sessionInfo: { sessionName: 'Test Session', sessionId: 'session-1' },
    ctx: createMockContext(),
    mode,
    onEvent: event => {
      events.push(event)
      if (event.type === 'proposed_action' && approvalDecision) {
        setTimeout(() => resolveApproval(event.proposalId, approvalDecision), 0)
      }
    },
  })
  return { result, events }
}

describe('runAgentLoop no-tool-warning gating', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // mockClear keeps queued once-implementations — reset the stream queue fully
    mockCreateAgentStream.mockReset()
    pendingApprovals.clear()
    mockCheckForHallucination.mockResolvedValue(null)
  })

  it('runs the check and emits the warning when no tools were called', async () => {
    queueStreamMessages({
      content: [{ type: 'text', text: CLAIM_TEXT }],
      stop_reason: 'end_turn',
    })
    mockCheckForHallucination.mockResolvedValue({
      confidence: 0.8,
      reasoning: 'claims completed actions',
    })

    const { result, events } = await runLoop()

    expect(mockCheckForHallucination).toHaveBeenCalledTimes(1)
    expect(mockCheckForHallucination).toHaveBeenCalledWith('create my tasks', CLAIM_TEXT, {
      readToolsRan: false,
    })
    expect(events).toContainEqual({
      type: 'no_tool_warning',
      confidence: 0.8,
      reasoning: 'claims completed actions',
    })
    expect(result.noToolWarning).toEqual({
      confidence: 0.8,
      reasoning: 'claims completed actions',
    })
  })

  it('runs the check when only READ tools ran (regression: any tool call suppressed it)', async () => {
    queueStreamMessages(
      {
        content: [{ type: 'tool_use', id: 'tu-1', name: 'get_tasks', input: {} }],
        stop_reason: 'tool_use',
      },
      {
        content: [{ type: 'text', text: CLAIM_TEXT }],
        stop_reason: 'end_turn',
      },
    )
    mockExecute.mockResolvedValue({ success: true, data: [] })
    mockCheckForHallucination.mockResolvedValue({
      confidence: 0.9,
      reasoning: 'claims writes after read-only turn',
    })

    const { result, events } = await runLoop()

    // The read tool was recorded — and the check must STILL run
    expect(result.toolCalls).toHaveLength(1)
    expect(result.toolCalls[0].category).toBe('read')
    expect(mockCheckForHallucination).toHaveBeenCalledTimes(1)
    expect(mockCheckForHallucination).toHaveBeenCalledWith('create my tasks', CLAIM_TEXT, {
      readToolsRan: true,
    })
    expect(events).toContainEqual({
      type: 'no_tool_warning',
      confidence: 0.9,
      reasoning: 'claims writes after read-only turn',
    })
    expect(result.noToolWarning).not.toBeNull()
  })

  it('does NOT run the check when a write tool was approved and applied', async () => {
    queueStreamMessages(
      {
        content: [
          { type: 'tool_use', id: 'tu-2', name: 'create_task', input: { name: 'Test' } },
        ],
        stop_reason: 'tool_use',
      },
      {
        content: [{ type: 'text', text: CLAIM_TEXT }],
        stop_reason: 'end_turn',
      },
    )
    mockExecute.mockResolvedValue({ success: true, data: { id: 'task-1' } })

    const { result, events } = await runLoop(ApprovalDecision.Approved)

    expect(result.toolCalls).toHaveLength(1)
    expect(result.toolCalls[0].approvalStatus).toBe(ApprovalDecision.Approved)
    expect(mockCheckForHallucination).not.toHaveBeenCalled()
    expect(events.some(event => event.type === 'no_tool_warning')).toBe(false)
    expect(result.noToolWarning).toBeNull()
  })

  it('runs the check when the only write tool was rejected by the user', async () => {
    queueStreamMessages(
      {
        content: [
          { type: 'tool_use', id: 'tu-3', name: 'create_task', input: { name: 'Test' } },
        ],
        stop_reason: 'tool_use',
      },
      {
        content: [{ type: 'text', text: CLAIM_TEXT }],
        stop_reason: 'end_turn',
      },
    )
    mockCheckForHallucination.mockResolvedValue({
      confidence: 0.7,
      reasoning: 'claims success after rejection',
    })

    const { result, events } = await runLoop(ApprovalDecision.Rejected)

    expect(result.toolCalls[0].approvalStatus).toBe(ApprovalDecision.Rejected)
    expect(mockCheckForHallucination).toHaveBeenCalledWith('create my tasks', CLAIM_TEXT, {
      readToolsRan: false,
    })
    expect(events).toContainEqual({
      type: 'no_tool_warning',
      confidence: 0.7,
      reasoning: 'claims success after rejection',
    })
  })

  it('runs the check when the approved write tool FAILED to execute', async () => {
    queueStreamMessages(
      {
        content: [
          { type: 'tool_use', id: 'tu-4', name: 'create_task', input: { name: 'Test' } },
        ],
        stop_reason: 'tool_use',
      },
      {
        content: [{ type: 'text', text: CLAIM_TEXT }],
        stop_reason: 'end_turn',
      },
    )
    mockExecute.mockResolvedValue({ success: false, error: 'database error' })
    mockCheckForHallucination.mockResolvedValue({
      confidence: 0.6,
      reasoning: 'claims success after failed write',
    })

    const { result } = await runLoop(ApprovalDecision.Approved)

    expect(result.toolCalls[0].error).toBe('database error')
    expect(mockCheckForHallucination).toHaveBeenCalledTimes(1)
    expect(result.noToolWarning).toEqual({
      confidence: 0.6,
      reasoning: 'claims success after failed write',
    })
  })

  it('emits no warning event when the check returns null', async () => {
    queueStreamMessages({
      content: [{ type: 'text', text: 'Here is how scheduling works in this app, explained.' }],
      stop_reason: 'end_turn',
    })
    mockCheckForHallucination.mockResolvedValue(null)

    const { result, events } = await runLoop()

    expect(mockCheckForHallucination).toHaveBeenCalledTimes(1)
    expect(events.some(event => event.type === 'no_tool_warning')).toBe(false)
    expect(result.noToolWarning).toBeNull()
  })
})

// ============================================================================
// runAgentLoop — quick command mode
// ============================================================================

describe('runAgentLoop quick mode', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateAgentStream.mockReset()
    pendingApprovals.clear()
    mockCheckForHallucination.mockResolvedValue(null)
  })

  it('auto-applies validated write tools without waiting for approval', async () => {
    queueStreamMessages(
      {
        content: [
          { type: 'tool_use', id: 'tu-q1', name: 'create_task', input: { name: 'Quick task' } },
        ],
        stop_reason: 'tool_use',
      },
      {
        content: [{ type: 'text', text: 'done — created Quick task' }],
        stop_reason: 'end_turn',
      },
    )
    mockExecute.mockResolvedValue({ success: true, data: { id: 'task-q1' } })

    // NO approval decision is queued — quick mode must not block on one.
    const { result, events } = await runLoop(undefined, AgentChatMode.Quick)

    expect(pendingApprovals.size).toBe(0)
    expect(mockExecute).toHaveBeenCalledWith('create_task', { name: 'Quick task' })
    expect(result.toolCalls).toHaveLength(1)
    expect(result.toolCalls[0].approvalStatus).toBe(ApprovalDecision.Approved)
    // Clients still get the proposal card + an immediate applied result.
    expect(events.some(event => event.type === 'proposed_action')).toBe(true)
    expect(
      events.some(
        event => event.type === 'action_result' && event.status === ActionResultStatus.Applied,
      ),
    ).toBe(true)
  })

  it('uses the fast model with a reduced token budget', async () => {
    queueStreamMessages({
      content: [{ type: 'text', text: 'didn\'t catch that — try again' }],
      stop_reason: 'end_turn',
    })

    await runLoop(undefined, AgentChatMode.Quick)

    expect(mockCreateAgentStream).toHaveBeenCalledWith(
      expect.objectContaining({ model: QUICK_AGENT_MODEL, maxTokens: 2000 }),
    )
  })

  it('full mode does not override the model (default omitted)', async () => {
    queueStreamMessages({
      content: [{ type: 'text', text: 'Here is an explanation.' }],
      stop_reason: 'end_turn',
    })

    await runLoop()

    const options = mockCreateAgentStream.mock.calls[0][0]
    expect(options.model).toBeUndefined()
    expect(options.maxTokens).toBe(8000)
  })

  it('skips the hallucination check even when no write was applied', async () => {
    queueStreamMessages({
      content: [{ type: 'text', text: CLAIM_TEXT }],
      stop_reason: 'end_turn',
    })

    const { result } = await runLoop(undefined, AgentChatMode.Quick)

    expect(mockCheckForHallucination).not.toHaveBeenCalled()
    expect(result.noToolWarning).toBeNull()
  })

  it('does not execute a write the reference validator rejected', async () => {
    queueStreamMessages(
      {
        content: [
          { type: 'tool_use', id: 'tu-q2', name: 'create_task', input: { type: 'fake-type' } },
        ],
        stop_reason: 'tool_use',
      },
      {
        content: [{ type: 'text', text: 'didn\'t catch that task type — try again' }],
        stop_reason: 'end_turn',
      },
    )
    vi.mocked(validateToolReferences).mockResolvedValueOnce({
      valid: false,
      error: 'Unknown task type: fake-type',
    })

    const { result } = await runLoop(undefined, AgentChatMode.Quick)

    expect(mockExecute).not.toHaveBeenCalled()
    expect(result.toolCalls[0].approvalStatus).toBe(ApprovalDecision.Rejected)
    expect(result.toolCalls[0].error).toBe('Unknown task type: fake-type')
  })
})
