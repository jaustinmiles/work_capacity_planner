/**
 * Resize Utilities
 *
 * Pure functions for resize calculations, extracted from useResizable hook
 * for testability and reuse.
 */

// =============================================================================
// Size Clamping
// =============================================================================

/**
 * Clamp a size value to be within min and max bounds.
 *
 * @param value - The value to clamp
 * @param min - Minimum allowed size
 * @param max - Maximum allowed size
 * @returns The clamped value
 */
export function clampSize(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

// =============================================================================
// Delta Calculation
// =============================================================================

/**
 * Handle position determines which edge the resize handle is on.
 * - 'start': Handle is at the start of the element (e.g., left edge of right sidebar)
 * - 'end': Handle is at the end of the element (e.g., right edge of left sidebar)
 */
export type HandlePosition = 'start' | 'end'

/**
 * Calculate the new size based on drag delta and handle position.
 *
 * For a right sidebar with handle on the left ('start'):
 * - Dragging left (negative delta) increases size
 * - Dragging right (positive delta) decreases size
 *
 * For a left sidebar with handle on the right ('end'):
 * - Dragging left (negative delta) decreases size
 * - Dragging right (positive delta) increases size
 *
 * @param startSize - The size when drag started
 * @param startPos - The cursor position when drag started
 * @param currentPos - The current cursor position
 * @param handlePosition - Which edge the handle is on
 * @returns The calculated new size (unclamped)
 */
export function calculateNewSize(
  startSize: number,
  startPos: number,
  currentPos: number,
  handlePosition: HandlePosition,
): number {
  const delta = currentPos - startPos

  if (handlePosition === 'start') {
    // For start position (e.g., left edge of right sidebar),
    // moving handle left (negative delta) increases size
    return startSize - delta
  } else {
    // For end position (e.g., right edge of left sidebar),
    // moving handle right (positive delta) increases size
    return startSize + delta
  }
}

/**
 * Calculate the new size with clamping applied.
 *
 * @param startSize - The size when drag started
 * @param startPos - The cursor position when drag started
 * @param currentPos - The current cursor position
 * @param handlePosition - Which edge the handle is on
 * @param minSize - Minimum allowed size
 * @param maxSize - Maximum allowed size
 * @returns The calculated new size, clamped to bounds
 */
export function calculateClampedSize(
  startSize: number,
  startPos: number,
  currentPos: number,
  handlePosition: HandlePosition,
  minSize: number,
  maxSize: number,
): number {
  const newSize = calculateNewSize(startSize, startPos, currentPos, handlePosition)
  return clampSize(newSize, minSize, maxSize)
}

// =============================================================================
// Storage Helpers
// =============================================================================

/**
 * Load a size value from localStorage with validation.
 *
 * @param storageKey - The localStorage key to read from
 * @param defaultSize - Default size to return if not found or invalid
 * @param minSize - Minimum valid size
 * @param maxSize - Maximum valid size
 * @returns The loaded size, clamped to bounds, or default if invalid
 */
export function loadSizeFromStorage(
  storageKey: string,
  defaultSize: number,
  minSize: number,
  maxSize: number,
): number {
  if (typeof window === 'undefined') {
    return defaultSize
  }

  try {
    const saved = window.localStorage.getItem(storageKey)
    if (saved === null) {
      return defaultSize
    }

    const parsed = parseInt(saved, 10)
    if (isNaN(parsed)) {
      return defaultSize
    }

    // Clamp to valid bounds
    return clampSize(parsed, minSize, maxSize)
  } catch {
    // localStorage might throw in some contexts (private browsing, etc.)
    return defaultSize
  }
}

/**
 * Save a size value to localStorage.
 *
 * @param storageKey - The localStorage key to write to
 * @param size - The size value to save
 * @returns true if saved successfully, false otherwise
 */
export function saveSizeToStorage(storageKey: string, size: number): boolean {
  if (typeof window === 'undefined') {
    return false
  }

  try {
    window.localStorage.setItem(storageKey, size.toString())
    return true
  } catch {
    // localStorage might throw in some contexts (quota exceeded, private browsing, etc.)
    return false
  }
}

// =============================================================================
// Cursor Utilities
// =============================================================================

/**
 * Resize direction for determining cursor style.
 */
export type ResizeDirection = 'horizontal' | 'vertical'

/**
 * Get the appropriate CSS cursor for a resize direction.
 *
 * @param direction - The resize direction
 * @returns The CSS cursor value
 */
export function getResizeCursor(direction: ResizeDirection): string {
  return direction === 'horizontal' ? 'col-resize' : 'row-resize'
}

/**
 * Get the client position from a mouse event based on direction.
 *
 * @param event - The mouse event
 * @param direction - The resize direction
 * @returns The X position for horizontal, Y position for vertical
 */
export function getClientPosition(
  event: { clientX: number; clientY: number },
  direction: ResizeDirection,
): number {
  return direction === 'horizontal' ? event.clientX : event.clientY
}

/**
 * Get the client position from a touch based on direction.
 *
 * @param touch - The touch object
 * @param direction - The resize direction
 * @returns The X position for horizontal, Y position for vertical
 */
export function getTouchPosition(
  touch: { clientX: number; clientY: number },
  direction: ResizeDirection,
): number {
  return direction === 'horizontal' ? touch.clientX : touch.clientY
}
