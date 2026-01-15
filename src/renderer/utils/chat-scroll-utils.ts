/**
 * Chat Scroll Utilities
 *
 * Pure functions for managing chat scroll behavior.
 * These help implement smart auto-scrolling that only triggers when appropriate.
 */

import { ScrollBehavior } from '@shared/enums'

// =============================================================================
// Constants
// =============================================================================

/**
 * Default threshold (in pixels) for considering the user "at bottom" of scroll.
 * If scrollTop + clientHeight >= scrollHeight - threshold, user is "at bottom".
 */
export const DEFAULT_SCROLL_THRESHOLD = 50

// =============================================================================
// Scroll State Detection
// =============================================================================

/**
 * Check if an element's content overflows its visible area.
 *
 * @param element - The scrollable container element
 * @returns true if content height exceeds visible height
 */
export function hasScrollOverflow(element: HTMLElement | null): boolean {
  if (!element) return false
  return element.scrollHeight > element.clientHeight
}

/**
 * Check if an element is scrolled to (or near) the bottom.
 *
 * @param element - The scrollable container element
 * @param threshold - How close to bottom counts as "at bottom" (default: 50px)
 * @returns true if scroll position is at or near bottom
 */
export function isScrolledToBottom(
  element: HTMLElement | null,
  threshold: number = DEFAULT_SCROLL_THRESHOLD,
): boolean {
  if (!element) return true // Default to true if no element (will scroll anyway)

  const { scrollTop, scrollHeight, clientHeight } = element
  return scrollTop + clientHeight >= scrollHeight - threshold
}

/**
 * Get the current scroll position as a percentage (0-100).
 *
 * @param element - The scrollable container element
 * @returns Scroll percentage, or 100 if no overflow
 */
export function getScrollPercentage(element: HTMLElement | null): number {
  if (!element) return 100

  const { scrollTop, scrollHeight, clientHeight } = element
  const maxScroll = scrollHeight - clientHeight

  if (maxScroll <= 0) return 100

  return Math.round((scrollTop / maxScroll) * 100)
}

// =============================================================================
// Auto-Scroll Decision
// =============================================================================

/**
 * Determine if auto-scroll should be triggered for a new message.
 *
 * Smart auto-scroll only activates when:
 * 1. Content overflows the container (there's something to scroll), AND
 * 2. User is already at/near the bottom (they want to see new content)
 *
 * This prevents jarring scroll when:
 * - Chat is short (no overflow)
 * - User scrolled up to read history
 *
 * @param containerElement - The scrollable messages container
 * @param threshold - Pixels from bottom to consider "at bottom"
 * @returns true if auto-scroll should be performed
 */
export function shouldAutoScroll(
  containerElement: HTMLElement | null,
  threshold: number = DEFAULT_SCROLL_THRESHOLD,
): boolean {
  // If no element, don't scroll
  if (!containerElement) return false

  // If content doesn't overflow, no need to scroll
  if (!hasScrollOverflow(containerElement)) return false

  // Only scroll if user is already at/near bottom
  return isScrolledToBottom(containerElement, threshold)
}

/**
 * More permissive version that scrolls when:
 * - User is at bottom, OR
 * - Content just started overflowing (was not scrollable before)
 *
 * Useful for the first message that causes overflow.
 *
 * @param containerElement - The scrollable messages container
 * @param wasScrollable - Whether container was scrollable before the change
 * @param threshold - Pixels from bottom to consider "at bottom"
 * @returns true if auto-scroll should be performed
 */
export function shouldAutoScrollPermissive(
  containerElement: HTMLElement | null,
  wasScrollable: boolean,
  threshold: number = DEFAULT_SCROLL_THRESHOLD,
): boolean {
  if (!containerElement) return false

  const isNowScrollable = hasScrollOverflow(containerElement)

  // If content just became scrollable, scroll to show new content
  if (!wasScrollable && isNowScrollable) return true

  // Otherwise, use normal logic
  return shouldAutoScroll(containerElement, threshold)
}

// =============================================================================
// Scroll Actions
// =============================================================================

/**
 * Scroll an element to the bottom smoothly.
 *
 * @param element - The element to scroll
 * @param behavior - Scroll behavior (smooth, instant, or auto)
 */
export function scrollToBottom(
  element: HTMLElement | null,
  behavior: ScrollBehavior = ScrollBehavior.Smooth,
): void {
  if (!element) return

  element.scrollTo({
    top: element.scrollHeight,
    behavior,
  })
}

/**
 * Scroll an element to show a specific child element.
 *
 * @param container - The scrollable container
 * @param target - The target element to scroll into view
 * @param behavior - Scroll behavior (smooth, instant, or auto)
 */
export function scrollToElement(
  container: HTMLElement | null,
  target: HTMLElement | null,
  behavior: ScrollBehavior = ScrollBehavior.Smooth,
): void {
  if (!container || !target) return

  target.scrollIntoView({
    behavior,
    block: 'end',
  })
}

// =============================================================================
// Scroll State Tracking
// =============================================================================

/**
 * Create a scroll state snapshot for comparison.
 *
 * @param element - The scrollable element
 * @returns Snapshot object with scroll metrics
 */
export function captureScrollState(element: HTMLElement | null): ScrollState {
  if (!element) {
    return {
      scrollTop: 0,
      scrollHeight: 0,
      clientHeight: 0,
      isAtBottom: true,
      hasOverflow: false,
    }
  }

  return {
    scrollTop: element.scrollTop,
    scrollHeight: element.scrollHeight,
    clientHeight: element.clientHeight,
    isAtBottom: isScrolledToBottom(element),
    hasOverflow: hasScrollOverflow(element),
  }
}

/**
 * Scroll state snapshot interface.
 */
export interface ScrollState {
  scrollTop: number
  scrollHeight: number
  clientHeight: number
  isAtBottom: boolean
  hasOverflow: boolean
}

/**
 * Check if scroll state changed significantly.
 *
 * @param prev - Previous scroll state
 * @param current - Current scroll state
 * @returns true if content height changed (new content added)
 */
export function didContentChange(prev: ScrollState, current: ScrollState): boolean {
  return current.scrollHeight !== prev.scrollHeight
}
