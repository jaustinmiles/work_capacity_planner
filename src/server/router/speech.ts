/**
 * Speech Router
 *
 * Handles speech-to-text transcription via OpenAI Whisper.
 * Audio is sent from the client and transcribed on the server.
 */

import { z } from 'zod'
import { router, protectedProcedure } from '../trpc'
import { getSpeechService } from '../../shared/speech-service'
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
})
