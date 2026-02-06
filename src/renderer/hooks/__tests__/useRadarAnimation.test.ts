import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useRadarAnimation } from '../useRadarAnimation'
import { AnimationPlayState, AnimationDirection, AnimationSpeed } from '@shared/enums'

describe('useRadarAnimation', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('initial state', () => {
    it('should start with stopped state and frame 0', () => {
      const { result } = renderHook(() =>
        useRadarAnimation({ frameCount: 7 }),
      )

      expect(result.current.playState).toBe(AnimationPlayState.Stopped)
      expect(result.current.direction).toBe(AnimationDirection.Forward)
      expect(result.current.speed).toBe(AnimationSpeed.Normal)
      expect(result.current.currentFrame).toBe(0)
      expect(result.current.isPlaying).toBe(false)
      expect(result.current.progress).toBe(0)
    })

    it('should set canAnimate to true when frameCount >= 2', () => {
      const { result } = renderHook(() =>
        useRadarAnimation({ frameCount: 2 }),
      )

      expect(result.current.canAnimate).toBe(true)
    })

    it('should set canAnimate to false when frameCount < 2', () => {
      const { result } = renderHook(() =>
        useRadarAnimation({ frameCount: 1 }),
      )

      expect(result.current.canAnimate).toBe(false)
    })
  })

  describe('play/pause/stop controls', () => {
    it('should transition to playing state on play()', () => {
      const { result } = renderHook(() =>
        useRadarAnimation({ frameCount: 7 }),
      )

      act(() => {
        result.current.play()
      })

      expect(result.current.playState).toBe(AnimationPlayState.Playing)
      expect(result.current.isPlaying).toBe(true)
    })

    it('should not play when canAnimate is false', () => {
      const { result } = renderHook(() =>
        useRadarAnimation({ frameCount: 1 }),
      )

      act(() => {
        result.current.play()
      })

      expect(result.current.playState).toBe(AnimationPlayState.Stopped)
      expect(result.current.isPlaying).toBe(false)
    })

    it('should transition to paused state on pause()', () => {
      const { result } = renderHook(() =>
        useRadarAnimation({ frameCount: 7 }),
      )

      act(() => {
        result.current.play()
      })

      act(() => {
        result.current.pause()
      })

      expect(result.current.playState).toBe(AnimationPlayState.Paused)
      expect(result.current.isPlaying).toBe(false)
    })

    it('should reset to initial state on stop()', () => {
      const { result } = renderHook(() =>
        useRadarAnimation({ frameCount: 7 }),
      )

      // Play and advance a few frames
      act(() => {
        result.current.play()
      })

      act(() => {
        vi.advanceTimersByTime(3000) // Advance 3 seconds (3 frames)
      })

      // Stop
      act(() => {
        result.current.stop()
      })

      expect(result.current.playState).toBe(AnimationPlayState.Stopped)
      expect(result.current.currentFrame).toBe(0)
      expect(result.current.direction).toBe(AnimationDirection.Forward)
    })
  })

  describe('frame advancement', () => {
    it('should advance frames while playing', () => {
      const { result } = renderHook(() =>
        useRadarAnimation({ frameCount: 7, baseIntervalMs: 1000 }),
      )

      act(() => {
        result.current.play()
      })

      expect(result.current.currentFrame).toBe(0)

      act(() => {
        vi.advanceTimersByTime(1000)
      })

      expect(result.current.currentFrame).toBe(1)

      act(() => {
        vi.advanceTimersByTime(1000)
      })

      expect(result.current.currentFrame).toBe(2)
    })

    it('should not advance frames while paused', () => {
      const { result } = renderHook(() =>
        useRadarAnimation({ frameCount: 7, baseIntervalMs: 1000 }),
      )

      act(() => {
        result.current.play()
      })

      act(() => {
        vi.advanceTimersByTime(2000) // Advance to frame 2
      })

      act(() => {
        result.current.pause()
      })

      const frameBeforePause = result.current.currentFrame

      act(() => {
        vi.advanceTimersByTime(3000) // Try to advance more
      })

      expect(result.current.currentFrame).toBe(frameBeforePause)
    })
  })

  describe('bounce animation', () => {
    it('should reverse direction at the end (forward to backward)', () => {
      const { result } = renderHook(() =>
        useRadarAnimation({ frameCount: 3, baseIntervalMs: 1000 }),
      )

      act(() => {
        result.current.play()
      })

      // Frame 0 -> 1
      act(() => {
        vi.advanceTimersByTime(1000)
      })
      expect(result.current.currentFrame).toBe(1)
      expect(result.current.direction).toBe(AnimationDirection.Forward)

      // Frame 1 -> 2 (end, should reverse)
      act(() => {
        vi.advanceTimersByTime(1000)
      })
      expect(result.current.currentFrame).toBe(2)
      expect(result.current.direction).toBe(AnimationDirection.Backward)

      // Frame 2 -> 1 (going backward)
      act(() => {
        vi.advanceTimersByTime(1000)
      })
      expect(result.current.currentFrame).toBe(1)
    })

    it('should reverse direction at the start (backward to forward)', () => {
      const { result } = renderHook(() =>
        useRadarAnimation({ frameCount: 3, baseIntervalMs: 1000 }),
      )

      act(() => {
        result.current.play()
      })

      // Advance to end and reverse
      act(() => {
        vi.advanceTimersByTime(2000) // Frame 2, direction backward
      })

      // Go backward to start
      act(() => {
        vi.advanceTimersByTime(2000) // Frame 0
      })
      expect(result.current.currentFrame).toBe(0)
      expect(result.current.direction).toBe(AnimationDirection.Forward)
    })
  })

  describe('speed control', () => {
    it('should change speed with setSpeed()', () => {
      const { result } = renderHook(() =>
        useRadarAnimation({ frameCount: 7 }),
      )

      act(() => {
        result.current.setSpeed(AnimationSpeed.Fast)
      })

      expect(result.current.speed).toBe(AnimationSpeed.Fast)
    })

    it('should advance frames faster at higher speed', () => {
      const { result } = renderHook(() =>
        useRadarAnimation({ frameCount: 10, baseIntervalMs: 1000 }),
      )

      act(() => {
        result.current.setSpeed(AnimationSpeed.Fast) // 2x speed = 500ms interval
        result.current.play()
      })

      // At 2x speed, 1 second should advance 2 frames
      act(() => {
        vi.advanceTimersByTime(1000)
      })

      expect(result.current.currentFrame).toBe(2)
    })

    it('should advance frames slower at lower speed', () => {
      const { result } = renderHook(() =>
        useRadarAnimation({ frameCount: 10, baseIntervalMs: 1000 }),
      )

      act(() => {
        result.current.setSpeed(AnimationSpeed.Slow) // 0.5x speed = 2000ms interval
        result.current.play()
      })

      // At 0.5x speed, 1 second should not advance a full frame
      act(() => {
        vi.advanceTimersByTime(1000)
      })

      expect(result.current.currentFrame).toBe(0)

      // After 2 seconds, should advance 1 frame
      act(() => {
        vi.advanceTimersByTime(1000)
      })

      expect(result.current.currentFrame).toBe(1)
    })
  })

  describe('seekToFrame', () => {
    it('should seek to a valid frame', () => {
      const { result } = renderHook(() =>
        useRadarAnimation({ frameCount: 7 }),
      )

      act(() => {
        result.current.seekToFrame(3)
      })

      expect(result.current.currentFrame).toBe(3)
    })

    it('should clamp to max frame when seeking beyond bounds', () => {
      const { result } = renderHook(() =>
        useRadarAnimation({ frameCount: 7 }),
      )

      act(() => {
        result.current.seekToFrame(100)
      })

      expect(result.current.currentFrame).toBe(6) // frameCount - 1
    })

    it('should clamp to 0 when seeking below bounds', () => {
      const { result } = renderHook(() =>
        useRadarAnimation({ frameCount: 7 }),
      )

      act(() => {
        result.current.seekToFrame(-5)
      })

      expect(result.current.currentFrame).toBe(0)
    })

    it('should call onFrameChange callback when seeking', () => {
      const onFrameChange = vi.fn()
      const { result } = renderHook(() =>
        useRadarAnimation({ frameCount: 7, onFrameChange }),
      )

      act(() => {
        result.current.seekToFrame(4)
      })

      expect(onFrameChange).toHaveBeenCalledWith(4)
    })
  })

  describe('progress calculation', () => {
    it('should calculate progress correctly', () => {
      const { result } = renderHook(() =>
        useRadarAnimation({ frameCount: 5 }),
      )

      expect(result.current.progress).toBe(0)

      act(() => {
        result.current.seekToFrame(2)
      })

      expect(result.current.progress).toBe(0.5) // 2 / (5-1) = 0.5

      act(() => {
        result.current.seekToFrame(4)
      })

      expect(result.current.progress).toBe(1) // 4 / (5-1) = 1
    })

    it('should return 0 progress when frameCount is 1', () => {
      const { result } = renderHook(() =>
        useRadarAnimation({ frameCount: 1 }),
      )

      expect(result.current.progress).toBe(0)
    })
  })

  describe('frameCount changes', () => {
    it('should reset currentFrame when it exceeds new frameCount', () => {
      const { result, rerender } = renderHook(
        ({ frameCount }) => useRadarAnimation({ frameCount }),
        { initialProps: { frameCount: 10 } },
      )

      act(() => {
        result.current.seekToFrame(8)
      })

      expect(result.current.currentFrame).toBe(8)

      // Reduce frame count
      rerender({ frameCount: 5 })

      expect(result.current.currentFrame).toBe(4) // frameCount - 1
    })

    it('should stop playing when frameCount drops below minimum', () => {
      const { result, rerender } = renderHook(
        ({ frameCount }) => useRadarAnimation({ frameCount }),
        { initialProps: { frameCount: 5 } },
      )

      act(() => {
        result.current.play()
      })

      expect(result.current.isPlaying).toBe(true)

      // Reduce frame count below minimum
      rerender({ frameCount: 1 })

      expect(result.current.playState).toBe(AnimationPlayState.Stopped)
      expect(result.current.canAnimate).toBe(false)
    })
  })

  describe('onFrameChange callback', () => {
    it('should call onFrameChange during playback', () => {
      const onFrameChange = vi.fn()
      const { result } = renderHook(() =>
        useRadarAnimation({ frameCount: 5, baseIntervalMs: 1000, onFrameChange }),
      )

      act(() => {
        result.current.play()
      })

      act(() => {
        vi.advanceTimersByTime(1000)
      })

      expect(onFrameChange).toHaveBeenCalledWith(1)

      act(() => {
        vi.advanceTimersByTime(1000)
      })

      expect(onFrameChange).toHaveBeenCalledWith(2)
    })

    it('should call onFrameChange with 0 on stop', () => {
      const onFrameChange = vi.fn()
      const { result } = renderHook(() =>
        useRadarAnimation({ frameCount: 5, baseIntervalMs: 1000, onFrameChange }),
      )

      act(() => {
        result.current.play()
      })

      act(() => {
        vi.advanceTimersByTime(2000)
      })

      onFrameChange.mockClear()

      act(() => {
        result.current.stop()
      })

      expect(onFrameChange).toHaveBeenCalledWith(0)
    })
  })
})
