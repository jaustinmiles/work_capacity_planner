/**
 * Platform Detection Utilities
 *
 * Provides runtime detection of the execution environment (Electron vs Web).
 * Used to conditionally enable/disable features based on platform capabilities.
 */

/**
 * Check if running in Electron environment.
 * Returns true if window.electronAPI is available (set by preload script).
 */
export function isElectron(): boolean {
  return typeof window !== 'undefined' && typeof window.electronAPI !== 'undefined'
}

/**
 * Check if running in web browser (not Electron).
 * Returns true if this is a standalone web client.
 */
export function isWeb(): boolean {
  return !isElectron()
}

/**
 * Check if running on iOS (iPad/iPhone Safari).
 * Useful for touch-specific optimizations.
 */
export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !('MSStream' in window)
}

/**
 * Check if running on iPad specifically.
 * Modern iPads report as 'Macintosh' so we also check for touch support.
 */
export function isIPad(): boolean {
  if (typeof navigator === 'undefined') return false
  // Modern iPads report as Macintosh but have touch support
  const isMacWithTouch =
    navigator.platform === 'MacIntel' &&
    typeof navigator.maxTouchPoints === 'number' &&
    navigator.maxTouchPoints > 1
  // Legacy check
  const isLegacyIPad = /iPad/.test(navigator.userAgent)
  return isMacWithTouch || isLegacyIPad
}

/**
 * Check if the device has touch support.
 */
export function hasTouchSupport(): boolean {
  if (typeof window === 'undefined') return false
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0
}

/**
 * Check if MediaRecorder is available for audio recording.
 * Required for voice features.
 */
export function hasMediaRecorderSupport(): boolean {
  return typeof MediaRecorder !== 'undefined'
}

/**
 * Get the current platform as a descriptive string.
 * Useful for logging and debugging.
 */
export function getPlatformDescription(): string {
  if (isElectron()) {
    return 'Electron Desktop'
  }
  if (isIPad()) {
    return 'iPad Safari'
  }
  if (isIOS()) {
    return 'iOS Safari'
  }
  if (hasTouchSupport()) {
    return 'Web (Touch)'
  }
  return 'Web (Desktop)'
}
