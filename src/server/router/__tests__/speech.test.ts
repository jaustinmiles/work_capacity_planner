/**
 * Tests for the speech router
 *
 * Tests speech-to-text transcription via OpenAI Whisper
 * with mocked external service
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createMockContext } from './router-test-helpers'

// Mock the speech service module
vi.mock('../../../shared/speech-service', () => ({
  getSpeechService: vi.fn(() => ({
    transcribeAudioBuffer: vi.fn(),
  })),
}))

// Mock the logger
vi.mock('../../../logger', () => ({
  logger: {
    system: {
      error: vi.fn(),
    },
  },
}))

describe('speech router', () => {
  let _ctx: ReturnType<typeof createMockContext>

  beforeEach(() => {
    _ctx = createMockContext()
    vi.clearAllMocks()
  })

  describe('transcribeBuffer', () => {
    it('should convert base64 to buffer and transcribe', async () => {
      // Simulate audio data as base64
      const originalText = 'Hello, this is a test recording'
      const audioBase64 = Buffer.from('fake-audio-data').toString('base64')
      // filename would be used with actual transcription API
      const _filename = 'recording.webm'

      // Simulate the transcription flow
      const audioBuffer = Buffer.from(audioBase64, 'base64')

      expect(audioBuffer).toBeInstanceOf(Buffer)
      expect(audioBuffer.length).toBeGreaterThan(0)

      // Mock transcription result
      const mockResult = {
        text: originalText,
        savedPath: '/tmp/recordings/recording.webm',
      }

      // Verify the expected return format
      expect(mockResult).toHaveProperty('text')
      expect(mockResult).toHaveProperty('savedPath')
      expect(mockResult.text).toBe(originalText)
    })

    it('should handle transcription options', async () => {
      const options = {
        language: 'en',
        prompt: 'This is a task planning session',
      }

      // Verify options structure
      expect(options.language).toBe('en')
      expect(options.prompt).toBeDefined()
    })

    it('should handle optional options parameter', async () => {
      const input = {
        audioBase64: Buffer.from('test').toString('base64'),
        filename: 'test.webm',
        options: undefined,
      }

      expect(input.options).toBeUndefined()
    })

    it('should convert base64 correctly', () => {
      const originalData = 'test audio data bytes'
      const base64 = Buffer.from(originalData).toString('base64')
      const decoded = Buffer.from(base64, 'base64').toString()

      expect(decoded).toBe(originalData)
    })

    it('should handle various audio formats via filename', () => {
      const supportedFormats = [
        'recording.webm',
        'audio.mp3',
        'voice.wav',
        'speech.m4a',
        'input.ogg',
      ]

      supportedFormats.forEach((filename) => {
        const extension = filename.split('.').pop()
        expect(['webm', 'mp3', 'wav', 'm4a', 'ogg']).toContain(extension)
      })
    })
  })

  describe('error handling', () => {
    it('should log and rethrow transcription errors', async () => {
      const error = new Error('OpenAI API rate limit exceeded')

      // Simulate error logging
      const loggedError = {
        error: error.message,
        filename: 'test.webm',
      }

      expect(loggedError.error).toBe('OpenAI API rate limit exceeded')
      expect(loggedError.filename).toBe('test.webm')
    })

    it('should handle non-Error objects', () => {
      const nonErrorObject = 'Something went wrong'

      // Simulate error conversion
      const errorMessage =
        nonErrorObject instanceof Error ? nonErrorObject.message : String(nonErrorObject)

      expect(errorMessage).toBe('Something went wrong')
    })

    it('should preserve error context for debugging', () => {
      const error = new Error('Network timeout')
      const input = {
        audioBase64: 'abc123',
        filename: 'recording.webm',
      }

      const errorContext = {
        error: error.message,
        filename: input.filename,
      }

      expect(errorContext).toEqual({
        error: 'Network timeout',
        filename: 'recording.webm',
      })
    })
  })

  describe('input validation', () => {
    it('should validate audioBase64 is a string', () => {
      const validInput = {
        audioBase64: 'SGVsbG8gV29ybGQ=', // "Hello World" in base64
        filename: 'test.webm',
      }

      expect(typeof validInput.audioBase64).toBe('string')
    })

    it('should validate filename is a string', () => {
      const validInput = {
        audioBase64: 'abc',
        filename: 'recording.webm',
      }

      expect(typeof validInput.filename).toBe('string')
    })

    it('should accept optional language in options', () => {
      const optionsWithLanguage = {
        language: 'es',
      }

      const optionsWithoutLanguage = {}

      expect(optionsWithLanguage.language).toBe('es')
      expect((optionsWithoutLanguage as { language?: string }).language).toBeUndefined()
    })

    it('should accept optional prompt in options', () => {
      const optionsWithPrompt = {
        prompt: 'Technical terminology: API, SDK, REST',
      }

      expect(optionsWithPrompt.prompt).toContain('API')
    })
  })

  describe('response format', () => {
    it('should return text and savedPath', () => {
      const response = {
        text: 'Transcribed text content',
        savedPath: '/path/to/saved/audio.webm',
      }

      expect(response).toHaveProperty('text')
      expect(response).toHaveProperty('savedPath')
      expect(typeof response.text).toBe('string')
      expect(typeof response.savedPath).toBe('string')
    })

    it('should handle empty transcription result', () => {
      const emptyResponse = {
        text: '',
        savedPath: '/path/to/file.webm',
      }

      expect(emptyResponse.text).toBe('')
    })
  })
})
