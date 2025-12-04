/**
 * Main entry point for the new structured logging system
 */

import { Logger } from './core/logger'
import { ConsoleTransport, DatabaseTransport } from './core/transport'
import { LogLevel } from './types'

// Create and configure the singleton logger
const loggerInstance = Logger.getInstance({
  level: process.env.NODE_ENV === 'production' ? LogLevel.INFO : LogLevel.DEBUG,
  enableDecorators: true,
  enableStackTrace: true,
  stackTraceDepth: 5,
  enableDatabase: true, // Enable database persistence for LogViewer
  enableConsole: true,
  enableAggregation: true,
  aggregationWindowMs: 1000,
})

// Add console transport
loggerInstance.addTransport(new ConsoleTransport())

// Add database transport for log persistence (works in renderer process)
loggerInstance.addTransport(new DatabaseTransport())

// Export the singleton
export const logger = loggerInstance

// Re-export types
export * from './types'

// Re-export decorators
export * from './decorators'
export * from './decorators-class'
export * from './decorators-async'

// Helper to temporarily disable verbose logs
export function suppressVerboseLogs() {
  loggerInstance.setLevel(LogLevel.INFO)
}

// Helper to enable all logs
export function enableAllLogs() {
  loggerInstance.setLevel(LogLevel.TRACE)
}

// Pattern management helpers
export function ignorePattern(pattern: string) {
  loggerInstance.ignorePattern(pattern)
}

export function clearIgnoredPatterns() {
  loggerInstance.clearIgnoredPatterns()
}

// For debugging
if (typeof window !== 'undefined') {
  (window as any).__logger = logger;
  (window as any).__logLevel = LogLevel
}
