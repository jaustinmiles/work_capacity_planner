/**
 * Hallucination Check
 *
 * Lightweight AI call to detect when the agent's text response
 * describes completed actions but no tools were actually called.
 *
 * Uses Haiku for speed and cost — this is a classification task,
 * not a generation task.
 */

import { getAIService } from '../../shared/ai-service'
import { ChatMessageRole } from '../../shared/enums'
import type { NoToolWarning } from '../../shared/agent-types'
import { logger } from '../../logger'

/** Minimum response length worth checking — very short replies are usually conversational */
const MIN_CHECK_LENGTH = 40

/**
 * Check whether an agent response appears to describe performed actions
 * when no tools were actually called.
 *
 * Returns null if no hallucination detected, or a warning object with
 * confidence and reasoning.
 */
export async function checkForHallucination(
  userMessage: string,
  agentResponse: string,
): Promise<NoToolWarning | null> {
  // Skip very short responses — they're almost always conversational
  if (agentResponse.length < MIN_CHECK_LENGTH) return null

  const aiService = getAIService()

  try {
    const result = await aiService.callAI({
      model: 'claude-haiku-4-5-20251001',
      maxTokens: 300,
      systemPrompt: `You are a hallucination detector for an AI agent that has access to database tools. The agent SHOULD call tools to read or modify data. Sometimes the agent writes text that DESCRIBES performing actions (creating tasks, updating records, reading data) without actually calling any tools.

Your job: given the user's message and the agent's response, determine if the agent's text claims to have performed actions that would require tool calls.

Signs of hallucinated actions:
- "I've created/updated/deleted..." without tool calls
- "Done! I..." followed by action descriptions
- "Here's what I found..." presenting specific data without having queried it
- Listing specific task names, IDs, or database records that weren't provided in context
- "I've scheduled/moved/added..." implying database mutations

NOT hallucination (legitimate no-tool responses):
- Asking clarifying questions
- Explaining how something works
- Suggesting a plan before acting
- Conversational responses ("Sure!", "You're welcome")
- Acknowledging limitations

Respond with ONLY a JSON object:
{"confidence": <0.0 to 1.0>, "reasoning": "<one sentence>"}`,
      messages: [
        {
          role: ChatMessageRole.User,
          content: `User said: "${userMessage.substring(0, 500)}"\n\nAgent responded (NO tool calls were made): "${agentResponse.substring(0, 1500)}"`,
        },
      ],
    })

    const parsed = JSON.parse(result.content) as { confidence: number; reasoning: string }

    if (typeof parsed.confidence !== 'number' || typeof parsed.reasoning !== 'string') {
      return null
    }

    // Only flag if confidence is meaningful
    if (parsed.confidence < 0.3) return null

    return {
      confidence: Math.min(1, Math.max(0, parsed.confidence)),
      reasoning: parsed.reasoning,
    }
  } catch (error) {
    // Non-critical — don't block the response if the check fails
    logger.system.warn('Hallucination check failed', {
      error: error instanceof Error ? error.message : String(error),
    }, 'hallucination-check')
    return null
  }
}
