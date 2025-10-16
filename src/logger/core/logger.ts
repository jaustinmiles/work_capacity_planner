/**
 * Main logger implementation with scope management and pattern-based filtering
 */

import { ILogger, LoggerConfig, LogLevel, LogScope, LogEntry } from '../types'
import { ScopedLogger } from './scoped-logger'
import { PatternExtractor } from './pattern-extractor'
import { Transport } from './transport'

export class Logger implements ILogger {
  private static instance: Logger | null = null
  private config: LoggerConfig
  private transports: Transport[] = []
  private scopedLoggers: Map<LogScope, ScopedLogger> = new Map()
  private recentPatterns: Map<string, { count: number; lastSeen: Date }> = new Map()
  private ignoredPatterns: Set<string> = new Set()

  // Public scope accessors
  public readonly ui: ScopedLogger
  public readonly db: ScopedLogger
  public readonly server: ScopedLogger
  public readonly ipc: ScopedLogger
  public readonly system: ScopedLogger

  private constructor(config: LoggerConfig) {
    this.config = config

    // Create scoped loggers
    this.ui = this.createScopedLogger(LogScope.UI)
    this.db = this.createScopedLogger(LogScope.Database)
    this.server = this.createScopedLogger(LogScope.Server)
    this.ipc = this.createScopedLogger(LogScope.IPC)
    this.system = this.createScopedLogger(LogScope.System)
  }

  static getInstance(config?: LoggerConfig): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger(config || Logger.getDefaultConfig())
    }
    return Logger.instance
  }

  static reset(): void {
    Logger.instance = null
  }

  private static getDefaultConfig(): LoggerConfig {
    return {
      level: LogLevel.INFO,
      enableDecorators: true,
      enableStackTrace: true,
      stackTraceDepth: 5,
      enableDatabase: true,
      enableConsole: true,
      enableAggregation: true,
      aggregationWindowMs: 1000,
    }
  }

  private createScopedLogger(scope: LogScope): ScopedLogger {
    const logger = new ScopedLogger(scope, (entry) => this.handleLog(entry))
    this.scopedLoggers.set(scope, logger)
    return logger
  }

  private handleLog(entry: LogEntry): void {
    // Check if we should log based on level
    // LogLevel: ERROR=0, WARN=1, INFO=2, DEBUG=3, TRACE=4
    // Example: If config.level=INFO(2), we log ERROR(0), WARN(1), INFO(2)
    //          but skip DEBUG(3) and TRACE(4) since they are > 2
    if (entry.level > this.config.level) {
      return
    }

    // Extract pattern for duplicate detection
    const pattern = PatternExtractor.extractPattern(entry)

    // Check if pattern is ignored
    // Patterns are added via logger.ignorePattern(pattern) to suppress repetitive logs
    if (this.ignoredPatterns.has(pattern)) {
      return
    }

    // Check for recent duplicates (aggregation)
    if (this.config.enableAggregation) {
      const recent = this.recentPatterns.get(pattern)
      if (recent && (Date.now() - recent.lastSeen.getTime()) < this.config.aggregationWindowMs) {
        // Update count but don't emit
        recent.count++
        recent.lastSeen = new Date()
        return
      }

      // Emit aggregated log if there were multiple
      if (recent && recent.count > 1) {
        entry.aggregateCount = recent.count
        entry.message = `${entry.message} (×${recent.count})`
      }

      // Start new tracking
      this.recentPatterns.set(pattern, { count: 1, lastSeen: new Date() })
    }

    // Send to all transports
    for (const transport of this.transports) {
      transport.write(entry)
    }
  }

  // Default logger methods (uses System scope)
  error(message: string, data?: any, tag?: string): void {
    this.system.error(message, data, tag)
  }

  warn(message: string, data?: any, tag?: string): void {
    this.system.warn(message, data, tag)
  }

  info(message: string, data?: any, tag?: string): void {
    this.system.info(message, data, tag)
  }

  debug(message: string, data?: any, tag?: string): void {
    this.system.debug(message, data, tag)
  }

  trace(message: string, data?: any, tag?: string): void {
    this.system.trace(message, data, tag)
  }

  // Pattern management
  ignorePattern(pattern: string): void {
    this.ignoredPatterns.add(pattern)
  }

  clearIgnoredPatterns(): void {
    this.ignoredPatterns.clear()
  }

  getIgnoredPatterns(): string[] {
    return Array.from(this.ignoredPatterns)
  }

  // Transport management
  addTransport(transport: Transport): void {
    this.transports.push(transport)
  }

  removeTransport(transport: Transport): void {
    this.transports = this.transports.filter(t => t !== transport)
  }

  // Configuration
  setLevel(level: LogLevel): void {
    this.config.level = level
  }

  getConfig(): LoggerConfig {
    return { ...this.config }
  }
}
