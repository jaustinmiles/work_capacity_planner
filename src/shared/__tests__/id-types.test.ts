/**
 * Tests for Branded ID Types
 *
 * Tests the type-safe ID system for ConversationId and ChatMessageId.
 */

import { describe, it, expect } from 'vitest'
import {
  ConversationId,
  ChatMessageId,
  toConversationId,
  toChatMessageId,
  isConversationId,
  isChatMessageId,
  generateConversationId,
  generateChatMessageId,
  unwrapId,
} from '../id-types'

describe('id-types', () => {
  describe('toConversationId', () => {
    it('should create ConversationId from valid string', () => {
      const id = toConversationId('conv_123')
      expect(id).toBe('conv_123')
    })

    it('should preserve the exact string value', () => {
      const input = 'conv_1234567890_abcdefg'
      const id = toConversationId(input)
      expect(id).toBe(input)
    })

    it('should throw for empty string', () => {
      expect(() => toConversationId('')).toThrow('Invalid ConversationId')
    })

    it('should throw for null', () => {
      expect(() => toConversationId(null as any)).toThrow('Invalid ConversationId')
    })

    it('should throw for undefined', () => {
      expect(() => toConversationId(undefined as any)).toThrow('Invalid ConversationId')
    })

    it('should throw for non-string types', () => {
      expect(() => toConversationId(123 as any)).toThrow('Invalid ConversationId')
      expect(() => toConversationId({} as any)).toThrow('Invalid ConversationId')
    })
  })

  describe('toChatMessageId', () => {
    it('should create ChatMessageId from valid string', () => {
      const id = toChatMessageId('msg_456')
      expect(id).toBe('msg_456')
    })

    it('should preserve the exact string value', () => {
      const input = 'msg_1234567890_xyz'
      const id = toChatMessageId(input)
      expect(id).toBe(input)
    })

    it('should throw for empty string', () => {
      expect(() => toChatMessageId('')).toThrow('Invalid ChatMessageId')
    })

    it('should throw for null', () => {
      expect(() => toChatMessageId(null as any)).toThrow('Invalid ChatMessageId')
    })

    it('should throw for undefined', () => {
      expect(() => toChatMessageId(undefined as any)).toThrow('Invalid ChatMessageId')
    })

    it('should throw for non-string types', () => {
      expect(() => toChatMessageId(123 as any)).toThrow('Invalid ChatMessageId')
      expect(() => toChatMessageId([] as any)).toThrow('Invalid ChatMessageId')
    })
  })

  describe('isConversationId', () => {
    it('should return true for non-empty strings', () => {
      expect(isConversationId('conv_123')).toBe(true)
      expect(isConversationId('any-string')).toBe(true)
      expect(isConversationId('a')).toBe(true)
    })

    it('should return false for empty string', () => {
      expect(isConversationId('')).toBe(false)
    })

    it('should return false for null', () => {
      expect(isConversationId(null)).toBe(false)
    })

    it('should return false for undefined', () => {
      expect(isConversationId(undefined)).toBe(false)
    })

    it('should return false for non-string types', () => {
      expect(isConversationId(123)).toBe(false)
      expect(isConversationId({})).toBe(false)
      expect(isConversationId([])).toBe(false)
      expect(isConversationId(true)).toBe(false)
    })
  })

  describe('isChatMessageId', () => {
    it('should return true for non-empty strings', () => {
      expect(isChatMessageId('msg_456')).toBe(true)
      expect(isChatMessageId('another-id')).toBe(true)
      expect(isChatMessageId('x')).toBe(true)
    })

    it('should return false for empty string', () => {
      expect(isChatMessageId('')).toBe(false)
    })

    it('should return false for null', () => {
      expect(isChatMessageId(null)).toBe(false)
    })

    it('should return false for undefined', () => {
      expect(isChatMessageId(undefined)).toBe(false)
    })

    it('should return false for non-string types', () => {
      expect(isChatMessageId(456)).toBe(false)
      expect(isChatMessageId({ id: 'msg' })).toBe(false)
    })
  })

  describe('generateConversationId', () => {
    it('should generate id with conv_ prefix', () => {
      const id = generateConversationId()
      expect(id.startsWith('conv_')).toBe(true)
    })

    it('should include timestamp', () => {
      const before = Date.now()
      const id = generateConversationId()
      const after = Date.now()

      // Extract timestamp from id (format: conv_{timestamp}_{random})
      const parts = id.split('_')
      const timestamp = parseInt(parts[1]!, 10)

      expect(timestamp).toBeGreaterThanOrEqual(before)
      expect(timestamp).toBeLessThanOrEqual(after)
    })

    it('should generate unique ids', () => {
      const ids = new Set<string>()
      for (let i = 0; i < 100; i++) {
        ids.add(generateConversationId())
      }
      expect(ids.size).toBe(100)
    })

    it('should return valid ConversationId type', () => {
      const id = generateConversationId()
      expect(isConversationId(id)).toBe(true)
    })
  })

  describe('generateChatMessageId', () => {
    it('should generate id with msg_ prefix', () => {
      const id = generateChatMessageId()
      expect(id.startsWith('msg_')).toBe(true)
    })

    it('should include timestamp', () => {
      const before = Date.now()
      const id = generateChatMessageId()
      const after = Date.now()

      // Extract timestamp from id (format: msg_{timestamp}_{random})
      const parts = id.split('_')
      const timestamp = parseInt(parts[1]!, 10)

      expect(timestamp).toBeGreaterThanOrEqual(before)
      expect(timestamp).toBeLessThanOrEqual(after)
    })

    it('should generate unique ids', () => {
      const ids = new Set<string>()
      for (let i = 0; i < 100; i++) {
        ids.add(generateChatMessageId())
      }
      expect(ids.size).toBe(100)
    })

    it('should return valid ChatMessageId type', () => {
      const id = generateChatMessageId()
      expect(isChatMessageId(id)).toBe(true)
    })
  })

  describe('unwrapId', () => {
    it('should unwrap ConversationId to string', () => {
      const id = toConversationId('conv_123')
      const unwrapped = unwrapId(id)
      expect(unwrapped).toBe('conv_123')
      expect(typeof unwrapped).toBe('string')
    })

    it('should unwrap ChatMessageId to string', () => {
      const id = toChatMessageId('msg_456')
      const unwrapped = unwrapId(id)
      expect(unwrapped).toBe('msg_456')
      expect(typeof unwrapped).toBe('string')
    })

    it('should unwrap generated ids', () => {
      const convId = generateConversationId()
      const msgId = generateChatMessageId()

      expect(typeof unwrapId(convId)).toBe('string')
      expect(typeof unwrapId(msgId)).toBe('string')
    })
  })

  describe('Type Safety (compile-time)', () => {
    // These tests verify runtime behavior that mirrors compile-time type safety
    it('ConversationId and ChatMessageId are distinct at runtime for debugging', () => {
      const convId = generateConversationId()
      const msgId = generateChatMessageId()

      // They have different prefixes, making them distinguishable
      expect(convId.startsWith('conv_')).toBe(true)
      expect(msgId.startsWith('msg_')).toBe(true)
    })

    it('should allow using branded ids as strings', () => {
      const convId: ConversationId = generateConversationId()
      const msgId: ChatMessageId = generateChatMessageId()

      // Can use string methods on branded types
      expect(convId.length).toBeGreaterThan(0)
      expect(msgId.includes('msg_')).toBe(true)
    })
  })
})
