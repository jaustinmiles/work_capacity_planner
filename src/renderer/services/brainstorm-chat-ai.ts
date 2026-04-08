/**
 * Brainstorm Chat AI Service
 * Handles AI communication, amendment generation, and validation
 */

import { Amendment, RawAmendment } from '@shared/amendment-types'
import { ChatMessageRole } from '@shared/enums'
import { validateWithRetry, ValidationLoopResult, parseAIResponse, transformAmendments } from '@shared/amendment-validator'
import { validateAmendments, formatValidationErrors } from '@shared/schema-generator'
import { gatherAppContext, formatContextForAI, AppContext, JobContextData, DateRange } from './chat-context-provider'
import { getCurrentTime, getLocalDateString } from '@shared/time-provider'
import { addDays } from '@shared/time-utils'
import { generateSystemPrompt } from '../prompts/brainstorm-chat-system'
import { getDatabase } from './database'
import { logger } from '@/logger'

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

  logger.ui.info('Sending chat message', {
    messageLength: userMessage.length,
    historyLength: conversationHistory.length,
    hasJobContext: !!jobContext,
  }, 'brainstorm-chat')

  onProgress?.('Gathering app context...')
  const dateRange = detectGapFillingIntent(userMessage, conversationHistory)
  const context = await gatherAppContext(jobContext, dateRange || undefined)

  onProgress?.('Generating response...')
  const messages = buildMessages(context, conversationHistory, userMessage, false)

  logger.ui.info('Calling Claude API', {
    messageCount: messages.length,
  }, 'brainstorm-chat')

  const response = await callClaudeAPI(messages)

  logger.ui.info('Received AI response', {
    responseLength: response.length,
  }, 'brainstorm-chat')

  // Check if AI included JSON in conversational mode (it shouldn't, but handle it)
  const parsed = parseAIResponse(response)

  if (parsed.amendments) {
    // AI included JSON when it should have been conversational
    // Extract and return separately
    const result: SendMessageResult = {
      response: parsed.rawText || "I've generated some amendments based on our conversation.",
    }

    // Validate the amendments before returning
    const validationResult = validateAmendments(parsed.amendments)

    if (validationResult.valid) {
      // Transform raw amendments (with string dates) to proper Amendment objects (with Date objects)
      result.amendments = transformAmendments(parsed.amendments as RawAmendment[])
    } else {
      // Show validation errors to user instead of silently dropping amendments
      const errorSummary = formatValidationErrors(validationResult)
      logger.ui.warn('Amendment validation failed', {
        errors: validationResult.errors,
        amendmentCount: Array.isArray(parsed.amendments) ? parsed.amendments.length : 0,
      }, 'amendment-validation-failed')

      // Append error to response so user sees it
      result.response = (result.response || '') +
        '\n\n⚠️ **I tried to create amendments but they failed validation:**\n' +
        errorSummary +
        '\n\nPlease provide more specific times (e.g., "from 9am to 10:30am on Jan 24").'
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
    // Transform raw amendments (with string dates) to proper Amendment objects (with Date objects)
    // This is critical - validateWithRetry() returns raw JSON with string dates
    result.amendments = transformAmendments(validationResult.amendments as RawAmendment[])
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

  // Add conversation history with amendments stripped from assistant messages.
  // The AI receives fresh context each turn via gatherAppContext(), so it doesn't
  // need to see old amendment JSON — and including it causes duplicate amendments.
  messages.push(...conversationHistory.map(msg => {
    if (msg.role === ChatMessageRole.Assistant) {
      return { ...msg, content: stripAmendmentTags(msg.content) }
    }
    return msg
  }))

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
6. **USE REASONABLE DEFAULTS** for any missing information:
   - Duration: 30 min (simple), 60 min (medium), 120 min (complex)
   - Importance: 5/10 unless context suggests otherwise
   - Urgency: 5/10 unless deadline mentioned
   - Type: "personal" for home tasks, "focused" for work, "admin" for meetings
7. **DO NOT refuse to generate** - use your best judgment for missing fields
8. **REQUIRED FIELDS** - Every amendment MUST include:
   - For task/workflow targets: target.id, target.name, target.type ("task" or "workflow"), target.confidence (0-1)
   - For NoteAddition: append must be true or false
   - For StepAddition/StepRemoval: workflowTarget object AND stepName
   - For DurationChange on steps: duration is required`,
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

Use ISO date strings (YYYY-MM-DDTHH:mm:ssZ format) for all dates.
Use reasonable defaults for missing fields (duration: 30-120min, importance/urgency: 5/10, type: personal/focused/admin).
DO NOT refuse - generate your best interpretation.`,
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
      role: m.role === ChatMessageRole.User ? ChatMessageRole.User : ChatMessageRole.Assistant,
      content: m.content,
    })),
    model: 'claude-opus-4-6',
  })

  return result.content
}

/**
 * Check if gap-filling is already active in the conversation.
 * Scans assistant messages for gap-related language that indicates
 * the conversation is mid-flow through a gap-filling session.
 * Returns the last 2 days as the date range to keep context flowing.
 */
function detectActiveGapFilling(conversationHistory?: ChatMessage[]): DateRange | null {
  if (!conversationHistory || conversationHistory.length === 0) return null

  // Look for gap-filling signals in recent assistant messages
  const gapSignals = [
    'gap', 'gaps', 'backfill', 'gap analysis', 'gap filling',
    'what were you up to between', 'what were you doing from',
    'filled in', 'next gap', 'remaining gap',
  ]

  const recentMessages = conversationHistory.slice(-10) // only check recent context
  const hasActiveGapSession = recentMessages.some(msg => {
    if (msg.role !== ChatMessageRole.Assistant) return false
    const content = msg.content.toLowerCase()
    return gapSignals.some(signal => content.includes(signal))
  })

  if (!hasActiveGapSession) return null

  // Re-derive the date range — use last 7 days as a safe window
  // The actual gap detection will only find gaps where patterns exist
  const now = getCurrentTime()
  const today = getLocalDateString(now)
  const startDate = getLocalDateString(addDays(now, -6))
  return { startDate, endDate: today }
}

/**
 * Detect if a user message (or the active conversation) involves time gap analysis.
 * Checks both the current message and conversation history — once gap-filling starts,
 * it stays active so the AI continues to receive gap context on follow-up messages.
 */
function detectGapFillingIntent(message: string, conversationHistory?: ChatMessage[]): DateRange | null {
  const lower = message.toLowerCase()

  // Check for gap-filling keywords in current message
  const gapKeywords = [
    'fill in time', 'fill in the time', 'missing time', 'unlogged time',
    'time gaps', 'fill gaps', 'fill in gaps', 'log missing', 'backfill',
    'what did i do', 'where did my time go',
  ]

  const hasGapIntent = gapKeywords.some(kw => lower.includes(kw))

  // If current message doesn't have gap intent, check if conversation is already in gap-filling mode
  if (!hasGapIntent) {
    return detectActiveGapFilling(conversationHistory)
  }

  const now = getCurrentTime()
  const today = getLocalDateString(now)

  // Parse date range from the message
  // Match "last N days" / "past N days"
  const numberWords: Record<string, number> = {
    one: 1, two: 2, three: 3, four: 4, five: 5,
    six: 6, seven: 7, '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7,
  }

  const daysMatch = lower.match(/(?:last|past)\s+(\w+)\s+days?/)
  if (daysMatch && daysMatch[1]) {
    const captured = daysMatch[1]
    const n = numberWords[captured] ?? parseInt(captured, 10)
    if (n && n > 0 && n <= 14) {
      const startDate = getLocalDateString(addDays(now, -(n - 1)))
      return { startDate, endDate: today }
    }
  }

  // "yesterday"
  if (lower.includes('yesterday')) {
    const yesterday = getLocalDateString(addDays(now, -1))
    return { startDate: yesterday, endDate: yesterday }
  }

  // "this week" / "past week"
  if (lower.includes('this week') || lower.includes('past week')) {
    const startDate = getLocalDateString(addDays(now, -6))
    return { startDate, endDate: today }
  }

  // "today"
  if (lower.includes('today')) {
    return { startDate: today, endDate: today }
  }

  // Default: last 2 days if gap intent detected but no specific range
  const startDate = getLocalDateString(addDays(now, -1))
  return { startDate, endDate: today }
}

/**
 * Strip <amendments> tags and their JSON content from an assistant message.
 * Preserves the conversational text around the amendments.
 */
function stripAmendmentTags(content: string): string {
  return content.replace(/<amendments>[\s\S]*?<\/amendments>/g, '[amendments applied]').trim()
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
