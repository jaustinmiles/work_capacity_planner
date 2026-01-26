import OpenAI from 'openai'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { logger } from '../logger'

/**
 * Get the persistent audio backup directory path.
 * Uses ~/.work-planner/audio/ for persistence across reboots.
 */
function getAudioBackupDir(): string {
  return path.join(os.homedir(), '.work-planner', 'audio')
}

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

      // Copy file to persistent archive directory
      const audioDir = getAudioBackupDir()
      if (!audioFilePath.includes(audioDir)) {
        if (!fs.existsSync(audioDir)) {
          fs.mkdirSync(audioDir, { recursive: true })
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
        const filename = path.basename(audioFilePath)
        const archivePath = path.join(audioDir, `audio_${timestamp}_${filename}`)
        fs.copyFileSync(audioFilePath, archivePath)
        logger.system.debug(`Audio file archived to: ${archivePath}`)
      }

      // Use createReadStream which is more reliable with various audio formats
      // toFile can have issues with browser-recorded webm/opus files
      const audioStream = fs.createReadStream(audioFilePath)

      const transcription = await this.openai.audio.transcriptions.create({
        file: audioStream,
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

      // Save audio files to persistent directory (survives reboots)
      const audioDir = getAudioBackupDir()
      if (!fs.existsSync(audioDir)) {
        fs.mkdirSync(audioDir, { recursive: true })
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      const savedFilePath = path.join(audioDir, `audio_${timestamp}_${filename}`)
      fs.writeFileSync(savedFilePath, audioBuffer)
      logger.system.debug(`Audio file saved to: ${savedFilePath}`)

      const result = await this.transcribeAudio(savedFilePath, options)
      return {
        ...result,
        savedPath: savedFilePath,
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
