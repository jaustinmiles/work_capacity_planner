import OpenAI from 'openai'
import { toFile } from 'openai/uploads'
import fs from 'fs'
import path from 'path'
import { logger } from '../logger'

/**
 * Service for speech-to-text conversion using OpenAI Whisper
 */
export class SpeechService {
  private openai: OpenAI

  constructor(apiKey: string) {
    this.openai = new OpenAI({
      apiKey,
    })
  }

  /**
   * Convert audio file to text using Whisper
   */
  async transcribeAudio(audioFilePath: string, options?: {
    language?: string
    prompt?: string
  }): Promise<{
    text: string
  }> {
    try {
      // Check if file exists and get size
      const stats = fs.statSync(audioFilePath)
      const fileSizeInMB = stats.size / (1024 * 1024)

      if (fileSizeInMB > 25) {
        throw new Error('Audio file exceeds 25MB limit for Whisper API')
      }

      // Copy file to archive if it's not already in our tmp directory
      if (!audioFilePath.includes('/tmp/work-planner-audio')) {
        const tempDir = '/tmp/work-planner-audio'
        if (!fs.existsSync(tempDir)) {
          fs.mkdirSync(tempDir, { recursive: true })
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
        const filename = path.basename(audioFilePath)
        const archivePath = path.join(tempDir, `audio_${timestamp}_${filename}`)
        fs.copyFileSync(audioFilePath, archivePath)
        logger.system.debug(`Audio file archived to: ${archivePath}`)
      }

      // Create a proper file object for OpenAI API
      const audioBuffer = fs.readFileSync(audioFilePath)
      const fileName = path.basename(audioFilePath)
      const audioFile = await toFile(audioBuffer, fileName, {
        type: this.getMimeType(fileName),
      })

      const transcription = await this.openai.audio.transcriptions.create({
        file: audioFile,
        model: 'whisper-1',
        language: options?.language,
        prompt: options?.prompt,
        response_format: 'json',
      })

      return {
        text: transcription.text,
      }
    } catch (error) {
      logger.system.error('Error transcribing audio:', { error })

      // Provide more specific error messages for common issues
      if (error instanceof Error) {
        // Check for format-related errors
        if (error.message.includes('format') || error.message.includes('codec')) {
          const fileName = path.basename(audioFilePath)
          const ext = path.extname(fileName).toLowerCase()
          throw new Error(`Audio format issue with ${ext} file: ${error.message}. Try converting to MP3 or WAV.`)
        }

        // Check for file size issues
        if (error.message.includes('size') || error.message.includes('limit')) {
          throw new Error(`Audio file too large: ${error.message}`)
        }

        throw new Error(`Failed to transcribe audio: ${error.message}`)
      }
      throw new Error('Failed to transcribe audio: Unknown error')
    }
  }

  /**
   * Convert audio buffer to text (for in-memory audio data)
   */
  async transcribeAudioBuffer(
    audioBuffer: Buffer,
    filename: string,
    options?: {
      language?: string
      prompt?: string
    },
  ): Promise<{
    text: string
    savedPath: string
  }> {
    try {
      const fileSizeInMB = audioBuffer.length / (1024 * 1024)

      if (fileSizeInMB > 25) {
        throw new Error('Audio buffer exceeds 25MB limit for Whisper API')
      }

      // Save audio files to system tmp directory
      const tempDir = '/tmp/work-planner-audio'
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true })
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      const tempFilePath = path.join(tempDir, `audio_${timestamp}_${filename}`)
      fs.writeFileSync(tempFilePath, audioBuffer)
      logger.system.debug(`Audio file saved to: ${tempFilePath}`)

      const result = await this.transcribeAudio(tempFilePath, options)
      return {
        ...result,
        savedPath: tempFilePath,
      }
    } catch (error) {
      logger.system.error('Error transcribing audio buffer:', { error })
      if (error instanceof Error) {
        throw new Error(`Failed to transcribe audio buffer: ${error.message}`)
      }
      throw new Error('Failed to transcribe audio buffer: Unknown error')
    }
  }

  /**
   * Get MIME type for a file based on its extension
   */
  private getMimeType(filename: string): string {
    const ext = path.extname(filename).toLowerCase().substring(1)
    const mimeTypes: Record<string, string> = {
      'mp3': 'audio/mpeg',
      'mp4': 'audio/mp4',
      'mpeg': 'audio/mpeg',
      'mpga': 'audio/mpeg',
      'm4a': 'audio/mp4',
      'wav': 'audio/wav',
      'webm': 'audio/webm',
    }
    return mimeTypes[ext] || 'application/octet-stream'
  }

  /**
   * Get supported audio formats
   */
  getSupportedFormats(): string[] {
    return [
      'mp3',
      'mp4',
      'mpeg',
      'mpga',
      'm4a',
      'wav',
      'webm',
    ]
  }

  /**
   * Validate audio file format
   */
  isValidAudioFormat(filename: string): boolean {
    const extension = path.extname(filename).toLowerCase().substring(1)
    return this.getSupportedFormats().includes(extension)
  }

  /**
   * Get optimal transcription settings for task brainstorming
   */
  getBrainstormingSettings(): {
    language: string
    prompt: string
  } {
    return {
      language: 'en', // English
      prompt: 'This is a brainstorming session about work tasks, projects, and productivity planning. The speaker may mention deadlines, priorities, meetings, coding tasks, and project management.',
    }
  }

  /**
   * Get optimal transcription settings for workflow descriptions
   */
  getWorkflowSettings(): {
    language: string
    prompt: string
  } {
    return {
      language: 'en', // English
      prompt: 'This is a detailed description of a work process or workflow. The speaker may mention specific steps, dependencies, time estimates, and technical requirements.',
    }
  }

  /**
   * Get optimal transcription settings for work pattern scheduling
   */
  getSchedulingSettings(): {
    language: string
    prompt: string
  } {
    return {
      language: 'en', // English
      prompt: 'This is a description of work availability and scheduling preferences. The speaker will mention available time blocks, days of the week, specific hours, focus time requirements, admin time needs, meetings, and work patterns.',
    }
  }
}

// Singleton instance with lazy initialization
let speechServiceInstance: SpeechService | null = null

export const getSpeechService = (): SpeechService => {
  if (!speechServiceInstance) {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY environment variable is not set')
    }
    speechServiceInstance = new SpeechService(apiKey)
  }
  return speechServiceInstance
}
