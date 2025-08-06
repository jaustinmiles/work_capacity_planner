import OpenAI from 'openai'
import fs from 'fs'
import path from 'path'

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

      // Create a readable stream for the audio file
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
      console.error('Error transcribing audio:', error)
      if (error instanceof Error) {
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
  }> {
    try {
      const fileSizeInMB = audioBuffer.length / (1024 * 1024)

      if (fileSizeInMB > 25) {
        throw new Error('Audio buffer exceeds 25MB limit for Whisper API')
      }

      // Create a temporary file to work with the OpenAI API
      const tempDir = path.join(process.cwd(), 'temp')
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true })
      }

      const tempFilePath = path.join(tempDir, `temp_audio_${Date.now()}_${filename}`)
      fs.writeFileSync(tempFilePath, audioBuffer)

      try {
        const result = await this.transcribeAudio(tempFilePath, options)
        return result
      } finally {
        // Clean up temporary file
        if (fs.existsSync(tempFilePath)) {
          fs.unlinkSync(tempFilePath)
        }
      }
    } catch (error) {
      console.error('Error transcribing audio buffer:', error)
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
