/**
 * RadialTypePicker — Circular type selection menu shown after node creation.
 *
 * Renders user task types as emoji buttons arranged in a radial layout
 * around the newly created node. This lets users assign a type with a single
 * click instead of navigating to the detail panel.
 *
 * Positioned in screen-space (same pattern as NodeQuickCreate).
 */

import { useState, useEffect, useRef, useCallback, forwardRef } from 'react'
import { Tooltip } from '@arco-design/web-react'
import { getTypeColor, getTypeEmoji } from '@shared/user-task-types'
import type { UserTaskType } from '@shared/user-task-types'
import { useSortedUserTaskTypes } from '../../store/useUserTaskTypeStore'

// =============================================================================
// Constants
// =============================================================================

/** Radius of the radial layout in pixels, keyed by type count thresholds */
const RADIUS_SMALL = 60 // 2-4 types
const RADIUS_MEDIUM = 70 // 5-8 types
const RADIUS_LARGE = 85 // 9+ types

const BUTTON_SIZE = 36
const EMOJI_FONT_SIZE = 16
const STAGGER_DELAY_MS = 30
const ANIMATION_DURATION_MS = 150
const Z_INDEX = 1000

// =============================================================================
// Types
// =============================================================================

interface RadialTypePickerProps {
  /** Screen-space position to center the radial menu on */
  position: { x: number; y: number }
  /** Current type ID (to highlight the active selection) */
  currentTypeId: string
  /** Called when user selects a type */
  onSelect: (typeId: string) => void
  /** Called when menu should dismiss (click outside, Escape) */
  onDismiss: () => void
}

export interface RadialPosition {
  x: number
  y: number
}

// =============================================================================
// Layout Utilities
// =============================================================================

/**
 * Calculate evenly-spaced positions on a circle.
 * Starts from the top (12 o'clock) and goes clockwise.
 */
export function getRadialPositions(count: number, radius: number): RadialPosition[] {
  return Array.from({ length: count }, (_, i) => {
    const angle = (2 * Math.PI * i) / count - Math.PI / 2
    return {
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
    }
  })
}

/**
 * Select the appropriate radius based on the number of types.
 */
export function getRadius(typeCount: number): number {
  if (typeCount <= 4) return RADIUS_SMALL
  if (typeCount <= 8) return RADIUS_MEDIUM
  return RADIUS_LARGE
}

// =============================================================================
// Component
// =============================================================================

export function RadialTypePicker({
  position,
  currentTypeId,
  onSelect,
  onDismiss,
}: RadialTypePickerProps): React.ReactElement | null {
  const userTypes = useSortedUserTaskTypes()
  const containerRef = useRef<HTMLDivElement>(null)
  const [mounted, setMounted] = useState(false)
  const [focusedIndex, setFocusedIndex] = useState(-1)
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([])

  // Trigger entry animation after mount
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setMounted(true))
    return (): void => { window.cancelAnimationFrame(frame) }
  }, [])

  // Escape key handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onDismiss()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return (): void => { document.removeEventListener('keydown', handleKeyDown) }
  }, [onDismiss])

  // Click-outside handler
  useEffect(() => {
    const handleMouseDown = (e: MouseEvent): void => {
      const container = containerRef.current
      if (container && !container.contains(e.target as Node)) {
        onDismiss()
      }
    }
    // Delay listener attachment to avoid catching the click that triggered creation
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleMouseDown)
    }, 50)
    return (): void => {
      clearTimeout(timer)
      document.removeEventListener('mousedown', handleMouseDown)
    }
  }, [onDismiss])

  // Keyboard navigation within the radial menu
  const handleContainerKeyDown = useCallback((e: React.KeyboardEvent): void => {
    if (userTypes.length === 0) return

    let nextIndex = focusedIndex

    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault()
      nextIndex = (focusedIndex + 1) % userTypes.length
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault()
      nextIndex = (focusedIndex - 1 + userTypes.length) % userTypes.length
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      const focusedType = focusedIndex >= 0 ? userTypes[focusedIndex] : undefined
      if (focusedType) {
        onSelect(focusedType.id)
      }
      return
    }

    if (nextIndex !== focusedIndex) {
      setFocusedIndex(nextIndex)
      buttonRefs.current[nextIndex]?.focus()
    }
  }, [focusedIndex, userTypes, onSelect])

  // Don't render if no types to choose from
  if (userTypes.length === 0) return null

  const radius = getRadius(userTypes.length)
  const positions = getRadialPositions(userTypes.length, radius)

  return (
    <div
      ref={containerRef}
      role="radiogroup"
      aria-label="Select task type"
      onKeyDown={handleContainerKeyDown}
      style={{
        position: 'absolute',
        left: position.x,
        top: position.y,
        zIndex: Z_INDEX,
        // Don't transform the container — buttons are positioned relative to this center
        pointerEvents: 'none', // Let clicks pass through to buttons only
      }}
    >
      {userTypes.map((userType, index) => {
        const pos = positions[index] ?? { x: 0, y: 0 }
        return (
        <TypeButton
          key={userType.id}
          userType={userType}
          userTypes={userTypes}
          isCurrent={userType.id === currentTypeId}
          offsetX={pos.x}
          offsetY={pos.y}
          animationDelay={index * STAGGER_DELAY_MS}
          mounted={mounted}
          focused={focusedIndex === index}
          onSelect={onSelect}
          onFocus={(): void => setFocusedIndex(index)}
          ref={(el): void => { buttonRefs.current[index] = el }}
        />
        )
      })}
    </div>
  )
}

// =============================================================================
// TypeButton Sub-Component
// =============================================================================

interface TypeButtonProps {
  userType: UserTaskType
  userTypes: UserTaskType[]
  isCurrent: boolean
  offsetX: number
  offsetY: number
  animationDelay: number
  mounted: boolean
  focused: boolean
  onSelect: (typeId: string) => void
  onFocus: () => void
}

const TypeButton = forwardRef<HTMLButtonElement, TypeButtonProps>(
  function TypeButton(
    { userType, userTypes, isCurrent, offsetX, offsetY, animationDelay, mounted, focused, onSelect, onFocus },
    ref,
  ) {
    const [hovered, setHovered] = useState(false)
    const color = getTypeColor(userTypes, userType.id)
    const emoji = getTypeEmoji(userTypes, userType.id)

    const handleClick = useCallback((): void => {
      onSelect(userType.id)
    }, [onSelect, userType.id])

    const scale = hovered ? 1.15 : 1
    const isAnimated = mounted

    return (
      <Tooltip content={userType.name} position="top" mini>
        <button
          ref={ref}
          type="button"
          role="radio"
          aria-checked={isCurrent}
          aria-label={`${userType.name} (${emoji})`}
          onClick={handleClick}
          onMouseEnter={(): void => setHovered(true)}
          onMouseLeave={(): void => setHovered(false)}
          onFocus={onFocus}
          tabIndex={focused ? 0 : -1}
          style={{
            position: 'absolute',
            left: offsetX,
            top: offsetY,
            transform: `translate(-50%, -50%) scale(${isAnimated ? scale : 0.3})`,
            opacity: isAnimated ? 1 : 0,
            transition: `transform ${ANIMATION_DURATION_MS}ms ease-out ${animationDelay}ms, opacity ${ANIMATION_DURATION_MS}ms ease-out ${animationDelay}ms, box-shadow 150ms ease-out`,
            width: BUTTON_SIZE,
            height: BUTTON_SIZE,
            borderRadius: '50%',
            border: `2px solid ${isCurrent ? color : '#e5e6eb'}`,
            backgroundColor: isCurrent ? `${color}20` : '#ffffff',
            boxShadow: hovered
              ? '0 2px 8px rgba(0, 0, 0, 0.15)'
              : '0 1px 4px rgba(0, 0, 0, 0.08)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: EMOJI_FONT_SIZE,
            lineHeight: 1,
            padding: 0,
            pointerEvents: 'auto',
            outline: focused ? `2px solid ${color}` : 'none',
            outlineOffset: 2,
          }}
        >
          {emoji}
        </button>
      </Tooltip>
    )
  },
)
