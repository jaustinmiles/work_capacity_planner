import { FastifyInstance } from 'fastify'
import { AIService } from '@task-planner/shared'

export async function aiRoutes(fastify: FastifyInstance): Promise<void> {
  // Initialize AI service with API key from environment
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    fastify.log.warn('ANTHROPIC_API_KEY not set - AI routes will return errors')
  }

  const getAIService = () => {
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY environment variable is not set')
    }
    return new AIService(apiKey)
  }

  // POST /api/ai/brainstorm - Extract tasks from brainstorm text
  fastify.post('/api/ai/brainstorm', async (request, reply) => {
    const { text } = request.body as { text: string }

    if (!text || text.trim().length === 0) {
      return reply.status(400).send({ error: 'Text is required' })
    }

    try {
      const ai = getAIService()
      const result = await ai.extractTasksFromBrainstorm(text)
      return result
    } catch (error) {
      fastify.log.error('Error extracting tasks from brainstorm:', error)
      return reply.status(500).send({
        error: error instanceof Error ? error.message : 'Failed to process brainstorm',
      })
    }
  })

  // POST /api/ai/workflows - Extract workflows from brainstorm text
  fastify.post('/api/ai/workflows', async (request, reply) => {
    const { text } = request.body as { text: string }

    if (!text || text.trim().length === 0) {
      return reply.status(400).send({ error: 'Text is required' })
    }

    try {
      const ai = getAIService()
      const result = await ai.extractWorkflowsFromBrainstorm(text)
      return result
    } catch (error) {
      fastify.log.error('Error extracting workflows from brainstorm:', error)
      return reply.status(500).send({
        error: error instanceof Error ? error.message : 'Failed to process brainstorm',
      })
    }
  })

  // POST /api/ai/schedule - Extract schedule from voice input
  fastify.post('/api/ai/schedule', async (request, reply) => {
    const { text, multiDay } = request.body as { text: string; multiDay?: boolean }

    if (!text || text.trim().length === 0) {
      return reply.status(400).send({ error: 'Text is required' })
    }

    try {
      const ai = getAIService()

      if (multiDay) {
        const result = await ai.extractMultiDayScheduleFromVoice(text)
        return result
      } else {
        const result = await ai.extractScheduleFromVoice(text)
        return result
      }
    } catch (error) {
      fastify.log.error('Error extracting schedule:', error)
      return reply.status(500).send({
        error: error instanceof Error ? error.message : 'Failed to extract schedule',
      })
    }
  })

  // POST /api/ai/jargon - Extract jargon terms from text
  fastify.post('/api/ai/jargon', async (request, reply) => {
    const { text, existingTerms } = request.body as {
      text: string
      existingTerms?: string[]
    }

    if (!text || text.trim().length === 0) {
      return reply.status(400).send({ error: 'Text is required' })
    }

    try {
      const ai = getAIService()
      const result = await ai.extractJargonTerms(text, existingTerms || [])
      return result
    } catch (error) {
      fastify.log.error('Error extracting jargon:', error)
      return reply.status(500).send({
        error: error instanceof Error ? error.message : 'Failed to extract jargon',
      })
    }
  })
}
