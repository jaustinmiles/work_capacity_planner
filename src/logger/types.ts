/**
 * Core types for the structured logging system
 */

export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3,
  TRACE = 4
}

export enum LogScope {
  UI = 'UI',
  Database = 'Database',
  Server = 'Server',
  IPC = 'IPC',
  System = 'System'
}

export interface LogContext {
  scope: LogScope
  component: string  // Auto-extracted from call site
  tag?: string       // Optional custom tag
  function?: string  // Function name if available
  file?: string      // File path
  line?: number      // Line number
}

export interface LogEntry {
  timestamp: Date
  level: LogLevel
  context: LogContext
  message: string
  data?: Record<string, any>
  stack?: string[]   // Call stack frames
  correlationId?: string
  aggregateCount?: number  // If this log has been aggregated
}

export interface LoggerConfig {
  level: LogLevel
  enableDecorators: boolean
  enableStackTrace: boolean
  stackTraceDepth: number
  enableDatabase: boolean
  enableConsole: boolean
  enableAggregation: boolean
  aggregationWindowMs: number
}

export interface ILogger {
  error(message: string, data?: any, tag?: string): void
  warn(message: string, data?: any, tag?: string): void
  info(message: string, data?: any, tag?: string): void
  debug(message: string, data?: any, tag?: string): void
  trace(message: string, data?: any, tag?: string): void

  // Scoped loggers
  ui: IScopedLogger
  db: IScopedLogger
  server: IScopedLogger
  ipc: IScopedLogger
  system: IScopedLogger
}

export interface IScopedLogger {
  error(message: string, data?: any, tag?: string): void
  warn(message: string, data?: any, tag?: string): void
  info(message: string, data?: any, tag?: string): void
  debug(message: string, data?: any, tag?: string): void
  trace(message: string, data?: any, tag?: string): void
}
