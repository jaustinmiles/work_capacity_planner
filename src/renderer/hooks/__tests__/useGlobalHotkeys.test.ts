import { describe, it, expect } from 'vitest'
import { matchesHotkey, formatHotkey, HotkeyConfig } from '../useGlobalHotkeys'

describe('useGlobalHotkeys', () => {
  describe('matchesHotkey', () => {
    // Helper to create mock keyboard events
    const createKeyEvent = (
      key: string,
      options: { ctrlKey?: boolean; shiftKey?: boolean; altKey?: boolean; metaKey?: boolean } = {}
    ): KeyboardEvent => {
      return new KeyboardEvent('keydown', {
        key,
        ctrlKey: options.ctrlKey ?? false,
        shiftKey: options.shiftKey ?? false,
        altKey: options.altKey ?? false,
        metaKey: options.metaKey ?? false,
      })
    }

    it('should match simple key press', () => {
      const config: HotkeyConfig = { key: 'a', handler: () => {} }
      const event = createKeyEvent('a')

      expect(matchesHotkey(event, config)).toBe(true)
    })

    it('should not match when key differs', () => {
      const config: HotkeyConfig = { key: 'a', handler: () => {} }
      const event = createKeyEvent('b')

      expect(matchesHotkey(event, config)).toBe(false)
    })

    it('should match case-insensitively', () => {
      const config: HotkeyConfig = { key: 'A', handler: () => {} }
      const event = createKeyEvent('a')

      expect(matchesHotkey(event, config)).toBe(true)
    })

    it('should match Ctrl+key combination', () => {
      const config: HotkeyConfig = { key: 's', ctrl: true, handler: () => {} }
      const event = createKeyEvent('s', { ctrlKey: true })

      expect(matchesHotkey(event, config)).toBe(true)
    })

    it('should not match when Ctrl is required but not pressed', () => {
      const config: HotkeyConfig = { key: 's', ctrl: true, handler: () => {} }
      const event = createKeyEvent('s')

      expect(matchesHotkey(event, config)).toBe(false)
    })

    it('should not match when Ctrl is pressed but not required', () => {
      const config: HotkeyConfig = { key: 's', handler: () => {} }
      const event = createKeyEvent('s', { ctrlKey: true })

      expect(matchesHotkey(event, config)).toBe(false)
    })

    it('should match Ctrl+Shift+key combination', () => {
      const config: HotkeyConfig = { key: 'r', ctrl: true, shift: true, handler: () => {} }
      const event = createKeyEvent('r', { ctrlKey: true, shiftKey: true })

      expect(matchesHotkey(event, config)).toBe(true)
    })

    it('should not match when only Ctrl is pressed for Ctrl+Shift combo', () => {
      const config: HotkeyConfig = { key: 'r', ctrl: true, shift: true, handler: () => {} }
      const event = createKeyEvent('r', { ctrlKey: true })

      expect(matchesHotkey(event, config)).toBe(false)
    })

    it('should match Alt+key combination', () => {
      const config: HotkeyConfig = { key: 'n', alt: true, handler: () => {} }
      const event = createKeyEvent('n', { altKey: true })

      expect(matchesHotkey(event, config)).toBe(true)
    })

    it('should match Meta key (Cmd on Mac) as Ctrl alternative', () => {
      const config: HotkeyConfig = { key: 's', ctrl: true, handler: () => {} }
      const event = createKeyEvent('s', { metaKey: true })

      expect(matchesHotkey(event, config)).toBe(true)
    })

    it('should respect disabled flag', () => {
      const config: HotkeyConfig = { key: 'a', handler: () => {}, disabled: true }
      const event = createKeyEvent('a')

      expect(matchesHotkey(event, config)).toBe(false)
    })

    it('should match special keys like Escape', () => {
      const config: HotkeyConfig = { key: 'Escape', handler: () => {} }
      const event = createKeyEvent('Escape')

      expect(matchesHotkey(event, config)).toBe(true)
    })

    it('should match Enter key', () => {
      const config: HotkeyConfig = { key: 'Enter', ctrl: true, handler: () => {} }
      const event = createKeyEvent('Enter', { ctrlKey: true })

      expect(matchesHotkey(event, config)).toBe(true)
    })
  })

  describe('formatHotkey', () => {
    it('should format simple key', () => {
      const config: HotkeyConfig = { key: 'a', handler: () => {} }
      expect(formatHotkey(config)).toBe('A')
    })

    it('should format Ctrl+key', () => {
      const config: HotkeyConfig = { key: 's', ctrl: true, handler: () => {} }
      expect(formatHotkey(config)).toBe('Ctrl+S')
    })

    it('should format Ctrl+Shift+key', () => {
      const config: HotkeyConfig = { key: 'r', ctrl: true, shift: true, handler: () => {} }
      expect(formatHotkey(config)).toBe('Ctrl+Shift+R')
    })

    it('should format Alt+key', () => {
      const config: HotkeyConfig = { key: 'n', alt: true, handler: () => {} }
      expect(formatHotkey(config)).toBe('Alt+N')
    })

    it('should format all modifiers', () => {
      const config: HotkeyConfig = { key: 'z', ctrl: true, alt: true, shift: true, meta: true, handler: () => {} }
      expect(formatHotkey(config)).toBe('Ctrl+Alt+Shift+Cmd+Z')
    })

    it('should format special keys correctly', () => {
      const config: HotkeyConfig = { key: 'Escape', handler: () => {} }
      expect(formatHotkey(config)).toBe('Escape')
    })

    it('should format Enter key', () => {
      const config: HotkeyConfig = { key: 'enter', ctrl: true, handler: () => {} }
      expect(formatHotkey(config)).toBe('Ctrl+Enter')
    })
  })
})
