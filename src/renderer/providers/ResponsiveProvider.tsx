import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'

type Breakpoint = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'xxl' | 'uwqhd' | 'suw'
type Orientation = 'portrait' | 'landscape'
type ContainerBreakpoint = 'narrow' | 'standard' | 'wide'

interface ContainerSize {
  width: number
  height: number
  breakpoint: ContainerBreakpoint
}

interface ResponsiveContextValue {
  breakpoint: Breakpoint
  orientation: Orientation
  containerQuery: (element: HTMLElement | null) => ContainerSize
  isTouch: boolean
  scale: number // Global scale factor for responsive sizing
  windowWidth: number
  windowHeight: number
  isCompact: boolean // Convenience flag for xs/sm breakpoints
  isMobile: boolean // Convenience flag for xs/sm/md breakpoints
  isDesktop: boolean // Convenience flag for lg/xl/xxl breakpoints
  isUltraWide: boolean // Convenience flag for uwqhd/suw breakpoints (2560px+)
  isSuperUltraWide: boolean // Convenience flag for suw breakpoint only (3440px+)
}

// Breakpoint definitions matching Tailwind/common standards
const BREAKPOINTS = {
  xs: 0,       // Mobile phones
  sm: 640,     // Large phones
  md: 768,     // Tablets
  lg: 1024,    // Desktop
  xl: 1280,    // Large desktop
  xxl: 1536,   // Wide desktop
  uwqhd: 2560, // Ultra-wide QHD (21:9 at 1440p)
  suw: 3440,   // Super ultra-wide (typical 21:9 ultrawide)
} as const

// Container query breakpoints for component-level responsiveness
const CONTAINER_BREAKPOINTS = {
  narrow: 400,
  wide: 800,
} as const

const ResponsiveContext = createContext<ResponsiveContextValue | null>(null)

export const ResponsiveProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<Omit<ResponsiveContextValue, 'containerQuery'>>(() => {
    // Initialize with current window size
    const width = typeof window !== 'undefined' ? window.innerWidth : 1024
    const height = typeof window !== 'undefined' ? window.innerHeight : 768
    const breakpoint = getBreakpoint(width)

    return {
      breakpoint,
      orientation: width > height ? 'landscape' : 'portrait',
      isTouch: typeof window !== 'undefined' && 'ontouchstart' in window,
      scale: Math.min(1, width / 1920), // Scale relative to design width
      windowWidth: width,
      windowHeight: height,
      isCompact: ['xs', 'sm'].includes(breakpoint),
      isMobile: ['xs', 'sm', 'md'].includes(breakpoint),
      isDesktop: ['lg', 'xl', 'xxl', 'uwqhd', 'suw'].includes(breakpoint),
      isUltraWide: ['uwqhd', 'suw'].includes(breakpoint),
      isSuperUltraWide: breakpoint === 'suw',
    }
  })

  // Container query function that measures element size
  const containerQuery = useCallback((element: HTMLElement | null): ContainerSize => {
    if (!element) {
      return { width: 0, height: 0, breakpoint: 'narrow' }
    }

    const rect = element.getBoundingClientRect()
    const width = rect.width
    const height = rect.height

    let breakpoint: ContainerBreakpoint = 'standard'
    if (width < CONTAINER_BREAKPOINTS.narrow) {
      breakpoint = 'narrow'
    } else if (width > CONTAINER_BREAKPOINTS.wide) {
      breakpoint = 'wide'
    }

    return { width, height, breakpoint }
  }, [])

  useEffect(() => {
    const updateResponsive = () => {
      const width = window.innerWidth
      const height = window.innerHeight
      const breakpoint = getBreakpoint(width)

      setState({
        breakpoint,
        orientation: width > height ? 'landscape' : 'portrait',
        isTouch: 'ontouchstart' in window,
        scale: Math.min(1, width / 1920),
        windowWidth: width,
        windowHeight: height,
        isCompact: ['xs', 'sm'].includes(breakpoint),
        isMobile: ['xs', 'sm', 'md'].includes(breakpoint),
        isDesktop: ['lg', 'xl', 'xxl', 'uwqhd', 'suw'].includes(breakpoint),
        isUltraWide: ['uwqhd', 'suw'].includes(breakpoint),
        isSuperUltraWide: breakpoint === 'suw',
      })

      // Apply mobile button sizes via inline styles for better specificity
      if (width < 768) {
        const style = document.getElementById('responsive-mobile-styles') || document.createElement('style')
        style.id = 'responsive-mobile-styles'
        style.innerHTML = `
          button, .arco-btn {
            min-height: 44px !important;
            min-width: 44px !important;
          }
          .arco-btn-size-default,
          .arco-btn-size-small,
          .arco-btn-size-mini {
            height: auto !important;
            min-height: 44px !important;
            padding: 8px 16px !important;
          }
        `
        if (!document.getElementById('responsive-mobile-styles')) {
          document.head.appendChild(style)
        }
      } else {
        // Remove mobile styles on desktop
        const style = document.getElementById('responsive-mobile-styles')
        if (style) {
          style.remove()
        }
      }
    }

    // Update on mount
    updateResponsive()

    // Throttled resize handler
    let resizeTimeout: NodeJS.Timeout
    const handleResize = () => {
      clearTimeout(resizeTimeout)
      resizeTimeout = setTimeout(updateResponsive, 150)
    }

    // Listen for resize and orientation change
    window.addEventListener('resize', handleResize)
    window.addEventListener('orientationchange', updateResponsive)

    return () => {
      window.removeEventListener('resize', handleResize)
      window.removeEventListener('orientationchange', updateResponsive)
      clearTimeout(resizeTimeout)
    }
  }, [])

  const value: ResponsiveContextValue = {
    ...state,
    containerQuery,
  }

  return (
    <ResponsiveContext.Provider value={value}>
      {children}
    </ResponsiveContext.Provider>
  )
}

// Helper function to determine breakpoint from width
function getBreakpoint(width: number): Breakpoint {
  if (width >= BREAKPOINTS.suw) return 'suw'
  if (width >= BREAKPOINTS.uwqhd) return 'uwqhd'
  if (width >= BREAKPOINTS.xxl) return 'xxl'
  if (width >= BREAKPOINTS.xl) return 'xl'
  if (width >= BREAKPOINTS.lg) return 'lg'
  if (width >= BREAKPOINTS.md) return 'md'
  if (width >= BREAKPOINTS.sm) return 'sm'
  return 'xs'
}

// Main hook for consuming responsive context
export const useResponsive = () => {
  const context = useContext(ResponsiveContext)
  if (!context) {
    throw new Error('useResponsive must be used within ResponsiveProvider')
  }
  return context
}

// Convenience hooks for common checks
export const useBreakpoint = () => {
  const { breakpoint } = useResponsive()
  return breakpoint
}

export const useIsMobile = () => {
  const { isMobile } = useResponsive()
  return isMobile
}

export const useIsDesktop = () => {
  const { isDesktop } = useResponsive()
  return isDesktop
}

export const useIsCompact = () => {
  const { isCompact } = useResponsive()
  return isCompact
}

export const useIsUltraWide = () => {
  const { isUltraWide } = useResponsive()
  return isUltraWide
}

export const useIsSuperUltraWide = () => {
  const { isSuperUltraWide } = useResponsive()
  return isSuperUltraWide
}

// Export types for external use
export type {
  Breakpoint,
  Orientation,
  ContainerBreakpoint,
  ContainerSize,
  ResponsiveContextValue,
}
