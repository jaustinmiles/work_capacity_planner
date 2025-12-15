import { FastifyInstance } from 'fastify'
import { SpeechService } from '@task-planner/shared'

export async function speechRoutes(fastify: FastifyInstance): Promise<void> {
  // Initialize Speech service with API key from environment
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    fastify.log.warn('OPENAI_API_KEY not set - Speech routes will return errors')
  }

  const getSpeechService = () => {
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY environment variable is not set')
    }
    return new SpeechService(apiKey)
  }

  // GET /api/speech/formats - Get supported audio formats
  fastify.get('/api/speech/formats', async () => {
    try {
      const speech = getSpeechService()
      return {
        formats: speech.getSupportedFormats(),
        maxSizeMB: 25,
      }
    } catch (error) {
      // Return formats even without API key
      return {
        formats: ['mp3', 'mp4', 'mpeg', 'mpga', 'm4a', 'wav', 'webm'],
        maxSizeMB: 25,
      }
    }
  })

  // POST /api/speech/transcribe - Transcribe uploaded audio file
  fastify.post('/api/speech/transcribe', async (request, reply) => {
    try {
      const speech = getSpeechService()

      // Get multipart file
      const data = await request.file()
      if (!data) {
        return reply.status(400).send({ error: 'No audio file uploaded' })
      }

      // Validate format
      const filename = data.filename
      if (!speech.isValidAudioFormat(filename)) {
        return reply.status(400).send({
          error: `Unsupported audio format. Supported formats: ${speech.getSupportedFormats().join(', ')}`,
        })
      }

      // Get the buffer
      const buffer = await data.toBuffer()

      // Check file size (25MB limit)
      const fileSizeInMB = buffer.length / (1024 * 1024)
      if (fileSizeInMB > 25) {
        return reply.status(400).send({ error: 'Audio file exceeds 25MB limit' })
      }

      // Get transcription settings based on context
      const { context } = request.query as { context?: string }
      let options: { language?: string; prompt?: string } | undefined

      switch (context) {
        case 'brainstorm':
          options = speech.getBrainstormingSettings()
          break
        case 'workflow':
          options = speech.getWorkflowSettings()
          break
        case 'schedule':
          options = speech.getSchedulingSettings()
          break
      }

      // Transcribe
      const result = await speech.transcribeAudioBuffer(buffer, filename, options)

      return {
        text: result.text,
        savedPath: result.savedPath,
      }
    } catch (error) {
      fastify.log.error('Error transcribing audio:', error)
      return reply.status(500).send({
        error: error instanceof Error ? error.message : 'Failed to transcribe audio',
      })
    }
  })
}
