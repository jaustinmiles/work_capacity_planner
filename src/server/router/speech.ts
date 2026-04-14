/**
 * Speech Router
 *
 * Handles speech-to-text transcription via OpenAI Whisper.
 * Audio is sent from the client and transcribed on the server.
 */

import { z } from 'zod'
import OpenAI from 'openai'
import { router, protectedProcedure } from '../trpc'
import { getSpeechService } from '../../shared/speech-service'
import { TTSVoice } from '../../shared/enums'
import { logger } from '../../logger'

export const speechRouter = router({
  /**
   * Transcribe audio buffer to text
   *
   * The client sends the audio as a base64-encoded string (since tRPC
   * uses JSON and can't directly transfer Buffers).
   */
  transcribeBuffer: protectedProcedure
    .input(
      z.object({
        // Audio data as base64 string (Buffers don't serialize over JSON)
        audioBase64: z.string(),
        filename: z.string(),
        options: z
          .object({
            language: z.string().optional(),
            prompt: z.string().optional(),
          })
          .optional(),
      }),
    )
    .mutation(async ({ input }) => {
      try {
        // Convert base64 back to Buffer
        const audioBuffer = Buffer.from(input.audioBase64, 'base64')

        const speechService = getSpeechService()
        const result = await speechService.transcribeAudioBuffer(
          audioBuffer,
          input.filename,
          input.options,
        )

        return {
          text: result.text,
          savedPath: result.savedPath,
        }
      } catch (error) {
        logger.system.error('Speech transcription failed', {
          error: error instanceof Error ? error.message : String(error),
          filename: input.filename,
        })
        throw error
      }
    }),

  /**
   * Synthesize speech using OpenAI TTS API.
   * Returns base64-encoded mp3 audio.
   */
  synthesize: protectedProcedure
    .input(z.object({
      text: z.string().min(1),
      voice: z.nativeEnum(TTSVoice).optional(),
    }))
    .mutation(async ({ input }) => {
      try {
        const apiKey = process.env.OPENAI_API_KEY
        if (!apiKey) {
          throw new Error('OPENAI_API_KEY environment variable is not set')
        }

        const openai = new OpenAI({ apiKey })

        const response = await openai.audio.speech.create({
          model: 'tts-1',
          voice: input.voice ?? TTSVoice.Nova,
          input: input.text,
          response_format: 'mp3',
          speed: 1.05,
        })

        const arrayBuffer = await response.arrayBuffer()
        const audioBase64 = Buffer.from(arrayBuffer).toString('base64')

        return { audioBase64 }
      } catch (error) {
        logger.system.error('TTS synthesis failed', {
          error: error instanceof Error ? error.message : String(error),
          textLength: input.text.length,
        })
        throw error
      }
    }),
})
