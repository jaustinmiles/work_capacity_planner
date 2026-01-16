/**
 * Conversation Router
 *
 * Handles chat conversations and messages.
 * Conversations persist across app sessions for AI chat history.
 */

import { z } from 'zod'
import { router, sessionProcedure, protectedProcedure } from '../trpc'
import { generateConversationId, generateChatMessageId } from '../../shared/id-types'
import { getCurrentTime } from '../../shared/time-provider'
import { ChatMessageRole } from '../../shared/enums'

/**
 * Schema for creating a conversation
 */
const createConversationInput = z.object({
  title: z.string().optional(),
  jobContextId: z.string().optional(),
})

/**
 * Schema for updating a conversation
 */
const updateConversationInput = z.object({
  id: z.string(),
  title: z.string().optional(),
  jobContextId: z.string().optional(),
  isArchived: z.boolean().optional(),
})

/**
 * Schema for creating a chat message
 */
const createMessageInput = z.object({
  conversationId: z.string(),
  role: z.nativeEnum(ChatMessageRole),
  content: z.string(),
  amendments: z.string().optional(), // JSON string of AmendmentCard[]
})

/**
 * Schema for updating amendment status
 */
const updateAmendmentInput = z.object({
  messageId: z.string(),
  cardId: z.string(),
  status: z.enum(['pending', 'applied', 'rejected', 'modified']),
})

export const conversationRouter = router({
  /**
   * Get all non-archived conversations for the session
   */
  getAll: sessionProcedure.query(async ({ ctx }) => {
    return ctx.prisma.conversation.findMany({
      where: {
        sessionId: ctx.sessionId,
        isArchived: false,
      },
      include: {
        ChatMessage: {
          orderBy: { createdAt: 'asc' },
          take: 1, // Just get first message for preview
        },
        JobContext: true,
      },
      orderBy: { updatedAt: 'desc' },
    })
  }),

  /**
   * Get a single conversation by ID with all messages
   */
  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.prisma.conversation.findUnique({
        where: { id: input.id },
        include: {
          ChatMessage: {
            orderBy: { createdAt: 'asc' },
          },
          JobContext: true,
        },
      })
    }),

  /**
   * Create a new conversation
   */
  create: sessionProcedure
    .input(createConversationInput)
    .mutation(async ({ ctx, input }) => {
      const id = generateConversationId()

      return ctx.prisma.conversation.create({
        data: {
          id,
          sessionId: ctx.sessionId,
          title: input.title || 'New Conversation',
          jobContextId: input.jobContextId || null,
        },
        include: {
          ChatMessage: true,
          JobContext: true,
        },
      })
    }),

  /**
   * Update a conversation
   */
  update: protectedProcedure
    .input(updateConversationInput)
    .mutation(async ({ ctx, input }) => {
      const { id, ...updates } = input

      return ctx.prisma.conversation.update({
        where: { id },
        data: updates,
        include: {
          ChatMessage: true,
          JobContext: true,
        },
      })
    }),

  /**
   * Delete a conversation (cascades to messages)
   */
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.conversation.delete({
        where: { id: input.id },
      })
      return { success: true }
    }),

  /**
   * Get messages for a conversation
   */
  getMessages: protectedProcedure
    .input(z.object({ conversationId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.prisma.chatMessage.findMany({
        where: { conversationId: input.conversationId },
        orderBy: { createdAt: 'asc' },
      })
    }),

  /**
   * Create a chat message
   */
  createMessage: protectedProcedure
    .input(createMessageInput)
    .mutation(async ({ ctx, input }) => {
      const id = generateChatMessageId()

      // Create message
      const message = await ctx.prisma.chatMessage.create({
        data: {
          id,
          conversationId: input.conversationId,
          role: input.role,
          content: input.content,
          amendments: input.amendments || null,
        },
      })

      // Update conversation's updatedAt
      await ctx.prisma.conversation.update({
        where: { id: input.conversationId },
        data: { updatedAt: getCurrentTime() },
      })

      return message
    }),

  /**
   * Update amendment card status in a message
   */
  updateAmendmentStatus: protectedProcedure
    .input(updateAmendmentInput)
    .mutation(async ({ ctx, input }) => {
      const message = await ctx.prisma.chatMessage.findUnique({
        where: { id: input.messageId },
      })

      if (!message || !message.amendments) {
        throw new Error('Message or amendments not found')
      }

      // Parse, update, and re-stringify amendments
      const amendments = JSON.parse(message.amendments)
      const cardIndex = amendments.findIndex(
        (a: { id: string }) => a.id === input.cardId,
      )

      if (cardIndex === -1) {
        throw new Error(`Amendment card ${input.cardId} not found`)
      }

      amendments[cardIndex].status = input.status

      return ctx.prisma.chatMessage.update({
        where: { id: input.messageId },
        data: {
          amendments: JSON.stringify(amendments),
        },
      })
    }),

  /**
   * Delete a chat message
   */
  deleteMessage: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.chatMessage.delete({
        where: { id: input.id },
      })
      return { success: true }
    }),
})
