/**
 * useResizable Hook
 *
 * Provides drag-to-resize functionality for panels and sidebars.
 * Supports both horizontal and vertical resizing with persistence.
 */

import { useState, useCallback, useEffect, useRef } from 'react'

export interface UseResizableOptions {
  /** Initial width/height in pixels */
  initialSize: number

  /** Minimum allowed size */
  minSize: number

  /** Maximum allowed size */
  maxSize: number

  /** Direction of resize ('horizontal' = width, 'vertical' = height) */
  direction?: 'horizontal' | 'vertical'

  /**
   * Whether the resize handle is on the "start" or "end" of the element.
   * For a right sidebar, use 'start' (handle is on the left edge).
   * For a left sidebar, use 'end' (handle is on the right edge).
   */
  handlePosition?: 'start' | 'end'

  /** localStorage key for persistence (optional) */
  storageKey?: string

  /** Callback when resize starts */
  onResizeStart?: () => void

  /** Callback during resize with current size */
  onResize?: (size: number) => void

  /** Callback when resize ends with final size */
  onResizeEnd?: (size: number) => void
}

export interface UseResizableReturn {
  /** Current size in pixels */
  size: number

  /** Whether the user is currently resizing */
  isResizing: boolean

  /** Set size programmatically */
  setSize: (size: number) => void

  /** Props to spread on the resize handle element */
  handleProps: {
    onMouseDown: (e: React.MouseEvent) => void
    onTouchStart: (e: React.TouchEvent) => void
    style: React.CSSProperties
  }

  /** CSS cursor to use during resize (for document body) */
  resizeCursor: string
}

/**
 * Hook for making elements resizable via drag.
 *
 * @example
 * ```tsx
 * function Sidebar() {
 *   const { size, handleProps, isResizing } = useResizable({
 *     initialSize: 400,
 *     minSize: 300,
 *     maxSize: 800,
 *     direction: 'horizontal',
 *     handlePosition: 'start',
 *     storageKey: 'sidebar-width',
 *   })
 *
 *   return (
 *     <div style={{ width: size }}>
 *       <div {...handleProps} className="resize-handle" />
 *       {children}
 *     </div>
 *   )
 * }
 * ```
 */
export function useResizable(options: UseResizableOptions): UseResizableReturn {
  const {
    initialSize,
    minSize,
    maxSize,
    direction = 'horizontal',
    handlePosition = 'start',
    storageKey,
    onResizeStart,
    onResize,
    onResizeEnd,
  } = options

  // Load initial size from storage or use default
  const [size, setSize] = useState<number>(() => {
    if (storageKey && typeof window !== 'undefined') {
      const saved = localStorage.getItem(storageKey)
      if (saved) {
        const parsed = parseInt(saved, 10)
        if (!isNaN(parsed) && parsed >= minSize && parsed <= maxSize) {
          return parsed
        }
      }
    }
    return initialSize
  })

  const [isResizing, setIsResizing] = useState(false)

  // Refs for tracking resize state
  const startPosRef = useRef<number>(0)
  const startSizeRef = useRef<number>(0)

  // Clamp size to bounds
  const clampSize = useCallback(
    (newSize: number): number => {
      return Math.max(minSize, Math.min(maxSize, newSize))
    },
    [minSize, maxSize],
  )

  // Update size with clamping
  const updateSize = useCallback(
    (newSize: number) => {
      const clamped = clampSize(newSize)
      setSize(clamped)
      onResize?.(clamped)
    },
    [clampSize, onResize],
  )

  // Handle mouse/touch move during resize
  const handleMove = useCallback(
    (clientPos: number) => {
      const delta = clientPos - startPosRef.current

      // Calculate new size based on handle position
      // For a right sidebar with handle on left (start), moving left increases size
      let newSize: number
      if (handlePosition === 'start') {
        newSize = startSizeRef.current - delta
      } else {
        newSize = startSizeRef.current + delta
      }

      updateSize(newSize)
    },
    [handlePosition, updateSize],
  )

  // Handle resize end
  const handleEnd = useCallback(() => {
    setIsResizing(false)

    // Persist to storage
    if (storageKey) {
      localStorage.setItem(storageKey, size.toString())
    }

    onResizeEnd?.(size)

    // Reset body cursor
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  }, [size, storageKey, onResizeEnd])

  // Mouse event handlers
  useEffect(() => {
    if (!isResizing) return

    const handleMouseMove = (e: MouseEvent) => {
      e.preventDefault()
      const clientPos = direction === 'horizontal' ? e.clientX : e.clientY
      handleMove(clientPos)
    }

    const handleMouseUp = () => {
      handleEnd()
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isResizing, direction, handleMove, handleEnd])

  // Touch event handlers
  useEffect(() => {
    if (!isResizing) return

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 1) return
      const touch = e.touches[0]
      if (!touch) return
      const clientPos = direction === 'horizontal' ? touch.clientX : touch.clientY
      handleMove(clientPos)
    }

    const handleTouchEnd = () => {
      handleEnd()
    }

    document.addEventListener('touchmove', handleTouchMove, { passive: true })
    document.addEventListener('touchend', handleTouchEnd)
    document.addEventListener('touchcancel', handleTouchEnd)

    return () => {
      document.removeEventListener('touchmove', handleTouchMove)
      document.removeEventListener('touchend', handleTouchEnd)
      document.removeEventListener('touchcancel', handleTouchEnd)
    }
  }, [isResizing, direction, handleMove, handleEnd])

  // Start resize from mouse
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      setIsResizing(true)

      const clientPos = direction === 'horizontal' ? e.clientX : e.clientY
      startPosRef.current = clientPos
      startSizeRef.current = size

      onResizeStart?.()

      // Set cursor on body to maintain cursor during drag
      document.body.style.cursor = direction === 'horizontal' ? 'col-resize' : 'row-resize'
      document.body.style.userSelect = 'none'
    },
    [direction, size, onResizeStart],
  )

  // Start resize from touch
  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length !== 1) return

      const touch = e.touches[0]
      if (!touch) return

      setIsResizing(true)

      const clientPos = direction === 'horizontal' ? touch.clientX : touch.clientY
      startPosRef.current = clientPos
      startSizeRef.current = size

      onResizeStart?.()
    },
    [direction, size, onResizeStart],
  )

  // Handle style for the resize grip
  const handleStyle: React.CSSProperties = {
    cursor: direction === 'horizontal' ? 'col-resize' : 'row-resize',
    touchAction: 'none',
  }

  return {
    size,
    isResizing,
    setSize: updateSize,
    handleProps: {
      onMouseDown: handleMouseDown,
      onTouchStart: handleTouchStart,
      style: handleStyle,
    },
    resizeCursor: direction === 'horizontal' ? 'col-resize' : 'row-resize',
  }
}
