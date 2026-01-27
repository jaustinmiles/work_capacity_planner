/**
 * useRadarAnimation Hook
 *
 * Manages animation state for radar chart time-lapse playback over a date range.
 * Supports play/pause/stop controls, speed adjustment, frame seeking, and bounce
 * (ping-pong) animation direction.
 *
 * @example
 * ```tsx
 * function AnimatedRadarChart({ frameCount }: { frameCount: number }) {
 *   const animation = useRadarAnimation({
 *     frameCount,
 *     baseIntervalMs: 1000,
 *   })
 *
 *   return (
 *     <div>
 *       <RadarChart data={frames[animation.currentFrame]} />
 *       <button onClick={animation.isPlaying ? animation.pause : animation.play}>
 *         {animation.isPlaying ? 'Pause' : 'Play'}
 *       </button>
 *       <Slider value={animation.currentFrame} onChange={animation.seekToFrame} />
 *     </div>
 *   )
 * }
 * ```
 */

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { AnimationPlayState, AnimationDirection, AnimationSpeed } from '@shared/enums'

// ============================================================================
// Types
// ============================================================================

export interface UseRadarAnimationOptions {
  /** Total number of frames (days) in the animation */
  frameCount: number
  /** Base interval in milliseconds between frames (default: 1000ms) */
  baseIntervalMs?: number
  /** Optional callback when frame changes */
  onFrameChange?: (frameIndex: number) => void
}

export interface UseRadarAnimationReturn {
  // State
  /** Current playback state */
  playState: AnimationPlayState
  /** Current animation direction (for bounce mode) */
  direction: AnimationDirection
  /** Current playback speed */
  speed: AnimationSpeed
  /** Current frame index (0-based) */
  currentFrame: number

  // Controls
  /** Start or resume playback */
  play: () => void
  /** Pause playback */
  pause: () => void
  /** Stop playback and reset to first frame */
  stop: () => void
  /** Set playback speed */
  setSpeed: (speed: AnimationSpeed) => void
  /** Seek to a specific frame */
  seekToFrame: (frameIndex: number) => void

  // Computed
  /** Whether animation is currently playing */
  isPlaying: boolean
  /** Progress through the animation (0-1) */
  progress: number
  /** Whether there are enough frames to animate */
  canAnimate: boolean
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_BASE_INTERVAL_MS = 1000
const MIN_FRAMES_FOR_ANIMATION = 2

// ============================================================================
// Hook Implementation
// ============================================================================

export function useRadarAnimation(options: UseRadarAnimationOptions): UseRadarAnimationReturn {
  const { frameCount, baseIntervalMs = DEFAULT_BASE_INTERVAL_MS, onFrameChange } = options

  // Core state
  const [playState, setPlayState] = useState<AnimationPlayState>(AnimationPlayState.Stopped)
  const [direction, setDirection] = useState<AnimationDirection>(AnimationDirection.Forward)
  const [speed, setSpeedState] = useState<AnimationSpeed>(AnimationSpeed.Normal)
  const [currentFrame, setCurrentFrame] = useState(0)

  // Ref for interval ID (avoids re-renders and ensures proper cleanup)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Ref for latest callback to avoid stale closure in interval
  const onFrameChangeRef = useRef(onFrameChange)
  useEffect(() => {
    onFrameChangeRef.current = onFrameChange
  }, [onFrameChange])

  // Computed values
  const isPlaying = playState === AnimationPlayState.Playing
  const canAnimate = frameCount >= MIN_FRAMES_FOR_ANIMATION
  const progress = useMemo(() => {
    if (frameCount <= 1) return 0
    return currentFrame / (frameCount - 1)
  }, [currentFrame, frameCount])

  // Clear any running interval
  const clearAnimationInterval = useCallback((): void => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }, [])

  // Animation loop effect
  useEffect(() => {
    // Don't animate if not playing or not enough frames
    if (playState !== AnimationPlayState.Playing || !canAnimate) {
      clearAnimationInterval()
      return
    }

    // Calculate actual interval based on speed
    const actualInterval = baseIntervalMs / speed

    intervalRef.current = setInterval(() => {
      setCurrentFrame((prev) => {
        let nextFrame: number

        if (direction === AnimationDirection.Forward) {
          nextFrame = prev + 1
          // Hit the end - reverse direction (bounce)
          if (nextFrame >= frameCount - 1) {
            setDirection(AnimationDirection.Backward)
            nextFrame = frameCount - 1
          }
        } else {
          nextFrame = prev - 1
          // Hit the start - reverse direction (bounce)
          if (nextFrame <= 0) {
            setDirection(AnimationDirection.Forward)
            nextFrame = 0
          }
        }

        // Call the frame change callback if provided
        if (onFrameChangeRef.current) {
          onFrameChangeRef.current(nextFrame)
        }

        return nextFrame
      })
    }, actualInterval)

    // Cleanup on unmount or when dependencies change
    return clearAnimationInterval
  }, [playState, direction, speed, frameCount, baseIntervalMs, canAnimate, clearAnimationInterval])

  // Reset animation when frame count changes significantly
  useEffect(() => {
    // If frame count drops below current frame, reset
    if (currentFrame >= frameCount) {
      setCurrentFrame(Math.max(0, frameCount - 1))
    }
    // If frame count drops below minimum, stop playing
    if (!canAnimate && playState === AnimationPlayState.Playing) {
      setPlayState(AnimationPlayState.Stopped)
    }
  }, [frameCount, currentFrame, canAnimate, playState])

  // Cleanup on unmount
  useEffect(() => {
    return clearAnimationInterval
  }, [clearAnimationInterval])

  // Control functions
  const play = useCallback((): void => {
    if (!canAnimate) return
    setPlayState(AnimationPlayState.Playing)
  }, [canAnimate])

  const pause = useCallback((): void => {
    setPlayState(AnimationPlayState.Paused)
  }, [])

  const stop = useCallback((): void => {
    setPlayState(AnimationPlayState.Stopped)
    setDirection(AnimationDirection.Forward)
    setCurrentFrame(0)
    if (onFrameChangeRef.current) {
      onFrameChangeRef.current(0)
    }
  }, [])

  const setSpeed = useCallback((newSpeed: AnimationSpeed): void => {
    setSpeedState(newSpeed)
  }, [])

  const seekToFrame = useCallback(
    (frameIndex: number): void => {
      // Clamp to valid range
      const clampedFrame = Math.max(0, Math.min(frameIndex, frameCount - 1))
      setCurrentFrame(clampedFrame)
      if (onFrameChangeRef.current) {
        onFrameChangeRef.current(clampedFrame)
      }
    },
    [frameCount],
  )

  return {
    // State
    playState,
    direction,
    speed,
    currentFrame,

    // Controls
    play,
    pause,
    stop,
    setSpeed,
    seekToFrame,

    // Computed
    isPlaying,
    progress,
    canAnimate,
  }
}

// Types are exported via interface declarations above
