import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SpeechService } from './speech-service'
import fs from 'fs'
import path from 'path'

// Mock OpenAI
const mockCreate = vi.fn()
vi.mock('openai', () => ({
  default: vi.fn().mockImplementation(() => ({
    audio: {
      transcriptions: {
        create: mockCreate,
      },
    },
  })),
}))

// Mock toFile from OpenAI uploads
vi.mock('openai/uploads', () => ({
  toFile: vi.fn().mockResolvedValue({
    name: 'test.mp3',
    type: 'audio/mpeg',
  }),
}))

// Mock fs
vi.mock('fs', () => ({
  default: {
    statSync: vi.fn().mockReturnValue({ size: 1024 * 1024 }), // 1MB
    existsSync: vi.fn().mockReturnValue(true),
    mkdirSync: vi.fn(),
    copyFileSync: vi.fn(),
    readFileSync: vi.fn().mockReturnValue(Buffer.from('audio data')),
    writeFileSync: vi.fn(),
  },
  statSync: vi.fn().mockReturnValue({ size: 1024 * 1024 }), // 1MB
  existsSync: vi.fn().mockReturnValue(true),
  mkdirSync: vi.fn(),
  copyFileSync: vi.fn(),
  readFileSync: vi.fn().mockReturnValue(Buffer.from('audio data')),
  writeFileSync: vi.fn(),
}))

// Mock logger
vi.mock('./logger', () => ({
  logger: {
    ai: {
      error: vi.fn(),
      debug: vi.fn(),
      info: vi.fn(),
    },
  },
}))

describe('SpeechService', () => {
  let service: SpeechService

  beforeEach(() => {
    vi.clearAllMocks()
    mockCreate.mockResolvedValue({
      text: 'This is a test transcription',
    })
    service = new SpeechService('test-api-key')
  })

  describe('constructor', () => {
    it('should create an instance with API key', () => {
      expect(service).toBeDefined()
    })
  })

  describe('transcribeAudio', () => {
    it('should transcribe audio file successfully', async () => {
      const result = await service.transcribeAudio('/path/to/audio.mp3')
      
      expect(result).toEqual({
        text: 'This is a test transcription',
      })
      expect(fs.statSync).toHaveBeenCalledWith('/path/to/audio.mp3')
      expect(fs.readFileSync).toHaveBeenCalledWith('/path/to/audio.mp3')
    })

    it('should handle audio file with language option', async () => {
      const result = await service.transcribeAudio('/path/to/audio.mp3', {
        language: 'en',
      })
      
      expect(result.text).toBe('This is a test transcription')
    })

    it('should handle audio file with prompt option', async () => {
      const result = await service.transcribeAudio('/path/to/audio.mp3', {
        prompt: 'This is about tasks',
      })
      
      expect(result.text).toBe('This is a test transcription')
    })

    it('should reject files over 25MB', async () => {
      vi.mocked(fs.statSync).mockReturnValueOnce({ 
        size: 26 * 1024 * 1024 // 26MB 
      } as any)

      await expect(
        service.transcribeAudio('/path/to/large.mp3')
      ).rejects.toThrow('Audio file exceeds 25MB limit')
    })

    it('should archive non-tmp files', async () => {
      await service.transcribeAudio('/home/user/audio.mp3')
      
      expect(fs.copyFileSync).toHaveBeenCalled()
    })

    it('should not archive files already in tmp directory', async () => {
      vi.clearAllMocks()
      await service.transcribeAudio('/tmp/work-planner-audio/audio.mp3')
      
      expect(fs.copyFileSync).not.toHaveBeenCalled()
    })

    it('should create temp directory if it does not exist', async () => {
      vi.mocked(fs.existsSync).mockReturnValueOnce(false)
      
      await service.transcribeAudio('/home/user/audio.mp3')
      
      expect(fs.mkdirSync).toHaveBeenCalledWith(
        '/tmp/work-planner-audio',
        { recursive: true }
      )
    })

    it('should handle format errors gracefully', async () => {
      mockCreate.mockRejectedValueOnce(
        new Error('Invalid format or codec')
      )
      
      await expect(
        service.transcribeAudio('/path/to/audio.xyz')
      ).rejects.toThrow('Audio format issue with .xyz file')
    })

    it('should handle size errors gracefully', async () => {
      mockCreate.mockRejectedValueOnce(
        new Error('File size limit exceeded')
      )
      
      await expect(
        service.transcribeAudio('/path/to/audio.mp3')
      ).rejects.toThrow('Audio file too large')
    })

    it('should handle generic errors', async () => {
      mockCreate.mockRejectedValueOnce(
        new Error('Some other error')
      )
      
      await expect(
        service.transcribeAudio('/path/to/audio.mp3')
      ).rejects.toThrow('Failed to transcribe audio: Some other error')
    })

    it('should handle non-Error exceptions', async () => {
      mockCreate.mockRejectedValueOnce(
        'String error'
      )
      
      await expect(
        service.transcribeAudio('/path/to/audio.mp3')
      ).rejects.toThrow('Failed to transcribe audio: Unknown error')
    })
  })

  describe('transcribeAudioBuffer', () => {
    it('should transcribe audio buffer successfully', async () => {
      const buffer = Buffer.from('audio data')
      const result = await service.transcribeAudioBuffer(buffer, 'test.mp3')
      
      expect(result).toEqual({
        text: 'This is a test transcription',
        savedPath: expect.stringContaining('/tmp/work-planner-audio/'),
      })
    })

    it('should save buffer to temp file', async () => {
      const buffer = Buffer.from('audio data')
      await service.transcribeAudioBuffer(buffer, 'test.mp3')
      
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('/tmp/work-planner-audio/'),
        buffer
      )
    })

    it('should handle buffer with options', async () => {
      const buffer = Buffer.from('audio data')
      const result = await service.transcribeAudioBuffer(buffer, 'test.mp3', {
        language: 'es',
        prompt: 'Spanish audio',
      })
      
      expect(result.text).toBe('This is a test transcription')
    })

    it('should create temp directory for buffer if needed', async () => {
      vi.mocked(fs.existsSync).mockReturnValueOnce(false)
      const buffer = Buffer.from('audio data')
      
      await service.transcribeAudioBuffer(buffer, 'test.mp3')
      
      expect(fs.mkdirSync).toHaveBeenCalledWith(
        '/tmp/work-planner-audio',
        { recursive: true }
      )
    })
  })

  describe('getMimeType', () => {
    it('should return correct MIME type for mp3', () => {
      const mimeType = (service as any).getMimeType('audio.mp3')
      expect(mimeType).toBe('audio/mpeg')
    })

    it('should return correct MIME type for wav', () => {
      const mimeType = (service as any).getMimeType('audio.wav')
      expect(mimeType).toBe('audio/wav')
    })

    it('should return correct MIME type for m4a', () => {
      const mimeType = (service as any).getMimeType('audio.m4a')
      expect(mimeType).toBe('audio/mp4')
    })

    it('should return correct MIME type for webm', () => {
      const mimeType = (service as any).getMimeType('audio.webm')
      expect(mimeType).toBe('audio/webm')
    })

    it('should return octet-stream for unknown extensions', () => {
      const mimeType = (service as any).getMimeType('audio.xyz')
      expect(mimeType).toBe('application/octet-stream')
    })

    it('should handle uppercase extensions', () => {
      const mimeType = (service as any).getMimeType('audio.MP3')
      expect(mimeType).toBe('audio/mpeg')
    })

    it('should handle files without extensions', () => {
      const mimeType = (service as any).getMimeType('audiofile')
      expect(mimeType).toBe('application/octet-stream')
    })
  })
})