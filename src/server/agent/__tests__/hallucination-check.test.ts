/**
 * Tests for the hallucination check
 *
 * Covers the defensive JSON parsing of the Haiku detector output
 * (code fences / prose preambles previously threw and silently
 * returned null) and the read-tools-aware prompt framing.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

const { mockCallAI } = vi.hoisted(() => ({ mockCallAI: vi.fn() }))

vi.mock('../../../shared/ai-service', () => ({
  getAIService: vi.fn(() => ({ callAI: mockCallAI })),
}))

vi.mock('../../../logger', () => ({
  logger: {
    system: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
  },
}))

import { checkForHallucination } from '../hallucination-check'

/** A response long enough to pass the MIN_CHECK_LENGTH gate */
const CLAIM_RESPONSE = 'Done! I have created the three tasks you asked for and scheduled them.'

describe('checkForHallucination', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('detector output parsing (regression: raw JSON.parse)', () => {
    it('parses a plain JSON object response', async () => {
      mockCallAI.mockResolvedValue({
        content: '{"confidence": 0.9, "reasoning": "claims creation without tools"}',
      })

      const result = await checkForHallucination('create tasks', CLAIM_RESPONSE, {
        readToolsRan: false,
      })

      expect(result).toEqual({
        confidence: 0.9,
        reasoning: 'claims creation without tools',
      })
    })

    it('parses a markdown-fenced JSON response', async () => {
      mockCallAI.mockResolvedValue({
        content: '```json\n{"confidence": 0.85, "reasoning": "fenced output"}\n```',
      })

      const result = await checkForHallucination('create tasks', CLAIM_RESPONSE, {
        readToolsRan: false,
      })

      expect(result).toEqual({ confidence: 0.85, reasoning: 'fenced output' })
    })

    it('parses a response with a prose preamble', async () => {
      mockCallAI.mockResolvedValue({
        content: 'Here is my analysis: {"confidence": 0.7, "reasoning": "prefaced output"}',
      })

      const result = await checkForHallucination('create tasks', CLAIM_RESPONSE, {
        readToolsRan: false,
      })

      expect(result).toEqual({ confidence: 0.7, reasoning: 'prefaced output' })
    })

    it('returns null when the response contains no JSON object', async () => {
      mockCallAI.mockResolvedValue({ content: 'I cannot evaluate this.' })

      const result = await checkForHallucination('create tasks', CLAIM_RESPONSE, {
        readToolsRan: false,
      })

      expect(result).toBeNull()
    })

    it('returns null when fields have the wrong types', async () => {
      mockCallAI.mockResolvedValue({
        content: '{"confidence": "high", "reasoning": "wrong type"}',
      })

      const result = await checkForHallucination('create tasks', CLAIM_RESPONSE, {
        readToolsRan: false,
      })

      expect(result).toBeNull()
    })

    it('clamps confidence to the 0–1 range', async () => {
      mockCallAI.mockResolvedValue({
        content: '{"confidence": 1.5, "reasoning": "over-confident"}',
      })

      const result = await checkForHallucination('create tasks', CLAIM_RESPONSE, {
        readToolsRan: false,
      })

      expect(result?.confidence).toBe(1)
    })
  })

  describe('gating', () => {
    it('returns null below the confidence floor', async () => {
      mockCallAI.mockResolvedValue({
        content: '{"confidence": 0.2, "reasoning": "probably fine"}',
      })

      const result = await checkForHallucination('create tasks', CLAIM_RESPONSE, {
        readToolsRan: false,
      })

      expect(result).toBeNull()
    })

    it('skips very short responses without calling the AI', async () => {
      const result = await checkForHallucination('hi', 'Sure!', { readToolsRan: false })

      expect(result).toBeNull()
      expect(mockCallAI).not.toHaveBeenCalled()
    })

    it('returns null without throwing when the AI call fails', async () => {
      mockCallAI.mockRejectedValue(new Error('AI service error'))

      const result = await checkForHallucination('create tasks', CLAIM_RESPONSE, {
        readToolsRan: false,
      })

      expect(result).toBeNull()
    })
  })

  describe('read-tools-aware framing', () => {
    it('tells the detector no tools ran when readToolsRan is false', async () => {
      mockCallAI.mockResolvedValue({
        content: '{"confidence": 0.9, "reasoning": "r"}',
      })

      await checkForHallucination('create tasks', CLAIM_RESPONSE, { readToolsRan: false })

      const callOptions = mockCallAI.mock.calls[0][0]
      expect(callOptions.messages[0].content).toContain('NO tool calls were made')
      expect(callOptions.systemPrompt).toContain('NO tools at all')
      // Data-presentation signs only apply when nothing was queried
      expect(callOptions.systemPrompt).toContain("Here's what I found")
    })

    it('tells the detector reads ran but no writes applied when readToolsRan is true', async () => {
      mockCallAI.mockResolvedValue({
        content: '{"confidence": 0.9, "reasoning": "r"}',
      })

      await checkForHallucination('create tasks', CLAIM_RESPONSE, { readToolsRan: true })

      const callOptions = mockCallAI.mock.calls[0][0]
      expect(callOptions.messages[0].content).toContain(
        'read-only tools ran, but NO write tools were applied',
      )
      expect(callOptions.systemPrompt).toContain('READ-ONLY tools')
      // Presenting queried data must not be listed as a hallucination sign
      expect(callOptions.systemPrompt).not.toContain("Here's what I found")
    })
  })
})
