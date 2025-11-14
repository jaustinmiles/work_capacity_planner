import { vi } from 'vitest'

/**
 * Event utilities stub - events have been removed from the system
 * This file exists only to prevent import errors in legacy tests
 * All functions are no-ops since the event system no longer exists
 */

export function initMockEvents(): void {
  // No-op - events have been removed
}

export function cleanupMockEvents(): void {
  // No-op - events have been removed
}

export function fireAppEvent(_eventType: string, _data?: any): void {
  // No-op - events have been removed
}

export async function waitForEvent(
  _eventType: string,
  _options?: { timeout?: number },
): Promise<any> {
  // No-op - events have been removed
  return Promise.resolve()
}

export function createEventSpy(_eventType: string): {
  handler: ReturnType<typeof vi.fn>
  unsubscribe: () => void
} {
  return {
    handler: vi.fn(),
    unsubscribe: () => {},
  }
}

export async function expectEventEmitted(
  _eventType: string,
  _expectedData?: any,
  _options?: { timeout?: number },
): Promise<void> {
  // No-op - events have been removed
}

export async function expectEventNotEmitted(
  _eventType: string,
  _options?: { waitTime?: number },
): Promise<void> {
  // No-op - events have been removed
}

export function getEventListeners(_eventType: string): Function[] {
  return []
}

export function getEventListenerCount(_eventType: string): number {
  return 0
}

// Legacy export for compatibility
export const APP_EVENTS = {
  TIME_LOGGED: 'timeLogged',
  DATA_REFRESH_NEEDED: 'dataRefresh',
  SESSION_CHANGED: 'sessionChanged',
  TIME_OVERRIDE_CHANGED: 'timeOverrideChanged',
  WORKFLOW_STATE_CHANGED: 'workflowStateChanged',
  WORKFLOW_PAUSED: 'workflowPaused',
  WORKFLOW_RESET: 'workflowReset',
}

export async function simulateEventSequence(
  _events: Array<{ type: string; data?: any; delay?: number }>,
): Promise<void> {
  // No-op - events have been removed
}

export function createMockEventEmitter() {
  return {
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
    _getListeners: (_event: string) => [],
    _getListenerCount: (_event: string) => 0,
    _clearAllListeners: () => {},
  }
}
