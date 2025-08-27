/**
 * Browser-safe base logger implementation
 */

import {
  ILogger,
  LogLevel,
  LoggerConfig,
  LogEntry,
  LazyLogData,
  LogMethod,
} from '../types'
import { RingBuffer } from '../core/RingBuffer'
import { Sampler } from '../core/Sampler'
import { StructuredLogger } from '../core/StructuredLogger.browser'

export abstract class BrowserLogger implements ILogger {
  protected config: LoggerConfig
  protected ringBuffer: RingBuffer
  protected sampler: Sampler
  protected structuredLogger: StructuredLogger
  protected transports: any[] = []
  protected context: Record<string, any> = {}
  protected flushTimer?: number  // Use number instead of NodeJS.Timeout
  protected logQueue: LogEntry[] = []

  constructor(config: LoggerConfig) {
    this.config = config
    this.structuredLogger = new StructuredLogger('renderer')

    this.ringBuffer = new RingBuffer({
      size: config.ringBufferSize,
      onError: this.handleBufferError.bind(this),
      persistOnError: true,
    })

    this.sampler = new Sampler(config.sampling)

    // Start flush timer
    if (config.flushInterval > 0) {
      this.startFlushTimer()
    }
  }

  protected startFlushTimer(): void {
    this.flushTimer = window.setInterval(() => {
      this.flush()
    }, this.config.flushInterval) as any
  }

  protected handleBufferError(error: Error): void {
    console.error('Ring buffer error:', error)
  }

  protected shouldLog(level: LogLevel): boolean {
    return level <= this.config.level && this.sampler.shouldSample(level)
  }

  protected log(level: LogLevel, message: string, data?: Record<string, any>, error?: Error): void {
    if (!this.shouldLog(level)) return

    // Evaluate lazy data
    const evaluatedData = this.evaluateLazyData(data)

    // Structure the log entry
    const entry = this.structuredLogger.structure({
      level,
      message,
      context: this.context,
      data: evaluatedData,
      error: error?.stack || error?.message,
    })

    // Add to ring buffer
    this.ringBuffer.push(entry)

    // Queue for transport
    this.logQueue.push(entry)

    // Flush immediately for errors
    if (level === LogLevel.ERROR) {
      this.flush()
    }
  }

  protected evaluateLazyData(data?: Record<string, any> | LazyLogData): Record<string, any> | undefined {
    if (!data) return undefined

    if (typeof data === 'function') {
      try {
        return data()
      } catch (error) {
        return { lazyEvaluationError: (error as Error).message }
      }
    }

    // Recursively evaluate nested lazy data
    const result: Record<string, any> = {}
    for (const key in data) {
      const value = data[key]
      if (typeof value === 'function') {
        try {
          result[key] = value()
        } catch (error) {
          result[key] = `[Error evaluating: ${(error as Error).message}]`
        }
      } else {
        result[key] = value
      }
    }

    return result
  }

  flush(): void {
    if (this.logQueue.length === 0) return

    const entries = [...this.logQueue]
    this.logQueue = []

    // Send to all transports
    for (const transport of this.transports) {
      try {
        transport.write(entries)
      } catch (error) {
        console.error('Transport write error:', error)
      }
    }
  }

  dumpBuffer(): LogEntry[] {
    return this.ringBuffer.dump()
  }

  configure(config: Partial<LoggerConfig>): void {
    this.config = { ...this.config, ...config }
    this.sampler.updateConfig(this.config.sampling)
  }

  child(context: Record<string, any>): ILogger {
    const childLogger = Object.create(this)
    childLogger.context = { ...this.context, ...context }
    return childLogger
  }

  // Log level methods
  error: LogMethod = (message: string, data?: Record<string, any> | LazyLogData): void => {
    this.log(LogLevel.ERROR, message, data)
  }

  warn: LogMethod = (message: string, data?: Record<string, any> | LazyLogData): void => {
    this.log(LogLevel.WARN, message, data)
  }

  info: LogMethod = (message: string, data?: Record<string, any> | LazyLogData): void => {
    this.log(LogLevel.INFO, message, data)
  }

  debug: LogMethod = (message: string, data?: Record<string, any> | LazyLogData): void => {
    this.log(LogLevel.DEBUG, message, data)
  }

  trace: LogMethod = (message: string, data?: Record<string, any> | LazyLogData): void => {
    this.log(LogLevel.TRACE, message, data)
  }

  shutdown(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer)
    }
    this.flush()
    for (const transport of this.transports) {
      if (transport.close) {
        transport.close()
      }
    }
  }
}
