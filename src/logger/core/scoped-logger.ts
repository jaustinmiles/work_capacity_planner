/**
 * Scoped logger implementation - handles logging for a specific scope
 */

import { LogLevel, LogScope, LogEntry, IScopedLogger } from '../types'
import { ContextExtractor } from '../context-extractor'

export class ScopedLogger implements IScopedLogger {
  constructor(
    private scope: LogScope,
    private onLog: (entry: LogEntry) => void,
  ) {}

  error(message: string, data?: any, tag?: string): void {
    this.log(LogLevel.ERROR, message, data, tag)
  }

  warn(message: string, data?: any, tag?: string): void {
    this.log(LogLevel.WARN, message, data, tag)
  }

  info(message: string, data?: any, tag?: string): void {
    this.log(LogLevel.INFO, message, data, tag)
  }

  debug(message: string, data?: any, tag?: string): void {
    this.log(LogLevel.DEBUG, message, data, tag)
  }

  trace(message: string, data?: any, tag?: string): void {
    this.log(LogLevel.TRACE, message, data, tag)
  }

  private log(level: LogLevel, message: string, data?: any, tag?: string): void {
    // Extract context from call stack
    const context = ContextExtractor.extractContext(this.scope, tag)

    // Get stack trace for debugging (only in debug/trace levels)
    const stack = (level >= LogLevel.DEBUG)
      ? ContextExtractor.getStackTrace(3)
      : undefined

    // Create log entry
    const entry: LogEntry = {
      timestamp: new Date(),
      level,
      context,
      message,
      ...(data && Object.keys(data).length > 0 ? { data } : {}),
      ...(stack ? { stack } : {}),
    }

    // Send to main logger
    this.onLog(entry)
  }
}
