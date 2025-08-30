// Simple event emitter for cross-component communication
type EventCallback = (...__args: any[]) => void

class EventEmitter {
  private events: Map<string, EventCallback[]> = new Map()

  on(event: string, callback: EventCallback): void {
    if (!this.events.has(event)) {
      this.events.set(event, [])
    }
    this.events.get(event)!.push(callback)
  }

  off(event: string, callback: EventCallback): void {
    const callbacks = this.events.get(event)
    if (callbacks) {
      const index = callbacks.indexOf(callback)
      if (index > -1) {
        callbacks.splice(index, 1)
      }
    }
  }

  emit(event: string, ...args: any[]): void {
    const callbacks = this.events.get(event)
    if (callbacks) {
      callbacks.forEach(callback => callback(...args))
    }
  }
}

export const appEvents = new EventEmitter()

// Event names
export const EVENTS = {
  TIME_LOGGED: 'time-logged',
  TASK_UPDATED: 'task-updated',
  WORKFLOW_UPDATED: 'workflow-updated',
  SESSION_CHANGED: 'session-changed',
  DATA_REFRESH_NEEDED: 'data-refresh-needed',
  TIME_OVERRIDE_CHANGED: 'time-override-changed',
} as const
