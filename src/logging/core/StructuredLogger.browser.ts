/**
 * Browser-safe JSON structured logging
 */

import { LogEntry, LogContext, LogLevel } from '../types'

export class StructuredLogger {
  private processType: 'main' | 'renderer' | 'preload'
  private globalContext: Record<string, any> = {}

  constructor(processType: 'main' | 'renderer' | 'preload' = 'renderer') {
    this.processType = processType
  }

  /**
   * Set global context that applies to all logs
   */
  setGlobalContext(context: Record<string, any>): void {
    this.globalContext = { ...this.globalContext, ...context }
  }

  /**
   * Create structured log context
   */
  createContext(entry: Partial<LogEntry>): LogContext {
    const context: LogContext = {
      timestamp: new Date().toISOString(),
      processType: this.processType,
      sessionId: this.globalContext.sessionId,
      userId: this.globalContext.userId,
      ...this.globalContext,
      ...entry.context,
    }

    // Browser-safe source extraction
    const source = this.extractSource()
    if (source) {
      context.source = source
    }

    return context
  }

  /**
   * Extract source file and line number from stack trace (browser-safe)
   */
  private extractSource(): { file: string; line: number; function?: string } | null {
    try {
      const stack = new Error().stack
      if (!stack) return null

      const lines = stack.split('\n')
      // Skip first 4 lines (Error, extractSource, createContext, log method)
      for (let i = 4; i < lines.length; i++) {
        const line = lines[i]
        if (line.includes('at ')) {
          // Try to extract file path and line number
          const match = line.match(/at\s+(?:(.+?)\s+\()?(.+?):(\d+):(\d+)/)
          if (match) {
            const funcName = match[1]
            const filePath = match[2]
            const lineNumber = match[3]

            // Skip internal logging files
            if (filePath.includes('node_modules') ||
                filePath.includes('logging/') ||
                filePath.includes('electron')) {
              continue
            }

            // Extract filename safely
            const fileName = filePath.split('/').pop() || filePath.split('\\').pop() || filePath

            return {
              file: fileName,
              line: parseInt(lineNumber, 10),
              function: funcName,
            }
          }
        }
      }
    } catch (_error) {
      // Silently fail - source extraction is optional
    }

    return null
  }

  /**
   * Sanitize sensitive data from logs
   */
  sanitize(data: any): any {
    if (!data) return data

    if (typeof data === 'string') {
      // Redact potential secrets
      return data.replace(/(?:password|token|secret|key|api[_-]?key)[\s=:]+["']?[\w-]+/gi, '[REDACTED]')
    }

    if (typeof data === 'object') {
      const sanitized: any = Array.isArray(data) ? [] : {}

      for (const key in data) {
        if (key.toLowerCase().includes('password') ||
            key.toLowerCase().includes('token') ||
            key.toLowerCase().includes('secret') ||
            key.toLowerCase().includes('apikey') ||
            key.toLowerCase().includes('api_key')) {
          sanitized[key] = '[REDACTED]'
        } else if (data[key] && typeof data[key] === 'object') {
          sanitized[key] = this.sanitize(data[key])
        } else if (typeof data[key] === 'string') {
          sanitized[key] = this.sanitize(data[key])
        } else {
          sanitized[key] = data[key]
        }
      }

      return sanitized
    }

    return data
  }

  /**
   * Format log entry as structured object
   */
  structure(entry: LogEntry): LogEntry {
    return {
      ...entry,
      context: this.createContext(entry),
      data: this.sanitize(entry.data),
    }
  }

  /**
   * Format log entry as JSON string
   */
  toJSON(entry: LogEntry): string {
    return JSON.stringify(entry, null, 0)
  }

  /**
   * Format log entry for console output
   */
  toConsole(entry: LogEntry): string {
    const levelColors = {
      [LogLevel.ERROR]: '\x1b[31m', // Red
      [LogLevel.WARN]: '\x1b[33m',  // Yellow
      [LogLevel.INFO]: '\x1b[36m',  // Cyan
      [LogLevel.DEBUG]: '\x1b[90m', // Gray
      [LogLevel.TRACE]: '\x1b[90m', // Gray
    }

    const reset = '\x1b[0m'
    const color = levelColors[entry.level]
    const levelName = LogLevel[entry.level].padEnd(5)

    let output = `${color}[${levelName}]${reset} ${entry.context.timestamp} `

    if (entry.context.source) {
      output += `[${entry.context.source.file}:${entry.context.source.line}] `
    }

    output += `${entry.message}`

    if (entry.data && Object.keys(entry.data).length > 0) {
      output += ` ${JSON.stringify(entry.data)}`
    }

    if (entry.error) {
      output += `\n  ${entry.error}`
    }

    return output
  }
}
