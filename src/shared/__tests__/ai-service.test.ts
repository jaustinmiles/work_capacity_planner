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
        model: 'claude-opus-4-1-20250805',
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

      const result = await aiService.extractWorkflowsFromBrainstorm(brainstormText, jobContext)
      
      expect(result).toEqual(expectedResponse)
    })

    it('should handle JSON extraction from response with extra text', async () => {
      mockAnthropicClient.messages.create.mockResolvedValue({
        content: [{
          type: 'text',
          text: 'Here is the JSON: {"workflows": [], "standaloneTasks": []} Hope this helps!',
        }],
      })

      const result = await aiService.extractWorkflowsFromBrainstorm('test', 'context')
      
      expect(result).toEqual({ workflows: [], standaloneTasks: [] })
    })
  })
})