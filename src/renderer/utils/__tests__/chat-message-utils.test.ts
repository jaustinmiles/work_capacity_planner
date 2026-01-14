/**
 * Tests for Chat Message Utilities
 */

import { describe, it, expect } from 'vitest'
import { ChatMessageRole } from '@shared/enums'
import { ChatMessageRecord, AmendmentCard } from '@shared/conversation-types'
import { toChatMessageId, toConversationId } from '@shared/id-types'
import {
  buildConversationHistory,
  isValidUserInput,
  shouldSendOnKeyDown,
  formatMessageTime,
  isUserMessage,
  isAssistantMessage,
  messageHasAmendments,
  countPendingAmendments,
  allAmendmentsProcessed,
} from '../chat-message-utils'

// Helper to create mock messages
function createMockMessage(
  overrides: Partial<ChatMessageRecord> = {},
): ChatMessageRecord {
  return {
    id: toChatMessageId('msg_123'),
    conversationId: toConversationId('conv_123'),
    role: ChatMessageRole.User,
    content: 'Test message',
    amendments: null,
    createdAt: new Date('2025-01-13T12:00:00Z'),
    ...overrides,
  }
}

// Helper to create mock amendment
function createMockAmendment(
  status: 'pending' | 'applied' | 'skipped' = 'pending',
): AmendmentCard {
  return {
    id: 'amend_123',
    amendment: { type: 'task_creation' as const, name: 'Test', duration: 30 } as any,
    status,
    preview: {
      title: 'Test',
      description: 'Test description',
      details: {},
    },
  }
}

describe('chat-message-utils', () => {
  describe('buildConversationHistory', () => {
    it('should return empty array for empty input', () => {
      expect(buildConversationHistory([])).toEqual([])
    })

    it('should return empty array for null input', () => {
      expect(buildConversationHistory(null as any)).toEqual([])
    })

    it('should return empty array for undefined input', () => {
      expect(buildConversationHistory(undefined as any)).toEqual([])
    })

    it('should extract role and content from messages', () => {
      const messages = [
        createMockMessage({ role: ChatMessageRole.User, content: 'Hello' }),
        createMockMessage({ role: ChatMessageRole.Assistant, content: 'Hi there' }),
      ]

      const result = buildConversationHistory(messages)

      expect(result).toEqual([
        { role: ChatMessageRole.User, content: 'Hello' },
        { role: ChatMessageRole.Assistant, content: 'Hi there' },
      ])
    })

    it('should preserve message order', () => {
      const messages = [
        createMockMessage({ content: 'First' }),
        createMockMessage({ content: 'Second' }),
        createMockMessage({ content: 'Third' }),
      ]

      const result = buildConversationHistory(messages)

      expect(result.map((m) => m.content)).toEqual(['First', 'Second', 'Third'])
    })

    it('should not include amendments or other fields', () => {
      const messages = [
        createMockMessage({
          amendments: [createMockAmendment()],
        }),
      ]

      const result = buildConversationHistory(messages)

      expect(result[0]).toEqual({
        role: ChatMessageRole.User,
        content: 'Test message',
      })
      expect((result[0] as any).amendments).toBeUndefined()
    })
  })

  describe('isValidUserInput', () => {
    it('should return false for null', () => {
      expect(isValidUserInput(null)).toBe(false)
    })

    it('should return false for undefined', () => {
      expect(isValidUserInput(undefined)).toBe(false)
    })

    it('should return false for empty string', () => {
      expect(isValidUserInput('')).toBe(false)
    })

    it('should return false for whitespace only', () => {
      expect(isValidUserInput('   ')).toBe(false)
      expect(isValidUserInput('\t\n')).toBe(false)
    })

    it('should return true for non-empty string', () => {
      expect(isValidUserInput('hello')).toBe(true)
    })

    it('should return true for string with leading/trailing whitespace', () => {
      expect(isValidUserInput('  hello  ')).toBe(true)
    })

    it('should return true for single character', () => {
      expect(isValidUserInput('a')).toBe(true)
    })
  })

  describe('shouldSendOnKeyDown', () => {
    it('should return true for Enter without Shift', () => {
      const event = { key: 'Enter', shiftKey: false } as KeyboardEvent
      expect(shouldSendOnKeyDown(event)).toBe(true)
    })

    it('should return false for Enter with Shift', () => {
      const event = { key: 'Enter', shiftKey: true } as KeyboardEvent
      expect(shouldSendOnKeyDown(event)).toBe(false)
    })

    it('should return false for other keys', () => {
      const event = { key: 'a', shiftKey: false } as KeyboardEvent
      expect(shouldSendOnKeyDown(event)).toBe(false)
    })

    it('should return false for Escape key', () => {
      const event = { key: 'Escape', shiftKey: false } as KeyboardEvent
      expect(shouldSendOnKeyDown(event)).toBe(false)
    })
  })

  describe('formatMessageTime', () => {
    it('should format Date object', () => {
      const date = new Date('2025-01-13T14:30:00Z')
      const result = formatMessageTime(date)
      // Result depends on locale, but should contain hour and minute
      expect(result).toMatch(/\d{1,2}:\d{2}/)
    })

    it('should format ISO date string', () => {
      const result = formatMessageTime('2025-01-13T14:30:00Z')
      expect(result).toMatch(/\d{1,2}:\d{2}/)
    })

    it('should return empty string for invalid date', () => {
      expect(formatMessageTime('invalid')).toBe('')
    })

    it('should handle invalid Date object', () => {
      expect(formatMessageTime(new Date('invalid'))).toBe('')
    })
  })

  describe('isUserMessage', () => {
    it('should return true for user message', () => {
      const message = createMockMessage({ role: ChatMessageRole.User })
      expect(isUserMessage(message)).toBe(true)
    })

    it('should return false for assistant message', () => {
      const message = createMockMessage({ role: ChatMessageRole.Assistant })
      expect(isUserMessage(message)).toBe(false)
    })

    it('should return false for system message', () => {
      const message = createMockMessage({ role: ChatMessageRole.System })
      expect(isUserMessage(message)).toBe(false)
    })
  })

  describe('isAssistantMessage', () => {
    it('should return true for assistant message', () => {
      const message = createMockMessage({ role: ChatMessageRole.Assistant })
      expect(isAssistantMessage(message)).toBe(true)
    })

    it('should return false for user message', () => {
      const message = createMockMessage({ role: ChatMessageRole.User })
      expect(isAssistantMessage(message)).toBe(false)
    })
  })

  describe('messageHasAmendments', () => {
    it('should return false for null amendments', () => {
      const message = createMockMessage({ amendments: null })
      expect(messageHasAmendments(message)).toBe(false)
    })

    it('should return false for empty amendments array', () => {
      const message = createMockMessage({ amendments: [] })
      expect(messageHasAmendments(message)).toBe(false)
    })

    it('should return true for message with amendments', () => {
      const message = createMockMessage({
        amendments: [createMockAmendment()],
      })
      expect(messageHasAmendments(message)).toBe(true)
    })

    it('should return true for message with multiple amendments', () => {
      const message = createMockMessage({
        amendments: [createMockAmendment(), createMockAmendment()],
      })
      expect(messageHasAmendments(message)).toBe(true)
    })
  })

  describe('countPendingAmendments', () => {
    it('should return 0 for null amendments', () => {
      const message = createMockMessage({ amendments: null })
      expect(countPendingAmendments(message)).toBe(0)
    })

    it('should return 0 for empty amendments', () => {
      const message = createMockMessage({ amendments: [] })
      expect(countPendingAmendments(message)).toBe(0)
    })

    it('should count pending amendments', () => {
      const message = createMockMessage({
        amendments: [
          createMockAmendment('pending'),
          createMockAmendment('applied'),
          createMockAmendment('pending'),
        ],
      })
      expect(countPendingAmendments(message)).toBe(2)
    })

    it('should return 0 when all amendments are processed', () => {
      const message = createMockMessage({
        amendments: [
          createMockAmendment('applied'),
          createMockAmendment('skipped'),
        ],
      })
      expect(countPendingAmendments(message)).toBe(0)
    })
  })

  describe('allAmendmentsProcessed', () => {
    it('should return true for null amendments', () => {
      const message = createMockMessage({ amendments: null })
      expect(allAmendmentsProcessed(message)).toBe(true)
    })

    it('should return true for empty amendments', () => {
      const message = createMockMessage({ amendments: [] })
      expect(allAmendmentsProcessed(message)).toBe(true)
    })

    it('should return true when all amendments are applied or skipped', () => {
      const message = createMockMessage({
        amendments: [
          createMockAmendment('applied'),
          createMockAmendment('skipped'),
          createMockAmendment('applied'),
        ],
      })
      expect(allAmendmentsProcessed(message)).toBe(true)
    })

    it('should return false when some amendments are pending', () => {
      const message = createMockMessage({
        amendments: [
          createMockAmendment('applied'),
          createMockAmendment('pending'),
        ],
      })
      expect(allAmendmentsProcessed(message)).toBe(false)
    })

    it('should return false when all amendments are pending', () => {
      const message = createMockMessage({
        amendments: [
          createMockAmendment('pending'),
          createMockAmendment('pending'),
        ],
      })
      expect(allAmendmentsProcessed(message)).toBe(false)
    })
  })
})
