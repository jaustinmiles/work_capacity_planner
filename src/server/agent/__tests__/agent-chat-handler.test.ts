/**
 * Tests for the agent chat SSE handler — persisted-amendments path
 *
 * Covers how a no-tool warning produced by the agent loop is persisted
 * into the assistant message's amendments JSON (the wrapper the client
 * store parses), and how a persisted warning is fed back into the next
 * turn's conversation history as a SYSTEM NOTE.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { Request, Response } from 'express'

const { prismaMock, mockRunAgentLoop } = vi.hoisted(() => ({
  prismaMock: {
    session: { findUnique: vi.fn() },
    chatMessage: {
      findMany: vi.fn(),
      create: vi.fn(),
      count: vi.fn(),
    },
    workSession: { findFirst: vi.fn() },
    jobContext: { findFirst: vi.fn() },
    conversation: { update: vi.fn() },
    conversationSummary: { findUnique: vi.fn() },
  },
  mockRunAgentLoop: vi.fn(),
}))

vi.mock('../../prisma', () => ({ prisma: prismaMock }))

vi.mock('../agent-loop', () => ({ runAgentLoop: mockRunAgentLoop }))

vi.mock('../../middleware/auth', () => ({
  validateApiKey: vi.fn(() => ({ isAuthenticated: true, apiKey: 'test-key' })),
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

import { agentChatHandler } from '../agent-chat-handler'
import type { AgentLoopResult } from '../agent-loop'
import type { StoredToolCall } from '../../../shared/agent-types'

function createMockRequest(): Request {
  return {
    headers: { 'x-api-key': 'test-key', 'x-session-id': 'session-1' },
    body: { userMessage: 'create my tasks', conversationId: 'conv-1' },
  } as unknown as Request
}

function createMockResponse(): Response {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    setHeader: vi.fn(),
    flushHeaders: vi.fn(),
    write: vi.fn(() => true),
    end: vi.fn(),
  } as unknown as Response
}

const READ_TOOL_CALL: StoredToolCall = {
  toolCallId: 'tu-1',
  toolName: 'get_tasks',
  toolInput: {},
  category: 'read',
  result: [],
}

function loopResult(overrides: Partial<AgentLoopResult>): AgentLoopResult {
  return {
    responseText: 'Done! I created the three tasks you asked for.',
    toolCalls: [],
    loopIterations: 1,
    noToolWarning: null,
    ...overrides,
  }
}

/** Find the persisted assistant message create call and parse its amendments */
function persistedAssistantAmendments(): unknown {
  const assistantCall = prismaMock.chatMessage.create.mock.calls.find(
    call => call[0].data.role === 'assistant',
  )
  expect(assistantCall).toBeDefined()
  return JSON.parse(assistantCall?.[0].data.amendments)
}

describe('agentChatHandler persisted amendments', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    prismaMock.session.findUnique.mockResolvedValue({ id: 'session-1', name: 'Test Session' })
    prismaMock.chatMessage.findMany.mockResolvedValue([])
    prismaMock.chatMessage.create.mockResolvedValue({})
    prismaMock.chatMessage.count.mockResolvedValue(0)
    prismaMock.workSession.findFirst.mockResolvedValue(null)
    prismaMock.jobContext.findFirst.mockResolvedValue(null)
    prismaMock.conversation.update.mockResolvedValue({})
    prismaMock.conversationSummary.findUnique.mockResolvedValue(null)
  })

  it('persists the noToolWarning inside the amendments wrapper', async () => {
    mockRunAgentLoop.mockResolvedValue(
      loopResult({
        toolCalls: [READ_TOOL_CALL],
        noToolWarning: { confidence: 0.7, reasoning: 'claims completed actions' },
      }),
    )

    await agentChatHandler(createMockRequest(), createMockResponse())

    expect(persistedAssistantAmendments()).toEqual({
      toolCalls: [READ_TOOL_CALL],
      noToolWarning: { confidence: 0.7, reasoning: 'claims completed actions' },
    })
  })

  it('persists a bare toolCalls array when there is no warning', async () => {
    mockRunAgentLoop.mockResolvedValue(loopResult({ toolCalls: [READ_TOOL_CALL] }))

    await agentChatHandler(createMockRequest(), createMockResponse())

    expect(persistedAssistantAmendments()).toEqual([READ_TOOL_CALL])
  })

  it('feeds a persisted high-confidence warning back into history as a SYSTEM NOTE', async () => {
    prismaMock.chatMessage.findMany.mockResolvedValue([
      { role: 'user', content: 'create my tasks', amendments: null },
      {
        role: 'assistant',
        content: 'Done! I created them.',
        amendments: JSON.stringify({
          toolCalls: [],
          noToolWarning: { confidence: 0.8, reasoning: 'claims completed actions' },
        }),
      },
    ])
    mockRunAgentLoop.mockResolvedValue(loopResult({}))

    await agentChatHandler(createMockRequest(), createMockResponse())

    const history = mockRunAgentLoop.mock.calls[0][0].conversationHistory
    expect(history).toHaveLength(2)
    expect(history[1].role).toBe('assistant')
    expect(history[1].content).toContain('SYSTEM NOTE')
    expect(history[1].content).toContain('80%')
  })

  it('does not inject a SYSTEM NOTE for low-confidence warnings', async () => {
    prismaMock.chatMessage.findMany.mockResolvedValue([
      {
        role: 'assistant',
        content: 'Maybe done.',
        amendments: JSON.stringify({
          toolCalls: [],
          noToolWarning: { confidence: 0.4, reasoning: 'weak signal' },
        }),
      },
    ])
    mockRunAgentLoop.mockResolvedValue(loopResult({}))

    await agentChatHandler(createMockRequest(), createMockResponse())

    const history = mockRunAgentLoop.mock.calls[0][0].conversationHistory
    expect(history[0].content).not.toContain('SYSTEM NOTE')
  })
})
