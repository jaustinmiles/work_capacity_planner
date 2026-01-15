/**
 * Tests for Conversation Utilities
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { ChatMessageRole } from '@shared/enums'
import { ChatMessageRecord, AmendmentCard } from '@shared/conversation-types'
import { toChatMessageId, toConversationId } from '@shared/id-types'
import {
  SIDEBAR_MIN_WIDTH,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_DEFAULT_WIDTH,
  SIDEBAR_WIDTH_STORAGE_KEY,
  clampSidebarWidth,
  loadSidebarWidth,
  saveSidebarWidth,
  updateAmendmentInMessage,
  updateAmendmentStatusInMessages,
  findMessageById,
  messageContainsAmendment,
  generateConversationTitle,
  MAX_TITLE_LENGTH,
} from '../conversation-utils'

// Helper to create mock messages
function createMockMessage(
  id: string,
  overrides: Partial<ChatMessageRecord> = {},
): ChatMessageRecord {
  return {
    id: toChatMessageId(id),
    conversationId: toConversationId('conv_123'),
    role: ChatMessageRole.Assistant,
    content: 'Test message',
    amendments: null,
    createdAt: new Date('2025-01-13T12:00:00Z'),
    ...overrides,
  }
}

// Helper to create mock amendment
function createMockAmendment(
  id: string,
  status: 'pending' | 'applied' | 'skipped' = 'pending',
): AmendmentCard {
  return {
    id,
    amendment: { type: 'task_creation' as const, name: 'Test', duration: 30 } as any,
    status,
    preview: {
      title: 'Test',
      description: 'Test description',
      details: {},
    },
  }
}

describe('conversation-utils', () => {
  describe('Constants', () => {
    it('should have valid sidebar width constants', () => {
      expect(SIDEBAR_MIN_WIDTH).toBe(300)
      expect(SIDEBAR_MAX_WIDTH).toBe(800)
      expect(SIDEBAR_DEFAULT_WIDTH).toBe(400)
      expect(SIDEBAR_MIN_WIDTH).toBeLessThan(SIDEBAR_DEFAULT_WIDTH)
      expect(SIDEBAR_DEFAULT_WIDTH).toBeLessThan(SIDEBAR_MAX_WIDTH)
    })

    it('should have a storage key defined', () => {
      expect(SIDEBAR_WIDTH_STORAGE_KEY).toBe('chat-sidebar-width')
    })
  })

  describe('clampSidebarWidth', () => {
    it('should return value when within range', () => {
      expect(clampSidebarWidth(400)).toBe(400)
      expect(clampSidebarWidth(500)).toBe(500)
    })

    it('should clamp to minimum when too small', () => {
      expect(clampSidebarWidth(100)).toBe(SIDEBAR_MIN_WIDTH)
      expect(clampSidebarWidth(0)).toBe(SIDEBAR_MIN_WIDTH)
      expect(clampSidebarWidth(-100)).toBe(SIDEBAR_MIN_WIDTH)
    })

    it('should clamp to maximum when too large', () => {
      expect(clampSidebarWidth(1000)).toBe(SIDEBAR_MAX_WIDTH)
      expect(clampSidebarWidth(10000)).toBe(SIDEBAR_MAX_WIDTH)
    })

    it('should return default for NaN', () => {
      expect(clampSidebarWidth(NaN)).toBe(SIDEBAR_DEFAULT_WIDTH)
    })

    it('should return default for Infinity', () => {
      expect(clampSidebarWidth(Infinity)).toBe(SIDEBAR_DEFAULT_WIDTH)
      expect(clampSidebarWidth(-Infinity)).toBe(SIDEBAR_DEFAULT_WIDTH)
    })

    it('should respect custom min/max', () => {
      expect(clampSidebarWidth(100, 200, 600)).toBe(200)
      expect(clampSidebarWidth(700, 200, 600)).toBe(600)
      expect(clampSidebarWidth(400, 200, 600)).toBe(400)
    })
  })

  describe('loadSidebarWidth', () => {
    beforeEach(() => {
      window.localStorage.clear()
    })

    it('should return default when window.localStorage is empty', () => {
      expect(loadSidebarWidth()).toBe(SIDEBAR_DEFAULT_WIDTH)
    })

    it('should return stored value when valid', () => {
      window.localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, '500')
      expect(loadSidebarWidth()).toBe(500)
    })

    it('should clamp stored value if out of range', () => {
      window.localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, '1000')
      expect(loadSidebarWidth()).toBe(SIDEBAR_MAX_WIDTH)
    })

    it('should return default for invalid stored value', () => {
      window.localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, 'invalid')
      expect(loadSidebarWidth()).toBe(SIDEBAR_DEFAULT_WIDTH)
    })
  })

  describe('saveSidebarWidth', () => {
    beforeEach(() => {
      window.localStorage.clear()
    })

    it('should save valid width to window.localStorage', () => {
      saveSidebarWidth(500)
      expect(window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY)).toBe('500')
    })

    it('should clamp width before saving', () => {
      saveSidebarWidth(1000)
      expect(window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY)).toBe(String(SIDEBAR_MAX_WIDTH))
    })
  })

  describe('updateAmendmentInMessage', () => {
    it('should return unchanged message if no amendments', () => {
      const message = createMockMessage('msg_1', { amendments: null })
      const result = updateAmendmentInMessage(message, 'card_1', 'applied')
      expect(result).toBe(message)
    })

    it('should return unchanged message if card not found', () => {
      const message = createMockMessage('msg_1', {
        amendments: [createMockAmendment('card_1')],
      })
      const result = updateAmendmentInMessage(message, 'card_2', 'applied')
      expect(result).toBe(message)
    })

    it('should update amendment status immutably', () => {
      const originalAmendment = createMockAmendment('card_1', 'pending')
      const message = createMockMessage('msg_1', {
        amendments: [originalAmendment],
      })

      const result = updateAmendmentInMessage(message, 'card_1', 'applied')

      // Should be a new object
      expect(result).not.toBe(message)
      expect(result.amendments).not.toBe(message.amendments)

      // Original should be unchanged
      expect(message.amendments![0].status).toBe('pending')

      // New should be updated
      expect(result.amendments![0].status).toBe('applied')
    })

    it('should only update the specified amendment', () => {
      const message = createMockMessage('msg_1', {
        amendments: [
          createMockAmendment('card_1', 'pending'),
          createMockAmendment('card_2', 'pending'),
        ],
      })

      const result = updateAmendmentInMessage(message, 'card_1', 'applied')

      expect(result.amendments![0].status).toBe('applied')
      expect(result.amendments![1].status).toBe('pending')
    })
  })

  describe('updateAmendmentStatusInMessages', () => {
    it('should update correct message', () => {
      const messages = [
        createMockMessage('msg_1', { amendments: [createMockAmendment('card_1')] }),
        createMockMessage('msg_2', { amendments: [createMockAmendment('card_2')] }),
      ]

      const result = updateAmendmentStatusInMessages(
        messages,
        toChatMessageId('msg_1'),
        'card_1',
        'applied',
      )

      expect(result[0].amendments![0].status).toBe('applied')
      expect(result[1].amendments![0].status).toBe('pending')
    })

    it('should return new array', () => {
      const messages = [createMockMessage('msg_1', { amendments: [createMockAmendment('card_1')] })]

      const result = updateAmendmentStatusInMessages(
        messages,
        toChatMessageId('msg_1'),
        'card_1',
        'applied',
      )

      expect(result).not.toBe(messages)
    })

    it('should not modify messages without matching ID', () => {
      const messages = [
        createMockMessage('msg_1', { amendments: [createMockAmendment('card_1')] }),
        createMockMessage('msg_2', { amendments: [createMockAmendment('card_2')] }),
      ]

      const result = updateAmendmentStatusInMessages(
        messages,
        toChatMessageId('msg_3'),
        'card_1',
        'applied',
      )

      expect(result[0]).toBe(messages[0])
      expect(result[1]).toBe(messages[1])
    })
  })

  describe('findMessageById', () => {
    it('should find existing message', () => {
      const messages = [
        createMockMessage('msg_1'),
        createMockMessage('msg_2'),
      ]

      const result = findMessageById(messages, toChatMessageId('msg_2'))
      expect(result?.id).toBe(toChatMessageId('msg_2'))
    })

    it('should return undefined for non-existent message', () => {
      const messages = [createMockMessage('msg_1')]
      const result = findMessageById(messages, toChatMessageId('msg_2'))
      expect(result).toBeUndefined()
    })

    it('should return undefined for empty array', () => {
      const result = findMessageById([], toChatMessageId('msg_1'))
      expect(result).toBeUndefined()
    })
  })

  describe('messageContainsAmendment', () => {
    it('should return false for null amendments', () => {
      const message = createMockMessage('msg_1', { amendments: null })
      expect(messageContainsAmendment(message, 'card_1')).toBe(false)
    })

    it('should return false when amendment not found', () => {
      const message = createMockMessage('msg_1', {
        amendments: [createMockAmendment('card_1')],
      })
      expect(messageContainsAmendment(message, 'card_2')).toBe(false)
    })

    it('should return true when amendment found', () => {
      const message = createMockMessage('msg_1', {
        amendments: [createMockAmendment('card_1')],
      })
      expect(messageContainsAmendment(message, 'card_1')).toBe(true)
    })
  })

  describe('generateConversationTitle', () => {
    it('should return "New Conversation" for null input', () => {
      expect(generateConversationTitle(null as any)).toBe('New Conversation')
    })

    it('should return "New Conversation" for undefined input', () => {
      expect(generateConversationTitle(undefined as any)).toBe('New Conversation')
    })

    it('should return "New Conversation" for empty string', () => {
      expect(generateConversationTitle('')).toBe('New Conversation')
    })

    it('should return "New Conversation" for whitespace only', () => {
      expect(generateConversationTitle('   ')).toBe('New Conversation')
    })

    it('should return trimmed message if short enough', () => {
      expect(generateConversationTitle('Hello world')).toBe('Hello world')
    })

    it('should truncate long messages with ellipsis', () => {
      const longMessage = 'This is a very long message that exceeds the maximum title length'
      const result = generateConversationTitle(longMessage)
      expect(result.length).toBeLessThanOrEqual(MAX_TITLE_LENGTH + 3) // +3 for "..."
      expect(result).toMatch(/\.\.\.$/  )
    })

    it('should try to truncate at word boundary', () => {
      const message = 'Hello world this is a test message that is quite long'
      const result = generateConversationTitle(message, 20)
      // Truncates to 20 chars "Hello world this is " then finds lastSpace
      expect(result).toBe('Hello world this is...')
    })

    it('should respect custom maxLength', () => {
      const result = generateConversationTitle('Hello world', 5)
      expect(result).toBe('Hello...')
    })
  })

  describe('MAX_TITLE_LENGTH constant', () => {
    it('should be defined as 50', () => {
      expect(MAX_TITLE_LENGTH).toBe(50)
    })
  })
})
