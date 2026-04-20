/**
 * Agent Chat SSE Handler
 *
 * Raw Express endpoint for the agent chat. Uses SSE (Server-Sent Events)
 * to stream agent responses to the client. This is separate from tRPC
 * because tRPC v10 doesn't natively support SSE streaming.
 *
 * Endpoint: POST /api/agent/chat
 * Headers: x-api-key, x-session-id
 * Body: { userMessage: string, conversationId: string }
 * Response: SSE stream of AgentSSEEvent objects
 */

import type { Request, Response } from 'express'
import type Anthropic from '@anthropic-ai/sdk'
import { validateApiKey } from '../middleware/auth'
import { prisma } from '../prisma'
import { runAgentLoop } from './agent-loop'
import { ChatMessageRole } from '../../shared/enums'
import { generateUniqueId } from '../../shared/step-id-utils'
import { getCurrentTime } from '../../shared/time-provider'
import type { AgentSSEEvent } from '../../shared/agent-types'
import type { Context } from '../trpc'
import { logger } from '../../logger'

/**
 * Express handler for the agent chat SSE endpoint.
 */
export async function agentChatHandler(req: Request, res: Response): Promise<void> {
  // Validate authentication
  const apiKey = req.headers['x-api-key'] as string | undefined
  const auth = validateApiKey(apiKey)
  if (!auth.isAuthenticated) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  // Get session ID
  const activeSessionId = req.headers['x-session-id'] as string | undefined
  if (!activeSessionId) {
    res.status(400).json({ error: 'Missing x-session-id header' })
    return
  }

  // Validate request body
  const { userMessage, conversationId } = req.body as {
    userMessage?: string
    conversationId?: string
  }
  if (!userMessage || !conversationId) {
    res.status(400).json({ error: 'Missing userMessage or conversationId' })
    return
  }

  // Set up SSE headers
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no') // Disable nginx buffering
  res.flushHeaders()

  // Build tRPC-compatible context for the tool executor
  const ctx: Context = {
    prisma,
    auth,
    activeSessionId,
  }

  try {
    // Load session info
    const session = await prisma.session.findUnique({
      where: { id: activeSessionId },
    })
    if (!session) {
      sendSSE(res, { type: 'error', message: 'Session not found' })
      res.end()
      return
    }

    // Load conversation history from DB
    const conversationHistory = await loadConversationHistory(conversationId)

    // Save the user message to the conversation
    await prisma.chatMessage.create({
      data: {
        id: generateUniqueId('msg'),
        conversationId,
        role: ChatMessageRole.User,
        content: userMessage,
        createdAt: getCurrentTime(),
      },
    })

    // Check for active work session to include in context
    const activeWorkSession = await prisma.workSession.findFirst({
      where: {
        endTime: null,
        Task: { sessionId: activeSessionId },
      },
      include: { Task: { select: { name: true } } },
    })

    // Load active job context for the session
    const activeJobContext = await prisma.jobContext.findFirst({
      where: { sessionId: activeSessionId, isActive: true },
    })

    // Run the agent loop
    const result = await runAgentLoop({
      userMessage,
      conversationHistory,
      sessionInfo: {
        sessionName: session.name,
        sessionId: activeSessionId,
        activeWorkSessionTask: activeWorkSession?.Task?.name,
        jobContext: activeJobContext ? {
          name: activeJobContext.name,
          description: activeJobContext.description,
          context: activeJobContext.context,
        } : undefined,
      },
      ctx,
      onEvent: (event: AgentSSEEvent) => {
        sendSSE(res, event)
      },
    })

    // Save the assistant message with tool call history
    await prisma.chatMessage.create({
      data: {
        id: generateUniqueId('msg'),
        conversationId,
        role: ChatMessageRole.Assistant,
        content: result.responseText,
        amendments: JSON.stringify(result.toolCalls),
        createdAt: getCurrentTime(),
      },
    })

    // Update conversation timestamp
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: getCurrentTime() },
    })

    // Trigger conversation summarization in background (non-blocking)
    // Only if conversation has enough messages and no existing summary
    triggerConversationSummary(conversationId, activeSessionId).catch(err => {
      logger.system.warn('Conversation summarization failed', {
        error: err instanceof Error ? err.message : String(err),
      }, 'summary-error')
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logger.system.error('Agent chat error', { error: message }, 'agent-chat')
    sendSSE(res, { type: 'error', message })
  } finally {
    res.end()
  }
}

/**
 * Send a Server-Sent Event to the client.
 */
function sendSSE(res: Response, event: AgentSSEEvent): void {
  res.write(`data: ${JSON.stringify(event)}\n\n`)
}

/**
 * Load conversation history and convert to Anthropic message format.
 * Filters to user/assistant messages and pairs them correctly.
 */
async function loadConversationHistory(
  conversationId: string,
): Promise<Anthropic.MessageParam[]> {
  const messages = await prisma.chatMessage.findMany({
    where: { conversationId },
    orderBy: { createdAt: 'asc' },
  })

  const history: Anthropic.MessageParam[] = []

  for (const msg of messages) {
    if (msg.role === ChatMessageRole.User) {
      history.push({ role: 'user', content: msg.content })
    } else if (msg.role === ChatMessageRole.Assistant) {
      history.push({ role: 'assistant', content: msg.content })
    }
  }

  return history
}

/**
 * Trigger conversation summarization if the conversation is long enough
 * and doesn't already have a summary. Runs in the background.
 */
async function triggerConversationSummary(
  conversationId: string,
  sessionId: string,
): Promise<void> {
  const MIN_MESSAGES = 10

  // Check if summary already exists
  const existing = await prisma.conversationSummary.findUnique({
    where: { conversationId },
  })
  if (existing) return

  // Count messages
  const messageCount = await prisma.chatMessage.count({
    where: { conversationId },
  })
  if (messageCount < MIN_MESSAGES) return

  // Load conversation for summarization
  const messages = await prisma.chatMessage.findMany({
    where: { conversationId },
    orderBy: { createdAt: 'asc' },
    select: { role: true, content: true },
  })

  const conversationText = messages
    .map(m => `${m.role}: ${m.content.substring(0, 500)}`)
    .join('\n\n')

  // Call Claude to summarize (non-streaming, separate from the agent loop)
  const { getAIService } = await import('../../shared/ai-service')
  const aiService = getAIService()

  const summaryResponse = await aiService.callAI({
    systemPrompt: `You are summarizing a conversation between a user and an AI task planning assistant. Extract:
1. A 2-3 sentence summary of what was discussed and accomplished
2. Key decisions made (as a JSON array of strings)
3. Any user preferences, corrections, or facts learned (as a JSON array of objects with category, key, value)

Respond in this exact JSON format:
{
  "summary": "...",
  "keyDecisions": ["...", "..."],
  "memoriesExtracted": [{"category": "preference|correction|pattern|fact", "key": "short_key", "value": "concise fact"}]
}`,
    messages: [
      { role: ChatMessageRole.User, content: `Summarize this conversation:\n\n${conversationText}` },
    ],
    maxTokens: 2000,
  })

  // Parse the summary response
  try {
    const parsed = JSON.parse(summaryResponse.content)
    const { generateUniqueId: genId } = await import('../../shared/step-id-utils')

    // Save the summary
    await prisma.conversationSummary.create({
      data: {
        id: genId('summary'),
        sessionId,
        conversationId,
        summary: parsed.summary || '',
        keyDecisions: JSON.stringify(parsed.keyDecisions || []),
        memoriesExtracted: JSON.stringify([]),
        messageCount,
        createdAt: getCurrentTime(),
      },
    })

    // Auto-create memories from extracted facts
    const memories = parsed.memoriesExtracted || []
    for (const mem of memories) {
      if (mem.key && mem.value && mem.category) {
        await prisma.agentMemory.upsert({
          where: {
            sessionId_key: { sessionId, key: mem.key },
          },
          create: {
            id: genId('mem'),
            sessionId,
            category: mem.category,
            key: mem.key,
            value: mem.value,
            confidence: 0.7,
            source: 'conversation_summary',
            createdAt: getCurrentTime(),
            updatedAt: getCurrentTime(),
            lastAccessedAt: getCurrentTime(),
          },
          update: {
            value: mem.value,
            updatedAt: getCurrentTime(),
          },
        })
      }
    }

    logger.system.info('Conversation summarized', {
      conversationId,
      memoryCount: memories.length,
    }, 'summary-created')
  } catch {
    // If parsing fails, save raw text as summary
    const { generateUniqueId: genId } = await import('../../shared/step-id-utils')
    await prisma.conversationSummary.create({
      data: {
        id: genId('summary'),
        sessionId,
        conversationId,
        summary: summaryResponse.content.substring(0, 2000),
        keyDecisions: '[]',
        memoriesExtracted: '[]',
        messageCount,
        createdAt: getCurrentTime(),
      },
    })
  }
}
