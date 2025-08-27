/**
 * JSON structured logging with automatic context injection
 */

import { LogEntry, LogContext, LogLevel } from '../types'

// Check if we're in a browser environment
const isBrowser = typeof window !== 'undefined' && typeof window.document !== 'undefined'

export class StructuredLogger {
  private processType: 'main' | 'renderer' | 'preload'
  private globalContext: Record<string, any> = {}

  constructor(processType: 'main' | 'renderer' | 'preload') {
    this.processType = processType
  }

  /**
   * Format a log entry with full context
   */
  format(
    level: LogLevel,
    message: string,
    data?: Record<string, any>,
    error?: Error,
  ): LogEntry {
    const context = this.buildContext()

    const entry: LogEntry = {
      level,
      message,
      data: this.sanitizeData(data),
      context,
    }

    if (error) {
      entry.error = {
        message: error.message,
        stack: error.stack,
        code: (error as any).code,
      }
    }

    return entry
  }

  /**
   * Build context object with all metadata
   */
  private buildContext(): LogContext {
    const timestamp = new Date().toISOString()
    const source = this.extractSource()

    const context: LogContext = {
      processType: this.processType,
      timestamp,
      ...this.globalContext,
    }

    // Add source information if available
    if (source) {
      context.source = source
    }

    // Add performance metrics (only in Node.js environment)
    if (this.processType === 'main' && typeof process !== 'undefined' && process.memoryUsage) {
      context.performance = {
        memory: process.memoryUsage(),
        cpu: process.cpuUsage().user / 1000000, // Convert to seconds
      }
    }

    return context
  }

  /**
   * Extract source file and line number from stack trace
   */
  private extractSource(): LogContext['source'] | undefined {
    // Skip source extraction in browser environments to avoid issues
    if (isBrowser) {
      return undefined
    }

    try {
      const stack = new Error().stack
      if (!stack) return undefined

      // Skip first 4 lines (Error message + 3 logger internal calls)
      const lines = stack.split('\n').slice(4)

      for (const line of lines) {
        // Match file paths in stack trace
        const match = line.match(/at\s+(?:.*?\s+)?\(?(.+):(\d+):(\d+)\)?/)
        if (match) {
          const [, filePath, lineNumber] = match

          // Skip node_modules and internal files
          if (!filePath.includes('node_modules') &&
              !filePath.includes('electron') &&
              !filePath.includes('logging/')) {

            // Extract function name if available
            const funcMatch = line.match(/at\s+([^\s(]+)/)

            // Extract filename without path module (browser-safe)
            const fileName = filePath.split('/').pop() || filePath.split('\\').pop() || filePath

            return {
              file: fileName,
              line: parseInt(lineNumber, 10),
              function: funcMatch?.[1],
            }
          }
        }
      }
    } catch (_error) {
      // Silently fail in case of any issues
      return undefined
    }

    return undefined
  }

  /**
   * Sanitize sensitive data from logs
   */
  private sanitizeData(data?: Record<string, any>): Record<string, any> | undefined {
    if (!data) return undefined

    const sanitized = { ...data }
    const sensitiveKeys = ['password', 'token', 'secret', 'key', 'authorization']

    const sanitizeObject = (obj: any): any => {
      if (typeof obj !== 'object' || obj === null) return obj

      const result: any = Array.isArray(obj) ? [] : {}

      for (const key in obj) {
        const lowerKey = key.toLowerCase()
        if (sensitiveKeys.some(sensitive => lowerKey.includes(sensitive))) {
          result[key] = '[REDACTED]'
        } else if (typeof obj[key] === 'object') {
          result[key] = sanitizeObject(obj[key])
        } else {
          result[key] = obj[key]
        }
      }

      return result
    }

    return sanitizeObject(sanitized)
  }

  /**
   * Set global context that will be included in all logs
   */
  setGlobalContext(context: Record<string, any>): void {
    this.globalContext = { ...this.globalContext, ...context }
  }

  /**
   * Clear global context
   */
  clearGlobalContext(): void {
    this.globalContext = {}
  }

  /**
   * Format log entry as JSON string
   */
  toJSON(entry: LogEntry): string {
    const isDev = typeof process !== 'undefined' && process.env?.NODE_ENV === 'development'
    return JSON.stringify(entry, null, isDev ? 2 : 0)
  }

  /**
   * Format log entry for console output
   */
  toConsole(entry: LogEntry): string {
    const levelColors: Record<LogLevel, string> = {
      [LogLevel.ERROR]: '\x1b[31m', // Red
      [LogLevel.WARN]: '\x1b[33m',  // Yellow
      [LogLevel.INFO]: '\x1b[36m',  // Cyan
      [LogLevel.DEBUG]: '\x1b[90m', // Gray
      [LogLevel.TRACE]: '\x1b[37m', // White
    }

    const levelNames: Record<LogLevel, string> = {
      [LogLevel.ERROR]: 'ERROR',
      [LogLevel.WARN]: 'WARN ',
      [LogLevel.INFO]: 'INFO ',
      [LogLevel.DEBUG]: 'DEBUG',
      [LogLevel.TRACE]: 'TRACE',
    }

    const color = levelColors[entry.level]
    const reset = '\x1b[0m'
    const levelName = levelNames[entry.level]

    let output = `${color}[${levelName}]${reset} ${entry.context.timestamp} `

    if (entry.context.source) {
      output += `[${entry.context.source.file}:${entry.context.source.line}] `
    }

    output += entry.message

    if (entry.data && Object.keys(entry.data).length > 0) {
      output += ' ' + JSON.stringify(entry.data)
    }

    if (entry.error) {
      output += `\n  Error: ${entry.error.message}`
      if (entry.error.stack) {
        output += `\n  ${entry.error.stack.split('\n').join('\n  ')}`
      }
    }

    return output
  }
}
