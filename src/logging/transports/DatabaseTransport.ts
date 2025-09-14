import { LogEntry } from '../types'

interface LogTransport {
  name?: string
  log(entry: LogEntry): Promise<void>
  flush?(): Promise<void>
  destroy?(): void
}

/**
 * Database transport for persisting logs to SQLite in development mode
 * Uses batching for performance
 */
export class DatabaseTransport implements LogTransport {
  name = 'DatabaseTransport'
  private batchSize = 10
  private flushInterval = 1000 // milliseconds
  private logBuffer: Array<{
    level: string
    message: string
    source: string
    context: any
  }> = []
  private flushTimer: NodeJS.Timeout | null = null
  private isProduction = process.env.NODE_ENV === 'production'

  constructor() {
    // Only activate when not in production
    if (this.isProduction) {
      console.log('[DatabaseTransport] Skipping - in production mode')
      return
    }

    console.log('[DatabaseTransport] Initializing for dev/test mode')
    // Set up periodic flush
    this.startPeriodicFlush()
  }

  private startPeriodicFlush() {
    this.flushTimer = setInterval(() => {
      if (this.logBuffer.length > 0) {
        this.flush()
      }
    }, this.flushInterval)
  }

  // The Logger expects a 'write' method, not 'log'
  async write(entries: LogEntry[]): Promise<void> {
    for (const entry of entries) {
      await this.log(entry)
    }
  }

  async log(entry: LogEntry): Promise<void> {
    // Skip if in production
    if (this.isProduction) {
      return
    }

    // Skip certain noisy log patterns
    if (this.shouldSkip(entry)) {
      return
    }

    // Add to buffer
    this.logBuffer.push({
      level: typeof entry.level === 'string' ? entry.level : String(entry.level),
      message: entry.message,
      source: typeof entry.context?.source === 'string' ? entry.context.source : 'renderer',
      context: entry.context,
    })

    // Flush if buffer is full
    if (this.logBuffer.length >= this.batchSize) {
      await this.flush()
    }
  }

  private shouldSkip(entry: LogEntry): boolean {
    // Skip very frequent/noisy logs that would flood the database
    const skipPatterns = [
      /Mouse event at/,
      /Hover state changed/,
      /Tooltip shown/,
      /Scroll position/,
    ]

    return skipPatterns.some(pattern => pattern.test(entry.message))
  }

  async flush(): Promise<void> {
    if (this.logBuffer.length === 0) {
      return
    }

    const logsToFlush = [...this.logBuffer]
    this.logBuffer = []

    try {
      // In renderer process, use IPC to persist
      if (typeof window !== 'undefined' && window.electronAPI?.persistLogs) {
        await window.electronAPI.persistLogs(logsToFlush)
      }
      // In main process, could directly use database (but we don't log from main currently)
    } catch (error) {
      console.error('[DatabaseTransport] Failed to persist logs:', error)
      // Don't re-add to buffer to avoid infinite loop
    }
  }

  async flush_sync(): Promise<void> {
    await this.flush()
  }

  destroy(): void {
    // Flush any remaining logs
    this.flush()

    // Clear the timer
    if (this.flushTimer) {
      clearInterval(this.flushTimer)
      this.flushTimer = null
    }
  }
}