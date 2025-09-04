import { useEffect, useRef, useState, RefObject } from 'react'

type ContainerBreakpoint = 'narrow' | 'standard' | 'wide'

interface ContainerSize {
  width: number
  height: number
  breakpoint: ContainerBreakpoint
  isNarrow: boolean
  isStandard: boolean
  isWide: boolean
}

interface UseContainerQueryOptions {
  // Custom breakpoint thresholds
  narrowThreshold?: number
  wideThreshold?: number
  // Debounce resize events
  debounce?: number
  // Enable logging for debugging
  debug?: boolean
}

const DEFAULT_OPTIONS: UseContainerQueryOptions = {
  narrowThreshold: 400,
  wideThreshold: 800,
  debounce: 150,
  debug: false,
}

/**
 * Hook to observe container size changes and provide responsive breakpoints
 * Uses ResizeObserver API for efficient size tracking
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { ref, width, height, breakpoint, isNarrow } = useContainerQuery()
 *
 *   return (
 *     <div ref={ref}>
 *       {isNarrow ? <CompactView /> : <FullView />}
 *     </div>
 *   )
 * }
 * ```
 */
export function useContainerQuery<T extends HTMLElement = HTMLDivElement>(
  options?: UseContainerQueryOptions,
): { ref: RefObject<T | null> } & ContainerSize {
  const ref = useRef<T>(null)
  const opts = { ...DEFAULT_OPTIONS, ...options }

  const [size, setSize] = useState<ContainerSize>({
    width: 0,
    height: 0,
    breakpoint: 'standard',
    isNarrow: false,
    isStandard: true,
    isWide: false,
  })

  useEffect(() => {
    if (!ref.current) return

    let timeoutId: NodeJS.Timeout | null = null

    const observer = new ResizeObserver((entries) => {
      // Clear any pending updates
      if (timeoutId) clearTimeout(timeoutId)

      // Debounce the resize callback
      timeoutId = setTimeout(() => {
        for (const entry of entries) {
          const { width, height } = entry.contentRect

          // Determine breakpoint
          let breakpoint: ContainerBreakpoint = 'standard'
          let isNarrow = false
          let isStandard = false
          let isWide = false

          if (width < opts.narrowThreshold!) {
            breakpoint = 'narrow'
            isNarrow = true
          } else if (width > opts.wideThreshold!) {
            breakpoint = 'wide'
            isWide = true
          } else {
            isStandard = true
          }

          const newSize = {
            width: Math.round(width),
            height: Math.round(height),
            breakpoint,
            isNarrow,
            isStandard,
            isWide,
          }

          if (opts.debug) {
            console.log('[useContainerQuery]', {
              element: ref.current?.className,
              ...newSize,
            })
          }

          setSize(newSize)
        }
      }, opts.debounce)
    })

    observer.observe(ref.current)

    // Cleanup
    return () => {
      if (timeoutId) clearTimeout(timeoutId)
      observer.disconnect()
    }
  }, [opts.narrowThreshold, opts.wideThreshold, opts.debounce, opts.debug])

  return {
    ref,
    ...size,
  }
}

/**
 * Hook variant that accepts an external ref
 * Useful when you already have a ref you need to use
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const containerRef = useRef<HTMLDivElement>(null)
 *   const { width, breakpoint } = useContainerQueryWithRef(containerRef)
 *
 *   return <div ref={containerRef}>...</div>
 * }
 * ```
 */
export function useContainerQueryWithRef<T extends HTMLElement = HTMLDivElement>(
  existingRef: RefObject<T>,
  options?: UseContainerQueryOptions,
): ContainerSize {
  const opts = { ...DEFAULT_OPTIONS, ...options }

  const [size, setSize] = useState<ContainerSize>({
    width: 0,
    height: 0,
    breakpoint: 'standard',
    isNarrow: false,
    isStandard: true,
    isWide: false,
  })

  useEffect(() => {
    if (!existingRef.current) return

    let timeoutId: NodeJS.Timeout | null = null

    const observer = new ResizeObserver((entries) => {
      if (timeoutId) clearTimeout(timeoutId)

      timeoutId = setTimeout(() => {
        for (const entry of entries) {
          const { width, height } = entry.contentRect

          let breakpoint: ContainerBreakpoint = 'standard'
          let isNarrow = false
          let isStandard = false
          let isWide = false

          if (width < opts.narrowThreshold!) {
            breakpoint = 'narrow'
            isNarrow = true
          } else if (width > opts.wideThreshold!) {
            breakpoint = 'wide'
            isWide = true
          } else {
            isStandard = true
          }

          setSize({
            width: Math.round(width),
            height: Math.round(height),
            breakpoint,
            isNarrow,
            isStandard,
            isWide,
          })
        }
      }, opts.debounce)
    })

    observer.observe(existingRef.current)

    return () => {
      if (timeoutId) clearTimeout(timeoutId)
      observer.disconnect()
    }
  }, [existingRef, opts.narrowThreshold, opts.wideThreshold, opts.debounce])

  return size
}

// Export types for external use
export type { ContainerSize, ContainerBreakpoint, UseContainerQueryOptions }
