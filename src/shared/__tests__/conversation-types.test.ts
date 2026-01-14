/**
 * Tests for Conversation Types
 *
 * Tests the conversion helpers for database records to typed entities.
 */

import { describe, it, expect } from 'vitest'
import { ChatMessageRole } from '../enums'
import {
  toConversation,
  toChatMessageRecord,
  RawConversation,
  RawChatMessage,
  AmendmentCard,
} from '../conversation-types'

describe('conversation-types', () => {
  describe('toConversation', () => {
    it('should convert raw conversation to typed Conversation', () => {
      const raw: RawConversation = {
        id: 'conv_123',
        sessionId: 'session_456',
        jobContextId: 'job_789',
        title: 'Test Conversation',
        createdAt: new Date('2025-01-13T10:00:00Z'),
        updatedAt: new Date('2025-01-13T11:00:00Z'),
        isArchived: false,
      }

      const result = toConversation(raw)

      expect(result.id).toBe('conv_123')
      expect(result.sessionId).toBe('session_456')
      expect(result.jobContextId).toBe('job_789')
      expect(result.title).toBe('Test Conversation')
      expect(result.createdAt).toEqual(new Date('2025-01-13T10:00:00Z'))
      expect(result.updatedAt).toEqual(new Date('2025-01-13T11:00:00Z'))
      expect(result.isArchived).toBe(false)
    })

    it('should handle null jobContextId', () => {
      const raw: RawConversation = {
        id: 'conv_123',
        sessionId: 'session_456',
        jobContextId: null,
        title: 'No Job Context',
        createdAt: new Date(),
        updatedAt: new Date(),
        isArchived: false,
      }

      const result = toConversation(raw)

      expect(result.jobContextId).toBeNull()
    })

    it('should handle archived conversations', () => {
      const raw: RawConversation = {
        id: 'conv_archived',
        sessionId: 'session_456',
        jobContextId: null,
        title: 'Archived',
        createdAt: new Date(),
        updatedAt: new Date(),
        isArchived: true,
      }

      const result = toConversation(raw)

      expect(result.isArchived).toBe(true)
    })

    it('should include message count when available', () => {
      const raw: RawConversation = {
        id: 'conv_123',
        sessionId: 'session_456',
        jobContextId: null,
        title: 'With Count',
        createdAt: new Date(),
        updatedAt: new Date(),
        isArchived: false,
        _count: { ChatMessage: 5 },
      }

      const result = toConversation(raw)

      expect(result.messageCount).toBe(5)
    })

    it('should handle missing message count', () => {
      const raw: RawConversation = {
        id: 'conv_123',
        sessionId: 'session_456',
        jobContextId: null,
        title: 'No Count',
        createdAt: new Date(),
        updatedAt: new Date(),
        isArchived: false,
      }

      const result = toConversation(raw)

      expect(result.messageCount).toBeUndefined()
    })
  })

  describe('toChatMessageRecord', () => {
    it('should convert raw message to typed ChatMessageRecord', () => {
      const raw: RawChatMessage = {
        id: 'msg_123',
        conversationId: 'conv_456',
        role: 'user',
        content: 'Hello, world!',
        amendments: null,
        createdAt: new Date('2025-01-13T12:00:00Z'),
      }

      const result = toChatMessageRecord(raw)

      expect(result.id).toBe('msg_123')
      expect(result.conversationId).toBe('conv_456')
      expect(result.role).toBe(ChatMessageRole.User)
      expect(result.content).toBe('Hello, world!')
      expect(result.amendments).toBeNull()
      expect(result.createdAt).toEqual(new Date('2025-01-13T12:00:00Z'))
    })

    it('should handle assistant role', () => {
      const raw: RawChatMessage = {
        id: 'msg_123',
        conversationId: 'conv_456',
        role: 'assistant',
        content: 'Hi there!',
        amendments: null,
        createdAt: new Date(),
      }

      const result = toChatMessageRecord(raw)

      expect(result.role).toBe(ChatMessageRole.Assistant)
    })

    it('should handle system role', () => {
      const raw: RawChatMessage = {
        id: 'msg_123',
        conversationId: 'conv_456',
        role: 'system',
        content: 'System message',
        amendments: null,
        createdAt: new Date(),
      }

      const result = toChatMessageRecord(raw)

      expect(result.role).toBe(ChatMessageRole.System)
    })

    it('should parse amendments JSON', () => {
      const amendments: AmendmentCard[] = [
        {
          id: 'amend_1',
          amendment: { type: 'task_creation' as any, name: 'Test', duration: 30 },
          status: 'pending',
          preview: { title: 'Create Task', description: 'Test', details: {} },
        },
      ]

      const raw: RawChatMessage = {
        id: 'msg_123',
        conversationId: 'conv_456',
        role: 'assistant',
        content: 'Creating a task for you.',
        amendments: JSON.stringify(amendments),
        createdAt: new Date(),
      }

      const result = toChatMessageRecord(raw)

      expect(result.amendments).toHaveLength(1)
      expect(result.amendments![0]!.id).toBe('amend_1')
      expect(result.amendments![0]!.status).toBe('pending')
    })

    it('should handle multiple amendments', () => {
      const amendments: AmendmentCard[] = [
        {
          id: 'amend_1',
          amendment: { type: 'task_creation' as any, name: 'Task 1', duration: 30 },
          status: 'applied',
          preview: { title: 'Create Task', description: 'Task 1', details: {} },
        },
        {
          id: 'amend_2',
          amendment: { type: 'task_creation' as any, name: 'Task 2', duration: 45 },
          status: 'skipped',
          preview: { title: 'Create Task', description: 'Task 2', details: {} },
        },
      ]

      const raw: RawChatMessage = {
        id: 'msg_123',
        conversationId: 'conv_456',
        role: 'assistant',
        content: 'Multiple tasks.',
        amendments: JSON.stringify(amendments),
        createdAt: new Date(),
      }

      const result = toChatMessageRecord(raw)

      expect(result.amendments).toHaveLength(2)
      expect(result.amendments![0]!.status).toBe('applied')
      expect(result.amendments![1]!.status).toBe('skipped')
    })

    it('should handle invalid amendments JSON gracefully', () => {
      const raw: RawChatMessage = {
        id: 'msg_123',
        conversationId: 'conv_456',
        role: 'assistant',
        content: 'Bad JSON',
        amendments: 'not valid json{{{',
        createdAt: new Date(),
      }

      // Should not throw, just return null amendments
      const result = toChatMessageRecord(raw)

      expect(result.amendments).toBeNull()
    })

    it('should handle empty amendments string as null', () => {
      const raw: RawChatMessage = {
        id: 'msg_123',
        conversationId: 'conv_456',
        role: 'user',
        content: 'No amendments',
        amendments: '',
        createdAt: new Date(),
      }

      const result = toChatMessageRecord(raw)

      // Empty string is falsy, so amendments should be null
      expect(result.amendments).toBeNull()
    })
  })
})
