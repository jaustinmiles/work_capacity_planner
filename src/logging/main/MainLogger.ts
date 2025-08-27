/**
 * Main process logger implementation
 */

import { Logger } from '../core/Logger'
import { LoggerConfig, LogLevel, LogEntry } from '../types'
import { ConsoleTransport } from '../transports/ConsoleTransport'
import { PrismaTransport } from '../transports/PrismaTransport'
import { IPCTransport } from '../transports/IPCTransport'
import { AsyncLocalStorage } from 'async_hooks'
import type { PrismaClient } from '@prisma/client'

// AsyncLocalStorage for request context
const asyncLocalStorage = new AsyncLocalStorage<Record<string, any>>()

export class MainLogger extends Logger {
  private static instance: MainLogger
  private prismaTransport?: PrismaTransport

  private constructor(config: LoggerConfig) {
    super(config, 'main')
    this.initializeTransports()
    this.setupProcessHandlers()
    this.listenForRendererLogs()
  }

  static getInstance(config?: LoggerConfig): MainLogger {
    if (!MainLogger.instance) {
      const defaultConfig: LoggerConfig = {
        level: process.env.NODE_ENV === 'production' ? LogLevel.INFO : LogLevel.DEBUG,
        sampling: {
          errorRate: 1.0,
          warnRate: 1.0,
          infoRate: process.env.NODE_ENV === 'production' ? 0.5 : 1.0,
          debugRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
          traceRate: process.env.NODE_ENV === 'production' ? 0.01 : 1.0,
          adaptiveSampling: true,
          bypassInDev: true,
        },
        transports: [
          { type: 'console', enabled: true },
          { type: 'prisma', enabled: true },
        ],
        ringBufferSize: 1000,
        flushInterval: 100,
        environment: process.env.NODE_ENV as any || 'development',
      }

      MainLogger.instance = new MainLogger(config || defaultConfig)
    }

    return MainLogger.instance
  }

  private initializeTransports(): void {
    // Console transport
    const consoleTransport = new ConsoleTransport({
      enabled: this.config.environment !== 'production',
    })
    this.transports.push(consoleTransport)

    // Prisma transport
    this.prismaTransport = new PrismaTransport({
      enabled: true,
      minLevel: LogLevel.WARN,
    })
    this.transports.push(this.prismaTransport)

    // IPC transport (to receive from renderer)
    const ipcTransport = new IPCTransport({
      enabled: true,
      isRenderer: false,
    })
    this.transports.push(ipcTransport)
  }

  /**
   * Set Prisma client for database logging
   */
  setPrisma(prisma: PrismaClient): void {
    if (this.prismaTransport) {
      this.prismaTransport.setPrisma(prisma)
    }
  }

  private setupProcessHandlers(): void {
    // Log uncaught exceptions
    process.on('uncaughtException', (error) => {
      this.error('Uncaught exception', {
        error: error.message,
        stack: error.stack,
      })
      this.dumpBuffer()
      process.exit(1)
    })

    // Log unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      this.error('Unhandled promise rejection', {
        reason: String(reason),
        promise: String(promise),
      })
    })

    // Log process warnings
    process.on('warning', (warning) => {
      this.warn('Process warning', {
        name: warning.name,
        message: warning.message,
        stack: warning.stack,
      })
    })

    // Graceful shutdown
    process.on('SIGINT', () => {
      this.info('Process shutting down (SIGINT)')
      this.shutdown()
      process.exit(0)
    })

    process.on('SIGTERM', () => {
      this.info('Process shutting down (SIGTERM)')
      this.shutdown()
      process.exit(0)
    })
  }

  private listenForRendererLogs(): void {
    // Listen for logs forwarded from renderer process
    process.on('renderer-log' as any, (entry: LogEntry) => {
      // Add to ring buffer and forward to transports
      this.ringBuffer.push(entry)
      this.logQueue.push(entry)

      if (entry.level === LogLevel.ERROR) {
        this.flush()
      }
    })
  }

  /**
   * Run a function with async context
   */
  runWithContext<T>(context: Record<string, any>, fn: () => T): T {
    return asyncLocalStorage.run(context, fn)
  }

  /**
   * Get current async context
   */
  getAsyncContext(): Record<string, any> | undefined {
    return asyncLocalStorage.getStore()
  }

  /**
   * Override log method to include async context
   */
  protected log(level: LogLevel, message: string, data?: Record<string, any>, error?: Error): void {
    const asyncContext = this.getAsyncContext()
    const mergedData = {
      ...asyncContext,
      ...data,
    }

    super.log(level, message, mergedData, error)
  }

  /**
   * Wrap a function with logging
   */
  wrap<T extends (...args: any[]) => any>(
    name: string,
    fn: T,
    options?: { logArgs?: boolean; logResult?: boolean },
  ): T {
    const logger = this

    return (async function wrapped(...args: any[]) {
      const startTime = Date.now()
      const correlationId = `${name}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

      logger.debug(`${name} started`, {
        correlationId,
        args: options?.logArgs ? args : undefined,
      })

      try {
        const result = await fn(...args)

        logger.debug(`${name} completed`, {
          correlationId,
          duration: Date.now() - startTime,
          result: options?.logResult ? result : undefined,
        })

        return result
      } catch (error) {
        logger.error(`${name} failed`, {
          correlationId,
          duration: Date.now() - startTime,
          error: (error as Error).message,
        })

        throw error
      }
    }) as T
  }
}

// Export singleton getter
export const getMainLogger = (config?: LoggerConfig) => MainLogger.getInstance(config)
