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

    // Create a key for duplicate suppression
    const key = `${entry.context.scope}:${entry.context.component}:${entry.message}`
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
      for (const [k, time] of this.lastLogTime.entries()) {
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
