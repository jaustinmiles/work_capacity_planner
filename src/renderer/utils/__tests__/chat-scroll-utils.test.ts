/**
 * Tests for Chat Scroll Utilities
 */

import { describe, it, expect, vi } from 'vitest'
import {
  DEFAULT_SCROLL_THRESHOLD,
  hasScrollOverflow,
  isScrolledToBottom,
  getScrollPercentage,
  shouldAutoScroll,
  shouldAutoScrollPermissive,
  scrollToBottom,
  scrollToElement,
  captureScrollState,
  didContentChange,
  ScrollState,
} from '../chat-scroll-utils'
import { ScrollBehavior } from '@shared/enums'

// Helper to create mock HTML element with scroll properties
function createMockElement(
  overrides: Partial<{
    scrollTop: number
    scrollHeight: number
    clientHeight: number
    scrollTo: ReturnType<typeof vi.fn>
  }> = {},
): HTMLElement {
  return {
    scrollTop: 0,
    scrollHeight: 500,
    clientHeight: 300,
    scrollTo: vi.fn(),
    ...overrides,
  } as unknown as HTMLElement
}

describe('chat-scroll-utils', () => {
  describe('DEFAULT_SCROLL_THRESHOLD', () => {
    it('should be a reasonable default value', () => {
      expect(DEFAULT_SCROLL_THRESHOLD).toBe(50)
    })
  })

  describe('hasScrollOverflow', () => {
    it('should return true when content overflows', () => {
      const element = createMockElement({
        scrollHeight: 500,
        clientHeight: 300,
      })
      expect(hasScrollOverflow(element)).toBe(true)
    })

    it('should return false when content fits', () => {
      const element = createMockElement({
        scrollHeight: 200,
        clientHeight: 300,
      })
      expect(hasScrollOverflow(element)).toBe(false)
    })

    it('should return false when heights are equal', () => {
      const element = createMockElement({
        scrollHeight: 300,
        clientHeight: 300,
      })
      expect(hasScrollOverflow(element)).toBe(false)
    })

    it('should return false for null element', () => {
      expect(hasScrollOverflow(null)).toBe(false)
    })
  })

  describe('isScrolledToBottom', () => {
    it('should return true when at exact bottom', () => {
      const element = createMockElement({
        scrollTop: 200,
        scrollHeight: 500,
        clientHeight: 300,
      })
      // scrollTop (200) + clientHeight (300) = 500 = scrollHeight
      expect(isScrolledToBottom(element)).toBe(true)
    })

    it('should return true when within threshold of bottom', () => {
      const element = createMockElement({
        scrollTop: 170,
        scrollHeight: 500,
        clientHeight: 300,
      })
      // scrollTop (170) + clientHeight (300) = 470
      // scrollHeight (500) - threshold (50) = 450
      // 470 >= 450, so at bottom
      expect(isScrolledToBottom(element, 50)).toBe(true)
    })

    it('should return false when scrolled up past threshold', () => {
      const element = createMockElement({
        scrollTop: 100,
        scrollHeight: 500,
        clientHeight: 300,
      })
      // scrollTop (100) + clientHeight (300) = 400
      // scrollHeight (500) - threshold (50) = 450
      // 400 < 450, so NOT at bottom
      expect(isScrolledToBottom(element, 50)).toBe(false)
    })

    it('should return true for null element (default behavior)', () => {
      expect(isScrolledToBottom(null)).toBe(true)
    })

    it('should use custom threshold', () => {
      const element = createMockElement({
        scrollTop: 100,
        scrollHeight: 500,
        clientHeight: 300,
      })
      // With threshold 100: 400 >= 400, so at bottom
      expect(isScrolledToBottom(element, 100)).toBe(true)
    })
  })

  describe('getScrollPercentage', () => {
    it('should return 0 when at top', () => {
      const element = createMockElement({
        scrollTop: 0,
        scrollHeight: 500,
        clientHeight: 300,
      })
      expect(getScrollPercentage(element)).toBe(0)
    })

    it('should return 100 when at bottom', () => {
      const element = createMockElement({
        scrollTop: 200,
        scrollHeight: 500,
        clientHeight: 300,
      })
      expect(getScrollPercentage(element)).toBe(100)
    })

    it('should return 50 when halfway', () => {
      const element = createMockElement({
        scrollTop: 100,
        scrollHeight: 500,
        clientHeight: 300,
      })
      // maxScroll = 500 - 300 = 200
      // percentage = 100 / 200 = 0.5 = 50%
      expect(getScrollPercentage(element)).toBe(50)
    })

    it('should return 100 when no overflow', () => {
      const element = createMockElement({
        scrollTop: 0,
        scrollHeight: 300,
        clientHeight: 300,
      })
      expect(getScrollPercentage(element)).toBe(100)
    })

    it('should return 100 for null element', () => {
      expect(getScrollPercentage(null)).toBe(100)
    })
  })

  describe('shouldAutoScroll', () => {
    it('should return false for null element', () => {
      expect(shouldAutoScroll(null)).toBe(false)
    })

    it('should return false when no overflow', () => {
      const element = createMockElement({
        scrollHeight: 200,
        clientHeight: 300,
      })
      expect(shouldAutoScroll(element)).toBe(false)
    })

    it('should return false when scrolled up', () => {
      const element = createMockElement({
        scrollTop: 0,
        scrollHeight: 500,
        clientHeight: 300,
      })
      expect(shouldAutoScroll(element)).toBe(false)
    })

    it('should return true when has overflow AND at bottom', () => {
      const element = createMockElement({
        scrollTop: 200,
        scrollHeight: 500,
        clientHeight: 300,
      })
      expect(shouldAutoScroll(element)).toBe(true)
    })

    it('should return true when within threshold of bottom', () => {
      const element = createMockElement({
        scrollTop: 180,
        scrollHeight: 500,
        clientHeight: 300,
      })
      expect(shouldAutoScroll(element, 50)).toBe(true)
    })
  })

  describe('shouldAutoScrollPermissive', () => {
    it('should return true when content just became scrollable', () => {
      const element = createMockElement({
        scrollTop: 0,
        scrollHeight: 500,
        clientHeight: 300,
      })
      // wasScrollable = false, now scrollable = true
      expect(shouldAutoScrollPermissive(element, false)).toBe(true)
    })

    it('should fall back to normal logic when already scrollable', () => {
      const element = createMockElement({
        scrollTop: 0, // At top
        scrollHeight: 500,
        clientHeight: 300,
      })
      // wasScrollable = true, at top, so should NOT scroll
      expect(shouldAutoScrollPermissive(element, true)).toBe(false)
    })

    it('should scroll when already scrollable AND at bottom', () => {
      const element = createMockElement({
        scrollTop: 200,
        scrollHeight: 500,
        clientHeight: 300,
      })
      expect(shouldAutoScrollPermissive(element, true)).toBe(true)
    })

    it('should return false for null element', () => {
      expect(shouldAutoScrollPermissive(null, false)).toBe(false)
    })
  })

  describe('scrollToBottom', () => {
    it('should call scrollTo with scrollHeight', () => {
      const scrollTo = vi.fn()
      const element = createMockElement({
        scrollHeight: 500,
        scrollTo,
      })

      scrollToBottom(element)

      expect(scrollTo).toHaveBeenCalledWith({
        top: 500,
        behavior: 'smooth',
      })
    })

    it('should use instant behavior when specified', () => {
      const scrollTo = vi.fn()
      const element = createMockElement({
        scrollHeight: 500,
        scrollTo,
      })

      scrollToBottom(element, ScrollBehavior.Instant)

      expect(scrollTo).toHaveBeenCalledWith({
        top: 500,
        behavior: 'instant',
      })
    })

    it('should not throw for null element', () => {
      expect(() => scrollToBottom(null)).not.toThrow()
    })
  })

  describe('scrollToElement', () => {
    it('should call scrollIntoView on target', () => {
      const scrollIntoView = vi.fn()
      const container = createMockElement()
      const target = { scrollIntoView } as unknown as HTMLElement

      scrollToElement(container, target)

      expect(scrollIntoView).toHaveBeenCalledWith({
        behavior: 'smooth',
        block: 'end',
      })
    })

    it('should use specified behavior', () => {
      const scrollIntoView = vi.fn()
      const container = createMockElement()
      const target = { scrollIntoView } as unknown as HTMLElement

      scrollToElement(container, target, 'instant')

      expect(scrollIntoView).toHaveBeenCalledWith({
        behavior: 'instant',
        block: 'end',
      })
    })

    it('should not throw for null container', () => {
      const target = { scrollIntoView: vi.fn() } as unknown as HTMLElement
      expect(() => scrollToElement(null, target)).not.toThrow()
    })

    it('should not throw for null target', () => {
      const container = createMockElement()
      expect(() => scrollToElement(container, null)).not.toThrow()
    })
  })

  describe('captureScrollState', () => {
    it('should capture all scroll properties', () => {
      const element = createMockElement({
        scrollTop: 100,
        scrollHeight: 500,
        clientHeight: 300,
      })

      const state = captureScrollState(element)

      expect(state).toEqual({
        scrollTop: 100,
        scrollHeight: 500,
        clientHeight: 300,
        isAtBottom: false,
        hasOverflow: true,
      })
    })

    it('should detect when at bottom', () => {
      const element = createMockElement({
        scrollTop: 200,
        scrollHeight: 500,
        clientHeight: 300,
      })

      const state = captureScrollState(element)

      expect(state.isAtBottom).toBe(true)
    })

    it('should detect no overflow', () => {
      const element = createMockElement({
        scrollHeight: 200,
        clientHeight: 300,
      })

      const state = captureScrollState(element)

      expect(state.hasOverflow).toBe(false)
    })

    it('should return default state for null element', () => {
      const state = captureScrollState(null)

      expect(state).toEqual({
        scrollTop: 0,
        scrollHeight: 0,
        clientHeight: 0,
        isAtBottom: true,
        hasOverflow: false,
      })
    })
  })

  describe('didContentChange', () => {
    it('should return true when scrollHeight increased', () => {
      const prev: ScrollState = {
        scrollTop: 0,
        scrollHeight: 500,
        clientHeight: 300,
        isAtBottom: true,
        hasOverflow: true,
      }
      const current: ScrollState = {
        ...prev,
        scrollHeight: 600,
      }

      expect(didContentChange(prev, current)).toBe(true)
    })

    it('should return true when scrollHeight decreased', () => {
      const prev: ScrollState = {
        scrollTop: 0,
        scrollHeight: 500,
        clientHeight: 300,
        isAtBottom: true,
        hasOverflow: true,
      }
      const current: ScrollState = {
        ...prev,
        scrollHeight: 400,
      }

      expect(didContentChange(prev, current)).toBe(true)
    })

    it('should return false when scrollHeight unchanged', () => {
      const prev: ScrollState = {
        scrollTop: 0,
        scrollHeight: 500,
        clientHeight: 300,
        isAtBottom: true,
        hasOverflow: true,
      }
      const current: ScrollState = {
        ...prev,
        scrollTop: 100, // Different scroll position, same content
      }

      expect(didContentChange(prev, current)).toBe(false)
    })
  })
})
