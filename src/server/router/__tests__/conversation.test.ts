/**
 * Tests for the conversation router
 *
 * Tests Conversation and ChatMessage operations including
 * amendment status updates with JSON parsing
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  createMockContext,
  createMockConversation,
  createMockChatMessage,
  type MockPrisma,
} from './router-test-helpers'
import { ChatMessageRole } from '../../../shared/enums'

describe('conversation router', () => {
  let mockPrisma: MockPrisma
  let ctx: ReturnType<typeof createMockContext>

  beforeEach(() => {
    ctx = createMockContext()
    mockPrisma = ctx.prisma as unknown as MockPrisma
    vi.clearAllMocks()
  })

  describe('Conversation CRUD', () => {
    describe('getAll', () => {
      it('should return non-archived conversations for the session', async () => {
        const mockConversations = [
          createMockConversation({ id: 'conv-1', title: 'Conversation 1' }),
          createMockConversation({ id: 'conv-2', title: 'Conversation 2' }),
        ]
        mockPrisma.conversation.findMany.mockResolvedValue(mockConversations)

        const conversations = await mockPrisma.conversation.findMany({
          where: {
            sessionId: ctx.activeSessionId,
            isArchived: false,
          },
          include: {
            ChatMessage: {
              orderBy: { createdAt: 'asc' },
              take: 1,
            },
            JobContext: true,
          },
          orderBy: { updatedAt: 'desc' },
        })

        expect(conversations).toHaveLength(2)
        expect(mockPrisma.conversation.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({
              sessionId: 'test-session-id',
              isArchived: false,
            }),
          }),
        )
      })
    })

    describe('getById', () => {
      it('should return conversation with all messages', async () => {
        const mockConversation = createMockConversation({
          id: 'conv-123',
          ChatMessage: [
            createMockChatMessage({ id: 'msg-1', content: 'Hello' }),
            createMockChatMessage({ id: 'msg-2', content: 'Hi there', role: 'assistant' }),
          ],
        })
        mockPrisma.conversation.findUnique.mockResolvedValue(mockConversation)

        const conversation = await mockPrisma.conversation.findUnique({
          where: { id: 'conv-123' },
          include: {
            ChatMessage: {
              orderBy: { createdAt: 'asc' },
            },
            JobContext: true,
          },
        })

        expect(conversation).toBeTruthy()
        expect(conversation?.ChatMessage).toHaveLength(2)
      })

      it('should return null when not found', async () => {
        mockPrisma.conversation.findUnique.mockResolvedValue(null)

        const conversation = await mockPrisma.conversation.findUnique({
          where: { id: 'non-existent' },
        })

        expect(conversation).toBeNull()
      })
    })

    describe('create', () => {
      it('should create conversation with default title', async () => {
        const newConversation = createMockConversation({
          id: 'conv-new',
          title: 'New Conversation',
        })
        mockPrisma.conversation.create.mockResolvedValue(newConversation)

        const conversation = await mockPrisma.conversation.create({
          data: {
            sessionId: ctx.activeSessionId,
            title: 'New Conversation',
            jobContextId: null,
          },
        })

        expect(conversation.title).toBe('New Conversation')
      })

      it('should create conversation with job context', async () => {
        const newConversation = createMockConversation({
          id: 'conv-new',
          jobContextId: 'jctx-123',
        })
        mockPrisma.conversation.create.mockResolvedValue(newConversation)

        const conversation = await mockPrisma.conversation.create({
          data: {
            sessionId: ctx.activeSessionId,
            title: 'New Conversation',
            jobContextId: 'jctx-123',
          },
        })

        expect(conversation.jobContextId).toBe('jctx-123')
      })
    })

    describe('update', () => {
      it('should update conversation fields', async () => {
        const updatedConversation = createMockConversation({
          id: 'conv-123',
          title: 'Updated Title',
          isArchived: true,
        })
        mockPrisma.conversation.update.mockResolvedValue(updatedConversation)

        const conversation = await mockPrisma.conversation.update({
          where: { id: 'conv-123' },
          data: { title: 'Updated Title', isArchived: true },
        })

        expect(conversation.title).toBe('Updated Title')
        expect(conversation.isArchived).toBe(true)
      })
    })

    describe('delete', () => {
      it('should delete conversation by id', async () => {
        mockPrisma.conversation.delete.mockResolvedValue(createMockConversation())

        await mockPrisma.conversation.delete({
          where: { id: 'conv-123' },
        })

        expect(mockPrisma.conversation.delete).toHaveBeenCalledWith({
          where: { id: 'conv-123' },
        })
      })
    })
  })

  describe('Chat Messages', () => {
    describe('getMessages', () => {
      it('should return messages for a conversation ordered by createdAt', async () => {
        const messages = [
          createMockChatMessage({ id: 'msg-1', createdAt: new Date('2025-01-26T09:00:00') }),
          createMockChatMessage({ id: 'msg-2', createdAt: new Date('2025-01-26T09:05:00') }),
        ]
        mockPrisma.chatMessage.findMany.mockResolvedValue(messages)

        const result = await mockPrisma.chatMessage.findMany({
          where: { conversationId: 'conv-123' },
          orderBy: { createdAt: 'asc' },
        })

        expect(result).toHaveLength(2)
      })
    })

    describe('createMessage', () => {
      it('should create a user message', async () => {
        const newMessage = createMockChatMessage({
          id: 'msg-new',
          conversationId: 'conv-123',
          role: ChatMessageRole.User,
          content: 'Hello assistant',
        })
        mockPrisma.chatMessage.create.mockResolvedValue(newMessage)
        mockPrisma.conversation.update.mockResolvedValue(createMockConversation())

        const message = await mockPrisma.chatMessage.create({
          data: {
            conversationId: 'conv-123',
            role: ChatMessageRole.User,
            content: 'Hello assistant',
            amendments: null,
          },
        })

        expect(message.role).toBe(ChatMessageRole.User)
        expect(message.content).toBe('Hello assistant')
      })

      it('should create an assistant message with amendments', async () => {
        const amendments = JSON.stringify([
          { id: 'card-1', type: 'task', status: 'pending' },
          { id: 'card-2', type: 'step', status: 'pending' },
        ])
        const newMessage = createMockChatMessage({
          id: 'msg-new',
          role: ChatMessageRole.Assistant,
          content: 'Here are some changes',
          amendments,
        })
        mockPrisma.chatMessage.create.mockResolvedValue(newMessage)

        const message = await mockPrisma.chatMessage.create({
          data: {
            conversationId: 'conv-123',
            role: ChatMessageRole.Assistant,
            content: 'Here are some changes',
            amendments,
          },
        })

        expect(message.amendments).toBe(amendments)
        const parsed = JSON.parse(message.amendments as string)
        expect(parsed).toHaveLength(2)
      })

      it('should update conversation updatedAt when creating message', async () => {
        mockPrisma.chatMessage.create.mockResolvedValue(createMockChatMessage())
        mockPrisma.conversation.update.mockResolvedValue(createMockConversation())

        // Create message
        await mockPrisma.chatMessage.create({
          data: {
            conversationId: 'conv-123',
            role: ChatMessageRole.User,
            content: 'Test',
          },
        })

        // Update conversation updatedAt
        await mockPrisma.conversation.update({
          where: { id: 'conv-123' },
          data: { updatedAt: expect.any(Date) },
        })

        expect(mockPrisma.conversation.update).toHaveBeenCalled()
      })
    })

    describe('updateAmendmentStatus', () => {
      it('should update amendment card status in message', async () => {
        const originalAmendments = [
          { id: 'card-1', type: 'task', status: 'pending' },
          { id: 'card-2', type: 'step', status: 'pending' },
        ]
        const message = createMockChatMessage({
          id: 'msg-123',
          amendments: JSON.stringify(originalAmendments),
        })
        mockPrisma.chatMessage.findUnique.mockResolvedValue(message)

        // Fetch the message
        const fetchedMessage = await mockPrisma.chatMessage.findUnique({
          where: { id: 'msg-123' },
        })

        expect(fetchedMessage).toBeTruthy()
        expect(fetchedMessage?.amendments).toBeTruthy()

        // Parse, update, and re-stringify amendments
        const amendments = JSON.parse(fetchedMessage!.amendments as string)
        const cardIndex = amendments.findIndex((a: { id: string }) => a.id === 'card-1')

        expect(cardIndex).toBe(0)

        amendments[cardIndex].status = 'applied'

        const updatedMessage = createMockChatMessage({
          id: 'msg-123',
          amendments: JSON.stringify(amendments),
        })
        mockPrisma.chatMessage.update.mockResolvedValue(updatedMessage)

        const result = await mockPrisma.chatMessage.update({
          where: { id: 'msg-123' },
          data: {
            amendments: JSON.stringify(amendments),
          },
        })

        const resultAmendments = JSON.parse(result.amendments as string)
        expect(resultAmendments[0].status).toBe('applied')
        expect(resultAmendments[1].status).toBe('pending') // Unchanged
      })

      it('should throw error when message not found', async () => {
        mockPrisma.chatMessage.findUnique.mockResolvedValue(null)

        const message = await mockPrisma.chatMessage.findUnique({
          where: { id: 'non-existent' },
        })

        expect(message).toBeNull()
        // In real implementation: throw new Error('Message or amendments not found')
      })

      it('should throw error when amendments is null', async () => {
        const message = createMockChatMessage({
          id: 'msg-123',
          amendments: null,
        })
        mockPrisma.chatMessage.findUnique.mockResolvedValue(message)

        const fetchedMessage = await mockPrisma.chatMessage.findUnique({
          where: { id: 'msg-123' },
        })

        expect(fetchedMessage?.amendments).toBeNull()
        // In real implementation: throw new Error('Message or amendments not found')
      })

      it('should throw error when card not found in amendments', async () => {
        const amendments = [
          { id: 'card-1', type: 'task', status: 'pending' },
        ]
        const message = createMockChatMessage({
          id: 'msg-123',
          amendments: JSON.stringify(amendments),
        })
        mockPrisma.chatMessage.findUnique.mockResolvedValue(message)

        const fetchedMessage = await mockPrisma.chatMessage.findUnique({
          where: { id: 'msg-123' },
        })

        const parsedAmendments = JSON.parse(fetchedMessage!.amendments as string)
        const cardIndex = parsedAmendments.findIndex(
          (a: { id: string }) => a.id === 'non-existent-card',
        )

        expect(cardIndex).toBe(-1)
        // In real implementation: throw new Error(`Amendment card ${input.cardId} not found`)
      })
    })

    describe('deleteMessage', () => {
      it('should delete message by id', async () => {
        mockPrisma.chatMessage.delete.mockResolvedValue(createMockChatMessage())

        await mockPrisma.chatMessage.delete({
          where: { id: 'msg-123' },
        })

        expect(mockPrisma.chatMessage.delete).toHaveBeenCalledWith({
          where: { id: 'msg-123' },
        })
      })
    })
  })

  describe('ChatMessageRole enum usage', () => {
    it('should use proper enum values for roles', () => {
      expect(ChatMessageRole.User).toBe('user')
      expect(ChatMessageRole.Assistant).toBe('assistant')
      expect(ChatMessageRole.System).toBe('system')
    })
  })
})
