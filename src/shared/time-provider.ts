/**
 * Global time provider for the application
 * Allows overriding current time for development/testing
 */

import { logger } from './logger'

// Import events if in renderer process
let appEvents: any
let EVENTS: any
if (typeof window !== 'undefined') {
  try {
    const eventsModule = require('../renderer/utils/events')
    appEvents = eventsModule.appEvents
    EVENTS = eventsModule.EVENTS
  } catch (_e) {
    // Not in renderer process or events not available
  }
}

class TimeProvider {
  private static instance: TimeProvider
  private overrideTime: Date | null = null
  private listeners: Set<(time: Date) => void> = new Set()

  private constructor() {
    // Check for dev time override in localStorage on initialization
    if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
      // eslint-disable-next-line no-undef
      const savedOverride = localStorage.getItem('dev-time-override')
      if (savedOverride) {
        try {
          this.overrideTime = new Date(savedOverride)
          logger.info(`Time override loaded from localStorage: ${this.overrideTime.toISOString()}`)
        } catch (_e) {
          logger.error('Failed to parse saved time override', { error: _e })
          if (typeof localStorage !== 'undefined') {
            // eslint-disable-next-line no-undef
            localStorage.removeItem('dev-time-override')
          }
        }
      }
    }
  }

  static getInstance(): TimeProvider {
    if (!TimeProvider.instance) {
      TimeProvider.instance = new TimeProvider()
    }
    return TimeProvider.instance
  }

  /**
   * Get the current time (real or overridden)
   */
  now(): Date {
    if (this.overrideTime) {
      const overriddenTime = new Date(this.overrideTime)
      logger.info(`⏰ [TimeProvider] Using OVERRIDE time: ${overriddenTime.toISOString()} (${overriddenTime.toLocaleString()})`)
      return overriddenTime
    }
    const realTime = new Date()
    logger.debug(`⏰ [TimeProvider] Using REAL time: ${realTime.toISOString()}`)
    return realTime
  }

  /**
   * Get current timestamp in milliseconds
   */
  nowMs(): number {
    return this.now().getTime()
  }

  /**
   * Set a time override (dev mode only)
   */
  setOverride(date: Date | string | null): void {
    if (date === null) {
      this.overrideTime = null
      if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
        // eslint-disable-next-line no-undef
        localStorage.removeItem('dev-time-override')
      }
      logger.info('Time override cleared')
    } else {
      this.overrideTime = typeof date === 'string' ? new Date(date) : new Date(date)
      if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
        // eslint-disable-next-line no-undef
        localStorage.setItem('dev-time-override', this.overrideTime.toISOString())
      }
      logger.info(`Time override set to: ${this.overrideTime.toISOString()}`)
    }

    // Notify all listeners
    this.notifyListeners()
    // Emit event for UI refresh
    if (appEvents && EVENTS) {
      appEvents.emit(EVENTS.TIME_OVERRIDE_CHANGED, this.overrideTime)
    }
  }

  /**
   * Check if time is currently overridden
   */
  isOverridden(): boolean {
    return this.overrideTime !== null
  }

  /**
   * Get the override time if set
   */
  getOverride(): Date | null {
    return this.overrideTime ? new Date(this.overrideTime) : null
  }

  /**
   * Subscribe to time changes
   */
  subscribe(listener: (time: Date) => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  /**
   * Notify all listeners of time change
   */
  private notifyListeners(): void {
    const currentTime = this.now()
    this.listeners.forEach(listener => {
      try {
        listener(currentTime)
      } catch (e) {
        logger.error('Error in time change listener', { error: e })
      }
    })
  }

  /**
   * Advance override time by minutes (useful for testing)
   */
  advanceBy(minutes: number): void {
    if (!this.overrideTime) {
      logger.warn('Cannot advance time - no override is set')
      return
    }

    const newTime = new Date(this.overrideTime.getTime() + minutes * 60 * 1000)
    this.setOverride(newTime)
  }

  /**
   * Set override to a specific time today
   */
  setTimeToday(hours: number, minutes: number = 0): void {
    const now = new Date()
    now.setHours(hours, minutes, 0, 0)
    this.setOverride(now)
  }
}

// Export singleton instance
export const timeProvider = TimeProvider.getInstance()

// Convenience exports
export const getCurrentTime = () => timeProvider.now()
export const getCurrentTimeMs = () => timeProvider.nowMs()
export const setTimeOverride = (date: Date | string | null) => timeProvider.setOverride(date)
export const isTimeOverridden = () => timeProvider.isOverridden()
export const subscribeToTimeChanges = (listener: (time: Date) => void) => timeProvider.subscribe(listener)

// Make it available globally for console access
if (typeof window !== 'undefined') {
  const win = window as any
  win.timeProvider = timeProvider
  win.setTime = (hours: number, minutes?: number) => {
    timeProvider.setTimeToday(hours, minutes || 0)
  }
  win.advanceTime = (minutes: number) => {
    timeProvider.advanceBy(minutes)
  }
  win.clearTime = () => {
    timeProvider.setOverride(null)
  }

  // Use console.info instead of logger at module level to avoid initialization issues
  console.info('Time provider dev tools available:')
  console.info('  window.setTime(hours, minutes) - Set time to specific time today')
  console.info('  window.advanceTime(minutes) - Advance current override by minutes')
  console.info('  window.clearTime() - Clear override and use real time')
  console.info('  window.timeProvider - Access full time provider')
}
