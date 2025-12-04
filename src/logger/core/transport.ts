/**
 * Base transport class for log output destinations
 */

import { LogEntry } from '../types'

export abstract class Transport {
  protected enabled: boolean = true

  constructor(protected name: string) {}

  abstract write(entry: LogEntry): void

  enable(): void {
    this.enabled = true
  }

  disable(): void {
    this.enabled = false
  }

  isEnabled(): boolean {
    return this.enabled
  }

  getName(): string {
    return this.name
  }

  /**
   * Clean up resources and disable the transport
   */
  destroy(): void {
    this.disable()
  }
}

/**
 * Console transport for browser/Node console output
 */
export class ConsoleTransport extends Transport {
  private lastLogTime: Map<string, number> = new Map()
  private suppressDuplicateMs: number = 50

  constructor() {
    super('console')
  }

  write(entry: LogEntry): void {
    if (!this.enabled) return

    // Create a key for duplicate suppression (trim long messages to 100 chars)
    const trimmedMessage = entry.message.length > 100
      ? entry.message.substring(0, 100) + '...'
      : entry.message
    const key = `${entry.context.scope}:${entry.context.component}:${trimmedMessage}`
    const now = Date.now()
    const lastTime = this.lastLogTime.get(key)

    // Suppress rapid duplicates (within 50ms)
    if (lastTime && (now - lastTime) < this.suppressDuplicateMs) {
      return
    }

    this.lastLogTime.set(key, now)

    // Clean old entries to prevent memory leak
    if (this.lastLogTime.size > 1000) {
      const cutoff = now - 10000 // 10 seconds
      const entries = Array.from(this.lastLogTime.entries())
      for (const [k, time] of entries) {
        if (time < cutoff) {
          this.lastLogTime.delete(k)
        }
      }
    }

    // Format the output
    const prefix = this.getPrefix(entry)
    const style = this.getStyle(entry)
    const args: any[] = [`%c${prefix}`, style, entry.message]

    // Add data if present
    if (entry.data && Object.keys(entry.data).length > 0) {
      args.push(entry.data)
    }

    // Add stack if present
    if (entry.stack) {
      args.push('\nStack:', entry.stack)
    }

    // Log based on level
    switch (entry.level) {
      case 0: // ERROR
        console.error(...args)
        break
      case 1: // WARN
        console.warn(...args)
        break
      case 2: // INFO
        console.info(...args)
        break
      case 3: // DEBUG
        console.debug(...args)
        break
      case 4: // TRACE
        console.log(...args) // Use log for trace since console.trace shows stack
        break
    }
  }

  private getPrefix(entry: LogEntry): string {
    const time = entry.timestamp.toISOString().split('T')[1]?.slice(0, -1) || ''
    const level = ['ERROR', 'WARN', 'INFO', 'DEBUG', 'TRACE'][entry.level]
    const { scope, component, tag } = entry.context

    let prefix = `[${time}] [${level}] [${scope}]`

    if (component !== 'Unknown') {
      prefix += ` [${component}]`
    }

    if (tag) {
      prefix += ` [${tag}]`
    }

    if (entry.aggregateCount && entry.aggregateCount > 1) {
      prefix += ` (×${entry.aggregateCount})`
    }

    return prefix
  }

  private getStyle(entry: LogEntry): string {
    const colors = {
      0: 'color: #ff4444; font-weight: bold', // ERROR - red
      1: 'color: #ff9944; font-weight: bold', // WARN - orange
      2: 'color: #4444ff',                     // INFO - blue
      3: 'color: #888888',                     // DEBUG - gray
      4: 'color: #aaaaaa',                      // TRACE - light gray
    }

    return colors[entry.level] || 'color: #000000'
  }
}

/**
 * Database Transport - persists logs to the database via IPC
 * Only works in renderer process where window.electronAPI is available
 */
export class DatabaseTransport extends Transport {
  private batchQueue: LogEntry[] = []
  private batchTimeout: ReturnType<typeof setTimeout> | null = null
  private readonly batchSize = 10
  private readonly batchDelayMs = 2000

  constructor() {
    super('database')
  }

  write(entry: LogEntry): void {
    if (!this.enabled) return

    // Only persist in renderer where window.electronAPI is available
    if (typeof window === 'undefined' || !(window as any).electronAPI?.persistLogs) return

    // Add to batch queue
    this.batchQueue.push(entry)

    // Flush immediately if batch is full
    if (this.batchQueue.length >= this.batchSize) {
      void this.flush()
    } else if (!this.batchTimeout) {
      // Otherwise set a timeout to flush
      this.batchTimeout = setTimeout(() => void this.flush(), this.batchDelayMs)
    }
  }

  private async flush(): Promise<void> {
    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout)
      this.batchTimeout = null
    }

    if (this.batchQueue.length === 0) return

    const logs = this.batchQueue.map(entry => ({
      level: ['ERROR', 'WARN', 'INFO', 'DEBUG', 'TRACE'][entry.level] || 'INFO',
      message: entry.message,
      source: 'renderer',
      context: {
        scope: entry.context.scope,
        component: entry.context.component,
        tag: entry.context.tag,
        data: entry.data,
      },
    }))

    this.batchQueue = []

    // Persist asynchronously - don't block logging
    try {
      await (window as any).electronAPI?.persistLogs?.(logs)
    } catch {
      // Silently ignore persistence errors to avoid log loops
    }
  }

  destroy(): void {
    void this.flush()
    super.destroy()
  }
}

/**
 * Electron Transport - forwards logs to the renderer process
 */
export class ElectronTransport extends Transport {
  private window: any // BrowserWindow type from electron

  constructor(window?: any) {
    super('electron')
    this.window = window
  }

  setWindow(window: any): void {
    this.window = window
  }

  write(entry: LogEntry): void {
    // Check if transport is enabled and window exists and is not destroyed
    if (!this.enabled || !this.window || this.window.isDestroyed?.()) return

    try {
      // Send simplified log data to renderer
      this.window.webContents.send('log:from-main', {
        level: entry.level,
        message: entry.message,
        scope: entry.context.scope,
        component: entry.context.component,
        tag: entry.context.tag,
        data: entry.data,
        timestamp: entry.timestamp.toISOString(),
      })
    } catch (error) {
      // Log to console if window communication fails
      // This happens when window is destroyed or IPC is unavailable
      console.debug('[ElectronTransport] Failed to send log to renderer:', error)
    }
  }
}
