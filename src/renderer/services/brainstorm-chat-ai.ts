/**
 * Brainstorm Chat AI Service
 * Handles AI communication, amendment generation, and validation
 */

import { Amendment } from '@shared/amendment-types'
import { ChatMessageRole } from '@shared/enums'
import { validateWithRetry, ValidationLoopResult, parseAIResponse } from '@shared/amendment-validator'
import { gatherAppContext, formatContextForAI, AppContext, JobContextData } from './chat-context-provider'
import { generateSystemPrompt } from '../prompts/brainstorm-chat-system'
import { getDatabase } from './database'

export interface ChatMessage {
  role: ChatMessageRole
  content: string
}

export interface SendMessageOptions {
  userMessage: string
  conversationHistory: ChatMessage[]
  jobContext?: JobContextData
  onProgress?: (status: string) => void
}

export interface SendMessageResult {
  response: string
  amendments?: Amendment[]
  validationResult?: ValidationLoopResult
}

export interface GenerateAmendmentsOptions {
  conversationHistory: ChatMessage[]
  jobContext?: JobContextData
  onProgress?: (status: string) => void
  onRetry?: (attempt: number, errors: string) => void
}

/**
 * Send a chat message to the AI
 * Handles conversational responses (no amendment generation)
 */
export async function sendChatMessage(options: SendMessageOptions): Promise<SendMessageResult> {
  const { userMessage, conversationHistory, jobContext, onProgress } = options

  onProgress?.('Gathering app context...')
  const context = await gatherAppContext(jobContext)

  onProgress?.('Generating response...')
  const messages = buildMessages(context, conversationHistory, userMessage, false)

  const response = await callClaudeAPI(messages)

  // Check if AI included JSON in conversational mode (it shouldn't, but handle it)
  const parsed = parseAIResponse(response)

  if (parsed.amendments) {
    // AI included JSON when it should have been conversational
    // Extract and return separately
    const result: SendMessageResult = {
      response: parsed.rawText || "I've generated some amendments based on our conversation.",
    }

    // Validate the amendments before returning
    const { validateAmendments } = await import('@shared/schema-generator')
    const validationResult = validateAmendments(parsed.amendments)

    if (validationResult.valid) {
      result.amendments = parsed.amendments as Amendment[]
    }

    return result
  }

  return {
    response,
  }
}

/**
 * Generate amendments from conversation
 * Triggers the validation loop
 */
export async function generateAmendments(options: GenerateAmendmentsOptions): Promise<SendMessageResult> {
  const { conversationHistory, jobContext, onProgress, onRetry } = options

  onProgress?.('Gathering app context...')
  const context = await gatherAppContext(jobContext)

  onProgress?.('Generating amendments...')

  // Use validation loop with retry
  const validationResult = await validateWithRetry(
    async (retryFeedback?: string) => {
      const messages = buildMessages(context, conversationHistory, retryFeedback, true)
      return await callClaudeAPI(messages)
    },
    {
      maxAttempts: 5,
      onRetry: (attempt, errors) => {
        onProgress?.(`Validation failed (attempt ${attempt}), retrying...`)
        onRetry?.(attempt, errors)
      },
    },
  )

  if (!validationResult.success) {
    throw new Error(`Failed to generate valid amendments: ${validationResult.errors}`)
  }

  const result: SendMessageResult = {
    response: 'Generated amendments successfully',
    validationResult,
  }

  if (validationResult.amendments) {
    result.amendments = validationResult.amendments
  }

  return result
}

/**
 * Build message array for Claude API
 */
function buildMessages(
  context: AppContext,
  conversationHistory: ChatMessage[],
  userMessageOrRetry: string | undefined,
  isAmendmentGeneration: boolean,
): ChatMessage[] {
  const messages: ChatMessage[] = []

  // System prompt with full context
  const systemPrompt = generateSystemPrompt(context)
  messages.push({
    role: ChatMessageRole.System,
    content: systemPrompt,
  })

  // Add conversation history
  messages.push(...conversationHistory)

  // Add current message or retry feedback
  if (userMessageOrRetry) {
    // Check if this is retry feedback (validation errors)
    if (userMessageOrRetry.includes('validation errors')) {
      messages.push({
        role: ChatMessageRole.User,
        content: userMessageOrRetry,
      })
    } else if (isAmendmentGeneration) {
      // Explicit amendment generation request - VERY CLEAR DIRECTIVE
      messages.push({
        role: ChatMessageRole.User,
        content: `SWITCH TO AMENDMENT MODE NOW.

Based on our conversation above, generate a JSON array of amendments to implement the changes we discussed.

CRITICAL INSTRUCTIONS:
1. Respond with ONLY a raw JSON array
2. NO additional text, explanations, or commentary
3. NO markdown code blocks (no \`\`\`json)
4. Just the pure JSON array starting with [ and ending with ]
5. Use ISO date strings (YYYY-MM-DDTHH:mm:ssZ format) for all dates

If you need more information, DO NOT generate amendments - instead, ask clarifying questions in a regular conversational response first.`,
      })
    } else {
      // Regular user message
      messages.push({
        role: ChatMessageRole.User,
        content: userMessageOrRetry,
      })
    }
  } else if (isAmendmentGeneration) {
    // No user message, but amendment generation requested
    messages.push({
      role: ChatMessageRole.User,
      content: `SWITCH TO AMENDMENT MODE NOW.

Generate a JSON array of amendments based on our conversation.

CRITICAL: Respond with ONLY a raw JSON array. No text, no code blocks, just [ ... ]

Use ISO date strings (YYYY-MM-DDTHH:mm:ssZ format) for all dates.`,
    })
  }

  return messages
}

/**
 * Call Claude API via the database service
 * Uses IPC to communicate with main process AI service
 */
async function callClaudeAPI(messages: ChatMessage[]): Promise<string> {
  const db = getDatabase()

  // Extract system prompt and conversation messages
  const systemMessage = messages.find(m => m.role === ChatMessageRole.System)
  const conversationMessages = messages.filter(m => m.role !== ChatMessageRole.System)

  // Call the AI via IPC
  const result = await db.callAI({
    systemPrompt: systemMessage?.content || '',
    messages: conversationMessages.map(m => ({
      role: m.role === ChatMessageRole.User ? 'user' : 'assistant',
      content: m.content,
    })),
    model: 'claude-sonnet-4-5-20250929',
  })

  return result.content
}

/**
 * Query information without generating amendments
 * Optimized for quick responses
 */
export async function queryInformation(
  query: string,
  jobContext?: JobContextData,
): Promise<string> {
  const context = await gatherAppContext(jobContext)

  const messages: ChatMessage[] = [
    {
      role: ChatMessageRole.System,
      content: `You are a helpful assistant. Answer the user's question about their tasks and schedule based on this context:\n\n${formatContextForAI(context)}`,
    },
    {
      role: ChatMessageRole.User,
      content: query,
    },
  ]

  return await callClaudeAPI(messages)
}
