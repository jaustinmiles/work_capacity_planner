import { vi, expect } from 'vitest'
import { waitFor } from '@testing-library/react'
import { appEvents } from '../shared/app-events'

/**
 * Mock event listeners registry
 */
const mockEventListeners = new Map<string, Set<Function>>()

/**
 * Initialize mock event system
 * Call this in beforeEach to set up event mocking
 */
export function initMockEvents(): void {
  mockEventListeners.clear()

  // Mock appEvents.on
  vi.spyOn(appEvents, 'on').mockImplementation((event: string, handler: Function) => {
    if (!mockEventListeners.has(event)) {
      mockEventListeners.set(event, new Set())
    }
    mockEventListeners.get(event)!.add(handler)

    // Return unsubscribe function
    return () => {
      mockEventListeners.get(event)?.delete(handler)
    }
  })

  // Mock appEvents.once
  vi.spyOn(appEvents, 'once').mockImplementation((event: string, handler: Function) => {
    const wrappedHandler = (...args: any[]) => {
      handler(...args)
      mockEventListeners.get(event)?.delete(wrappedHandler)
    }

    if (!mockEventListeners.has(event)) {
      mockEventListeners.set(event, new Set())
    }
    mockEventListeners.get(event)!.add(wrappedHandler)

    return () => {
      mockEventListeners.get(event)?.delete(wrappedHandler)
    }
  })

  // Mock appEvents.off
  vi.spyOn(appEvents, 'off').mockImplementation((event: string, handler: Function) => {
    mockEventListeners.get(event)?.delete(handler)
  })

  // Mock appEvents.emit
  vi.spyOn(appEvents, 'emit').mockImplementation((event: string, ...args: any[]) => {
    const listeners = mockEventListeners.get(event)
    if (listeners) {
      listeners.forEach(handler => {
        handler(...args)
      })
    }
  })

  // Mock appEvents.removeAllListeners
  vi.spyOn(appEvents, 'removeAllListeners').mockImplementation((event?: string) => {
    if (event) {
      mockEventListeners.delete(event)
    } else {
      mockEventListeners.clear()
    }
  })
}

/**
 * Clean up mock events
 * Call this in afterEach to clean up
 */
export function cleanupMockEvents(): void {
  mockEventListeners.clear()
  vi.restoreAllMocks()
}

/**
 * Fire a mock app event
 */
export function fireAppEvent(eventType: string, data?: any): void {
  const listeners = mockEventListeners.get(eventType)
  if (listeners) {
    listeners.forEach(handler => {
      handler(data)
    })
  }
}

/**
 * Wait for an event to be emitted
 * Useful for testing async operations that emit events
 */
export async function waitForEvent(
  eventType: string,
  options?: { timeout?: number },
): Promise<any> {
  const { timeout = 1000 } = options || {}

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      appEvents.off(eventType, handler)
      reject(new Error(`Event "${eventType}" not emitted within ${timeout}ms`))
    }, timeout)

    const handler = (data: any) => {
      clearTimeout(timer)
      resolve(data)
    }

    appEvents.once(eventType, handler)
  })
}

/**
 * Create a spy for a specific event
 * Returns a function that can be used to check if the event was emitted
 */
export function createEventSpy(eventType: string): {
  handler: ReturnType<typeof vi.fn>
  unsubscribe: () => void
} {
  const handler = vi.fn()

  if (!mockEventListeners.has(eventType)) {
    mockEventListeners.set(eventType, new Set())
  }
  mockEventListeners.get(eventType)!.add(handler)

  const unsubscribe = () => {
    mockEventListeners.get(eventType)?.delete(handler)
  }

  return { handler, unsubscribe }
}

/**
 * Assert that an event was emitted with specific data
 */
export async function expectEventEmitted(
  eventType: string,
  expectedData?: any,
  options?: { timeout?: number },
): Promise<void> {
  const { timeout = 100 } = options || {}

  const eventSpy = createEventSpy(eventType)

  await waitFor(
    () => {
      expect(eventSpy.handler).toHaveBeenCalled()
      if (expectedData !== undefined) {
        expect(eventSpy.handler).toHaveBeenCalledWith(expectedData)
      }
    },
    { timeout },
  )

  eventSpy.unsubscribe()
}

/**
 * Assert that an event was NOT emitted
 */
export async function expectEventNotEmitted(
  eventType: string,
  options?: { waitTime?: number },
): Promise<void> {
  const { waitTime = 100 } = options || {}

  const eventSpy = createEventSpy(eventType)

  // Wait a bit to make sure the event has time to be emitted if it was going to be
  await new Promise(resolve => setTimeout(resolve, waitTime))

  expect(eventSpy.handler).not.toHaveBeenCalled()

  eventSpy.unsubscribe()
}

/**
 * Get all listeners for a specific event (for debugging)
 */
export function getEventListeners(eventType: string): Function[] {
  return Array.from(mockEventListeners.get(eventType) || [])
}

/**
 * Get count of listeners for a specific event
 */
export function getEventListenerCount(eventType: string): number {
  return mockEventListeners.get(eventType)?.size || 0
}

/**
 * Common event types used in the application
 */
export const APP_EVENTS = {
  TIME_LOGGED: 'timeLogged',
  WORKFLOW_UPDATED: 'workflowUpdated',
  TASK_UPDATED: 'taskUpdated',
  SESSION_CHANGED: 'sessionChanged',
  DATA_REFRESH_NEEDED: 'dataRefresh',
  TIME_OVERRIDE_CHANGED: 'timeOverrideChanged',
  WORK_PATTERN_UPDATED: 'workPatternUpdated',
  SETTINGS_UPDATED: 'settingsUpdated',
} as const

/**
 * Helper to simulate a sequence of events
 * Useful for testing complex event-driven workflows
 */
export async function simulateEventSequence(
  events: Array<{ type: string; data?: any; delay?: number }>,
): Promise<void> {
  for (const event of events) {
    if (event.delay) {
      await new Promise(resolve => setTimeout(resolve, event.delay))
    }
    fireAppEvent(event.type, event.data)
  }
}

/**
 * Create a mock event emitter for testing
 * This can be used to replace appEvents entirely in tests
 */
export function createMockEventEmitter() {
  const listeners = new Map<string, Set<Function>>()

  return {
    on: vi.fn((event: string, handler: Function) => {
      if (!listeners.has(event)) {
        listeners.set(event, new Set())
      }
      listeners.get(event)!.add(handler)
      return () => listeners.get(event)?.delete(handler)
    }),

    once: vi.fn((event: string, handler: Function) => {
      const wrappedHandler = (...args: any[]) => {
        handler(...args)
        listeners.get(event)?.delete(wrappedHandler)
      }
      if (!listeners.has(event)) {
        listeners.set(event, new Set())
      }
      listeners.get(event)!.add(wrappedHandler)
      return () => listeners.get(event)?.delete(wrappedHandler)
    }),

    off: vi.fn((event: string, handler: Function) => {
      listeners.get(event)?.delete(handler)
    }),

    emit: vi.fn((event: string, ...args: any[]) => {
      const eventListeners = listeners.get(event)
      if (eventListeners) {
        eventListeners.forEach(handler => handler(...args))
      }
    }),

    removeAllListeners: vi.fn((event?: string) => {
      if (event) {
        listeners.delete(event)
      } else {
        listeners.clear()
      }
    }),

    // Test-specific helpers
    _getListeners: (event: string) => Array.from(listeners.get(event) || []),
    _getListenerCount: (event: string) => listeners.get(event)?.size || 0,
    _clearAllListeners: () => listeners.clear(),
  }
}
