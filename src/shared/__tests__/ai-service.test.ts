import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AIService } from '../ai-service'
import Anthropic from '@anthropic-ai/sdk'

// Mock Anthropic
vi.mock('@anthropic-ai/sdk')

describe('AIService', () => {
  let aiService: AIService
  let mockAnthropicClient: any

  beforeEach(() => {
    mockAnthropicClient = {
      messages: {
        create: vi.fn(),
      },
    }

    vi.mocked(Anthropic).mockImplementation(() => mockAnthropicClient as any)
    aiService = new AIService('test-api-key')
  })

  describe('extractJargonTerms', () => {
    it('should extract jargon terms from context text', async () => {
      const contextText = 'We need to deploy the service using CI/CD pipeline and ensure the SLO metrics are met.'

      mockAnthropicClient.messages.create.mockResolvedValue({
        content: [{
          type: 'text',
          text: '["CI/CD", "SLO", "pipeline", "deploy", "metrics"]',
        }],
      })

      const result = await aiService.extractJargonTerms(contextText)

      expect(mockAnthropicClient.messages.create).toHaveBeenCalledWith({
        model: 'claude-opus-4-6',
        max_tokens: 1000,
        temperature: 0.3,
        messages: [{
          role: 'user',
          content: expect.stringContaining('identify technical terms'),
        }],
      })

      expect(result).toBe('["CI/CD", "SLO", "pipeline", "deploy", "metrics"]')
    })

    it('should return empty array on error', async () => {
      mockAnthropicClient.messages.create.mockRejectedValue(new Error('API error'))

      const result = await aiService.extractJargonTerms('some context')

      expect(result).toBe('[]')
    })

    it('should handle non-text responses gracefully', async () => {
      mockAnthropicClient.messages.create.mockResolvedValue({
        content: [{
          type: 'image',
          source: { type: 'base64', media_type: 'image/png', data: '' },
        }],
      })

      const result = await aiService.extractJargonTerms('some context')

      expect(result).toBe('[]')
    })

    it('should limit to 15 terms in the prompt', async () => {
      const contextText = 'Technical context with many terms'

      mockAnthropicClient.messages.create.mockResolvedValue({
        content: [{
          type: 'text',
          text: '[]',
        }],
      })

      await aiService.extractJargonTerms(contextText)

      const call = mockAnthropicClient.messages.create.mock.calls[0][0]
      expect(call.messages[0].content).toContain('Limit to the 15 most important')
    })
  })

  describe('extractWorkflowsFromBrainstorm', () => {
    const availableTypes = [
      { id: 'type-deep', name: 'Deep Work' },
      { id: 'type-ops', name: 'Operations' },
    ]

    it('should extract workflows from brainstorm text', async () => {
      const brainstormText = 'I need to complete the main safety task and deploy it'
      const jobContext = 'Working on safety systems'

      const expectedResponse = {
        workflows: [{
          name: 'Complete Main Safety Task',
          importance: 9,
          urgency: 9,
        }],
        standaloneTasks: [],
      }

      mockAnthropicClient.messages.create.mockResolvedValue({
        content: [{
          type: 'text',
          text: JSON.stringify(expectedResponse),
        }],
      })

      const result = await aiService.extractWorkflowsFromBrainstorm(brainstormText, availableTypes, jobContext)

      expect(result).toEqual(expectedResponse)
    })

    it('should handle JSON extraction from response with extra text', async () => {
      mockAnthropicClient.messages.create.mockResolvedValue({
        content: [{
          type: 'text',
          text: 'Here is the JSON: {"workflows": [], "standaloneTasks": []} Hope this helps!',
        }],
      })

      const result = await aiService.extractWorkflowsFromBrainstorm('test', availableTypes, 'context')

      expect(result).toEqual({ workflows: [], standaloneTasks: [] })
    })

    // Regression: prompts hardcoded the legacy "focused"/"admin" types, instructing the
    // model to emit type ids that don't exist in any session (server now rejects them).
    it('injects the user-defined task types into the prompt instead of hardcoded legacy types', async () => {
      mockAnthropicClient.messages.create.mockResolvedValue({
        content: [{
          type: 'text',
          text: '{"workflows": [], "standaloneTasks": []}',
        }],
      })

      await aiService.extractWorkflowsFromBrainstorm('test', availableTypes)

      const call = mockAnthropicClient.messages.create.mock.calls[0][0]
      const prompt: string = call.messages[0].content
      expect(prompt).toContain('type-deep')
      expect(prompt).toContain('Deep Work')
      expect(prompt).toContain('type-ops')
      expect(prompt).not.toContain('"focused"')
      expect(prompt).not.toContain('"admin"')
    })

    it('rejects when no user-defined task types exist instead of inventing types', async () => {
      await expect(
        aiService.extractWorkflowsFromBrainstorm('test', []),
      ).rejects.toThrow('No user-defined task types')

      expect(mockAnthropicClient.messages.create).not.toHaveBeenCalled()
    })
  })

  describe('extractTasksFromBrainstorm', () => {
    const availableTypes = [
      { id: 'type-deep', name: 'Deep Work' },
      { id: 'type-ops', name: 'Operations' },
    ]

    it('should extract tasks and inject user-defined task types into the prompt', async () => {
      const expectedResponse = {
        summary: 'A task',
        tasks: [{
          name: 'Write report',
          description: 'Draft the quarterly report',
          estimatedDuration: 60,
          importance: 7,
          urgency: 5,
          type: 'type-deep',
        }],
      }

      mockAnthropicClient.messages.create.mockResolvedValue({
        content: [{
          type: 'text',
          text: JSON.stringify(expectedResponse),
        }],
      })

      const result = await aiService.extractTasksFromBrainstorm('write the report', availableTypes)

      expect(result).toEqual(expectedResponse)

      const call = mockAnthropicClient.messages.create.mock.calls[0][0]
      const prompt: string = call.messages[0].content
      expect(prompt).toContain('type-deep')
      expect(prompt).toContain('type-ops')
      expect(prompt).not.toContain('"focused"')
      expect(prompt).not.toContain('"admin"')
    })

    it('rejects when no user-defined task types exist instead of inventing types', async () => {
      await expect(
        aiService.extractTasksFromBrainstorm('test', []),
      ).rejects.toThrow('No user-defined task types')

      expect(mockAnthropicClient.messages.create).not.toHaveBeenCalled()
    })
  })
})
