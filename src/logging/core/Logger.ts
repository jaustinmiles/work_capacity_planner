/**
 * Base logger implementation with all core features
 */

import {
  ILogger,
  LogLevel,
  LoggerConfig,
  LogEntry,
  LazyLogData,
  LogMethod,
} from '../types'
import { RingBuffer } from './RingBuffer'
import { Sampler } from './Sampler'
import { StructuredLogger } from './StructuredLogger'

export abstract class Logger implements ILogger {
  protected config: LoggerConfig
  protected ringBuffer: RingBuffer
  protected sampler: Sampler
  protected structuredLogger: StructuredLogger
  protected transports: any[] = []
  protected context: Record<string, any> = {}
  protected flushTimer?: NodeJS.Timeout
  protected logQueue: LogEntry[] = []

  constructor(config: LoggerConfig, processType: 'main' | 'renderer' | 'preload') {
    this.config = config
    this.structuredLogger = new StructuredLogger(processType)

    this.ringBuffer = new RingBuffer({
      size: config.ringBufferSize,
      onError: this.handleBufferError.bind(this),
      persistOnError: true,
    })

    this.sampler = new Sampler(config.sampling)

    // Start flush timer
    this.startFlushTimer()
  }

  /**
   * Log an error
   */
  error = (message: string, errorOrData?: Error | Record<string, any> | LazyLogData, additionalData?: Record<string, any>): void => {
    let error: Error | undefined
    let data: Record<string, any> | LazyLogData | undefined

    if (errorOrData instanceof Error) {
      error = errorOrData
      data = additionalData
    } else {
      data = errorOrData
    }

    this.log(LogLevel.ERROR, message, data, error)
  }

  /**
   * Log a warning
   */
  warn: LogMethod = (message: string, data?: Record<string, any> | LazyLogData): void => {
    this.log(LogLevel.WARN, message, data)
  }

  /**
   * Log info
   */
  info: LogMethod = (message: string, data?: Record<string, any> | LazyLogData): void => {
    this.log(LogLevel.INFO, message, data)
  }

  /**
   * Log debug
   */
  debug: LogMethod = (message: string, data?: Record<string, any> | LazyLogData): void => {
    this.log(LogLevel.DEBUG, message, data)
  }

  /**
   * Log trace
   */
  trace: LogMethod = (message: string, data?: Record<string, any> | LazyLogData): void => {
    this.log(LogLevel.TRACE, message, data)
  }

  /**
   * Core logging method
   */
  protected log(
    level: LogLevel,
    message: string,
    data?: Record<string, any> | LazyLogData,
    error?: Error,
  ): void {
    // Check log level
    if (level > this.config.level) {
      return
    }

    // Check sampling
    const module = this.context.module as string | undefined
    if (!this.sampler.shouldSample(level, module)) {
      return
    }

    // Evaluate lazy data
    const evaluatedData = typeof data === 'function' ? data() : data

    // Merge context with data
    const fullData = {
      ...this.context,
      ...evaluatedData,
    }

    // Create structured log entry
    const entry = this.structuredLogger.format(level, message, fullData, error)

    // Add to ring buffer
    this.ringBuffer.push(entry)

    // Add to queue for batched transport
    this.logQueue.push(entry)

    // If queue is large or this is an error, flush immediately
    if (this.logQueue.length >= 50 || level === LogLevel.ERROR) {
      this.flush()
    }
  }

  /**
   * Create a child logger with additional context
   */
  child(context: Record<string, any>): ILogger {
    const ChildLoggerClass = this.constructor as any
    const childLogger = new ChildLoggerClass(this.config, this.structuredLogger['processType'])
    childLogger.context = { ...this.context, ...context }
    childLogger.transports = this.transports
    // CRITICAL: Share the same ring buffer, sampler, and structured logger
    childLogger.ringBuffer = this.ringBuffer
    childLogger.sampler = this.sampler
    childLogger.structuredLogger = this.structuredLogger
    return childLogger
  }

  /**
   * Dump the ring buffer
   */
  dumpBuffer(): LogEntry[] {
    return this.ringBuffer.dump()
  }

  /**
   * Update configuration
   */
  configure(config: Partial<LoggerConfig>): void {
    this.config = { ...this.config, ...config }

    if (config.sampling) {
      this.sampler.updateConfig(config.sampling)
    }

    // Restart flush timer if interval changed
    if (config.flushInterval) {
      this.stopFlushTimer()
      this.startFlushTimer()
    }
  }

  /**
   * Start the flush timer
   */
  protected startFlushTimer(): void {
    this.flushTimer = setInterval(() => {
      if (this.logQueue.length > 0) {
        this.flush()
      }
    }, this.config.flushInterval)

    // Don't block Node.js from exiting
    if (this.flushTimer.unref) {
      this.flushTimer.unref()
    }
  }

  /**
   * Stop the flush timer
   */
  protected stopFlushTimer(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer)
      this.flushTimer = undefined
    }
  }

  /**
   * Flush queued logs to transports
   */
  protected flush(): void {
    if (this.logQueue.length === 0) return

    const entries = [...this.logQueue]
    this.logQueue = []

    // Send to all transports
    for (const transport of this.transports) {
      try {
        transport.write(entries)
      } catch (error) {
        // Don't log transport errors to avoid infinite loop
        console.error('Transport error:', error)
      }
    }
  }

  /**
   * Handle buffer error (dump context)
   */
  protected handleBufferError(entries: LogEntry[]): void {
    // This will be overridden by specific implementations
    console.error('Buffer error dump:', entries.length, 'entries')
  }

  /**
   * Set global context
   */
  setContext(context: Record<string, any>): void {
    this.context = { ...this.context, ...context }
    this.structuredLogger.setGlobalContext(context)
  }

  /**
   * Clear context
   */
  clearContext(): void {
    this.context = {}
    this.structuredLogger.clearGlobalContext()
  }

  /**
   * Cleanup on shutdown
   */
  shutdown(): void {
    this.stopFlushTimer()
    this.flush()

    for (const transport of this.transports) {
      if (transport.close) {
        transport.close()
      }
    }
  }
}
