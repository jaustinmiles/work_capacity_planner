/**
 * RadarPlaybackControls Component
 *
 * Playback controls for the radar chart animation, including play/pause,
 * stop, speed selection, and a timeline scrubber.
 */

import React, { useCallback } from 'react'
import { Button, Slider, Space, Typography } from '@arco-design/web-react'
import { IconPlayArrow, IconPause, IconRefresh } from '@arco-design/web-react/icon'
import dayjs from 'dayjs'
import { useResponsive } from '../../providers/ResponsiveProvider'
import { AnimationPlayState, AnimationSpeed } from '@shared/enums'
import { DateString } from '@shared/work-blocks-types'

const { Text } = Typography

// ============================================================================
// Types
// ============================================================================

export interface RadarPlaybackControlsProps {
  /** Total number of frames in the animation */
  frameCount: number
  /** Current frame index (0-based) */
  currentFrame: number
  /** The date corresponding to the current frame */
  currentDate: DateString
  /** Current playback state */
  playState: AnimationPlayState
  /** Current playback speed */
  speed: AnimationSpeed
  /** Callback when play is clicked */
  onPlay: () => void
  /** Callback when pause is clicked */
  onPause: () => void
  /** Callback when stop is clicked */
  onStop: () => void
  /** Callback when speed changes */
  onSpeedChange: (speed: AnimationSpeed) => void
  /** Callback when user seeks to a frame */
  onSeek: (frame: number) => void
  /** Whether the control is disabled (e.g., during loading) */
  disabled?: boolean
}

// ============================================================================
// Constants
// ============================================================================

interface SpeedOption {
  value: AnimationSpeed
  label: string
}

const SPEED_OPTIONS: SpeedOption[] = [
  { value: AnimationSpeed.Slow, label: '0.5x' },
  { value: AnimationSpeed.Normal, label: '1x' },
  { value: AnimationSpeed.Fast, label: '2x' },
  { value: AnimationSpeed.VeryFast, label: '4x' },
]

// ============================================================================
// Component
// ============================================================================

export function RadarPlaybackControls({
  frameCount,
  currentFrame,
  currentDate,
  playState,
  speed,
  onPlay,
  onPause,
  onStop,
  onSpeedChange,
  onSeek,
  disabled = false,
}: RadarPlaybackControlsProps): React.ReactElement {
  const { isMobile } = useResponsive()

  const isPlaying = playState === AnimationPlayState.Playing
  const isStopped = playState === AnimationPlayState.Stopped

  // Handle play/pause toggle
  const handlePlayPause = useCallback((): void => {
    if (isPlaying) {
      onPause()
    } else {
      onPlay()
    }
  }, [isPlaying, onPlay, onPause])

  // Handle slider change
  const handleSliderChange = useCallback(
    (value: number): void => {
      onSeek(value)
    },
    [onSeek],
  )

  // Format the current date for display
  const formattedDate = dayjs(currentDate).format(isMobile ? 'MMM D' : 'MMM D, YYYY')

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        padding: '12px 0',
        borderTop: '1px solid var(--color-border-2)',
        marginTop: 16,
      }}
    >
      {/* Main controls row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: isMobile ? 8 : 12,
          flexWrap: 'wrap',
        }}
      >
        {/* Play/Pause and Stop buttons */}
        <Space size={isMobile ? 4 : 8}>
          <Button
            type={isPlaying ? 'secondary' : 'primary'}
            icon={isPlaying ? <IconPause /> : <IconPlayArrow />}
            onClick={handlePlayPause}
            disabled={disabled}
            size={isMobile ? 'small' : 'default'}
          >
            {!isMobile && (isPlaying ? 'Pause' : 'Play')}
          </Button>
          <Button
            type="secondary"
            icon={<IconRefresh />}
            onClick={onStop}
            disabled={disabled || isStopped}
            size={isMobile ? 'small' : 'default'}
          >
            {!isMobile && 'Reset'}
          </Button>
        </Space>

        {/* Timeline scrubber */}
        <div style={{ flex: 1, minWidth: isMobile ? 100 : 150 }}>
          <Slider
            value={currentFrame}
            min={0}
            max={Math.max(0, frameCount - 1)}
            step={1}
            onChange={handleSliderChange}
            disabled={disabled}
            formatTooltip={(value) => {
              if (value === undefined) return ''
              return `Day ${value + 1}`
            }}
          />
        </div>

        {/* Speed selector */}
        <Button.Group>
          {SPEED_OPTIONS.map((option) => (
            <Button
              key={option.value}
              size={isMobile ? 'mini' : 'small'}
              type={speed === option.value ? 'primary' : 'secondary'}
              onClick={() => onSpeedChange(option.value)}
              disabled={disabled}
            >
              {option.label}
            </Button>
          ))}
        </Button.Group>
      </div>

      {/* Current date display - shows cumulative progress */}
      <div style={{ textAlign: 'center' }}>
        <Text type="secondary" style={{ fontSize: isMobile ? 12 : 14 }}>
          📊 Through {formattedDate}
          <Text
            style={{
              marginLeft: 8,
              color: 'var(--color-text-3)',
              fontSize: isMobile ? 11 : 12,
            }}
          >
            ({currentFrame + 1} {currentFrame === 0 ? 'day' : 'days'} accumulated)
          </Text>
        </Text>
      </div>
    </div>
  )
}
