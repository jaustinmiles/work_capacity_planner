/**
 * Decision Router
 *
 * Handles Socratic decision sessions. The core loop:
 * 1. User sends text
 * 2. Claude reflects with zero-opinion Socratic prompt
 * 3. Visual response merged into decision state (graph grows)
 * 4. Connectivity score computed
 * 5. Updated state persisted
 */

import { z } from 'zod'
import { router, sessionProcedure, protectedProcedure } from '../trpc'
import { generateUniqueId } from '../../shared/step-id-utils'
import { getCurrentTime } from '../../shared/time-provider'
import { getAIService } from '../../shared/ai-service'
import { emptyDecisionState } from '../../shared/decision-types'
import type { DecisionState } from '../../shared/decision-types'
import { mergeVisualResponse } from '../../shared/decision-state-merger'
import { computeConnectivity } from '../../shared/decision-connectivity'
import { logger } from '../../logger'

export const decisionRouter = router({
  /**
   * Start a new decision session.
   */
  startSession: sessionProcedure
    .input(z.object({
      conversationId: z.string().optional(),
    }).optional())
    .mutation(async ({ ctx, input }) => {
      const id = generateUniqueId('decision')
      const now = getCurrentTime()

      // Auto-create a conversation if none provided, so chat history persists
      let conversationId = input?.conversationId ?? null
      if (!conversationId) {
        const conversation = await ctx.prisma.conversation.create({
          data: {
            id: generateUniqueId('conv'),
            sessionId: ctx.sessionId,
            title: 'Decision Session',
            createdAt: now,
            isArchived: false,
          },
        })
        conversationId = conversation.id
      }

      const session = await ctx.prisma.decisionSession.create({
        data: {
          id,
          sessionId: ctx.sessionId,
          decisionState: JSON.stringify(emptyDecisionState()),
          connectivity: 0,
          isActive: true,
          conversationId,
          createdAt: now,
        },
      })

      return {
        id: session.id,
        conversationId,
        decisionState: emptyDecisionState(),
        connectivity: computeConnectivity(null),
      }
    }),

  /**
   * End a decision session. Marks inactive and returns final state.
   */
  endSession: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const session = await ctx.prisma.decisionSession.update({
        where: { id: input.id },
        data: {
          isActive: false,
        },
      })

      const decisionState = JSON.parse(session.decisionState) as DecisionState

      return {
        id: session.id,
        decisionState,
        connectivity: computeConnectivity(decisionState),
      }
    }),

  /**
   * Core Socratic loop: user text → reflect → updated state.
   * This is the heart of Decision Mode.
   */
  reflect: protectedProcedure
    .input(z.object({
      id: z.string(),
      text: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      // Load session
      const session = await ctx.prisma.decisionSession.findUnique({
        where: { id: input.id },
      })
      if (!session) throw new Error(`Decision session ${input.id} not found`)

      const currentState = JSON.parse(session.decisionState) as DecisionState

      // Load conversation history from linked conversation (if any)
      let history: Array<{ role: 'user' | 'assistant'; content: string }> = []
      if (session.conversationId) {
        const messages = await ctx.prisma.chatMessage.findMany({
          where: { conversationId: session.conversationId },
          orderBy: { createdAt: 'asc' },
        })
        history = messages
          .filter(m => m.role === 'user' || m.role === 'assistant')
          .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }))
      }

      // Add the new user message
      history.push({ role: 'user', content: input.text })

      // Call Claude's Socratic reflection
      const aiService = getAIService()
      const result = await aiService.reflectOnDecision(history, currentState)

      // Merge visual response into state
      const updatedState = mergeVisualResponse(currentState, result.visual)

      // Compute connectivity
      const connectivity = computeConnectivity(updatedState)

      // Persist
      await ctx.prisma.decisionSession.update({
        where: { id: input.id },
        data: {
          decisionState: JSON.stringify(updatedState),
          connectivity: connectivity.score,
          topic: updatedState.topic ?? session.topic,
        },
      })

      // Save messages to conversation if linked
      if (session.conversationId) {
        const now = getCurrentTime()
        await ctx.prisma.chatMessage.createMany({
          data: [
            {
              id: generateUniqueId('msg'),
              conversationId: session.conversationId,
              role: 'user',
              content: input.text,
              createdAt: now,
            },
            {
              id: generateUniqueId('msg'),
              conversationId: session.conversationId,
              role: 'assistant',
              content: result.question,
              createdAt: new Date(now.getTime() + 1), // ensure ordering
            },
          ],
        })
      }

      logger.system.info('Decision reflect', {
        sessionId: input.id,
        nodeCount: updatedState.tree.nodes.length,
        edgeCount: updatedState.tree.edges.length,
        connectivity: connectivity.score,
      }, 'decision-reflect')

      return {
        question: result.question,
        decisionState: updatedState,
        connectivity,
      }
    }),

  /**
   * Neutral summary of current decision state.
   */
  summarize: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const session = await ctx.prisma.decisionSession.findUnique({
        where: { id: input.id },
      })
      if (!session) throw new Error(`Decision session ${input.id} not found`)

      const currentState = JSON.parse(session.decisionState) as DecisionState

      // Load history
      let history: Array<{ role: 'user' | 'assistant'; content: string }> = []
      if (session.conversationId) {
        const messages = await ctx.prisma.chatMessage.findMany({
          where: { conversationId: session.conversationId },
          orderBy: { createdAt: 'asc' },
        })
        history = messages
          .filter(m => m.role === 'user' || m.role === 'assistant')
          .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }))
      }

      const aiService = getAIService()
      const summary = await aiService.summarizeDecision(history, currentState)

      return { summary }
    }),

  /**
   * Get current state of a decision session.
   */
  getState: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const session = await ctx.prisma.decisionSession.findUnique({
        where: { id: input.id },
      })
      if (!session) return null

      const decisionState = JSON.parse(session.decisionState) as DecisionState

      return {
        id: session.id,
        topic: session.topic,
        decisionState,
        connectivity: computeConnectivity(decisionState),
        isActive: session.isActive,
        createdAt: session.createdAt,
      }
    }),

  /**
   * List all decision sessions for the current app session.
   */
  getSessions: sessionProcedure.query(async ({ ctx }) => {
    const sessions = await ctx.prisma.decisionSession.findMany({
      where: { sessionId: ctx.sessionId },
      orderBy: { createdAt: 'desc' },
    })

    return sessions.map(s => ({
      id: s.id,
      topic: s.topic,
      connectivity: s.connectivity,
      isActive: s.isActive,
      createdAt: s.createdAt,
    }))
  }),
})

export type DecisionRouter = typeof decisionRouter
