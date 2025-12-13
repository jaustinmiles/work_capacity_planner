/**
 * Global Hotkeys Hook
 *
 * Provides a declarative way to register global keyboard shortcuts.
 * Hotkeys work anywhere in the app as long as the component using this hook is mounted.
 *
 * @example
 * useGlobalHotkeys([
 *   { key: 'r', ctrl: true, shift: true, handler: toggleRecording },
 *   { key: 's', ctrl: true, handler: saveDocument },
 * ])
 */

import { useEffect, useCallback, useRef } from 'react'

export interface HotkeyConfig {
  /** The key to listen for (case-insensitive, e.g., 'r', 'Enter', 'Escape') */
  key: string
  /** Require Ctrl/Cmd key */
  ctrl?: boolean
  /** Require Shift key */
  shift?: boolean
  /** Require Alt/Option key */
  alt?: boolean
  /** Require Meta key (Cmd on Mac, Win on Windows) */
  meta?: boolean
  /** Handler to call when hotkey is triggered */
  handler: () => void
  /** Optional description for debugging/documentation */
  description?: string
  /** Disable this hotkey temporarily */
  disabled?: boolean
}

/**
 * Check if a keyboard event matches a hotkey configuration
 */
export function matchesHotkey(event: KeyboardEvent, config: HotkeyConfig): boolean {
  if (config.disabled) return false

  // Check modifier keys
  const ctrlMatch = config.ctrl ? (event.ctrlKey || event.metaKey) : !(event.ctrlKey || event.metaKey)
  const shiftMatch = config.shift ? event.shiftKey : !event.shiftKey
  const altMatch = config.alt ? event.altKey : !event.altKey
  const metaMatch = config.meta ? event.metaKey : true // Meta is optional if ctrl is set

  // Check the key itself (case-insensitive)
  const keyMatch = event.key.toLowerCase() === config.key.toLowerCase()

  return keyMatch && ctrlMatch && shiftMatch && altMatch && metaMatch
}

/**
 * Hook for registering global keyboard shortcuts
 *
 * @param hotkeys Array of hotkey configurations to register
 */
export function useGlobalHotkeys(hotkeys: HotkeyConfig[]): void {
  // Use ref to always have latest hotkeys without re-adding listeners
  const hotkeysRef = useRef(hotkeys)
  hotkeysRef.current = hotkeys

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    // Don't trigger hotkeys when typing in input fields
    const target = event.target as HTMLElement
    const isInputField =
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.isContentEditable

    // Allow some hotkeys even in input fields (configurable in future)
    // For now, skip hotkey handling in input fields
    if (isInputField) return

    for (const hotkey of hotkeysRef.current) {
      if (matchesHotkey(event, hotkey)) {
        event.preventDefault()
        event.stopPropagation()
        hotkey.handler()
        return // Only trigger one hotkey per keypress
      }
    }
  }, [])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])
}

/**
 * Format a hotkey for display (e.g., "Ctrl+Shift+R")
 */
export function formatHotkey(config: HotkeyConfig): string {
  const parts: string[] = []

  if (config.ctrl) parts.push('Ctrl')
  if (config.alt) parts.push('Alt')
  if (config.shift) parts.push('Shift')
  if (config.meta) parts.push('Cmd')

  // Capitalize the key for display
  const displayKey = config.key.length === 1
    ? config.key.toUpperCase()
    : config.key.charAt(0).toUpperCase() + config.key.slice(1)

  parts.push(displayKey)

  return parts.join('+')
}
