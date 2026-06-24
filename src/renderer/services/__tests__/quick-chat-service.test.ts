/**
 * Tests for the quick chat service: quick-chat conversation reuse/creation
 * and quick-mode dispatch to the agent stream handler.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

const { mockGetConversations, mockCreateConversation, mockSendAgentMessage } = vi.hoisted(() => ({
  mockGetConversations: vi.fn(),
  mockCreateConversation: vi.fn(),
  mockSendAgentMessage: vi.fn(),
}))

vi.mock('../database', () => ({
  getDatabase: vi.fn(() => ({
    getConversations: mockGetConversations,
    createConversation: mockCreateConversation,
  })),
}))

vi.mock('../agent-stream-handler', () => ({
  sendAgentMessage: mockSendAgentMessage,
}))

import {
  ensureQuickChatConversation,
  sendQuickCommand,
  QUICK_CHAT_CONVERSATION_TITLE,
} from '../quick-chat-service'
import { AgentChatMode } from '@shared/enums'

describe('ensureQuickChatConversation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('reuses an existing non-archived Quick Chat conversation', async () => {
    mockGetConversations.mockResolvedValue([
      { id: 'conv-1', title: 'Sprint planning' },
      { id: 'conv-2', title: QUICK_CHAT_CONVERSATION_TITLE },
    ])

    const id = await ensureQuickChatConversation()

    expect(id).toBe('conv-2')
    expect(mockCreateConversation).not.toHaveBeenCalled()
  })

  it('skips an archived Quick Chat conversation and creates a fresh one', async () => {
    mockGetConversations.mockResolvedValue([
      { id: 'conv-old', title: QUICK_CHAT_CONVERSATION_TITLE, isArchived: true },
    ])
    mockCreateConversation.mockResolvedValue({ id: 'conv-new', title: QUICK_CHAT_CONVERSATION_TITLE })

    const id = await ensureQuickChatConversation()

    expect(id).toBe('conv-new')
    expect(mockCreateConversation).toHaveBeenCalledWith({ title: QUICK_CHAT_CONVERSATION_TITLE })
  })

  it('creates the conversation on first use', async () => {
    mockGetConversations.mockResolvedValue([])
    mockCreateConversation.mockResolvedValue({ id: 'conv-first', title: QUICK_CHAT_CONVERSATION_TITLE })

    const id = await ensureQuickChatConversation()

    expect(id).toBe('conv-first')
  })
})

describe('sendQuickCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('dispatches with AgentChatMode.Quick', () => {
    const controller = new AbortController()
    mockSendAgentMessage.mockReturnValue(controller)
    const callbacks = {
      onTextDelta: vi.fn(),
      onToolStatus: vi.fn(),
      onProposedAction: vi.fn(),
      onActionResult: vi.fn(),
      onNoToolWarning: vi.fn(),
      onDone: vi.fn(),
      onError: vi.fn(),
    }

    const returned = sendQuickCommand('create a task called Demo', 'conv-2', callbacks)

    expect(returned).toBe(controller)
    expect(mockSendAgentMessage).toHaveBeenCalledWith(
      'create a task called Demo',
      'conv-2',
      callbacks,
      AgentChatMode.Quick,
    )
  })
})
