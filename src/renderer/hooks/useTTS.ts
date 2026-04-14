/**
 * useTTS Hook — Text-to-Speech via OpenAI TTS API.
 *
 * Calls the server's speech.synthesize procedure, receives base64 mp3,
 * and plays it via an Audio element. Supports voice mode toggle that
 * auto-speaks all AI responses.
 *
 * Ported from Decision Helper's useAudio.js speak() function.
 */

import { useState, useRef, useCallback } from 'react'
import { TTSVoice } from '@shared/enums'
import { getDatabase } from '../services/database'
import { logger } from '@/logger'

interface UseTTSReturn {
  speak: (text: string, voice?: TTSVoice) => Promise<void>
  speaking: boolean
  voiceMode: boolean
  setVoiceMode: (on: boolean) => void
  cancel: () => void
}

export function useTTS(): UseTTSReturn {
  const [speaking, setSpeaking] = useState(false)
  const [voiceMode, setVoiceMode] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const cancel = useCallback((): void => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }
    setSpeaking(false)
  }, [])

  const speak = useCallback(async (text: string, voice?: TTSVoice): Promise<void> => {
    if (!text.trim()) return

    // Cancel any current playback
    cancel()
    setSpeaking(true)

    try {
      const db = getDatabase()
      const result = await db.synthesizeSpeech(text, voice)
      const audioBase64 = result.audioBase64 as string

      // Convert base64 to blob and play
      const binaryString = atob(audioBase64)
      const bytes = new Uint8Array(binaryString.length)
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i)
      }
      const blob = new Blob([bytes], { type: 'audio/mpeg' })
      const audioUrl = URL.createObjectURL(blob)
      const audio = new Audio(audioUrl)
      audioRef.current = audio

      await new Promise<void>((resolve) => {
        audio.onended = () => {
          URL.revokeObjectURL(audioUrl)
          setSpeaking(false)
          audioRef.current = null
          resolve()
        }
        audio.onerror = () => {
          URL.revokeObjectURL(audioUrl)
          setSpeaking(false)
          audioRef.current = null
          resolve()
        }
        audio.play().catch((e) => {
          logger.ui.warn('TTS playback blocked', { error: e.message }, 'tts-blocked')
          setSpeaking(false)
          audioRef.current = null
          resolve()
        })
      })
    } catch (error) {
      logger.ui.error('TTS failed', {
        error: error instanceof Error ? error.message : String(error),
      }, 'tts-error')
      setSpeaking(false)
    }
  }, [cancel])

  return { speak, speaking, voiceMode, setVoiceMode, cancel }
}
