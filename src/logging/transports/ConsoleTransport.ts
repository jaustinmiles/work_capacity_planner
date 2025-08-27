/**
 * Console transport for development logging
 */

import { LogEntry, LogLevel } from '../types'
import { StructuredLogger } from '../core/StructuredLogger'

export class ConsoleTransport {
  private enabled: boolean
  private minLevel: LogLevel
  private structuredLogger: StructuredLogger

  constructor(options: { enabled?: boolean; minLevel?: LogLevel } = {}) {
    this.enabled = options.enabled ?? true
    this.minLevel = options.minLevel ?? LogLevel.TRACE
    // Detect environment properly
    const processType = typeof window !== 'undefined' ? 'renderer' : 'main'
    this.structuredLogger = new StructuredLogger(processType as any)
  }

  write(entries: LogEntry[]): void {
    if (!this.enabled) return

    for (const entry of entries) {
      if (entry.level <= this.minLevel) {
        const formatted = this.structuredLogger.toConsole(entry)

        switch (entry.level) {
          case LogLevel.ERROR:
            console.error(formatted)
            break
          case LogLevel.WARN:
            console.warn(formatted)
            break
          default:
            console.log(formatted)
        }
      }
    }
  }

  close(): void {
    // Nothing to close for console
  }
}
