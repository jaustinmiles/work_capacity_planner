/**
 * Hook for voice recording and transcription
 * Used by ChatView for voice input functionality
 */

import { useState, useRef, useCallback, useEffect } from 'react'
import { getDatabase } from '../services/database'
import { logger } from '@/logger'

export type RecordingState = 'idle' | 'recording' | 'stopped'

export interface UseVoiceRecordingOptions {
  /** Prompt to guide transcription (helps Whisper understand context) */
  transcriptionPrompt?: string
  /** Called when transcription completes successfully */
  onTranscriptionComplete?: (text: string) => void
  /** Called when an error occurs */
  onError?: (error: string) => void
}

export interface UseVoiceRecordingResult {
  /** Current recording state */
  recordingState: RecordingState
  /** Whether transcription is in progress */
  isTranscribing: boolean
  /** Recording duration in seconds */
  recordingDuration: number
  /** Last transcribed text */
  transcribedText: string
  /** Error message if any */
  error: string | null
  /** Start recording audio */
  startRecording: () => Promise<void>
  /** Stop recording and trigger transcription */
  stopRecording: () => void
  /** Process an uploaded audio file */
  processAudioFile: (file: File) => Promise<void>
  /** Reset state to initial values */
  reset: () => void
}

export function useVoiceRecording(options: UseVoiceRecordingOptions = {}): UseVoiceRecordingResult {
  const {
    transcriptionPrompt = 'Transcribe the following audio',
    onTranscriptionComplete,
    onError,
  } = options

  const [recordingState, setRecordingState] = useState<RecordingState>('idle')
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [recordingDuration, setRecordingDuration] = useState(0)
  const [transcribedText, setTranscribedText] = useState('')
  const [error, setError] = useState<string | null>(null)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Start/stop duration timer when recording state changes
  useEffect(() => {
    if (recordingState === 'recording') {
      // Start the duration timer
      const startTime = Date.now()
      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration(Math.floor((Date.now() - startTime) / 1000))
      }, 1000)
    }

    return () => {
      // Cleanup timer when leaving recording state or unmounting
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current)
        recordingTimerRef.current = null
      }
    }
  }, [recordingState])

  // Stop media recorder on unmount if still recording
  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop()
      }
    }
  }, [])

  const processAudioBlob = useCallback(async (audioBlob: Blob) => {
    setIsTranscribing(true)
    setError(null)

    try {
      // Convert blob to array buffer
      const arrayBuffer = await audioBlob.arrayBuffer()
      const uint8Array = new Uint8Array(arrayBuffer)
      const filename = `recording-${Date.now()}.${audioBlob.type.includes('mp4') ? 'mp4' : 'webm'}`

      // Transcribe via database service
      // Note: IPC serialization handles Uint8Array to Buffer conversion
      const transcriptionResult = await getDatabase().transcribeAudioBuffer(
        uint8Array as unknown as Buffer,
        filename,
        { prompt: transcriptionPrompt },
      )

      const text = transcriptionResult.text
      setTranscribedText(text)
      onTranscriptionComplete?.(text)

    } catch (err) {
      const errorMessage = 'Failed to process audio. Please try again.'
      setError(errorMessage)
      onError?.(errorMessage)
      logger.ui.error('Error processing audio', {
        error: err instanceof Error ? err.message : String(err),
      }, 'voice-process-error')
    } finally {
      setIsTranscribing(false)
    }
  }, [transcriptionPrompt, onTranscriptionComplete, onError])

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })

      // Select best supported mime type
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/mp4')
        ? 'audio/mp4'
        : 'audio/webm'

      const mediaRecorder = new MediaRecorder(stream, { mimeType })
      audioChunksRef.current = []

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType })
        await processAudioBlob(audioBlob)

        // Clean up stream tracks
        stream.getTracks().forEach(track => track.stop())
        // Timer cleanup is now handled by useEffect when recordingState changes
        setRecordingDuration(0)
      }

      mediaRecorderRef.current = mediaRecorder
      mediaRecorder.start(100) // Collect data every 100ms
      setRecordingState('recording')
      setError(null)
      // Timer is now started by useEffect when recordingState changes to 'recording'

    } catch (err) {
      const errorMessage = 'Failed to start recording. Please check your microphone permissions.'
      setError(errorMessage)
      onError?.(errorMessage)
      logger.ui.error('Error starting recording', {
        error: err instanceof Error ? err.message : String(err),
      }, 'voice-record-error')
    }
  }, [processAudioBlob, onError])

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && recordingState === 'recording') {
      mediaRecorderRef.current.stop()
      setRecordingState('stopped')
    }
  }, [recordingState])

  const processAudioFile = useCallback(async (file: File) => {
    setIsTranscribing(true)
    setError(null)

    try {
      const arrayBuffer = await file.arrayBuffer()
      const uint8Array = new Uint8Array(arrayBuffer)

      // Note: IPC serialization handles Uint8Array to Buffer conversion
      const transcriptionResult = await getDatabase().transcribeAudioBuffer(
        uint8Array as unknown as Buffer,
        file.name,
        { prompt: transcriptionPrompt },
      )

      const text = transcriptionResult.text
      setTranscribedText(text)
      onTranscriptionComplete?.(text)

    } catch (err) {
      const errorMessage = 'Failed to process audio file. Please try again.'
      setError(errorMessage)
      onError?.(errorMessage)
      logger.ui.error('Error processing audio file', {
        error: err instanceof Error ? err.message : String(err),
      }, 'voice-file-error')
    } finally {
      setIsTranscribing(false)
    }
  }, [transcriptionPrompt, onTranscriptionComplete, onError])

  const reset = useCallback(() => {
    setRecordingState('idle')
    setIsTranscribing(false)
    setRecordingDuration(0)
    setTranscribedText('')
    setError(null)
    audioChunksRef.current = []
  }, [])

  return {
    recordingState,
    isTranscribing,
    recordingDuration,
    transcribedText,
    error,
    startRecording,
    stopRecording,
    processAudioFile,
    reset,
  }
}
