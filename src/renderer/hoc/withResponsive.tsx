import React, { ComponentType, forwardRef } from 'react'
import { useResponsive, Breakpoint } from '../providers/ResponsiveProvider'

export interface ResponsiveProps {
  breakpoint: Breakpoint
  scale: number
  isCompact: boolean
  isMobile: boolean
  isDesktop: boolean
  windowWidth: number
  windowHeight: number
}

/**
 * Higher-order component that injects responsive props into wrapped components
 *
 * @example
 * ```tsx
 * interface MyComponentProps extends ResponsiveProps {
 *   title: string
 * }
 *
 * const MyComponentBase: React.FC<MyComponentProps> = ({
 *   title,
 *   breakpoint,
 *   isCompact
 * }) => {
 *   return (
 *     <div style={{ fontSize: isCompact ? 12 : 16 }}>
 *       {title} - {breakpoint}
 *     </div>
 *   )
 * }
 *
 * export const MyComponent = withResponsive(MyComponentBase)
 *
 * // Usage - no need to pass responsive props
 * <MyComponent title="Hello" />
 * ```
 */
export function withResponsive<P extends ResponsiveProps>(
  Component: ComponentType<P>,
): ComponentType<Omit<P, keyof ResponsiveProps>> {
  const WithResponsiveComponent = forwardRef<
    any,
    Omit<P, keyof ResponsiveProps>
  >((props, ref) => {
    const {
      breakpoint,
      scale,
      isCompact,
      isMobile,
      isDesktop,
      windowWidth,
      windowHeight,
    } = useResponsive()

    const responsiveProps: ResponsiveProps = {
      breakpoint,
      scale,
      isCompact,
      isMobile,
      isDesktop,
      windowWidth,
      windowHeight,
    }

    return <Component {...(props as any)} {...responsiveProps} ref={ref} />
  })

  WithResponsiveComponent.displayName = `withResponsive(${Component.displayName || Component.name || 'Component'})`

  return WithResponsiveComponent as ComponentType<Omit<P, keyof ResponsiveProps>>
}

/**
 * HOC variant that provides only specific responsive props
 * Useful when you only need certain responsive values
 *
 * @example
 * ```tsx
 * const MyComponent = withResponsiveProps(['isCompact', 'breakpoint'])(
 *   ({ isCompact, breakpoint }) => {
 *     // Only has access to isCompact and breakpoint
 *   }
 * )
 * ```
 */
export function withResponsiveProps<K extends keyof ResponsiveProps>(
  keys: K[],
) {
  return function <P extends Pick<ResponsiveProps, K>>(
    Component: ComponentType<P>,
  ): ComponentType<Omit<P, K>> {
    const WithResponsivePropsComponent = forwardRef<
      any,
      Omit<P, K>
    >((props, ref) => {
      const responsive = useResponsive()

      const selectedProps = keys.reduce((acc, key) => {
        acc[key] = responsive[key as keyof typeof responsive] as any
        return acc
      }, {} as Pick<ResponsiveProps, K>)

      return <Component {...(props as any)} {...selectedProps} ref={ref} />
    })

    WithResponsivePropsComponent.displayName = `withResponsiveProps(${Component.displayName || Component.name || 'Component'})`

    return WithResponsivePropsComponent as ComponentType<Omit<P, K>>
  }
}

/**
 * Conditional rendering HOC based on breakpoints
 * Useful for showing/hiding components at different screen sizes
 *
 * @example
 * ```tsx
 * const DesktopOnlyComponent = withBreakpoint({
 *   minBreakpoint: 'lg'
 * })(MyComponent)
 *
 * const MobileOnlyComponent = withBreakpoint({
 *   maxBreakpoint: 'md'
 * })(MyComponent)
 * ```
 */
interface BreakpointOptions {
  minBreakpoint?: Breakpoint
  maxBreakpoint?: Breakpoint
  fallback?: React.ReactNode
}

const breakpointOrder: Breakpoint[] = ['xs', 'sm', 'md', 'lg', 'xl', 'xxl']

export function withBreakpoint(options: BreakpointOptions) {
  return function <P extends object>(
    Component: ComponentType<P>,
  ): ComponentType<P> {
    const WithBreakpointComponent = forwardRef<any, P>((props, ref) => {
      const { breakpoint } = useResponsive()

      const currentIndex = breakpointOrder.indexOf(breakpoint)
      const minIndex = options.minBreakpoint
        ? breakpointOrder.indexOf(options.minBreakpoint)
        : -1
      const maxIndex = options.maxBreakpoint
        ? breakpointOrder.indexOf(options.maxBreakpoint)
        : breakpointOrder.length

      const shouldRender = currentIndex >= minIndex && currentIndex <= maxIndex

      if (!shouldRender) {
        return <>{options.fallback || null}</>
      }

      return <Component {...(props as any)} ref={ref} />
    })

    WithBreakpointComponent.displayName = `withBreakpoint(${Component.displayName || Component.name || 'Component'})`

    return WithBreakpointComponent as ComponentType<P>
  }
}
