/**
 * Hallucination Check
 *
 * Lightweight AI call to detect when the agent's text response
 * describes completed actions but no write tool was actually applied.
 *
 * Uses Haiku for speed and cost — this is a classification task,
 * not a generation task.
 */

import { getAIService } from '../../shared/ai-service'
import { extractJsonObjectText } from '../../shared/json-utils'
import { ChatMessageRole } from '../../shared/enums'
import type { NoToolWarning } from '../../shared/agent-types'
import { logger } from '../../logger'

/** Minimum response length worth checking — very short replies are usually conversational */
const MIN_CHECK_LENGTH = 40

/**
 * What actually ran during the turn being checked. Read tools run on
 * nearly every real agent turn ("read first, then act"), so the detector
 * must know whether presenting data is legitimate for this turn.
 */
export interface HallucinationCheckContext {
  /** True when read/memory tools executed this turn (data presentation is legitimate) */
  readToolsRan: boolean
}

/**
 * Build the detector system prompt, adjusted for whether read-only
 * tools ran this turn. Presenting queried data is legitimate when
 * reads happened — only claimed MUTATIONS are hallucinated then.
 */
function buildDetectorSystemPrompt(context: HallucinationCheckContext): string {
  const situation = context.readToolsRan
    ? 'This turn, the agent executed READ-ONLY tools but NO write/mutation tool was applied. Presenting or summarizing data it just queried is legitimate. What it CANNOT legitimately claim is having created, updated, scheduled, moved, completed, or deleted anything.'
    : 'This turn, the agent applied NO tools at all. It has not queried any data and has not modified anything.'

  const dataPresentationSigns = context.readToolsRan
    ? ''
    : `
- "Here's what I found..." presenting specific data without having queried it
- Listing specific task names, IDs, or database records that weren't provided in context`

  return `You are a hallucination detector for an AI agent that has access to database tools. The agent SHOULD call tools to read or modify data. Sometimes the agent writes text that DESCRIBES performing actions (creating tasks, updating records, reading data) without those actions actually happening.

${situation}

Your job: given the user's message and the agent's response, determine if the agent's text claims to have performed actions that did not actually happen.

Signs of hallucinated actions:
- "I've created/updated/deleted..." without an applied write
- "Done! I..." followed by action descriptions
- "I've scheduled/moved/added..." implying database mutations${dataPresentationSigns}

NOT hallucination (legitimate responses):
- Asking clarifying questions
- Explaining how something works
- Suggesting a plan before acting
- Conversational responses ("Sure!", "You're welcome")
- Acknowledging limitations${context.readToolsRan ? '\n- Presenting or summarizing data retrieved by this turn\'s read tools' : ''}

Respond with ONLY a JSON object:
{"confidence": <0.0 to 1.0>, "reasoning": "<one sentence>"}`
}

/**
 * Check whether an agent response appears to describe performed actions
 * when no write tool was actually applied.
 *
 * Returns null if no hallucination detected, or a warning object with
 * confidence and reasoning.
 */
export async function checkForHallucination(
  userMessage: string,
  agentResponse: string,
  context: HallucinationCheckContext,
): Promise<NoToolWarning | null> {
  // Skip very short responses — they're almost always conversational
  if (agentResponse.length < MIN_CHECK_LENGTH) return null

  const aiService = getAIService()

  const turnDescription = context.readToolsRan
    ? 'read-only tools ran, but NO write tools were applied'
    : 'NO tool calls were made'

  try {
    const result = await aiService.callAI({
      model: 'claude-haiku-4-5-20251001',
      maxTokens: 300,
      systemPrompt: buildDetectorSystemPrompt(context),
      messages: [
        {
          role: ChatMessageRole.User,
          content: `User said: "${userMessage.substring(0, 500)}"\n\nAgent responded (${turnDescription}): "${agentResponse.substring(0, 1500)}"`,
        },
      ],
    })

    // Haiku may wrap the JSON in a code fence or add a preamble — extract
    // the object substring before parsing (same defensive pattern as the
    // brainstorm extractors in ai-service).
    const parsed = JSON.parse(extractJsonObjectText(result.content)) as {
      confidence: number
      reasoning: string
    }

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
